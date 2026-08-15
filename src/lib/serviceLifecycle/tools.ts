import type { ToolDef } from '@/lib/assistant/aiClient'
import {
  approveServiceQuote,
  cancelServiceRequest,
  getActiveServicesForPhone,
  getPendingReturnLegInfo,
  getRepairStatus,
  getServiceDiagnostic,
  getServiceStatus,
  rejectServiceQuote,
  setReturnLeg,
} from './store'
import { notifyQuoteDecision } from './notifications'
import { STATUS_DESCRIPTION, REPAIR_DONE_STATUSES, ServiceLifecycleError, type ServiceSummary } from './types'
import { createAppointment, type DeviceAppointmentType } from '@/lib/agenda/service'
import { AgendaError } from '@/lib/agenda/types'
import { bookingWindowDays, dateKeyToBr, formatStoreDateTime, parseStoreDateTime } from '@/lib/agenda/slots'
import { createServiceClient } from '@/lib/supabase/service'
import { buscarEnderecos } from '@/lib/mapa/geocodificacao'

/**
 * Tools do ciclo de assistência técnica: diagnóstico → orçamento → aprovação
 * → reparo → entrega. Sempre no tool-calling já existente (`aiClient.ts`),
 * sem infraestrutura nova — consultam `service_requests`/`service_diagnostics`/
 * `service_orders` direto, a mesma fonte que o painel do lojista usa.
 *
 * Regra central: a IA nunca deduz status pelo histórico da conversa — toda
 * pergunta sobre "já terminou", "qual o problema", "quanto custa" passa por
 * uma destas tools antes de qualquer resposta.
 */
export const SERVICE_TOOLS: ToolDef[] = [
  {
    name: 'consultar_meus_atendimentos',
    description:
      'Lista os atendimentos (solicitações de reparo) do cliente pelo telefone dele, com status atual de cada um. Rode isto ANTES de qualquer outra tool de atendimento, pra descobrir o request_id — nunca invente ou reaproveite um ID de conversa anterior sem confirmar aqui primeiro. Confirme com o cliente qual número está cadastrado no atendimento antes de chamar: normalmente é o da conversa, mas pode ser outro — ele pode estar continuando aqui um atendimento que começou por outro canal (telefone, loja física).',
    parameters: {
      type: 'object',
      properties: { telefone: { type: 'string', description: 'Telefone cadastrado no atendimento (confirmado com o cliente), só dígitos.' } },
      required: ['telefone'],
    },
  },
  {
    name: 'consultar_status_atendimento',
    description:
      'Status atual de um atendimento específico. Use sempre que o cliente perguntar "já terminou", "tem novidade", "está pronto" — nunca responda essas perguntas só pelo histórico da conversa. Quando o reparo está concluído e a entrega/retirada ainda não foi combinada, a resposta desta tool traz uma instrução de qual pergunta fazer — sempre siga essa instrução antes de qualquer outra coisa.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento (vem de consultar_meus_atendimentos).' },
        telefone: { type: 'string', description: 'Telefone do cliente — usado pra confirmar que o atendimento é dele.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
  {
    name: 'consultar_diagnostico',
    description:
      'Detalhes do diagnóstico já feito: serviços identificados, observações técnicas e valor do orçamento. Só retorna algo quando o status já passou de "aguardando_diagnostico". Use quando o cliente perguntar qual foi o problema encontrado ou quanto vai custar.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento.' },
        telefone: { type: 'string', description: 'Telefone do cliente.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
  {
    name: 'aprovar_orcamento',
    description:
      'Aprova o orçamento em nome do cliente, avançando o atendimento pra "aprovado". Só funciona quando o status é "aguardando aprovação do cliente" (diagnóstico já enviado). Confirme o valor com o cliente antes de chamar — a aprovação é irreversível pela assistente (só a loja pode reverter). Avisa o cliente automaticamente após aprovar.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento.' },
        telefone: { type: 'string', description: 'Telefone do cliente.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
  {
    name: 'recusar_orcamento',
    description:
      'Recusa o orçamento em nome do cliente, encerrando o atendimento. Só funciona quando o status é "aguardando aprovação do cliente". Confirme com o cliente antes de chamar.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento.' },
        telefone: { type: 'string', description: 'Telefone do cliente.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
  {
    name: 'cancelar_atendimento',
    description:
      'Cancela o atendimento a pedido do cliente. Só funciona ANTES da aprovação do orçamento (enquanto está pendente, aguardando diagnóstico ou com diagnóstico enviado) — depois de aprovado, o reparo pode já estar em andamento e o cancelamento passa a depender da loja; explique isso ao cliente se a tool recusar. Confirme com o cliente antes de chamar, e pergunte o motivo pra registrar.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento.' },
        telefone: { type: 'string', description: 'Telefone do cliente.' },
        motivo: { type: 'string', description: 'Motivo informado pelo cliente, quando houver.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
  {
    name: 'consultar_status_reparo',
    description:
      'Detalhes de um reparo já concluído: serviços realizados, garantia e valor final. Só retorna algo quando o reparo terminou. Use quando o cliente perguntar sobre garantia ou o que foi feito no aparelho.',
    parameters: {
      type: 'object',
      properties: {
        atendimento_id: { type: 'string', description: 'ID do atendimento.' },
        telefone: { type: 'string', description: 'Telefone do cliente.' },
      },
      required: ['atendimento_id', 'telefone'],
    },
  },
]

function deviceParams() {
  return {
    type: 'object' as const,
    properties: {
      atendimento_id: { type: 'string', description: 'ID do atendimento vinculado ao aparelho.' },
      cliente_nome: { type: 'string', description: 'Nome do cliente.' },
      cliente_telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente.' },
      data: { type: 'string', description: '"hoje" ou "amanhã" (também aceita dd/mm/aaaa).' },
      horario: { type: 'string', description: 'Horário em HH:MM, formato 24h.' },
    },
    required: ['atendimento_id', 'cliente_nome', 'cliente_telefone', 'data', 'horario'],
  }
}

function entregaParams() {
  return {
    type: 'object' as const,
    properties: {
      atendimento_id: { type: 'string', description: 'ID do atendimento vinculado ao aparelho.' },
      cliente_nome: { type: 'string', description: 'Nome do cliente.' },
      cliente_telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente.' },
      data: { type: 'string', description: '"hoje" ou "amanhã" (também aceita dd/mm/aaaa).' },
      horario: { type: 'string', description: 'Horário em HH:MM, formato 24h.' },
      mesmo_endereco_coleta: {
        type: 'boolean',
        description: 'true se a entrega é no mesmo endereço em que o aparelho foi coletado. false se for outro endereço (nesse caso preencha "endereco"). Deixe de fora se não houve coleta.',
      },
      endereco: {
        type: 'string',
        description: 'Endereço completo de entrega, só quando for diferente do endereço da coleta (ou quando não houve coleta e o cliente escolheu entrega em vez de retirada na loja).',
      },
    },
    required: ['atendimento_id', 'cliente_nome', 'cliente_telefone', 'data', 'horario'],
  }
}

/**
 * Separadas de SERVICE_TOOLS de propósito: agendar aparelho usa a mesma
 * agenda do atendimento (`agenda_settings.appointment_ai_enabled`), então só
 * devem ser oferecidas à IA junto com as demais tools de agenda — nunca
 * quando a loja desligou o agendamento por IA.
 */
export const DEVICE_TOOLS: ToolDef[] = [
  {
    name: 'agendar_coleta_aparelho',
    description:
      'Agenda a coleta do aparelho no endereço do cliente (a loja vai buscar), na mesma agenda dos atendimentos. Vale enquanto o atendimento estiver ativo (não cancelado/finalizado). Use quando o cliente solicitar o serviço e não puder trazer o aparelho até a loja.',
    parameters: deviceParams(),
  },
  {
    name: 'agendar_entrega_aparelho',
    description:
      'Agenda a entrega do aparelho pronto no endereço do cliente (a loja entrega) e registra essa perna de volta no atendimento — SÓ pode ser chamada depois que consultar_status_atendimento (ou consultar_status_reparo) indicar que o reparo terminou E a entrega/retirada ainda não foi combinada. Pergunte antes se é o mesmo endereço da coleta (quando houve coleta) ou peça o endereço (quando não houve coleta ou for um endereço diferente). O valor da entrega é calculado e cobrado automaticamente nesse momento, se a loja cobrar essa perna.',
    parameters: entregaParams(),
  },
  {
    name: 'agendar_retirada_aparelho',
    description:
      'Agenda a retirada do aparelho pelo cliente na loja e registra essa perna de volta no atendimento — SÓ pode ser chamada depois que consultar_status_atendimento indicar que o reparo terminou E a entrega/retirada ainda não foi combinada. Retirada na loja nunca tem custo de deslocamento.',
    parameters: deviceParams(),
  },
]

export const SERVICE_TOOL_NAMES = SERVICE_TOOLS.map((t) => t.name)
export const DEVICE_TOOL_NAMES = DEVICE_TOOLS.map((t) => t.name)

function describe(s: ServiceSummary): string {
  const aparelho = s.phone_model ? ` (${s.phone_model})` : ''
  return `ID: ${s.id} | Status: ${STATUS_DESCRIPTION[s.status]}${aparelho}`
}

async function consultarMeusAtendimentos(telefone: string): Promise<string> {
  const rows = await getActiveServicesForPhone(telefone)
  if (rows.length === 0) return 'Nenhum atendimento encontrado para este telefone.'
  return rows.map(describe).join('\n')
}

async function consultarStatusAtendimento(id: string, telefone: string): Promise<string> {
  const s = await getServiceStatus(id, telefone)
  const base = `STATUS: ${STATUS_DESCRIPTION[s.status]}${s.quote_value ? ` (orçamento: R$ ${s.quote_value.toFixed(2)})` : ''}`

  const pending = await getPendingReturnLegInfo(id, telefone)
  if (!pending.returnLegPending) return base

  const pergunta = pending.selfPickup
    ? 'PERGUNTE AO CLIENTE: o reparo está pronto. Ele quer RETIRAR o aparelho na loja, ou prefere que a loja ENTREGUE no endereço dele? Depois de ele responder, chame agendar_retirada_aparelho ou agendar_entrega_aparelho conforme a escolha.'
    : `PERGUNTE AO CLIENTE: o reparo está pronto. A entrega é no MESMO endereço da coleta${pending.collectionAddressLabel ? ` (${pending.collectionAddressLabel})` : ''}, ele prefere RETIRAR na loja, ou quer entrega em outro endereço? Depois de ele responder, chame agendar_entrega_aparelho (informando mesmo_endereco_coleta e, se for outro endereço, o campo endereco) ou agendar_retirada_aparelho.`

  return `${base}\n\n${pergunta}`
}

async function consultarDiagnostico(id: string, telefone: string): Promise<string> {
  const d = await getServiceDiagnostic(id, telefone)
  if (!d) return 'Diagnóstico ainda não disponível para este atendimento.'
  const servicos = (d.services_selected ?? []).join(', ')
  return [
    servicos ? `Serviços identificados: ${servicos}` : null,
    d.notes ? `Observações: ${d.notes}` : null,
    d.quote_value ? `Orçamento: R$ ${Number(d.quote_value).toFixed(2)}` : null,
  ].filter(Boolean).join('\n') || 'Diagnóstico registrado, sem detalhes adicionais.'
}

async function aprovarOrcamento(id: string, telefone: string): Promise<string> {
  const s = await approveServiceQuote(id, telefone)
  await notifyQuoteDecision(id, 'accepted')
  return `ORÇAMENTO APROVADO: atendimento ${s.id} agora está com status "${STATUS_DESCRIPTION.accepted}". Cliente já foi avisado por WhatsApp.`
}

async function recusarOrcamento(id: string, telefone: string): Promise<string> {
  const s = await rejectServiceQuote(id, telefone)
  await notifyQuoteDecision(id, 'cancelled')
  return `ORÇAMENTO RECUSADO: atendimento ${s.id} foi cancelado. Cliente já foi avisado por WhatsApp.`
}

async function cancelarAtendimento(id: string, telefone: string, motivo?: string): Promise<string> {
  const s = await cancelServiceRequest(id, telefone, motivo)
  await notifyQuoteDecision(id, 'cancelled')
  return `ATENDIMENTO CANCELADO: ${s.id}. Cliente já foi avisado por WhatsApp.`
}

async function consultarStatusReparo(id: string, telefone: string): Promise<string> {
  const r = await getRepairStatus(id, telefone)
  if (!r) return 'O reparo ainda não foi concluído — sem resumo disponível ainda.'
  return [
    r.completed_services ? `Serviços realizados: ${r.completed_services}` : null,
    r.warranty ? `Garantia: ${r.warranty}` : null,
    r.final_value != null ? `Valor final: R$ ${Number(r.final_value).toFixed(2)}` : null,
  ].filter(Boolean).join('\n') || 'Reparo concluído, sem detalhes adicionais.'
}

function resolveDeliveryDateKey(input?: string): string | null {
  const dias = bookingWindowDays()
  if (!input) return null
  const t = input.trim().toLowerCase()
  if (t === 'hoje') return dias[0].key
  if (t === 'amanha' || t === 'amanhã') return dias[1].key
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

const DEVICE_ACTION_LABEL: Record<DeviceAppointmentType, string> = {
  device_collection: 'COLETA AGENDADA',
  device_delivery: 'ENTREGA AGENDADA',
  device_pickup: 'RETIRADA AGENDADA',
}

/**
 * Preço de uma perna de entrega, honrando o toggle `cobrar_entrega` de
 * `shipping_settings` (a mesma base de cálculo de /dashboard/servicodeslocamento).
 * `null` de coordenadas = não deu pra calcular (endereço não encontrado) —
 * cai pra 0 em vez de travar o agendamento.
 */
async function calcularPrecoEntrega(lat: number, lng: number): Promise<number> {
  const db = createServiceClient()
  const { data: settings } = await db
    .from('shipping_settings')
    .select('cobrar_entrega')
    .eq('id', 1)
    .maybeSingle()
  if (settings?.cobrar_entrega === false) return 0
  const { data: est } = await db.rpc('estimate_shipping', { p_lat: lat, p_lng: lng })
  if (est && typeof est === 'object' && 'price' in est) return Number((est as { price: number }).price)
  return 0
}

async function agendarDispositivo(
  type: DeviceAppointmentType,
  input: {
    atendimento_id: string
    cliente_nome: string
    cliente_telefone: string
    data: string
    horario: string
    mesmo_endereco_coleta?: boolean
    endereco?: string
  },
): Promise<string> {
  const dateKey = resolveDeliveryDateKey(input.data)
  if (!dateKey) return 'FALHOU (validation): informe a data como "hoje", "amanhã" ou dd/mm/aaaa.'
  const dias = bookingWindowDays()
  if (!dias.some((d) => d.key === dateKey)) {
    return `FALHOU (validation): a loja só agenda para hoje (${dateKeyToBr(dias[0].key)}) ou amanhã (${dateKeyToBr(dias[1].key)}).`
  }

  // Perna de volta (entrega/retirada): calcula o preço e registra ANTES do
  // agendamento em si, pra não criar um horário na agenda se o preço não
  // puder ser resolvido (ex: endereço novo não encontrado).
  let returnLegPrice: number | null = null
  let returnLegSameAddress: boolean | null = null
  if (type === 'device_pickup') {
    returnLegPrice = 0
  } else if (type === 'device_delivery') {
    returnLegSameAddress = input.mesmo_endereco_coleta ?? null
    if (input.mesmo_endereco_coleta) {
      const db = createServiceClient()
      const { data: req } = await db
        .from('service_requests')
        .select('address_lat, address_lng')
        .eq('id', input.atendimento_id)
        .maybeSingle()
      if (!req?.address_lat || !req?.address_lng) {
        return 'FALHOU (validation): não encontrei o endereço da coleta salvo neste atendimento — peça o endereço de entrega ao cliente e chame de novo com "endereco" preenchido.'
      }
      returnLegPrice = await calcularPrecoEntrega(req.address_lat, req.address_lng)
    } else {
      if (!input.endereco?.trim()) {
        return 'FALHOU (validation): informe o endereço de entrega (campo "endereco") — não é o mesmo da coleta.'
      }
      const results = await buscarEnderecos(input.endereco.trim())
      if (results.length === 0) {
        return 'FALHOU (validation): não encontrei esse endereço. Peça ao cliente pra ser mais específico (rua, número, bairro, cidade).'
      }
      returnLegPrice = await calcularPrecoEntrega(results[0].lat, results[0].lng)
    }
  }

  if (type !== 'device_collection') {
    try {
      await setReturnLeg(
        input.atendimento_id,
        input.cliente_telefone,
        type === 'device_pickup' ? 'pickup_store' : 'delivery_home',
        returnLegPrice,
        returnLegSameAddress,
      )
    } catch (e) {
      if (e instanceof ServiceLifecycleError) return `FALHOU (${e.code}): ${e.message}`
      throw e
    }
  }

  try {
    const appointment = await createAppointment({
      customer_name: input.cliente_nome,
      customer_phone: input.cliente_telefone,
      starts_at: parseStoreDateTime(dateKey, input.horario),
      actor_type: 'assistente',
      appointment_type: type,
      service_request_id: input.atendimento_id,
    })
    const preco = returnLegPrice ? ` Valor da entrega: R$ ${returnLegPrice.toFixed(2)} (somado ao total, cobrado na entrega).` : ''
    return `${DEVICE_ACTION_LABEL[type]}: ${appointment.service_label} em ${formatStoreDateTime(appointment.starts_at)}. ID: ${appointment.id}.${preco}`
  } catch (e) {
    if (e instanceof AgendaError) return `FALHOU (${e.code}): ${e.message}`
    throw e
  }
}

const DEVICE_TOOL_TYPE: Record<string, DeviceAppointmentType> = {
  agendar_coleta_aparelho: 'device_collection',
  agendar_entrega_aparelho: 'device_delivery',
  agendar_retirada_aparelho: 'device_pickup',
}

export async function executeServiceTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  if (!SERVICE_TOOL_NAMES.includes(name) && !DEVICE_TOOL_NAMES.includes(name)) return null

  try {
    switch (name) {
      case 'consultar_meus_atendimentos':
        return await consultarMeusAtendimentos(String(input.telefone ?? ''))
      case 'consultar_status_atendimento':
        return await consultarStatusAtendimento(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'consultar_diagnostico':
        return await consultarDiagnostico(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'aprovar_orcamento':
        return await aprovarOrcamento(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'recusar_orcamento':
        return await recusarOrcamento(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'cancelar_atendimento':
        return await cancelarAtendimento(
          String(input.atendimento_id ?? ''),
          String(input.telefone ?? ''),
          input.motivo ? String(input.motivo) : undefined,
        )
      case 'consultar_status_reparo':
        return await consultarStatusReparo(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'agendar_coleta_aparelho':
      case 'agendar_entrega_aparelho':
      case 'agendar_retirada_aparelho':
        return await agendarDispositivo(DEVICE_TOOL_TYPE[name], {
          atendimento_id: String(input.atendimento_id ?? ''),
          cliente_nome: String(input.cliente_nome ?? ''),
          cliente_telefone: String(input.cliente_telefone ?? ''),
          data: String(input.data ?? ''),
          horario: String(input.horario ?? ''),
          mesmo_endereco_coleta: typeof input.mesmo_endereco_coleta === 'boolean' ? input.mesmo_endereco_coleta : undefined,
          endereco: typeof input.endereco === 'string' ? input.endereco : undefined,
        })
      default:
        return null
    }
  } catch (e) {
    if (e instanceof ServiceLifecycleError) return `FALHOU (${e.code}): ${e.message}`
    return `FALHOU: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** Status a partir dos quais o reparo já terminou e a entrega pode ser agendada. */
export { REPAIR_DONE_STATUSES }
