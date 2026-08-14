import { describe, it, expect, beforeEach, vi } from 'vitest'
import { seedDb, type FakeDb } from './fakeDb'
import { parseStoreDateTime } from './slots'
import { AgendaError, MIN_JUSTIFICATION_LENGTH } from './types'
import {
  cancelAppointment,
  checkAvailability,
  createAppointment,
  findAvailableSlots,
  getAppointmentEvents,
  listAppointments,
  rescheduleAppointment,
} from './service'

// O módulo importa createServiceClient no topo; nos testes injetamos o fake
// pelo último parâmetro `db` de cada função (por isso ele existe).
type Db = Parameters<typeof createAppointment>[1]
const asDb = (db: FakeDb) => db as unknown as Db

// Quinta-feira, dentro do expediente. Congelado pra o teste não depender do dia real.
const REF_DATE = '2026-08-20'
const NOW = parseStoreDateTime(REF_DATE, '08:00')

let db: FakeDb

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  db = seedDb()
})

const baseInput = (time: string) => ({
  service_id: 'svc-1',
  customer_name: 'Fernando',
  customer_phone: '83999998888',
  starts_at: parseStoreDateTime(REF_DATE, time),
  actor_type: 'assistente' as const,
})

describe('criação de agendamento', () => {
  it('cria e congela o nome do serviço vindo do catálogo', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    expect(a.service_label).toBe('iPhone 12 — Troca de tela')
    expect(a.status).toBe('agendado')
    expect(a.created_by).toBe('assistente')
    // 60min é a duração padrão da configuração.
    expect(new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()).toBe(60 * 60_000)
  })

  it('normaliza o telefone pra só dígitos', async () => {
    const a = await createAppointment(
      { ...baseInput('14:00'), customer_phone: '(83) 99999-8888' },
      asDb(db),
    )
    expect(a.customer_phone).toBe('83999998888')
  })

  it('exige nome e telefone', async () => {
    await expect(
      createAppointment({ ...baseInput('14:00'), customer_name: '' }, asDb(db)),
    ).rejects.toThrow(/Nome do cliente/)
    await expect(
      createAppointment({ ...baseInput('14:00'), customer_phone: '' }, asDb(db)),
    ).rejects.toThrow(/Telefone do cliente/)
  })

  it('recusa serviço que não existe no catálogo', async () => {
    await expect(
      createAppointment({ ...baseInput('14:00'), service_id: 'nao-existe' }, asDb(db)),
    ).rejects.toThrow(/não encontrado/)
  })

  it('registra evento de auditoria na criação', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    const events = await getAppointmentEvents(a.id, asDb(db))
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('created')
    expect(events[0].actor_type).toBe('assistente')
    expect(events[0].new_starts_at).toBe(a.starts_at)
  })
})

describe('proteção contra double-booking', () => {
  it('recusa segundo agendamento no mesmo horário', async () => {
    await createAppointment(baseInput('14:00'), asDb(db))
    await expect(createAppointment(baseInput('14:00'), asDb(db))).rejects.toThrow(/indisponível|ocupado/i)
  })

  it('recusa sobreposição parcial', async () => {
    await createAppointment(baseInput('14:00'), asDb(db))
    // 14:30 ainda cai dentro do atendimento de 14:00–15:00.
    await expect(createAppointment(baseInput('14:30'), asDb(db))).rejects.toThrow(/indisponível|ocupado/i)
  })

  it('aceita horário adjacente (encostado, sem sobrepor)', async () => {
    await createAppointment(baseInput('14:00'), asDb(db))
    const a = await createAppointment(baseInput('15:00'), asDb(db))
    expect(a.status).toBe('agendado')
  })

  it('em corrida simultânea pelo mesmo slot, só um vence', async () => {
    // Ambas passam pela checagem antes de qualquer insert — quem perde é
    // barrado pela constraint do banco, não pela checagem da aplicação.
    const results = await Promise.allSettled([
      createAppointment(baseInput('16:00'), asDb(db)),
      createAppointment(baseInput('16:00'), asDb(db)),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(db.tables.appointments).toHaveLength(1)
  })

  it('cancelar libera o horário pra outro cliente', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await cancelAppointment(a.id, { actor_type: 'cliente' }, asDb(db))
    const novo = await createAppointment(baseInput('14:00'), asDb(db))
    expect(novo.status).toBe('agendado')
  })
})

describe('consulta de disponibilidade', () => {
  it('diz disponível quando o horário está livre', async () => {
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '14:00'), 60, asDb(db))
    expect(r.available).toBe(true)
  })

  it('diz "ocupado" e sugere alternativas reais quando já há atendimento', async () => {
    await createAppointment(baseInput('14:00'), asDb(db))
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '14:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.reason).toBe('ocupado')
    expect(r.alternatives.length).toBeGreaterThan(0)
    // Nenhuma alternativa pode colidir com o que já está marcado.
    for (const alt of r.alternatives) {
      expect(new Date(alt.starts_at).getTime()).not.toBe(parseStoreDateTime(REF_DATE, '14:00').getTime())
    }
  })

  it('diz "fora_do_horario" depois do fechamento', async () => {
    // 20:00 ainda está no futuro (agora são 08:00), mas a loja fecha 18:00 —
    // então o motivo tem que ser o expediente, não a antecedência.
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '20:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('fora_do_horario')
  })

  it('horário no passado é "muito_em_cima", não "fora_do_horario"', async () => {
    // 07:00 está antes da abertura E no passado; a checagem de tempo vem
    // primeiro porque é a informação mais útil pro cliente.
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '07:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('muito_em_cima')
  })

  it('diz "fora_do_horario" em dia fechado (domingo)', async () => {
    const r = await checkAvailability(parseStoreDateTime('2026-08-23', '10:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('fora_do_horario')
  })

  it('diz "bloqueado" quando cai num bloqueio da loja', async () => {
    db.tables.agenda_blocks.push({
      id: 'blk-1',
      starts_at: parseStoreDateTime(REF_DATE, '12:00').toISOString(),
      ends_at: parseStoreDateTime(REF_DATE, '13:00').toISOString(),
      reason: 'Almoço',
    })
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '12:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('bloqueado')
  })

  it('diz "muito_em_cima" pra horário que já passou', async () => {
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '07:00'), 60, asDb(db))
    expect(r.available).toBe(false)
  })

  it('respeita a antecedência mínima configurada', async () => {
    db.tables.agenda_settings[0].lead_time_minutes = 120
    // 09:00 está aberto, mas agora são 08:00 e o mínimo é 2h.
    const r = await checkAvailability(parseStoreDateTime(REF_DATE, '09:00'), 60, asDb(db))
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toBe('muito_em_cima')
  })

  it('lista próximas vagas livres pulando as ocupadas', async () => {
    await createAppointment(baseInput('09:00'), asDb(db))
    const slots = await findAvailableSlots(NOW, 60, 3, asDb(db))
    expect(slots.length).toBe(3)
    // 09:00 e 09:30 colidem com o atendimento de 09:00–10:00.
    expect(slots[0].start.getTime()).toBe(parseStoreDateTime(REF_DATE, '10:00').getTime())
  })
})

describe('remarcação', () => {
  it('move o agendamento e guarda o horário anterior', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    const { appointment, previous } = await rescheduleAppointment(
      a.id,
      parseStoreDateTime(REF_DATE, '16:00'),
      { actor_type: 'admin', justification: 'Técnico responsável ficou indisponível hoje.' },
      asDb(db),
    )
    expect(appointment.status).toBe('remarcado')
    expect(previous.starts_at).toBe(a.starts_at)
    expect(new Date(appointment.starts_at).getTime()).toBe(parseStoreDateTime(REF_DATE, '16:00').getTime())
  })

  it('preserva a duração original', async () => {
    const a = await createAppointment({ ...baseInput('14:00'), duration_minutes: 30 }, asDb(db))
    const { appointment } = await rescheduleAppointment(
      a.id,
      parseStoreDateTime(REF_DATE, '16:00'),
      { actor_type: 'admin', justification: 'Reorganização da agenda do dia inteiro.' },
      asDb(db),
    )
    expect(new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()).toBe(30 * 60_000)
  })

  it('recusa remarcar pra horário ocupado', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await createAppointment({ ...baseInput('16:00'), customer_name: 'Outro' }, asDb(db))
    await expect(
      rescheduleAppointment(
        a.id,
        parseStoreDateTime(REF_DATE, '16:00'),
        { actor_type: 'admin', justification: 'Tentativa de mover pra horário ocupado.' },
        asDb(db),
      ),
    ).rejects.toThrow(/indisponível|ocupado/i)
  })

  it('não conta o próprio agendamento como conflito', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    // Mover 14:00→14:30 sobrepõe o próprio horário atual: deve ser permitido.
    const { appointment } = await rescheduleAppointment(
      a.id,
      parseStoreDateTime(REF_DATE, '14:30'),
      { actor_type: 'admin', justification: 'Pequeno ajuste de meia hora no horário.' },
      asDb(db),
    )
    expect(new Date(appointment.starts_at).getTime()).toBe(parseStoreDateTime(REF_DATE, '14:30').getTime())
  })

  it('registra a remarcação na auditoria com horários e justificativa', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    const justification = 'Técnico responsável ficará indisponível no horário original.'
    await rescheduleAppointment(
      a.id,
      parseStoreDateTime(REF_DATE, '16:00'),
      { actor_type: 'admin', actor_id: 'admin@vrtech', justification },
      asDb(db),
    )
    const events = await getAppointmentEvents(a.id, asDb(db))
    const ev = events.find((e) => e.action === 'rescheduled')
    expect(ev).toBeDefined()
    expect(ev!.justification).toBe(justification)
    expect(ev!.actor_id).toBe('admin@vrtech')
    expect(ev!.previous_starts_at).toBe(a.starts_at)
  })

  it('não remarca agendamento cancelado', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await cancelAppointment(a.id, { actor_type: 'cliente' }, asDb(db))
    await expect(
      rescheduleAppointment(
        a.id,
        parseStoreDateTime(REF_DATE, '16:00'),
        { actor_type: 'admin', justification: 'Tentando remarcar algo já cancelado.' },
        asDb(db),
      ),
    ).rejects.toThrow(/cancelado/)
  })
})

describe('justificativa administrativa (mínimo 20 caracteres, no servidor)', () => {
  const short = 'muito curto'

  it('recusa remarcação do admin com justificativa curta', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await expect(
      rescheduleAppointment(
        a.id,
        parseStoreDateTime(REF_DATE, '16:00'),
        { actor_type: 'admin', justification: short },
        asDb(db),
      ),
    ).rejects.toMatchObject({ code: 'justification_too_short' })
  })

  it('recusa remarcação do admin sem justificativa nenhuma', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await expect(
      rescheduleAppointment(
        a.id,
        parseStoreDateTime(REF_DATE, '16:00'),
        { actor_type: 'admin' },
        asDb(db),
      ),
    ).rejects.toMatchObject({ code: 'justification_too_short' })
  })

  it('recusa cancelamento do admin com justificativa curta', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await expect(
      cancelAppointment(a.id, { actor_type: 'admin', justification: short }, asDb(db)),
    ).rejects.toMatchObject({ code: 'justification_too_short' })
    // Nada foi alterado: o agendamento continua vivo.
    expect(db.tables.appointments[0].status).toBe('agendado')
  })

  it('não conta espaço em branco pra atingir o mínimo', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await expect(
      cancelAppointment(
        a.id,
        { actor_type: 'admin', justification: `${short}${' '.repeat(30)}` },
        asDb(db),
      ),
    ).rejects.toMatchObject({ code: 'justification_too_short' })
  })

  it('aceita justificativa com exatamente o mínimo', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    const exact = 'x'.repeat(MIN_JUSTIFICATION_LENGTH)
    const out = await cancelAppointment(a.id, { actor_type: 'admin', justification: exact }, asDb(db))
    expect(out.status).toBe('cancelado')
  })

  it('cliente/IA cancelando não precisa justificar', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    const out = await cancelAppointment(a.id, { actor_type: 'cliente' }, asDb(db))
    expect(out.status).toBe('cancelado')
  })
})

describe('cancelamento e auditoria', () => {
  it('cancelar é mudança de status, nunca exclusão de linha', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await cancelAppointment(
      a.id,
      { actor_type: 'admin', justification: 'Serviço não poderá ser realizado hoje.' },
      asDb(db),
    )
    expect(db.tables.appointments).toHaveLength(1)
    expect(db.tables.appointments[0].status).toBe('cancelado')
  })

  it('mantém a trilha completa de eventos após criar, remarcar e cancelar', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await rescheduleAppointment(
      a.id,
      parseStoreDateTime(REF_DATE, '16:00'),
      { actor_type: 'admin', justification: 'Indisponibilidade do técnico responsável.' },
      asDb(db),
    )
    await cancelAppointment(
      a.id,
      { actor_type: 'admin', justification: 'Cliente não poderá comparecer nesta semana.' },
      asDb(db),
    )
    const events = await getAppointmentEvents(a.id, asDb(db))
    expect(events.map((e) => e.action).sort()).toEqual(['cancelled', 'created', 'rescheduled'])
  })

  it('cancelar duas vezes é idempotente', async () => {
    const a = await createAppointment(baseInput('14:00'), asDb(db))
    await cancelAppointment(a.id, { actor_type: 'cliente' }, asDb(db))
    const again = await cancelAppointment(a.id, { actor_type: 'cliente' }, asDb(db))
    expect(again.status).toBe('cancelado')
    const events = await getAppointmentEvents(a.id, asDb(db))
    expect(events.filter((e) => e.action === 'cancelled')).toHaveLength(1)
  })

  it('erro de agendamento inexistente é not_found', async () => {
    await expect(
      cancelAppointment('nao-existe', { actor_type: 'cliente' }, asDb(db)),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('listagem com filtros', () => {
  beforeEach(async () => {
    await createAppointment(baseInput('09:00'), asDb(db))
    await createAppointment(
      { ...baseInput('11:00'), customer_name: 'Maria', customer_phone: '83911112222' },
      asDb(db),
    )
  })

  it('filtra por dia local da loja', async () => {
    expect(await listAppointments({ date: REF_DATE }, asDb(db))).toHaveLength(2)
    expect(await listAppointments({ date: '2026-08-21' }, asDb(db))).toHaveLength(0)
  })

  it('filtra por nome do cliente', async () => {
    const rows = await listAppointments({ customer: 'maria' }, asDb(db))
    expect(rows).toHaveLength(1)
    expect(rows[0].customer_name).toBe('Maria')
  })

  it('filtra por telefone ignorando formatação', async () => {
    const rows = await listAppointments({ phone: '(83) 91111-2222' }, asDb(db))
    expect(rows).toHaveLength(1)
    expect(rows[0].customer_name).toBe('Maria')
  })

  it('filtra por status', async () => {
    const all = await listAppointments({}, asDb(db))
    await cancelAppointment(all[0].id, { actor_type: 'cliente' }, asDb(db))
    expect(await listAppointments({ status: 'cancelado' }, asDb(db))).toHaveLength(1)
    expect(await listAppointments({ status: 'agendado' }, asDb(db))).toHaveLength(1)
  })
})

describe('erros de domínio', () => {
  it('conflito de horário vem tipado como AgendaError code=conflict', async () => {
    await createAppointment(baseInput('14:00'), asDb(db))
    const err = await createAppointment(baseInput('14:00'), asDb(db)).catch((e) => e)
    expect(err).toBeInstanceOf(AgendaError)
    expect(err.code).toBe('conflict')
  })
})
