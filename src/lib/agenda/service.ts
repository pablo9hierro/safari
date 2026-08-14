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
  overlaps,
  slotsForDay,
  storeDateKey,
  withinBusinessHours,
  type Interval,
} from './slots'

/** Status que ocupam horário — os demais liberam o slot. */
const LIVE_STATUSES = ['agendado', 'remarcado'] as const

type Db = ReturnType<typeof createServiceClient>

export async function getSettings(db: Db = createServiceClient()): Promise<AgendaSettings> {
  const { data, error } = await db.from('agenda_settings').select('*').eq('id', 'default').single()
  if (error) throw new AgendaError(`Falha ao ler configuração da agenda: ${error.message}`, 'validation')
  return data as AgendaSettings
}

export async function getBusinessHours(db: Db = createServiceClient()): Promise<BusinessHours[]> {
  const { data, error } = await db.from('agenda_business_hours').select('*').order('weekday')
  if (error) throw new AgendaError(`Falha ao ler horário de funcionamento: ${error.message}`, 'validation')
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
    const slots = slotsForDay(storeDateKey(cursor), hours, settings.slot_minutes, durationMinutes)
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
 * O horário pedido está livre? Quando não, diz POR QUE e oferece alternativas —
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

  const earliest = new Date(Date.now() + settings.lead_time_minutes * 60_000)
  if (interval.start < earliest) {
    return {
      available: false,
      reason: 'muito_em_cima',
      detail:
        settings.lead_time_minutes > 0
          ? `É preciso agendar com pelo menos ${settings.lead_time_minutes} minutos de antecedência.`
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

  const blocks = await blocksInRange(db, interval.start, interval.end)
  if (blocks.some((b) => overlaps(interval, b))) {
    return {
      available: false,
      reason: 'bloqueado',
      detail: 'Esse horário está bloqueado na agenda da loja.',
      alternatives: await alternatives(),
    }
  }

  const appointments = await liveAppointmentsInRange(db, interval.start, interval.end)
  const conflicting = appointments.filter((a) => a.id !== opts.ignoreAppointmentId)
  if (conflicting.length > 0) {
    return {
      available: false,
      reason: 'ocupado',
      detail: 'Já existe um atendimento marcado nesse horário.',
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
    .select('id, model_name, repair_type')
    .eq('id', serviceId)
    .maybeSingle()
  if (error) throw new AgendaError(`Falha ao buscar serviço: ${error.message}`, 'validation')
  if (!data) throw new AgendaError('Serviço não encontrado no catálogo.', 'not_found')
  return {
    service_id: data.id as string,
    service_label: `${data.model_name} — ${data.repair_type}`,
    duration_minutes: settings.default_duration_minutes,
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

  const service = await resolveService(input.service_id ?? null, input.service_label ?? null, db)
  const duration = input.duration_minutes ?? service.duration_minutes

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
      service_id: service.service_id,
      service_label: service.service_label,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.replace(/\D/g, ''),
      starts_at: input.starts_at.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'agendado',
      notes: input.notes ?? null,
      created_by: input.actor_type === 'admin' ? 'admin' : 'assistente',
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

/** Texto curto pro cliente — usado nas mensagens automáticas e nas tools. */
export function describeAppointment(a: Appointment): string {
  return `${a.service_label} — ${formatStoreDateTime(a.starts_at)}`
}
