export type AppointmentStatus =
  | 'agendado'
  | 'remarcado'
  | 'cancelado'
  | 'concluido'
  | 'nao_compareceu'

export type ActorType = 'assistente' | 'admin' | 'cliente'

export type AgendaSettings = {
  id: string
  appointment_ai_enabled: boolean
  slot_minutes: number
  default_duration_minutes: number
  lead_time_minutes: number
  max_advance_days: number
}

export type BusinessHours = {
  weekday: number
  closed: boolean
  open_time: string
  close_time: string
}

export type Appointment = {
  id: string
  service_id: string | null
  service_label: string
  customer_name: string
  customer_phone: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  notes: string | null
  created_by: 'assistente' | 'admin'
  created_at: string
  updated_at: string
}

export type AppointmentEvent = {
  id: string
  appointment_id: string
  action: 'created' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'
  actor_type: ActorType
  actor_id: string | null
  justification: string | null
  previous_starts_at: string | null
  previous_ends_at: string | null
  new_starts_at: string | null
  new_ends_at: string | null
  created_at: string
}

/** Por que um horário não pode ser usado — a IA precisa distinguir os casos. */
export type UnavailableReason = 'ocupado' | 'bloqueado' | 'fora_do_horario' | 'muito_em_cima'

export type AvailabilityResult =
  | { available: true; starts_at: string; ends_at: string }
  | {
      available: false
      reason: UnavailableReason
      detail: string
      alternatives: { starts_at: string; ends_at: string }[]
    }

/** Justificativa administrativa: mínimo exigido pelo negócio. */
export const MIN_JUSTIFICATION_LENGTH = 20

export class AgendaError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'validation'
      | 'conflict'
      | 'not_found'
      | 'disabled'
      | 'justification_too_short',
  ) {
    super(message)
    this.name = 'AgendaError'
  }
}
