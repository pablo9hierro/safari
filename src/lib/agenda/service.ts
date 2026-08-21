import { createServiceClient } from '@/lib/supabase/service'
import {
  AgendaError,
  MIN_JUSTIFICATION_LENGTH,
  type ActorType,
  type AgendaSettings,
  type Appointment,
  type AppointmentEvent,
  type AvailabilityResult,
  type BusinessHours,
} from './types'
import {
  formatStoreDateTime,
  freeRangesForDay,
  overlaps,
  slotsForDay,
  storeDateKey,
  withinBusinessHours,
  type Interval,
} from './slots'
import { REPAIR_DONE_STATUSES } from '@/lib/serviceLifecycle/types'

/** Status que ocupam horário — os demais liberam o slot. */
const LIVE_STATUSES = ['agendado', 'remarcado'] as const

/**
 * Granularidade interna só pra listar exemplos de horário (grade de gestão
 * do painel e "alternativas" quando um pedido é recusado) — não é mais uma
 * config do lojista, a oferta real ao cliente/IA é por faixa contínua
 * (ver freeRangesForDay). 15min é fino o bastante pra não escapar do bloco.
 */
const INTERNAL_GRID_MINUTES = 15

type Db = ReturnType<typeof createServiceClient>

export async function getSettings(db: Db = createServiceClient()): Promise<AgendaSettings> {
  const { data, error } = await db.from('agenda_settings').select('*').eq('id', 'default').single()
  if (error) throw new AgendaError(`Falha ao ler configuração da agenda: ${error.message}`, 'validation')
  return data as AgendaSettings
}

export async function getBusinessHours(db: Db = createServiceClient()): Promise<BusinessHours[]> {
  const { data, error } = await db.from('agenda_business_hours').select('*').order('weekday').order('open_time')
  if (error) throw new AgendaError(`Falha ao ler horário de funcionamento: ${error.message}`, 'validation')
  return (data ?? []) as BusinessHours[]
}

export type BusinessHoursInput = { weekday: number; open_time: string; close_time: string }

/**
 * Substitui o horário de funcionamento inteiro. Cada dia pode ter vários
 * blocos (ex: manhã 08-12 e tarde 14-18) — dia sem nenhum bloco = fechado.
 * Sempre reescreve tudo (não há PATCH incremental) pra não ter que resolver
 * diffs no cliente.
 */
export async function setBusinessHours(
  blocks: BusinessHoursInput[],
  db: Db = createServiceClient(),
): Promise<BusinessHours[]> {
  for (const b of blocks) {
    if (b.weekday < 0 || b.weekday > 6) {
      throw new AgendaError(`Dia da semana inválido: ${b.weekday}`, 'validation')
    }
    if (!/^\d{2}:\d{2}$/.test(b.open_time) || !/^\d{2}:\d{2}$/.test(b.close_time)) {
      throw new AgendaError('Horário inválido — use HH:MM.', 'validation')
    }
    if (b.close_time <= b.open_time) {
      throw new AgendaError('O horário de fechamento precisa ser depois do de abertura.', 'validation')
    }
  }
  // Overlap entre blocos do mesmo dia — dois blocos que se cruzam tornam o
  // cálculo de faixas livres ambíguo (a mesma janela contada duas vezes).
  const byDay = new Map<number, BusinessHoursInput[]>()
  for (const b of blocks) byDay.set(b.weekday, [...(byDay.get(b.weekday) ?? []), b])
  for (const [, dayBlocks] of byDay) {
    const sorted = [...dayBlocks].sort((a, b) => a.open_time.localeCompare(b.open_time))
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].open_time < sorted[i - 1].close_time) {
        throw new AgendaError('Blocos de horário do mesmo dia não podem se sobrepor.', 'validation')
      }
    }
  }

  const { error: delError } = await db.from('agenda_business_hours').delete().gte('weekday', 0)
  if (delError) throw new AgendaError(`Falha ao atualizar horário: ${delError.message}`, 'validation')

  if (blocks.length === 0) return []

  const { data, error } = await db
    .from('agenda_business_hours')
    .insert(blocks)
    .select()
    .order('weekday')
    .order('open_time')
  if (error) throw new AgendaError(`Falha ao salvar horário: ${error.message}`, 'validation')
  return (data ?? []) as BusinessHours[]
}

/** Agendamentos vivos que tocam a janela informada. */
async function liveAppointmentsInRange(db: Db, from: Date, to: Date): Promise<Appointment[]> {
  const { data, error } = await db
    .from('appointments')
    .select('*')
    .in('status', LIVE_STATUSES as unknown as string[])
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at')
  if (error) throw new AgendaError(`Falha ao consultar agendamentos: ${error.message}`, 'validation')
  return (data ?? []) as Appointment[]
}

async function blocksInRange(db: Db, from: Date, to: Date): Promise<Interval[]> {
  const { data, error } = await db
    .from('agenda_blocks')
    .select('starts_at, ends_at')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
  if (error) throw new AgendaError(`Falha ao consultar bloqueios: ${error.message}`, 'validation')
  return (data ?? []).map((b: { starts_at: string; ends_at: string }) => ({
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
  }))
}

/**
 * Atendimentos com bancada ocupada agora (diagnóstico ou reparo em
 * andamento, `service_requests.busy_until` calculado a partir do
 * `duration_minutes` do serviço no catálogo — ver
 * `serviceLifecycle/store.ts::startOccupation`). Ninguém consegue agendar
 * um horário que colida com essa janela: o intervalo vai de "agora" até
 * `busy_until`, já que o que importa pra disponibilidade futura é só o
 * fim, não quando o atendimento realmente começou.
 */
async function dynamicOccupationInRange(db: Db, from: Date, to: Date): Promise<Interval[]> {
  // NULL nunca satisfaz .gt()/.lt() em SQL -- exclui linhas sem busy_until
  // sem precisar de um .not('is', null) explícito (que os fakes de teste
  // não implementam de qualquer forma).
  const { data, error } = await db
    .from('service_requests')
    .select('busy_until')
    .gt('busy_until', from.toISOString())
    .lt('busy_until', to.toISOString())
  if (error) throw new AgendaError(`Falha ao consultar ocupação dinâmica: ${error.message}`, 'validation')
  const now = new Date()
  return (data ?? [])
    .map((r: { busy_until: string }) => ({ start: now, end: new Date(r.busy_until) }))
    .filter((i) => i.end > now)
}

/**
 * Próximos horários livres a partir de um instante, varrendo dia a dia.
 * Usado tanto pra sugerir alternativa quanto pra listar disponibilidade.
 */
export async function findAvailableSlots(
  from: Date,
  durationMinutes: number,
  limit: number,
  db: Db = createServiceClient(),
  settingsInput?: AgendaSettings,
  hoursInput?: BusinessHours[],
): Promise<Interval[]> {
  const settings = settingsInput ?? (await getSettings(db))
  const hours = hoursInput ?? (await getBusinessHours(db))

  const horizon = new Date(from.getTime() + settings.max_advance_days * 86_400_000)
  const [appointments, blocks] = await Promise.all([
    liveAppointmentsInRange(db, from, horizon),
    blocksInRange(db, from, horizon),
  ])
  const busy: Interval[] = [
    ...appointments.map((a) => ({ start: new Date(a.starts_at), end: new Date(a.ends_at) })),
    ...blocks,
  ]

  const earliest = new Date(from.getTime() + settings.lead_time_minutes * 60_000)
  const found: Interval[] = []

  for (let dayOffset = 0; dayOffset <= settings.max_advance_days && found.length < limit; dayOffset++) {
    const cursor = new Date(from.getTime() + dayOffset * 86_400_000)
    const slots = slotsForDay(storeDateKey(cursor), hours, INTERNAL_GRID_MINUTES, durationMinutes)
    for (const slot of slots) {
      if (found.length >= limit) break
      if (slot.start < earliest) continue
      if (busy.some((b) => overlaps(slot, b))) continue
      found.push(slot)
    }
  }
  return found
}

/**
 * Faixas de disponibilidade contínua de um dia (ex: "08:00-12:00 e
 * 14:00-18:00"), já considerando expediente, agendamentos/bloqueios vivos
 * (expandidos pelo buffer) e o piso mínimo a partir de agora. Isso substitui
 * a grade fixa como forma de OFERECER horário ao cliente/IA -- a validação
 * final de um horário específico continua em checkAvailability.
 */
export async function getFreeRangesForDay(
  dateKey: string,
  db: Db = createServiceClient(),
  settingsInput?: AgendaSettings,
  hoursInput?: BusinessHours[],
): Promise<Interval[]> {
  const settings = settingsInput ?? (await getSettings(db))
  const hours = hoursInput ?? (await getBusinessHours(db))

  const dayStart = parseDateKeyStartOfDayUtc(dateKey)
  const dayEnd = new Date(dayStart.getTime() + 2 * 86_400_000) // janela generosa, corta no fuso da loja abaixo
  const [appointments, blocks, occupation] = await Promise.all([
    liveAppointmentsInRange(db, dayStart, dayEnd),
    blocksInRange(db, dayStart, dayEnd),
    dynamicOccupationInRange(db, dayStart, dayEnd),
  ])
  const busy: Interval[] = [
    ...appointments.map((a) => ({ start: new Date(a.starts_at), end: new Date(a.ends_at) })),
    ...blocks,
    ...occupation,
  ]

  const minLeadMs = Math.max(settings.lead_time_minutes, settings.buffer_minutes) * 60_000
  const floor = new Date(Date.now() + minLeadMs)

  return freeRangesForDay(dateKey, hours, busy, settings.buffer_minutes, floor)
}

function parseDateKeyStartOfDayUtc(dateKey: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) throw new AgendaError(`Data invalida: "${dateKey}"`, 'validation')
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1))
}

/**
 * O horário pedido está livre? Quando não, diz POR QUE e oferece alternativas.
 * a IA precisa dessa distinção pra não inventar justificativa.
 */
export async function checkAvailability(
  startsAt: Date,
  durationMinutes: number,
  db: Db = createServiceClient(),
  opts: { ignoreAppointmentId?: string } = {},
): Promise<AvailabilityResult> {
  const settings = await getSettings(db)
  const hours = await getBusinessHours(db)
  const interval: Interval = {
    start: startsAt,
    end: new Date(startsAt.getTime() + durationMinutes * 60_000),
  }

  const alternatives = async () =>
    (await findAvailableSlots(new Date(), durationMinutes, 3, db, settings, hours)).map((s) => ({
      starts_at: s.start.toISOString(),
      ends_at: s.end.toISOString(),
    }))

  // Piso mínimo pra começar: o maior entre antecedência mínima e o buffer
  // (o buffer também vale a partir de "agora", não só entre agendamentos —
  // ver regra do produto: "10h agora + buffer 30 = só a partir de 10h31").
  const minLeadMs = Math.max(settings.lead_time_minutes, settings.buffer_minutes) * 60_000
  const earliest = new Date(Date.now() + minLeadMs)
  if (interval.start < earliest) {
    return {
      available: false,
      reason: 'muito_em_cima',
      detail:
        minLeadMs > 0
          ? `É preciso agendar com pelo menos ${Math.round(minLeadMs / 60_000)} minutos de antecedência.`
          : 'Esse horário já passou.',
      alternatives: await alternatives(),
    }
  }

  if (!withinBusinessHours(interval, hours)) {
    return {
      available: false,
      reason: 'fora_do_horario',
      detail: 'A loja não está aberta nesse horário.',
      alternatives: await alternatives(),
    }
  }

  const bufferMs = settings.buffer_minutes * 60_000
  const expanded: Interval = {
    start: new Date(interval.start.getTime() - bufferMs),
    end: new Date(interval.end.getTime() + bufferMs),
  }

  const blocks = await blocksInRange(db, interval.start, interval.end)
  if (blocks.some((b) => overlaps(interval, b))) {
    return {
      available: false,
      reason: 'bloqueado',
      detail: 'Esse horário está bloqueado na agenda da loja.',
      alternatives: await alternatives(),
    }
  }

  const appointments = await liveAppointmentsInRange(db, expanded.start, expanded.end)
  const conflicting = appointments.filter((a) => a.id !== opts.ignoreAppointmentId)
  if (conflicting.length > 0) {
    return {
      available: false,
      reason: 'ocupado',
      detail:
        settings.buffer_minutes > 0
          ? `Esse horário fica muito perto de outro atendimento já marcado — é preciso pelo menos ${settings.buffer_minutes} minutos de intervalo.`
          : 'Já existe um atendimento marcado nesse horário.',
      alternatives: await alternatives(),
    }
  }

  const occupation = await dynamicOccupationInRange(db, expanded.start, expanded.end)
  if (occupation.some((o) => overlaps(interval, o))) {
    return {
      available: false,
      reason: 'ocupado',
      detail: 'A bancada está ocupada com outro atendimento (diagnóstico/reparo em andamento) até esse horário.',
      alternatives: await alternatives(),
    }
  }

  return {
    available: true,
    starts_at: interval.start.toISOString(),
    ends_at: interval.end.toISOString(),
  }
}

/** Duração do serviço — o catálogo não tem duração própria, cai no padrão. */
export async function resolveService(
  serviceId: string | null,
  fallbackLabel: string | null,
  db: Db = createServiceClient(),
): Promise<{ service_id: string | null; service_label: string; duration_minutes: number }> {
  const settings = await getSettings(db)
  if (!serviceId) {
    if (!fallbackLabel?.trim()) {
      throw new AgendaError('É necessário informar o serviço do agendamento.', 'validation')
    }
    return {
      service_id: null,
      service_label: fallbackLabel.trim(),
      duration_minutes: settings.default_duration_minutes,
    }
  }
  const { data, error } = await db
    .from('service_catalog_items')
    .select('id, model_name, repair_type, duration_minutes')
    .eq('id', serviceId)
    .maybeSingle()
  if (error) throw new AgendaError(`Falha ao buscar serviço: ${error.message}`, 'validation')
  if (!data) throw new AgendaError('Serviço não encontrado no catálogo.', 'not_found')
  return {
    service_id: data.id as string,
    service_label: `${data.model_name} — ${data.repair_type}`,
    // A duração do serviço cobre coleta + manutenção + entrega, e é ela que
    // define quanto tempo o agendamento ocupa a agenda.
    duration_minutes: (data.duration_minutes as number) || settings.default_duration_minutes,
  }
}

function assertJustification(justification: string | undefined, actorType: ActorType) {
  // Só o admin precisa justificar: o cliente/IA cancelando é decisão do próprio cliente.
  if (actorType !== 'admin') return
  const text = (justification ?? '').trim()
  if (text.length < MIN_JUSTIFICATION_LENGTH) {
    throw new AgendaError(
      `A justificativa é obrigatória e precisa ter pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres (recebido: ${text.length}).`,
      'justification_too_short',
    )
  }
}

async function recordEvent(
  db: Db,
  event: Omit<AppointmentEvent, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await db.from('appointment_events').insert(event)
  if (error) throw new AgendaError(`Falha ao registrar auditoria: ${error.message}`, 'validation')
}

export type DeviceAppointmentType = 'device_collection' | 'device_delivery' | 'device_pickup'

export type CreateAppointmentInput = {
  service_id?: string | null
  service_label?: string | null
  customer_name: string
  customer_phone: string
  starts_at: Date
  duration_minutes?: number
  notes?: string | null
  actor_type: ActorType
  actor_id?: string | null
  appointment_type?: 'service' | DeviceAppointmentType
  /** Obrigatório nos tipos `device_*` — precisa estar vinculado ao atendimento. */
  service_request_id?: string | null
}

const DEVICE_APPOINTMENT_LABEL: Record<DeviceAppointmentType, string> = {
  device_collection: 'Coleta',
  device_delivery: 'Entrega',
  device_pickup: 'Retirada',
}

/**
 * Regra de status por subtipo de agendamento de aparelho:
 * - coleta: o aparelho ainda está com o cliente — vale em qualquer etapa
 *   ativa do atendimento (antes de cancelado/finalizado/já entregue).
 * - entrega/retirada: o aparelho só está pronto pra sair da loja depois do
 *   reparo concluído.
 */
function assertDeviceAppointmentAllowed(type: DeviceAppointmentType, status: string): string | null {
  if (type === 'device_collection') {
    const blocked = ['cancelled', 'rejected', 'finished', 'delivered']
    if (blocked.includes(status)) {
      return `Não dá pra agendar coleta — este atendimento já está com status "${status}".`
    }
    return null
  }
  if (!(REPAIR_DONE_STATUSES as string[]).includes(status)) {
    const acao = type === 'device_delivery' ? 'a entrega' : 'a retirada'
    return `Ainda não dá pra agendar ${acao} — o reparo precisa estar concluído primeiro (status atual: ${status}).`
  }
  return null
}

export type ServiceRequestSource = 'storefront_form' | 'storefront_booking' | 'whatsapp_ai' | 'admin_manual' | 'pdv'

/**
 * Cria a `service_requests` que todo agendamento de serviço precisa ter por
 * trás, independente da origem (vitrine, WhatsApp, PDV, admin) -- é o que faz
 * o agendamento aparecer na mesma fila de "Solicitações" do painel, como se
 * o lojista tivesse cadastrado manualmente. Sempre cria uma linha nova (não
 * tenta casar com uma já existente) -- cada agendamento é seu próprio
 * atendimento.
 */
export async function ensureServiceRequestForAppointment(
  input: {
    customer_name: string
    customer_phone: string
    customer_email?: string | null
    problem_description?: string | null
    service_label: string
    source: ServiceRequestSource
    /** 'em_busca' pro fluxo normal (self_pickup=false aqui, nasce já em
     * deslocamento -- nunca fica "pendente" esperando aceite manual); PDV
     * usa 'accepted' -- orçamento já foi acordado no balcão, pula a coleta. */
    status?: string
  },
  db: Db = createServiceClient(),
): Promise<string> {
  const { data, error } = await db
    .from('service_requests')
    .insert({
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.replace(/\D/g, ''),
      customer_email: input.customer_email?.trim() || null,
      problem_description: input.problem_description?.trim() || `Agendamento: ${input.service_label}`,
      selected_service_ids: [],
      diagnosis_requested: false,
      self_pickup: false,
      payment_methods: [],
      status: input.status ?? 'em_busca',
      source: input.source,
    })
    .select('id')
    .single()
  if (error) throw new AgendaError(`Falha ao criar solicitação: ${error.message}`, 'validation')
  return data.id as string
}

export async function createAppointment(
  input: CreateAppointmentInput,
  db: Db = createServiceClient(),
): Promise<Appointment> {
  if (!input.customer_name?.trim()) {
    throw new AgendaError('Nome do cliente é obrigatório.', 'validation')
  }
  if (!input.customer_phone?.trim()) {
    throw new AgendaError('Telefone do cliente é obrigatório.', 'validation')
  }

  const deviceType =
    input.appointment_type && input.appointment_type !== 'service'
      ? (input.appointment_type as DeviceAppointmentType)
      : null
  let serviceId: string | null = null
  let serviceLabel: string
  let duration: number

  if (deviceType) {
    if (!input.service_request_id) {
      throw new AgendaError(
        `${DEVICE_APPOINTMENT_LABEL[deviceType]} do aparelho precisa estar vinculada ao atendimento (service_request_id).`,
        'validation',
      )
    }
    const { data: req, error: reqErr } = await db
      .from('service_requests')
      .select('id, status, phone_model')
      .eq('id', input.service_request_id)
      .maybeSingle()
    if (reqErr || !req) throw new AgendaError('Atendimento não encontrado.', 'not_found')

    const blockedReason = assertDeviceAppointmentAllowed(deviceType, req.status as string)
    if (blockedReason) throw new AgendaError(blockedReason, 'validation')

    serviceLabel = `${DEVICE_APPOINTMENT_LABEL[deviceType]} — ${req.phone_model ?? 'aparelho'}`
    duration = input.duration_minutes ?? 15
  } else {
    const service = await resolveService(input.service_id ?? null, input.service_label ?? null, db)
    serviceId = service.service_id
    serviceLabel = service.service_label
    duration = input.duration_minutes ?? service.duration_minutes
  }

  const availability = await checkAvailability(input.starts_at, duration, db)
  if (!availability.available) {
    throw new AgendaError(
      `Horário indisponível (${availability.reason}): ${availability.detail}`,
      'conflict',
    )
  }

  const endsAt = new Date(input.starts_at.getTime() + duration * 60_000)
  const { data, error } = await db
    .from('appointments')
    .insert({
      service_id: serviceId,
      service_label: serviceLabel,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.replace(/\D/g, ''),
      starts_at: input.starts_at.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'agendado',
      notes: input.notes ?? null,
      created_by: input.actor_type === 'admin' ? 'admin' : 'assistente',
      appointment_type: deviceType ?? 'service',
      // Vínculo é obrigatório pra device_* (validado acima) e agora também
      // aceito (opcional) pra 'service' -- é o que permite o auto-release da
      // agenda quando o atendimento vinculado é marcado como concluído.
      service_request_id: input.service_request_id ?? null,
    })
    .select()
    .single()

  if (error) {
    // 23P01 = exclusion_violation: outra requisição pegou o slot entre a
    // checagem e o insert. A constraint do banco é a autoridade final.
    if (error.code === '23P01') {
      throw new AgendaError('Esse horário acabou de ser ocupado por outro agendamento.', 'conflict')
    }
    throw new AgendaError(`Falha ao criar agendamento: ${error.message}`, 'validation')
  }

  const appointment = data as Appointment
  await recordEvent(db, {
    appointment_id: appointment.id,
    action: 'created',
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    justification: null,
    previous_starts_at: null,
    previous_ends_at: null,
    new_starts_at: appointment.starts_at,
    new_ends_at: appointment.ends_at,
  })
  return appointment
}

export async function getAppointment(
  id: string,
  db: Db = createServiceClient(),
): Promise<Appointment | null> {
  const { data, error } = await db.from('appointments').select('*').eq('id', id).maybeSingle()
  if (error) throw new AgendaError(`Falha ao buscar agendamento: ${error.message}`, 'validation')
  return (data as Appointment) ?? null
}

export async function getAppointmentEvents(
  id: string,
  db: Db = createServiceClient(),
): Promise<AppointmentEvent[]> {
  const { data, error } = await db
    .from('appointment_events')
    .select('*')
    .eq('appointment_id', id)
    .order('created_at', { ascending: false })
  if (error) throw new AgendaError(`Falha ao buscar histórico: ${error.message}`, 'validation')
  return (data ?? []) as AppointmentEvent[]
}

export type ListFilters = {
  date?: string
  from?: Date
  to?: Date
  service_id?: string
  customer?: string
  phone?: string
  status?: string
}

export async function listAppointments(
  filters: ListFilters = {},
  db: Db = createServiceClient(),
): Promise<Appointment[]> {
  let q = db.from('appointments').select('*').order('starts_at')

  if (filters.date) {
    const dayStart = new Date(`${filters.date}T00:00:00.000Z`)
    // Janela generosa: cobre o dia local inteiro em qualquer offset do Brasil.
    q = q
      .gte('starts_at', new Date(dayStart.getTime() - 86_400_000).toISOString())
      .lt('starts_at', new Date(dayStart.getTime() + 2 * 86_400_000).toISOString())
  }
  if (filters.from) q = q.gte('starts_at', filters.from.toISOString())
  if (filters.to) q = q.lt('starts_at', filters.to.toISOString())
  if (filters.service_id) q = q.eq('service_id', filters.service_id)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.customer) q = q.ilike('customer_name', `%${filters.customer}%`)
  if (filters.phone) q = q.ilike('customer_phone', `%${filters.phone.replace(/\D/g, '')}%`)

  const { data, error } = await q
  if (error) throw new AgendaError(`Falha ao listar agendamentos: ${error.message}`, 'validation')

  let rows = (data ?? []) as Appointment[]
  // Recorta pro dia local de verdade (a janela acima é propositalmente larga).
  if (filters.date) rows = rows.filter((a) => storeDateKey(new Date(a.starts_at)) === filters.date)
  return rows
}

export type DaySlot = {
  starts_at: string
  ends_at: string
  available: boolean
  /** Só preenchido quando indisponível. */
  reason?: 'ocupado' | 'bloqueado' | 'muito_em_cima'
  /** Nome do cliente/serviço — visível só para o lojista. */
  label?: string
}

/**
 * Grade do dia inteiro: o dia começa 100% disponível e vai sendo ocupado
 * conforme atendimentos são marcados (pelo cliente ou pelo lojista) e
 * horários são bloqueados.
 *
 * `includePrivate` decide se os rótulos internos (nome do cliente, motivo do
 * bloqueio) acompanham o resultado — o painel do lojista mostra, o cliente não.
 */
export async function getDayAvailability(
  dateKey: string,
  durationMinutes: number,
  db: Db = createServiceClient(),
  opts: { includePrivate?: boolean } = {},
): Promise<DaySlot[]> {
  const settings = await getSettings(db)
  const hours = await getBusinessHours(db)
  const slots = slotsForDay(dateKey, hours, INTERNAL_GRID_MINUTES, durationMinutes)
  if (slots.length === 0) return []

  const dayStart = slots[0].start
  const dayEnd = slots[slots.length - 1].end
  const [appointments, blocks] = await Promise.all([
    liveAppointmentsInRange(db, dayStart, dayEnd),
    listBlocks(dayStart, dayEnd, db),
  ])

  const earliest = new Date(Date.now() + settings.lead_time_minutes * 60_000)

  return slots.map((slot) => {
    const appt = appointments.find((a) =>
      overlaps(slot, { start: new Date(a.starts_at), end: new Date(a.ends_at) }),
    )
    if (appt) {
      return {
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        available: false,
        reason: 'ocupado' as const,
        ...(opts.includePrivate
          ? { label: `${appt.customer_name} — ${appt.service_label}` }
          : {}),
      }
    }

    const block = blocks.find((b) =>
      overlaps(slot, { start: new Date(b.starts_at), end: new Date(b.ends_at) }),
    )
    if (block) {
      return {
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        available: false,
        reason: 'bloqueado' as const,
        ...(opts.includePrivate ? { label: block.reason ?? 'Bloqueado' } : {}),
      }
    }

    if (slot.start < earliest) {
      return {
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        available: false,
        reason: 'muito_em_cima' as const,
      }
    }

    return { starts_at: slot.start.toISOString(), ends_at: slot.end.toISOString(), available: true }
  })
}

export type RescheduleResult = {
  appointment: Appointment
  previous: { starts_at: string; ends_at: string }
}

export async function rescheduleAppointment(
  id: string,
  newStartsAt: Date,
  opts: {
    actor_type: ActorType
    actor_id?: string | null
    justification?: string
    duration_minutes?: number
  },
  db: Db = createServiceClient(),
): Promise<RescheduleResult> {
  assertJustification(opts.justification, opts.actor_type)

  const current = await getAppointment(id, db)
  if (!current) throw new AgendaError('Agendamento não encontrado.', 'not_found')
  if (current.status === 'cancelado') {
    throw new AgendaError('Não é possível remarcar um agendamento cancelado.', 'validation')
  }

  const duration =
    opts.duration_minutes ??
    Math.round((new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime()) / 60_000)

  const availability = await checkAvailability(newStartsAt, duration, db, { ignoreAppointmentId: id })
  if (!availability.available) {
    throw new AgendaError(
      `Novo horário indisponível (${availability.reason}): ${availability.detail}`,
      'conflict',
    )
  }

  const newEndsAt = new Date(newStartsAt.getTime() + duration * 60_000)
  const { data, error } = await db
    .from('appointments')
    .update({
      starts_at: newStartsAt.toISOString(),
      ends_at: newEndsAt.toISOString(),
      status: 'remarcado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23P01') {
      throw new AgendaError('Esse horário acabou de ser ocupado por outro agendamento.', 'conflict')
    }
    throw new AgendaError(`Falha ao remarcar: ${error.message}`, 'validation')
  }

  await recordEvent(db, {
    appointment_id: id,
    action: 'rescheduled',
    actor_type: opts.actor_type,
    actor_id: opts.actor_id ?? null,
    justification: opts.justification?.trim() ?? null,
    previous_starts_at: current.starts_at,
    previous_ends_at: current.ends_at,
    new_starts_at: newStartsAt.toISOString(),
    new_ends_at: newEndsAt.toISOString(),
  })

  return {
    appointment: data as Appointment,
    previous: { starts_at: current.starts_at, ends_at: current.ends_at },
  }
}

export async function cancelAppointment(
  id: string,
  opts: { actor_type: ActorType; actor_id?: string | null; justification?: string },
  db: Db = createServiceClient(),
): Promise<Appointment> {
  assertJustification(opts.justification, opts.actor_type)

  const current = await getAppointment(id, db)
  if (!current) throw new AgendaError('Agendamento não encontrado.', 'not_found')
  if (current.status === 'cancelado') return current

  // Nunca DELETE — cancelar é transição de status, o histórico permanece.
  const { data, error } = await db
    .from('appointments')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new AgendaError(`Falha ao cancelar: ${error.message}`, 'validation')

  await recordEvent(db, {
    appointment_id: id,
    action: 'cancelled',
    actor_type: opts.actor_type,
    actor_id: opts.actor_id ?? null,
    justification: opts.justification?.trim() ?? null,
    previous_starts_at: current.starts_at,
    previous_ends_at: current.ends_at,
    new_starts_at: null,
    new_ends_at: null,
  })
  return data as Appointment
}

/**
 * Conclui o atendimento. Se terminou antes do previsto, o fim é encurtado
 * para agora — e o tempo que sobrava volta a ficar livre na agenda.
 *
 * Ex.: atendimento 09:00–09:40 concluído às 09:20 libera 09:20–09:40 para
 * outro cliente marcar.
 */
export async function completeAppointment(
  id: string,
  opts: { actor_type: ActorType; actor_id?: string | null },
  db: Db = createServiceClient(),
): Promise<{ appointment: Appointment; freed_minutes: number }> {
  const current = await getAppointment(id, db)
  if (!current) throw new AgendaError('Agendamento não encontrado.', 'not_found')
  if (current.status === 'cancelado') {
    throw new AgendaError('Não é possível concluir um agendamento cancelado.', 'validation')
  }
  if (current.status === 'concluido') return { appointment: current, freed_minutes: 0 }

  const now = new Date()
  const plannedEnd = new Date(current.ends_at)
  // Nunca estica o fim: concluir depois do previsto não deve invadir o
  // horário de quem vem em seguida.
  const newEnd = now < plannedEnd ? now : plannedEnd
  // Um atendimento não pode terminar antes de começar (concluído na mesma
  // hora em que foi criado, por exemplo).
  const start = new Date(current.starts_at)
  const effectiveEnd = newEnd > start ? newEnd : plannedEnd
  const freedMinutes = Math.max(
    0,
    Math.round((plannedEnd.getTime() - effectiveEnd.getTime()) / 60_000),
  )

  const { data, error } = await db
    .from('appointments')
    .update({
      status: 'concluido',
      ends_at: effectiveEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new AgendaError(`Falha ao concluir: ${error.message}`, 'validation')

  await recordEvent(db, {
    appointment_id: id,
    action: 'completed',
    actor_type: opts.actor_type,
    actor_id: opts.actor_id ?? null,
    justification: freedMinutes > 0 ? `Concluído ${freedMinutes} min antes do previsto.` : null,
    previous_starts_at: current.starts_at,
    previous_ends_at: current.ends_at,
    new_starts_at: current.starts_at,
    new_ends_at: effectiveEnd.toISOString(),
  })

  return { appointment: data as Appointment, freed_minutes: freedMinutes }
}

export type AgendaBlock = {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
  created_at: string
}

export async function listBlocks(
  from: Date,
  to: Date,
  db: Db = createServiceClient(),
): Promise<AgendaBlock[]> {
  const { data, error } = await db
    .from('agenda_blocks')
    .select('*')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at')
  if (error) throw new AgendaError(`Falha ao listar bloqueios: ${error.message}`, 'validation')
  return (data ?? []) as AgendaBlock[]
}

/**
 * Bloqueia um intervalo na agenda. O motivo é interno — o cliente só enxerga
 * que o horário está indisponível, nunca a justificativa.
 */
export async function createBlock(
  startsAt: Date,
  endsAt: Date,
  reason: string,
  db: Db = createServiceClient(),
): Promise<AgendaBlock> {
  if (endsAt <= startsAt) {
    throw new AgendaError('O fim do bloqueio precisa ser depois do início.', 'validation')
  }

  // Bloquear por cima de atendimento já marcado deixaria o cliente com um
  // horário confirmado que a loja não vai honrar.
  const conflitos = await liveAppointmentsInRange(db, startsAt, endsAt)
  if (conflitos.length > 0) {
    const lista = conflitos
      .map((a) => `${formatStoreDateTime(a.starts_at)} (${a.customer_name})`)
      .join(', ')
    throw new AgendaError(
      `Já existe atendimento marcado nesse intervalo: ${lista}. Remarque ou cancele antes de bloquear.`,
      'conflict',
    )
  }

  const { data, error } = await db
    .from('agenda_blocks')
    .insert({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: reason.trim() || null,
    })
    .select()
    .single()
  if (error) throw new AgendaError(`Falha ao bloquear horário: ${error.message}`, 'validation')
  return data as AgendaBlock
}

export async function deleteBlock(id: string, db: Db = createServiceClient()): Promise<void> {
  const { error } = await db.from('agenda_blocks').delete().eq('id', id)
  if (error) throw new AgendaError(`Falha ao liberar horário: ${error.message}`, 'validation')
}

/** Texto curto pro cliente — usado nas mensagens automáticas e nas tools. */
export function describeAppointment(a: Appointment): string {
  return `${a.service_label} — ${formatStoreDateTime(a.starts_at)}`
}
