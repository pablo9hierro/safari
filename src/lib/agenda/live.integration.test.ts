/**
 * Teste de integração REAL: roda o executor das tools contra o Supabase de
 * verdade (mesmo banco que a assistente usa em produção).
 *
 * Não entra na suíte normal — só roda com RUN_LIVE=1, porque escreve no banco
 * e depende de rede. Ele limpa o que cria.
 *
 *   RUN_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     src/lib/agenda/live.integration.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { executeAgendaTool, agendaToolsEnabled } from './tools'
import { storeDateKey } from './slots'

const live = process.env.RUN_LIVE === '1'
const TEST_PHONE = '5583900000001'

/** Uma segunda-feira bem à frente, pra não colidir com agenda real. */
function futureMonday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 30)
  while (new Date(d).getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1)
  return storeDateKey(d)
}

const DATE = futureMonday()

describe.skipIf(!live)('agenda contra o banco real', () => {
  afterAll(async () => {
    const db = createServiceClient()
    await db.from('appointments').delete().eq('customer_phone', TEST_PHONE)
  })

  it('a feature flag está ligada nesta loja', async () => {
    expect(await agendaToolsEnabled()).toBe(true)
  })

  it('consultar_disponibilidade devolve vagas reais dentro do expediente', async () => {
    const out = await executeAgendaTool('consultar_disponibilidade', { data: DATE })
    expect(out).toMatch(/Horários livres/)
    // Segunda é 09–18: a primeira vaga do dia tem que ser 09:00.
    expect(out).toMatch(/09:00/)
  })

  it('consultar_disponibilidade recusa horário fora do expediente', async () => {
    const out = await executeAgendaTool('consultar_disponibilidade', { data: DATE, horario: '22:00' })
    expect(out).toMatch(/INDISPONÍVEL \(fora_do_horario\)/)
  })

  it('criar_agendamento grava de verdade', async () => {
    const out = await executeAgendaTool('criar_agendamento', {
      cliente_nome: 'Cliente Teste E2E',
      cliente_telefone: TEST_PHONE,
      servico_nome: 'Troca de tela (teste E2E)',
      data: DATE,
      horario: '14:00',
    })
    expect(out).toMatch(/AGENDAMENTO CONFIRMADO/)

    const db = createServiceClient()
    const { data } = await db.from('appointments').select('*').eq('customer_phone', TEST_PHONE)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('agendado')
  })

  it('o horário recém-criado passa a aparecer como ocupado', async () => {
    const out = await executeAgendaTool('consultar_disponibilidade', { data: DATE, horario: '14:00' })
    expect(out).toMatch(/INDISPONÍVEL \(ocupado\)/)
    expect(out).toMatch(/Horários alternativos livres/)
  })

  it('a IA não consegue criar dois agendamentos no mesmo horário', async () => {
    const out = await executeAgendaTool('criar_agendamento', {
      cliente_nome: 'Outro Cliente',
      cliente_telefone: TEST_PHONE,
      servico_nome: 'Bateria (teste E2E)',
      data: DATE,
      horario: '14:00',
    })
    expect(out).toMatch(/^FALHOU \(conflict\)/)
  })

  it('consultar_agenda lista o agendamento do dia', async () => {
    const out = await executeAgendaTool('consultar_agenda', { data: DATE })
    expect(out).toMatch(/Cliente Teste E2E/)
  })

  it('consultar_agendamento acha pelo telefone', async () => {
    const out = await executeAgendaTool('consultar_agendamento', { telefone: TEST_PHONE })
    expect(out).toMatch(/Cliente Teste E2E/)
  })

  it('remarcar_agendamento move o horário', async () => {
    const db = createServiceClient()
    const { data } = await db.from('appointments').select('id').eq('customer_phone', TEST_PHONE).limit(1)
    const out = await executeAgendaTool('remarcar_agendamento', {
      agendamento_id: data![0].id,
      data: DATE,
      horario: '16:00',
    })
    expect(out).toMatch(/REMARCADO/)
    expect(out).toMatch(/16:00/)
  })

  it('cancelar_agendamento libera o horário', async () => {
    const db = createServiceClient()
    const { data } = await db.from('appointments').select('id').eq('customer_phone', TEST_PHONE).limit(1)
    const out = await executeAgendaTool('cancelar_agendamento', { agendamento_id: data![0].id })
    expect(out).toMatch(/CANCELADO/)

    const depois = await executeAgendaTool('consultar_disponibilidade', { data: DATE, horario: '16:00' })
    expect(depois).toMatch(/DISPONÍVEL/)
  })

  it('a auditoria guardou toda a trilha, sem apagar o agendamento', async () => {
    const db = createServiceClient()
    const { data: appts } = await db.from('appointments').select('id').eq('customer_phone', TEST_PHONE)
    expect(appts).toHaveLength(1) // cancelado, não deletado

    const { data: events } = await db
      .from('appointment_events')
      .select('action')
      .eq('appointment_id', appts![0].id)
    expect(events!.map((e) => e.action).sort()).toEqual(['cancelled', 'created', 'rescheduled'])
  })
})
