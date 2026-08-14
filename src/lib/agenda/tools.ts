import type { ToolDef } from '@/lib/assistant/aiClient'
import {
  cancelAppointment,
  checkAvailability,
  createAppointment,
  getAppointment,
  getDayAvailability,
  listAppointments,
  rescheduleAppointment,
  resolveService,
  getSettings,
} from './service'
import {
  bookingWindowDays,
  dateKeyToBr,
  formatStoreDateTime,
  formatStoreTime,
  parseStoreDateTime,
  storeDateKey,
} from './slots'
import { AgendaError, type Appointment } from './types'
import { notifyAppointmentCreated } from './notifications'

/**
 * Tools de agenda oferecidas à Assistente IA. Só entram na lista enviada ao
 * modelo quando `agenda_settings.appointment_ai_enabled` está ligado — ver
 * `agendaToolsEnabled()`.
 */
export const AGENDA_TOOLS: ToolDef[] = [
  {
    name: 'consultar_agenda',
    description:
      'Lista os agendamentos já marcados da loja num dia específico. Use pra saber como está a agenda, NUNCA pra afirmar que um horário está livre (pra isso use consultar_disponibilidade).',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Dia no formato AAAA-MM-DD (ex: 2026-08-20)' },
      },
      required: ['data'],
    },
  },
  {
    name: 'consultar_disponibilidade',
    description:
      'Verifica horários livres para agendamento. OBRIGATÓRIO rodar antes de dizer ao cliente que qualquer horário está disponível. Omita "horario" para receber a lista de horários livres de HOJE e AMANHÃ — a loja só agenda nesses dois dias, e a lista já respeita a antecedência mínima (o primeiro horário oferecido nunca é "agora"). Ofereça essa lista ao cliente e pergunte se ele prefere hoje ou amanhã e em qual horário. Informe "servico_id" para que a duração considerada seja a do serviço escolhido.',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Dia desejado: "hoje", "amanhã" ou dd/mm/aaaa. Omita para ver os dois dias.' },
        horario: { type: 'string', description: 'Horário desejado em HH:MM, formato 24h (ex: 15:00 para 3 da tarde). Omita para listar as vagas livres.' },
        servico_id: { type: 'string', description: 'ID do serviço vindo de buscar_servicos, quando já souber qual é.' },
      },
      required: [],
    },
  },
  {
    name: 'criar_agendamento',
    description:
      'Cria o agendamento do serviço na agenda da loja. Todo serviço de assistência técnica EXIGE agendamento, inclusive quando o cliente quer ser atendido agora — nesse caso, ofereça o primeiro horário livre. O tempo que o agendamento ocupa vem da duração cadastrada do serviço (coleta + manutenção + entrega). Só chame depois de o cliente confirmar dia e horário. O backend revalida a disponibilidade e recusa se o horário já tiver sido ocupado.',
    parameters: {
      type: 'object',
      properties: {
        servico_id: { type: 'string', description: 'ID do serviço obtido em buscar_servicos — é ele que define a duração.' },
        servico_nome: { type: 'string', description: 'Nome do serviço, caso não exista no catálogo.' },
        cliente_nome: { type: 'string', description: 'Nome do cliente.' },
        cliente_telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente (só dígitos).' },
        data: { type: 'string', description: '"hoje" ou "amanhã" (também aceita dd/mm/aaaa). A loja só agenda nesses dois dias.' },
        horario: { type: 'string', description: 'Horário em HH:MM, formato 24h (ex: 14:00 para 2 da tarde).' },
        observacoes: { type: 'string', description: 'Observações relevantes (defeito relatado, etc).' },
      },
      required: ['cliente_nome', 'cliente_telefone', 'data', 'horario'],
    },
  },
  {
    name: 'consultar_agendamento',
    description:
      'Busca os agendamentos de um cliente pelo telefone, ou um agendamento específico pelo ID. Use pra confirmar detalhes antes de cancelar ou remarcar.',
    parameters: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Telefone do cliente (só dígitos).' },
        agendamento_id: { type: 'string', description: 'ID do agendamento, quando já conhecido.' },
      },
      required: [],
    },
  },
  {
    name: 'cancelar_agendamento',
    description:
      'Cancela um agendamento a pedido do cliente. O registro não é apagado, só passa a status cancelado e o horário volta a ficar livre.',
    parameters: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'string', description: 'ID do agendamento (obtenha em consultar_agendamento).' },
        motivo: { type: 'string', description: 'Motivo informado pelo cliente, quando houver.' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'remarcar_agendamento',
    description:
      'Move um agendamento existente para outro horário. O backend valida a disponibilidade do novo horário e recusa se estiver ocupado.',
    parameters: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'string', description: 'ID do agendamento.' },
        data: { type: 'string', description: 'Novo dia no formato AAAA-MM-DD.' },
        horario: { type: 'string', description: 'Novo horário no formato HH:MM.' },
        motivo: { type: 'string', description: 'Motivo informado pelo cliente, quando houver.' },
      },
      required: ['agendamento_id', 'data', 'horario'],
    },
  },
]

export const AGENDA_TOOL_NAMES = AGENDA_TOOLS.map((t) => t.name)

/** Feature flag por loja — enquanto false, a IA nem enxerga as tools de agenda. */
export async function agendaToolsEnabled(): Promise<boolean> {
  try {
    const settings = await getSettings()
    return settings.appointment_ai_enabled === true
  } catch {
    return false
  }
}

function formatAppointment(a: Appointment): string {
  const status = a.status === 'remarcado' ? 'agendado (remarcado)' : a.status
  return `- ${formatStoreDateTime(a.starts_at)} | ${a.service_label} | ${a.customer_name} (${a.customer_phone}) | ${status} | ID: ${a.id}`
}

async function consultarAgenda(data: string): Promise<string> {
  const rows = await listAppointments({ date: data })
  const live = rows.filter((a) => a.status === 'agendado' || a.status === 'remarcado')
  if (live.length === 0) return `Nenhum agendamento marcado em ${data}.`
  return `Agendamentos em ${data}:\n${live.map(formatAppointment).join('\n')}`
}

/** Aceita "hoje"/"amanhã" além de AAAA-MM-DD — é assim que o cliente fala. */
function resolveDateKey(input?: string): string | null {
  const dias = bookingWindowDays()
  if (!input) return null
  const t = input.trim().toLowerCase()
  if (t === 'hoje') return dias[0].key
  if (t === 'amanha' || t === 'amanhã') return dias[1].key
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // dd/mm/aaaa, que é como o cliente costuma escrever.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

async function consultarDisponibilidade(input: {
  data?: string
  horario?: string
  servico_id?: string
}): Promise<string> {
  const service = await resolveService(input.servico_id ?? null, 'consulta', undefined)
  const duration = service.duration_minutes
  const dias = bookingWindowDays()

  // Sem horário específico → lista as vagas reais de hoje e amanhã. A folga
  // mínima já está aplicada, então o primeiro horário oferecido nunca é
  // "agora" — o cliente não chega a ver um horário que não daria tempo.
  if (!input.horario) {
    const alvo = resolveDateKey(input.data)
    const chaves = alvo ? [alvo] : dias.map((d) => d.key)
    const blocos: string[] = []

    for (const key of chaves) {
      const slots = (await getDayAvailability(key, duration)).filter((s) => s.available)
      const rotulo = dias.find((d) => d.key === key)?.label ?? dateKeyToBr(key)
      blocos.push(
        slots.length === 0
          ? `${rotulo}: sem horários livres.`
          : `${rotulo}:\n${slots.map((s) => `  - ${formatStoreTime(s.starts_at)}`).join('\n')}`,
      )
    }
    return [
      `Duração do atendimento: ${duration} min (coleta + manutenção + entrega).`,
      ...blocos,
      'Pergunte ao cliente se prefere HOJE ou AMANHÃ e qual desses horários.',
    ].join('\n')
  }

  const dateKey = resolveDateKey(input.data)
  if (!dateKey) return 'Informe a data como "hoje", "amanhã" ou no formato dd/mm/aaaa.'
  if (!dias.some((d) => d.key === dateKey)) {
    return `FORA DA JANELA: a loja só agenda para hoje (${dateKeyToBr(dias[0].key)}) ou amanhã (${dateKeyToBr(dias[1].key)}).`
  }

  const startsAt = parseStoreDateTime(dateKey, input.horario)
  const result = await checkAvailability(startsAt, duration)

  if (result.available) {
    return `DISPONÍVEL: ${formatStoreDateTime(result.starts_at)} está livre — o atendimento ocupa até ${formatStoreTime(result.ends_at)} (${duration} min).`
  }

  const alts = result.alternatives.length
    ? `\nHorários alternativos livres:\n${result.alternatives.map((a) => `- ${formatStoreDateTime(a.starts_at)}`).join('\n')}`
    : '\nNão há horários alternativos no período.'
  return `INDISPONÍVEL (${result.reason}): ${result.detail}${alts}`
}

async function criarAgendamento(input: {
  servico_id?: string
  servico_nome?: string
  cliente_nome: string
  cliente_telefone: string
  data: string
  horario: string
  observacoes?: string
}): Promise<string> {
  const dateKey = resolveDateKey(input.data)
  if (!dateKey) return 'FALHOU (validation): informe a data como "hoje", "amanhã" ou dd/mm/aaaa.'
  const dias = bookingWindowDays()
  if (!dias.some((d) => d.key === dateKey)) {
    return `FALHOU (validation): a loja só agenda para hoje (${dateKeyToBr(dias[0].key)}) ou amanhã (${dateKeyToBr(dias[1].key)}).`
  }

  const startsAt = parseStoreDateTime(dateKey, input.horario)
  const appointment = await createAppointment({
    service_id: input.servico_id ?? null,
    service_label: input.servico_nome ?? null,
    customer_name: input.cliente_nome,
    customer_phone: input.cliente_telefone,
    starts_at: startsAt,
    notes: input.observacoes ?? null,
    actor_type: 'assistente',
  })
  await notifyAppointmentCreated(appointment)
  return `AGENDAMENTO CONFIRMADO: ${appointment.service_label} em ${formatStoreDateTime(appointment.starts_at)} (até ${formatStoreTime(appointment.ends_at)}) para ${appointment.customer_name}. ID: ${appointment.id}`
}

async function consultarAgendamento(input: {
  telefone?: string
  agendamento_id?: string
}): Promise<string> {
  if (input.agendamento_id) {
    const a = await getAppointment(input.agendamento_id)
    if (!a) return 'Agendamento não encontrado.'
    return formatAppointment(a)
  }
  if (!input.telefone) return 'Informe o telefone do cliente ou o ID do agendamento.'
  const rows = await listAppointments({ phone: input.telefone })
  if (rows.length === 0) return 'Nenhum agendamento encontrado para este número.'
  return rows.slice(-5).map(formatAppointment).join('\n')
}

async function cancelarAgendamento(input: { agendamento_id: string; motivo?: string }): Promise<string> {
  const a = await cancelAppointment(input.agendamento_id, {
    actor_type: 'cliente',
    justification: input.motivo,
  })
  return `CANCELADO: ${a.service_label} que estava marcado para ${formatStoreDateTime(a.starts_at)}. O horário voltou a ficar livre.`
}

async function remarcarAgendamento(input: {
  agendamento_id: string
  data: string
  horario: string
  motivo?: string
}): Promise<string> {
  const dateKey = resolveDateKey(input.data)
  if (!dateKey) return 'FALHOU (validation): informe a data como "hoje", "amanhã" ou dd/mm/aaaa.'
  const startsAt = parseStoreDateTime(dateKey, input.horario)
  const { appointment, previous } = await rescheduleAppointment(input.agendamento_id, startsAt, {
    actor_type: 'cliente',
    justification: input.motivo,
  })
  return `REMARCADO: de ${formatStoreDateTime(previous.starts_at)} para ${formatStoreDateTime(appointment.starts_at)}. ID: ${appointment.id}`
}

/** Executor das tools de agenda. Retorna null quando o nome não é de agenda. */
export async function executeAgendaTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  if (!AGENDA_TOOL_NAMES.includes(name)) return null

  try {
    switch (name) {
      case 'consultar_agenda':
        return await consultarAgenda(String(input.data ?? storeDateKey(new Date())))
      case 'consultar_disponibilidade':
        return await consultarDisponibilidade({
          data: input.data ? String(input.data) : undefined,
          horario: input.horario ? String(input.horario) : undefined,
          servico_id: input.servico_id ? String(input.servico_id) : undefined,
        })
      case 'criar_agendamento':
        return await criarAgendamento({
          servico_id: input.servico_id ? String(input.servico_id) : undefined,
          servico_nome: input.servico_nome ? String(input.servico_nome) : undefined,
          cliente_nome: String(input.cliente_nome ?? ''),
          cliente_telefone: String(input.cliente_telefone ?? ''),
          data: String(input.data ?? ''),
          horario: String(input.horario ?? ''),
          observacoes: input.observacoes ? String(input.observacoes) : undefined,
        })
      case 'consultar_agendamento':
        return await consultarAgendamento({
          telefone: input.telefone ? String(input.telefone) : undefined,
          agendamento_id: input.agendamento_id ? String(input.agendamento_id) : undefined,
        })
      case 'cancelar_agendamento':
        return await cancelarAgendamento({
          agendamento_id: String(input.agendamento_id ?? ''),
          motivo: input.motivo ? String(input.motivo) : undefined,
        })
      case 'remarcar_agendamento':
        return await remarcarAgendamento({
          agendamento_id: String(input.agendamento_id ?? ''),
          data: String(input.data ?? ''),
          horario: String(input.horario ?? ''),
          motivo: input.motivo ? String(input.motivo) : undefined,
        })
      default:
        return null
    }
  } catch (e) {
    // Erro de agenda vira texto pro modelo — ele precisa saber que FALHOU e
    // não pode confirmar nada pro cliente.
    if (e instanceof AgendaError) return `FALHOU (${e.code}): ${e.message}`
    return `FALHOU: ${e instanceof Error ? e.message : String(e)}`
  }
}
