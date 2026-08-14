import { describe, it, expect } from 'vitest'
import { buildCancellationMessage, buildCreatedMessage, buildRescheduleMessage } from './notifications'
import type { Appointment } from './types'

const appointment: Appointment = {
  id: 'appt-1',
  service_id: 'svc-1',
  service_label: 'iPhone 12 — Troca de tela',
  customer_name: 'Fernando',
  customer_phone: '83999998888',
  // 2026-08-20 14:00 em SP.
  starts_at: '2026-08-20T17:00:00.000Z',
  ends_at: '2026-08-20T18:00:00.000Z',
  status: 'remarcado',
  notes: null,
  created_by: 'admin',
  created_at: '2026-08-19T12:00:00.000Z',
  updated_at: '2026-08-19T12:00:00.000Z',
}

const JUSTIFICATION = 'O técnico responsável ficará indisponível no horário originalmente agendado.'

describe('mensagem de remarcação', () => {
  const msg = buildRescheduleMessage(appointment, '2026-08-20T13:00:00.000Z', JUSTIFICATION)

  it('preserva a justificativa do lojista literalmente', () => {
    // A justificativa não passa pelo modelo — reescrever abriria espaço pra
    // a IA inventar um motivo diferente do que foi registrado.
    expect(msg).toContain(JUSTIFICATION)
  })

  it('traz horário anterior e novo, ambos no fuso da loja', () => {
    expect(msg).toContain('Horário anterior: 20/08 às 10:00')
    expect(msg).toContain('Novo horário: 20/08 às 14:00')
  })

  it('identifica cliente e serviço', () => {
    expect(msg).toContain('Fernando')
    expect(msg).toContain('iPhone 12 — Troca de tela')
  })
})

describe('mensagem de cancelamento', () => {
  const msg = buildCancellationMessage(appointment, JUSTIFICATION)

  it('preserva a justificativa literalmente', () => {
    expect(msg).toContain(JUSTIFICATION)
  })

  it('informa o horário original que foi desmarcado', () => {
    expect(msg).toContain('Horário original: 20/08 às 14:00')
  })

  it('oferece encontrar novo horário', () => {
    expect(msg).toMatch(/novo horário/i)
  })

  it('remove espaço em volta da justificativa sem alterar o conteúdo', () => {
    const padded = buildCancellationMessage(appointment, `   ${JUSTIFICATION}   `)
    expect(padded).toContain(`Motivo: ${JUSTIFICATION}`)
  })
})

describe('mensagem de confirmação', () => {
  it('confirma serviço, data e horário', () => {
    const msg = buildCreatedMessage(appointment)
    expect(msg).toContain('iPhone 12 — Troca de tela')
    expect(msg).toContain('20/08 às 14:00')
  })
})
