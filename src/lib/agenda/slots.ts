import type { BusinessHours } from './types'

/**
 * A loja opera em horário de Brasília. O banco guarda tudo em timestamptz
 * (UTC), mas o horário de funcionamento é hora de parede local — então toda
 * conversão passa por aqui, sem depender de o servidor estar no fuso certo.
 */
export const STORE_TZ = 'America/Sao_Paulo'

/** Deslocamento do fuso da loja, em ms, no instante informado. */
function tzOffsetMs(date: Date, tz: string = STORE_TZ): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

/** Hora de parede na loja (ex: 2026-08-20 14:00) → instante UTC correspondente. */
export function storeTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  // Duas passadas cobrem a borda de mudança de offset (o Brasil não usa
  // horário de verão hoje, mas a conta continua correta se voltar).
  let offset = tzOffsetMs(new Date(naive))
  offset = tzOffsetMs(new Date(naive - offset))
  return new Date(naive - offset)
}

/** Partes da data na hora local da loja. */
export function partsInStoreTz(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TZ,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
  }
}

/** "2026-08-20" + "14:30" (hora da loja) → Date UTC. Lança se o formato for inválido. */
export function parseStoreDateTime(dateStr: string, timeStr: string): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  if (!dm) throw new Error(`Data inválida: "${dateStr}" (use AAAA-MM-DD)`)
  if (!tm) throw new Error(`Horário inválido: "${timeStr}" (use HH:MM)`)
  const hour = Number(tm[1])
  const minute = Number(tm[2])
  if (hour > 23 || minute > 59) throw new Error(`Horário inválido: "${timeStr}"`)
  return storeTimeToUtc(Number(dm[1]), Number(dm[2]), Number(dm[3]), hour, minute)
}

/** Formata para exibição/mensagem ao cliente: "20/08 às 14:30". */
export function formatStoreDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const p = partsInStoreTz(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(p.day)}/${pad(p.month)} às ${pad(p.hour)}:${pad(p.minute)}`
}

/** "AAAA-MM-DD" da data, na hora da loja. */
export function storeDateKey(date: Date): string {
  const p = partsInStoreTz(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

export type Interval = { start: Date; end: Date }

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Todos os slots de um dia que cabem inteiros dentro do expediente.
 * Só a grade — não considera ocupação nem bloqueio (isso é do chamador).
 */
export function slotsForDay(
  dateKey: string,
  hours: BusinessHours[],
  slotMinutes: number,
  durationMinutes: number,
): Interval[] {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!dm) return []
  const year = Number(dm[1])
  const month = Number(dm[2])
  const day = Number(dm[3])

  // Meio-dia evita qualquer ambiguidade de borda ao descobrir o dia da semana.
  const weekday = partsInStoreTz(storeTimeToUtc(year, month, day, 12, 0)).weekday
  const bh = hours.find((h) => h.weekday === weekday)
  if (!bh || bh.closed) return []

  const openMin = timeToMinutes(bh.open_time)
  const closeMin = timeToMinutes(bh.close_time)
  const out: Interval[] = []

  for (let m = openMin; m + durationMinutes <= closeMin; m += slotMinutes) {
    const start = storeTimeToUtc(year, month, day, Math.floor(m / 60), m % 60)
    out.push({ start, end: new Date(start.getTime() + durationMinutes * 60_000) })
  }
  return out
}

/** O intervalo cabe dentro do expediente daquele dia? */
export function withinBusinessHours(interval: Interval, hours: BusinessHours[]): boolean {
  const p = partsInStoreTz(interval.start)
  const bh = hours.find((h) => h.weekday === p.weekday)
  if (!bh || bh.closed) return false

  const startMin = p.hour * 60 + p.minute
  const endParts = partsInStoreTz(interval.end)
  // Terminou em outro dia — extrapola o expediente por definição.
  if (endParts.day !== p.day || endParts.month !== p.month) return false
  const endMin = endParts.hour * 60 + endParts.minute

  return startMin >= timeToMinutes(bh.open_time) && endMin <= timeToMinutes(bh.close_time)
}
