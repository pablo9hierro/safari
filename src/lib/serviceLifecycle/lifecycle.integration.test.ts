/**
 * Ciclo completo de assistência técnica contra o banco real do vrtech.
 * Opt-in (RUN_LIVE=1); cria e limpa seus próprios dados.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import {
  approveServiceQuote,
  cancelServiceRequest,
  getActiveServicesForPhone,
  getRepairStatus,
  getServiceDiagnostic,
  getServiceStatus,
  rejectServiceQuote,
} from './store'
import { ServiceLifecycleError } from './types'
import { createAppointment } from '@/lib/agenda/service'
import { AgendaError } from '@/lib/agenda/types'
import { parseStoreDateTime, bookingWindowDays, storeDateKey } from '@/lib/agenda/slots'

const live = process.env.RUN_LIVE === '1'
const PHONE_A = '5583900000021'
const PHONE_B = '5583900000022'
const createdIds: string[] = []
const createdAppointmentIds: string[] = []

/**
 * Uma segunda-feira (sempre aberta, 09–18) bem à frente, com um horário
 * diferente a cada chamada — evita depender de que dia da semana é
 * "hoje"/"amanhã" quando o teste roda (a janela de 2 dias da loja pode cair
 * num fim de semana fechado). `createAppointment` em si não impõe a janela
 * de hoje/amanhã — isso é responsabilidade da camada de tools —, então
 * testar a regra de "reparo concluído" aqui com uma data mais distante é
 * válido.
 */
let slotHour = 9
function findOpenSlot(): { dateKey: string; time: string } {
  const now = new Date()
  const next = new Date(now.getTime() + 14 * 86_400_000)
  while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1) // segunda-feira
  const dateKey = storeDateKey(next)
  const time = `${String(slotHour++).padStart(2, '0')}:00`
  return { dateKey, time }
}

async function seedRequest(db: ReturnType<typeof createServiceClient>, overrides: Record<string, unknown>) {
  const { data, error } = await db
    .from('service_requests')
    .insert({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      customer_email: 'teste@exemplo.com',
      phone_model: 'iPhone 13',
      problem_description: 'Tela trincada (teste automatizado)',
      status: 'pending',
      ...overrides,
    })
    .select()
    .single()
  if (error) throw error
  createdIds.push(data.id)
  return data
}

describe.skipIf(!live)('ciclo de assistência técnica (banco real)', () => {
  afterAll(async () => {
    const db = createServiceClient()
    if (createdAppointmentIds.length) {
      await db.from('appointments').delete().in('id', createdAppointmentIds)
    }
    if (createdIds.length) {
      await db.from('service_diagnostics').delete().in('service_request_id', createdIds)
      await db.from('service_orders').delete().in('request_id', createdIds)
      await db.from('service_requests').delete().in('id', createdIds)
    }
  })

  it('lista só os atendimentos do telefone certo (isolamento por cliente)', async () => {
    const db = createServiceClient()
    const reqA = await seedRequest(db, { customer_phone: PHONE_A })
    await seedRequest(db, { customer_phone: PHONE_B })

    const rowsA = await getActiveServicesForPhone(PHONE_A)
    const rowsB = await getActiveServicesForPhone(PHONE_B)

    expect(rowsA.some((r) => r.id === reqA.id)).toBe(true)
    expect(rowsB.some((r) => r.id === reqA.id)).toBe(false)
  })

  it('consultar status de atendimento de outro telefone é recusado (not_found)', async () => {
    const db = createServiceClient()
    const reqA = await seedRequest(db, { customer_phone: PHONE_A })

    const err = await getServiceStatus(reqA.id, PHONE_B).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceLifecycleError)
    expect(err.code).toBe('not_found')
  })

  it('status "aguardando_diagnostico" não expõe diagnóstico nem orçamento', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'aguardando_diagnostico' })

    const status = await getServiceStatus(req.id, PHONE_A)
    expect(status.status).toBe('aguardando_diagnostico')
    expect(status.quote_value).toBeNull()

    const diag = await getServiceDiagnostic(req.id, PHONE_A)
    expect(diag).toBeNull()
  })

  it('diagnóstico concluído expõe serviços/observações/valor, nunca owner_notes', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, {
      status: 'diagnostico_enviado',
      quote_value: 250,
      owner_notes: 'NUNCA DEVE APARECER PRO CLIENTE — nota interna do lojista',
    })
    await db.from('service_diagnostics').insert({
      service_request_id: req.id,
      services_selected: ['Troca de tela'],
      notes: 'Tela com múltiplas trincas, display ok.',
      quote_confirmed: 250,
    })

    const diag = await getServiceDiagnostic(req.id, PHONE_A)
    expect(diag?.services_selected).toContain('Troca de tela')
    expect(diag?.quote_value).toBe(250)
    expect(JSON.stringify(diag)).not.toContain('NUNCA DEVE APARECER')
  })

  it('aprovar orçamento fora do status "diagnostico_enviado" é recusado', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'pending' })

    const err = await approveServiceQuote(req.id, PHONE_A).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceLifecycleError)
    expect(err.code).toBe('invalid_transition')

    const after = await getServiceStatus(req.id, PHONE_A)
    expect(after.status).toBe('pending')
  })

  it('aprova o orçamento e transiciona pra "accepted"', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'diagnostico_enviado', quote_value: 180 })

    const result = await approveServiceQuote(req.id, PHONE_A)
    expect(result.status).toBe('accepted')

    const after = await getServiceStatus(req.id, PHONE_A)
    expect(after.status).toBe('accepted')
  })

  it('não deixa outro telefone aprovar o orçamento', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'diagnostico_enviado', quote_value: 180 })

    const err = await approveServiceQuote(req.id, PHONE_B).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceLifecycleError)
    expect(err.code).toBe('not_found')

    const after = await getServiceStatus(req.id, PHONE_A)
    expect(after.status).toBe('diagnostico_enviado')
  })

  it('recusa o orçamento e transiciona pra "cancelled" (mesmo status que o painel usa aqui, não "rejected")', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'diagnostico_enviado', quote_value: 180 })

    const result = await rejectServiceQuote(req.id, PHONE_A)
    expect(result.status).toBe('cancelled')
  })

  it('cancelar_atendimento funciona em pending/aguardando_diagnostico/diagnostico_enviado', async () => {
    const db = createServiceClient()
    for (const status of ['pending', 'aguardando_diagnostico', 'diagnostico_enviado']) {
      const req = await seedRequest(db, { status })
      const result = await cancelServiceRequest(req.id, PHONE_A, 'Desisti da manutenção.')
      expect(result.status).toBe('cancelled')
    }
  })

  it('cancelar_atendimento anexa o motivo em owner_notes sem apagar nota anterior', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'pending', owner_notes: 'Nota antiga do lojista.' })
    await cancelServiceRequest(req.id, PHONE_A, 'Comprei outro aparelho.')

    const { data } = await db.from('service_requests').select('owner_notes').eq('id', req.id).single()
    expect(data?.owner_notes).toContain('Nota antiga do lojista.')
    expect(data?.owner_notes).toContain('Comprei outro aparelho.')
  })

  it('cancelar_atendimento é recusado depois de aprovado (accepted)', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'accepted' })
    const err = await cancelServiceRequest(req.id, PHONE_A, 'mudei de ideia').catch((e) => e)
    expect(err).toBeInstanceOf(ServiceLifecycleError)
    expect(err.code).toBe('invalid_transition')
  })

  it('cancelar_atendimento não deixa outro telefone cancelar', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'pending' })
    const err = await cancelServiceRequest(req.id, PHONE_B, undefined).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceLifecycleError)
    expect(err.code).toBe('not_found')
  })

  it('reparo em andamento não expõe resumo do reparo', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'in_progress' })
    const repair = await getRepairStatus(req.id, PHONE_A)
    expect(repair).toBeNull()
  })

  it('reparo concluído expõe o resumo real, nunca checklist/used_parts internos', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'completed' })
    await db.from('service_orders').insert({
      request_id: req.id,
      checklist: [{ item: 'Teste de bateria', internal: 'nota interna do técnico' }],
      completed_services: 'Troca de tela',
      warranty: '90 dias',
      final_value: 250,
      closed_at: new Date().toISOString(),
    })

    const repair = await getRepairStatus(req.id, PHONE_A)
    expect(repair?.completed_services).toBe('Troca de tela')
    expect(repair?.warranty).toBe('90 dias')
    expect(JSON.stringify(repair)).not.toContain('nota interna do técnico')
  })

  it('não deixa agendar entrega com o reparo ainda em andamento', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'in_progress' })
    const dia = bookingWindowDays()[1].key

    const err = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dia, '11:00'),
      actor_type: 'assistente',
      appointment_type: 'device_delivery',
      service_request_id: req.id,
    }).catch((e) => e)

    expect(err).toBeInstanceOf(AgendaError)
    expect(err.message).toMatch(/reparo precisa estar concluído/)
  })

  it('agenda a entrega normalmente quando o reparo já terminou', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'completed', phone_model: 'iPhone 13' })
    const { dateKey, time } = findOpenSlot()

    const appt = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_delivery',
      service_request_id: req.id,
    })
    createdAppointmentIds.push(appt.id)

    expect(appt.appointment_type).toBe('device_delivery')
    expect(appt.service_request_id).toBe(req.id)
    expect(appt.service_label).toContain('iPhone 13')
  })

  it('também aceita "em_pagamento" como reparo concluído pra fins de entrega', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'em_pagamento' })
    const { dateKey, time } = findOpenSlot()

    const appt = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_delivery',
      service_request_id: req.id,
    })
    createdAppointmentIds.push(appt.id)
    expect(appt.status).toBe('agendado')
  })

  it('coleta pode ser agendada logo no início, antes até do diagnóstico', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'pending' })
    const { dateKey, time } = findOpenSlot()

    const appt = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_collection',
      service_request_id: req.id,
    })
    createdAppointmentIds.push(appt.id)
    expect(appt.appointment_type).toBe('device_collection')
  })

  it('coleta é recusada quando o atendimento já foi cancelado/finalizado', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'cancelled' })
    const { dateKey, time } = findOpenSlot()

    const err = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_collection',
      service_request_id: req.id,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AgendaError)
  })

  it('retirada segue a mesma regra da entrega — só após reparo concluído', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'in_progress' })
    const { dateKey, time } = findOpenSlot()

    const err = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_pickup',
      service_request_id: req.id,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AgendaError)
    expect(err.message).toMatch(/retirada/)
  })

  it('retirada funciona normalmente com o reparo concluído', async () => {
    const db = createServiceClient()
    const req = await seedRequest(db, { status: 'completed' })
    const { dateKey, time } = findOpenSlot()

    const appt = await createAppointment({
      customer_name: 'Cliente Teste Ciclo',
      customer_phone: PHONE_A,
      starts_at: parseStoreDateTime(dateKey, time),
      actor_type: 'assistente',
      appointment_type: 'device_pickup',
      service_request_id: req.id,
    })
    createdAppointmentIds.push(appt.id)
    expect(appt.appointment_type).toBe('device_pickup')
  })
})
