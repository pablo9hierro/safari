/**
 * Fake do client Supabase usado nos testes da agenda.
 *
 * Reimplementa só o subconjunto de query builder que o módulo usa, mantendo
 * as tabelas em memória — inclusive a regra de exclusão de sobreposição que
 * no banco real é a constraint `appointments_no_overlap`, pra que o teste de
 * concorrência exercite o mesmo comportamento (erro 23P01).
 */
import { overlaps } from './slots'

type Row = Record<string, unknown>

type Filter =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[] }
  | { kind: 'ilike'; column: string; pattern: string }

const LIVE = ['agendado', 'remarcado']

function matches(row: Row, f: Filter): boolean {
  const v = row[f.column]
  switch (f.kind) {
    case 'eq': return v === f.value
    case 'neq': return v !== f.value
    case 'gt': return String(v) > String(f.value)
    case 'gte': return String(v) >= String(f.value)
    case 'lt': return String(v) < String(f.value)
    case 'lte': return String(v) <= String(f.value)
    case 'in': return f.values.includes(v)
    case 'ilike': {
      const re = new RegExp(`^${f.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
      return re.test(String(v ?? ''))
    }
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {
    agenda_settings: [],
    agenda_business_hours: [],
    agenda_blocks: [],
    appointments: [],
    appointment_events: [],
    service_catalog_items: [],
    assistant_conversations: [],
    assistant_messages: [],
  }

  /** Simula a constraint EXCLUDE do banco: dois vivos não podem se sobrepor. */
  private assertNoOverlap(candidate: Row, ignoreId?: string) {
    if (!LIVE.includes(String(candidate.status))) return
    const iv = {
      start: new Date(String(candidate.starts_at)),
      end: new Date(String(candidate.ends_at)),
    }
    const clash = this.tables.appointments.some((r) => {
      if (r.id === ignoreId) return false
      if (!LIVE.includes(String(r.status))) return false
      return overlaps(iv, { start: new Date(String(r.starts_at)), end: new Date(String(r.ends_at)) })
    })
    if (clash) {
      const err = new Error('conflicting key value violates exclusion constraint') as Error & { code: string }
      err.code = '23P01'
      throw err
    }
  }

  from(table: string) {
    const rows = () => (this.tables[table] ??= [])
    const self = this
    const filters: Filter[] = []
    let orderCol: string | null = null
    let orderAsc = true
    let limitN: number | null = null
    let pending: { op: 'insert' | 'update'; payload: Row } | null = null

    const apply = () => {
      let out = rows().filter((r) => filters.every((f) => matches(r, f)))
      if (orderCol) {
        const col = orderCol
        out = [...out].sort((a, b) => {
          const av = String(a[col] ?? '')
          const bv = String(b[col] ?? '')
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
        })
      }
      if (limitN !== null) out = out.slice(0, limitN)
      return out
    }

    const run = () => {
      if (pending?.op === 'insert') {
        const row: Row = {
          id: pending.payload.id ?? `id-${Math.random().toString(36).slice(2, 10)}`,
          created_at: new Date().toISOString(),
          ...pending.payload,
        }
        if (table === 'appointments') self.assertNoOverlap(row)
        rows().push(row)
        return [row]
      }
      if (pending?.op === 'update') {
        const targets = apply()
        for (const t of targets) {
          const merged = { ...t, ...pending.payload }
          if (table === 'appointments') self.assertNoOverlap(merged, String(t.id))
          Object.assign(t, pending.payload)
        }
        return targets
      }
      return apply()
    }

    const builder = {
      select: () => builder,
      insert: (payload: Row) => { pending = { op: 'insert', payload }; return builder },
      update: (payload: Row) => { pending = { op: 'update', payload }; return builder },
      eq: (column: string, value: unknown) => { filters.push({ kind: 'eq', column, value }); return builder },
      neq: (column: string, value: unknown) => { filters.push({ kind: 'neq', column, value }); return builder },
      gt: (column: string, value: unknown) => { filters.push({ kind: 'gt', column, value }); return builder },
      gte: (column: string, value: unknown) => { filters.push({ kind: 'gte', column, value }); return builder },
      lt: (column: string, value: unknown) => { filters.push({ kind: 'lt', column, value }); return builder },
      lte: (column: string, value: unknown) => { filters.push({ kind: 'lte', column, value }); return builder },
      in: (column: string, values: unknown[]) => { filters.push({ kind: 'in', column, values }); return builder },
      ilike: (column: string, pattern: string) => { filters.push({ kind: 'ilike', column, pattern }); return builder },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderCol = column
        orderAsc = opts?.ascending !== false
        return builder
      },
      limit: (n: number) => { limitN = n; return builder },

      single: async () => {
        try {
          const out = run()
          if (out.length === 0) return { data: null, error: { message: 'no rows', code: 'PGRST116' } }
          return { data: out[0], error: null }
        } catch (e) {
          return { data: null, error: e as { message: string; code: string } }
        }
      },
      maybeSingle: async () => {
        try {
          const out = run()
          return { data: out[0] ?? null, error: null }
        } catch (e) {
          return { data: null, error: e as { message: string; code: string } }
        }
      },
      then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
        try {
          return Promise.resolve(resolve({ data: run(), error: null }))
        } catch (e) {
          return Promise.resolve(resolve({ data: null, error: e }))
        }
      },
    }
    return builder
  }
}

/** Banco com configuração padrão + um serviço no catálogo. */
export function seedDb(overrides: Partial<Row> = {}): FakeDb {
  const db = new FakeDb()
  db.tables.agenda_settings = [{
    id: 'default',
    appointment_ai_enabled: true,
    slot_minutes: 30,
    default_duration_minutes: 60,
    lead_time_minutes: 0,
    max_advance_days: 60,
    ...overrides,
  }]
  db.tables.agenda_business_hours = [
    { weekday: 0, closed: true, open_time: '09:00', close_time: '18:00' },
    { weekday: 1, closed: false, open_time: '09:00', close_time: '18:00' },
    { weekday: 2, closed: false, open_time: '09:00', close_time: '18:00' },
    { weekday: 3, closed: false, open_time: '09:00', close_time: '18:00' },
    { weekday: 4, closed: false, open_time: '09:00', close_time: '18:00' },
    { weekday: 5, closed: false, open_time: '09:00', close_time: '18:00' },
    { weekday: 6, closed: false, open_time: '09:00', close_time: '13:00' },
  ]
  db.tables.service_catalog_items = [
    { id: 'svc-1', model_name: 'iPhone 12', repair_type: 'Troca de tela', price: 450, active: true },
  ]
  return db
}
