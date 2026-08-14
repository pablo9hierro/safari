import { describe, it, expect } from 'vitest'
import {
  formatStoreDateTime,
  overlaps,
  parseStoreDateTime,
  slotsForDay,
  storeDateKey,
  withinBusinessHours,
} from './slots'
import type { BusinessHours } from './types'

// Seg–Sex 09–18, Sáb 09–13, Dom fechado (mesmo default da migration).
const HOURS: BusinessHours[] = [
  { weekday: 0, closed: true, open_time: '09:00', close_time: '18:00' },
  { weekday: 1, closed: false, open_time: '09:00', close_time: '18:00' },
  { weekday: 2, closed: false, open_time: '09:00', close_time: '18:00' },
  { weekday: 3, closed: false, open_time: '09:00', close_time: '18:00' },
  { weekday: 4, closed: false, open_time: '09:00', close_time: '18:00' },
  { weekday: 5, closed: false, open_time: '09:00', close_time: '18:00' },
  { weekday: 6, closed: false, open_time: '09:00', close_time: '13:00' },
]

describe('conversão de fuso da loja', () => {
  it('converte hora de parede de Brasília (UTC-3) pra UTC', () => {
    // 2026-08-20 é uma quinta-feira. 14:00 em SP = 17:00 UTC.
    const d = parseStoreDateTime('2026-08-20', '14:00')
    expect(d.toISOString()).toBe('2026-08-20T17:00:00.000Z')
  })

  it('faz o caminho de volta sem perder o dia', () => {
    const d = parseStoreDateTime('2026-08-20', '14:00')
    expect(storeDateKey(d)).toBe('2026-08-20')
    expect(formatStoreDateTime(d)).toBe('20/08 às 14:00')
  })

  it('não escorrega de dia perto da meia-noite local', () => {
    // 23:30 em SP ainda é dia 20 local, mesmo já sendo dia 21 em UTC.
    const d = parseStoreDateTime('2026-08-20', '23:30')
    expect(d.toISOString()).toBe('2026-08-21T02:30:00.000Z')
    expect(storeDateKey(d)).toBe('2026-08-20')
  })

  it('rejeita formatos inválidos em vez de inventar uma data', () => {
    expect(() => parseStoreDateTime('20/08/2026', '14:00')).toThrow(/Data inválida/)
    expect(() => parseStoreDateTime('2026-08-20', '2pm')).toThrow(/Horário inválido/)
    expect(() => parseStoreDateTime('2026-08-20', '25:00')).toThrow(/Horário inválido/)
  })
})

describe('sobreposição de intervalos', () => {
  const iv = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) })

  it('detecta sobreposição parcial', () => {
    expect(overlaps(
      iv('2026-08-20T14:00:00Z', '2026-08-20T15:00:00Z'),
      iv('2026-08-20T14:30:00Z', '2026-08-20T15:30:00Z'),
    )).toBe(true)
  })

  it('não considera encostar como sobreposição', () => {
    // 14–15 e 15–16 são adjacentes: o segundo pode ser agendado.
    expect(overlaps(
      iv('2026-08-20T14:00:00Z', '2026-08-20T15:00:00Z'),
      iv('2026-08-20T15:00:00Z', '2026-08-20T16:00:00Z'),
    )).toBe(false)
  })

  it('detecta contenção total', () => {
    expect(overlaps(
      iv('2026-08-20T14:00:00Z', '2026-08-20T18:00:00Z'),
      iv('2026-08-20T15:00:00Z', '2026-08-20T16:00:00Z'),
    )).toBe(true)
  })
})

describe('grade de slots do dia', () => {
  it('gera slots dentro do expediente de um dia útil', () => {
    // Quinta 09–18, slots de 30min, duração 60min → último começa 17:00.
    const slots = slotsForDay('2026-08-20', HOURS, 30, 60)
    expect(slots.length).toBe(17)
    expect(formatStoreDateTime(slots[0].start)).toBe('20/08 às 09:00')
    expect(formatStoreDateTime(slots[slots.length - 1].start)).toBe('20/08 às 17:00')
  })

  it('não gera slot que estoure o fechamento', () => {
    const slots = slotsForDay('2026-08-20', HOURS, 30, 60)
    const last = slots[slots.length - 1]
    expect(formatStoreDateTime(last.end)).toBe('20/08 às 18:00')
  })

  it('respeita o expediente reduzido do sábado', () => {
    // 2026-08-22 é sábado: 09–13.
    const slots = slotsForDay('2026-08-22', HOURS, 30, 60)
    expect(formatStoreDateTime(slots[slots.length - 1].end)).toBe('22/08 às 13:00')
  })

  it('não gera nada em dia fechado', () => {
    // 2026-08-23 é domingo.
    expect(slotsForDay('2026-08-23', HOURS, 30, 60)).toEqual([])
  })
})

describe('horário de funcionamento', () => {
  const interval = (date: string, time: string, minutes: number) => {
    const start = parseStoreDateTime(date, time)
    return { start, end: new Date(start.getTime() + minutes * 60_000) }
  }

  it('aceita intervalo dentro do expediente', () => {
    expect(withinBusinessHours(interval('2026-08-20', '14:00', 60), HOURS)).toBe(true)
  })

  it('recusa antes da abertura', () => {
    expect(withinBusinessHours(interval('2026-08-20', '08:00', 60), HOURS)).toBe(false)
  })

  it('recusa quando o fim ultrapassa o fechamento', () => {
    expect(withinBusinessHours(interval('2026-08-20', '17:30', 60), HOURS)).toBe(false)
  })

  it('recusa dia fechado', () => {
    expect(withinBusinessHours(interval('2026-08-23', '10:00', 60), HOURS)).toBe(false)
  })

  it('recusa sábado à tarde (fora do expediente reduzido)', () => {
    expect(withinBusinessHours(interval('2026-08-22', '15:00', 60), HOURS)).toBe(false)
  })
})
