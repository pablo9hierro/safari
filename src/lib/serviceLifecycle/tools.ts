import type { ToolDef } from '@/lib/assistant/aiClient'
import {
  approveServiceQuote,
  getActiveServicesForPhone,
  getRepairStatus,
  getServiceDiagnostic,
  getServiceStatus,
  rejectServiceQuote,
} from './store'
import { notifyQuoteDecision } from './notifications'
import { STATUS_DESCRIPTION, REPAIR_DONE_STATUSES, ServiceLifecycleError, type ServiceSummary } from './types'
import { createAppointment } from '@/lib/agenda/service'
import { AgendaError } from '@/lib/agenda/types'
import { bookingWindowDays, dateKeyToBr, formatStoreDateTime, parseStoreDateTime } from '@/lib/agenda/slots'

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
      'Lista os atendimentos (solicitações de reparo) do cliente pelo telefone dele, com status atual de cada um. Rode isto ANTES de qualquer outra tool de atendimento, pra descobrir o request_id — nunca invente ou reaproveite um ID de conversa anterior sem confirmar aqui primeiro.',
    parameters: {
      type: 'object',
      properties: { telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente (só dígitos).' } },
      required: ['telefone'],
    },
  },
  {
    name: 'consultar_status_atendimento',
    description:
      'Status atual de um atendimento específico. Use sempre que o cliente perguntar "já terminou", "tem novidade", "está pronto" — nunca responda essas perguntas só pelo histórico da conversa.',
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

/**
 * Separada de SERVICE_TOOLS de propósito: agendar entrega usa a mesma agenda
 * do atendimento (`agenda_settings.appointment_ai_enabled`), então só deve
 * ser oferecida à IA junto com as demais tools de agenda — nunca quando a
 * loja desligou o agendamento por IA.
 */
export const DELIVERY_TOOL: ToolDef = {
  name: 'agendar_entrega_aparelho',
  description:
    'Agenda a entrega/retirada do aparelho na mesma agenda dos atendimentos. SÓ funciona quando o reparo já está concluído (confira antes com consultar_status_atendimento) — tentar antes disso é recusado pelo backend. Usa a mesma janela hoje/amanhã e a mesma proteção contra dois agendamentos no mesmo horário.',
  parameters: {
    type: 'object',
    properties: {
      atendimento_id: { type: 'string', description: 'ID do atendimento cujo aparelho será entregue/retirado.' },
      cliente_nome: { type: 'string', description: 'Nome do cliente.' },
      cliente_telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente.' },
      data: { type: 'string', description: '"hoje" ou "amanhã" (também aceita dd/mm/aaaa).' },
      horario: { type: 'string', description: 'Horário em HH:MM, formato 24h.' },
    },
    required: ['atendimento_id', 'cliente_nome', 'cliente_telefone', 'data', 'horario'],
  },
}

export const SERVICE_TOOL_NAMES = SERVICE_TOOLS.map((t) => t.name)
export const DELIVERY_TOOL_NAME = DELIVERY_TOOL.name

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
  return `STATUS: ${STATUS_DESCRIPTION[s.status]}${s.quote_value ? ` (orçamento: R$ ${s.quote_value.toFixed(2)})` : ''}`
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
  await notifyQuoteDecision(id, 'rejected')
  return `ORÇAMENTO RECUSADO: atendimento ${s.id} foi encerrado. Cliente já foi avisado por WhatsApp.`
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

async function agendarEntregaAparelho(input: {
  atendimento_id: string
  cliente_nome: string
  cliente_telefone: string
  data: string
  horario: string
}): Promise<string> {
  const dateKey = resolveDeliveryDateKey(input.data)
  if (!dateKey) return 'FALHOU (validation): informe a data como "hoje", "amanhã" ou dd/mm/aaaa.'
  const dias = bookingWindowDays()
  if (!dias.some((d) => d.key === dateKey)) {
    return `FALHOU (validation): a loja só agenda para hoje (${dateKeyToBr(dias[0].key)}) ou amanhã (${dateKeyToBr(dias[1].key)}).`
  }

  try {
    const appointment = await createAppointment({
      customer_name: input.cliente_nome,
      customer_phone: input.cliente_telefone,
      starts_at: parseStoreDateTime(dateKey, input.horario),
      actor_type: 'assistente',
      appointment_type: 'device_delivery',
      service_request_id: input.atendimento_id,
    })
    return `ENTREGA AGENDADA: ${appointment.service_label} em ${formatStoreDateTime(appointment.starts_at)}. ID: ${appointment.id}`
  } catch (e) {
    if (e instanceof AgendaError) return `FALHOU (${e.code}): ${e.message}`
    throw e
  }
}

export async function executeServiceTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  if (!SERVICE_TOOL_NAMES.includes(name) && name !== DELIVERY_TOOL_NAME) return null

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
      case 'consultar_status_reparo':
        return await consultarStatusReparo(String(input.atendimento_id ?? ''), String(input.telefone ?? ''))
      case 'agendar_entrega_aparelho':
        return await agendarEntregaAparelho({
          atendimento_id: String(input.atendimento_id ?? ''),
          cliente_nome: String(input.cliente_nome ?? ''),
          cliente_telefone: String(input.cliente_telefone ?? ''),
          data: String(input.data ?? ''),
          horario: String(input.horario ?? ''),
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
