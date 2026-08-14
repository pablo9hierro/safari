/**
 * Valida contra o banco real as regras de duração, conclusão antecipada e
 * antecedência mínima. Opt-in (RUN_LIVE=1); limpa o que cria.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { createAppointment, completeAppointment, checkAvailability, getSettings, resolveService, getDayAvailability } from './service'
import { storeDateKey, parseStoreDateTime, bookingWindowDays } from './slots'

const live = process.env.RUN_LIVE === '1'
const PHONE = '5583900000009'

describe.skipIf(!live)('duração e liberação de horário (banco real)', () => {
  afterAll(async () => {
    const db = createServiceClient()
    await db.from('appointments').delete().eq('customer_phone', PHONE)
  })

  it('serviço do catálogo tem duração própria e ela manda no agendamento', async () => {
    const db = createServiceClient()
    const { data: svc } = await db
      .from('service_catalog_items')
      .select('id, duration_minutes')
      .eq('active', true)
      .limit(1)
      .single()
    expect(svc?.duration_minutes).toBeGreaterThan(0)

    const resolved = await resolveService(svc!.id, null)
    expect(resolved.duration_minutes).toBe(svc!.duration_minutes)
  })

  it('o agendamento ocupa exatamente a duração do serviço', async () => {
    const db = createServiceClient()
    const { data: svc } = await db
      .from('service_catalog_items')
      .select('id, duration_minutes')
      .eq('active', true)
      .limit(1)
      .single()

    // Amanhã evita colidir com a antecedência mínima de hoje.
    const amanha = bookingWindowDays()[1].key
    const appt = await createAppointment({
      service_id: svc!.id,
      customer_name: 'Teste Duração',
      customer_phone: PHONE,
      starts_at: parseStoreDateTime(amanha, '10:00'),
      actor_type: 'admin',
    })
    const minutos = Math.round(
      (new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000,
    )
    expect(minutos).toBe(svc!.duration_minutes)
  })

  it('concluir antes do previsto libera o tempo restante', async () => {
    const db = createServiceClient()
    // Atendimento EM ANDAMENTO: começou há 1h e terminaria daqui a 1h.
    // Inserido direto porque createAppointment (com razão) recusa horário
    // no passado — aqui o objetivo é justamente ter um já em curso.
    const inicio = new Date(Date.now() - 60 * 60_000)
    const fimPrevisto = new Date(Date.now() + 60 * 60_000)
    const { data: criado, error } = await db
      .from('appointments')
      .insert({
        service_label: 'Teste em andamento',
        customer_name: 'Teste Duração',
        customer_phone: PHONE,
        starts_at: inicio.toISOString(),
        ends_at: fimPrevisto.toISOString(),
        status: 'agendado',
        created_by: 'admin',
      })
      .select()
      .single()
    expect(error).toBeNull()

    const { freed_minutes, appointment } = await completeAppointment(criado!.id, {
      actor_type: 'admin',
    })

    // Terminou 1h antes do previsto: essa hora volta a ficar livre.
    expect(freed_minutes).toBeGreaterThan(55)
    expect(appointment.status).toBe('concluido')
    expect(new Date(appointment.ends_at).getTime()).toBeLessThan(fimPrevisto.getTime())
  })

  it('concluir um atendimento que ainda nem começou não encurta nada', async () => {
    // Encurtar para "agora" deixaria o fim antes do início — o previsto é mantido.
    const db = createServiceClient()
    const { data: appts } = await db
      .from('appointments')
      .select('id, ends_at')
      .eq('customer_phone', PHONE)
      .eq('status', 'agendado')
      .limit(1)
    if (!appts?.[0]) return

    const { freed_minutes, appointment } = await completeAppointment(appts[0].id, {
      actor_type: 'admin',
    })
    expect(freed_minutes).toBe(0)
    expect(new Date(appointment.ends_at).getTime()).toBe(new Date(appts[0].ends_at).getTime())
  })

  it('antecedência mínima impede marcar "pra agora"', async () => {
    const settings = await getSettings()
    expect(settings.lead_time_minutes).toBeGreaterThan(0)

    const daqui1min = new Date(Date.now() + 60_000)
    const r = await checkAvailability(daqui1min, 30)
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('muito_em_cima')
  })

  it('a grade do dia oferece horários e nunca começa antes da folga mínima', async () => {
    const settings = await getSettings()
    const hoje = await getDayAvailability(storeDateKey(new Date()), 30)
    const livres = hoje.filter((s) => s.available)
    const limite = Date.now() + settings.lead_time_minutes * 60_000
    for (const s of livres) {
      expect(new Date(s.starts_at).getTime()).toBeGreaterThanOrEqual(limite)
    }
  })

  it('a loja só agenda hoje e amanhã', async () => {
    const dias = bookingWindowDays()
    expect(dias).toHaveLength(2)
    expect(dias[0].label).toMatch(/^Hoje/)
    expect(dias[1].label).toMatch(/^Amanhã/)
  })
})
