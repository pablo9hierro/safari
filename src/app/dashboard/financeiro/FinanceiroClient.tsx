'use client'

import { useMemo, useState } from 'react'
import { Wallet, Wrench, ShoppingBag, Truck } from 'lucide-react'

export type ServiceOrderRow = {
  id: string
  closed_at: string | null
  final_value: number | null
  request_id: string
  service_requests: { customer_name: string; customer_phone: string; phone_model: string; payment_methods: { method: string; value: number }[] | null; shipping_price: number | null } | null
}

type StoreOrderItemRow = {
  id: string
  product_name: string
  unit_price: number
  quantity: number
  status: string
  discount_percent: number | null
  payment_methods: { method: string; value: number }[] | null
}

export type StoreOrderRow = {
  id: string
  customer_name: string
  created_at: string
  shipping_price: number | null
  store_order_items: StoreOrderItemRow[] | null
}

type Transaction = {
  id: string
  type: 'manutencao' | 'venda'
  date: string
  title: string
  phone: string
  subtitle: string
  value: number
  freteValue: number
  paymentMethods: string[]
}

const TYPE_FILTERS = [
  { key: 'all', label: 'Tudo' },
  { key: 'manutencao', label: 'Manutenção' },
  { key: 'venda', label: 'Venda' },
  { key: 'frete', label: 'Frete' },
] as const

const DATE_PRESETS = [
  { key: 'all', label: 'Tudo' },
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
] as const

type TypeFilter = typeof TYPE_FILTERS[number]['key']
type DatePreset = typeof DATE_PRESETS[number]['key']

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function startOfPreset(preset: DatePreset): Date | null {
  const now = new Date()
  if (preset === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d
  }
  if (preset === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }
  if (preset === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d
  }
  if (preset === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return null
}

function formatDay(day: string) {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

export default function FinanceiroClient({
  serviceOrders,
  storeOrders,
}: {
  serviceOrders: ServiceOrderRow[]
  storeOrders: StoreOrderRow[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')

  const transactions = useMemo<Transaction[]>(() => {
    const manutencao: Transaction[] = serviceOrders
      .filter((o) => o.closed_at && o.final_value != null)
      .map((o) => ({
        id: `os-${o.id}`,
        type: 'manutencao' as const,
        date: o.closed_at as string,
        title: o.service_requests?.customer_name ?? 'Cliente',
        phone: o.service_requests?.customer_phone ?? '',
        subtitle: o.service_requests?.phone_model ?? '',
        value: Number(o.final_value),
        freteValue: Number(o.service_requests?.shipping_price ?? 0),
        paymentMethods: (o.service_requests?.payment_methods ?? []).map((p) => p.method),
      }))

    const venda: Transaction[] = storeOrders
      .map((order): Transaction | null => {
        const soldItems = (order.store_order_items ?? []).filter((i) => i.status === 'vendido')
        const value = soldItems.reduce((sum, i) => {
          const discount = i.discount_percent ?? 0
          return sum + Number(i.unit_price) * i.quantity * (1 - discount / 100)
        }, 0)
        if (value <= 0 && !order.shipping_price) return null
        return {
          id: `store-${order.id}`,
          type: 'venda',
          date: order.created_at,
          title: order.customer_name,
          phone: '',
          subtitle: soldItems.map((i) => `${i.quantity}x ${i.product_name}`).join(', '),
          value,
          freteValue: Number(order.shipping_price ?? 0),
          paymentMethods: Array.from(new Set(soldItems.flatMap((i) => (i.payment_methods ?? []).map((p) => p.method)))),
        }
      })
      .filter((t): t is Transaction => t !== null)

    return [...manutencao, ...venda].sort((a, b) => b.date.localeCompare(a.date))
  }, [serviceOrders, storeOrders])

  const rangeStart = useMemo(() => (datePreset !== 'all' ? startOfPreset(datePreset) : null), [datePreset])

  const availablePaymentMethods = useMemo(
    () => Array.from(new Set(transactions.flatMap((t) => t.paymentMethods))).sort(),
    [transactions]
  )

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter === 'frete' && t.freteValue <= 0) return false
      if (typeFilter !== 'all' && typeFilter !== 'frete' && t.type !== typeFilter) return false
      if (paymentFilter !== 'all' && !t.paymentMethods.includes(paymentFilter)) return false
      const d = new Date(t.date)
      if (customFrom || customTo) {
        if (customFrom && d < new Date(customFrom)) return false
        if (customTo) {
          const to = new Date(customTo)
          to.setHours(23, 59, 59, 999)
          if (d > to) return false
        }
        return true
      }
      if (rangeStart && d < rangeStart) return false
      return true
    })
  }, [transactions, typeFilter, paymentFilter, rangeStart, customFrom, customTo])

  const totals = useMemo(() => {
    const base = typeFilter === 'frete' ? transactions : filtered
    const manutencao = base.filter((t) => t.type === 'manutencao').reduce((s, t) => s + t.value, 0)
    const venda = base.filter((t) => t.type === 'venda').reduce((s, t) => s + t.value, 0)
    const frete = base.reduce((s, t) => s + t.freteValue, 0)
    return { manutencao, venda, frete, total: manutencao + venda + frete }
  }, [filtered, transactions, typeFilter])

  const total3 = totals.manutencao + totals.venda + totals.frete
  const pctManutencao = total3 > 0 ? Math.round((totals.manutencao / total3) * 100) : 0
  const pctVenda = total3 > 0 ? Math.round((totals.venda / total3) * 100) : 0
  const pctFrete = total3 > 0 ? 100 - pctManutencao - pctVenda : 0

  const dailyBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of filtered) {
      const day = t.date.slice(0, 10)
      map.set(day, (map.get(day) ?? 0) + t.value)
    }
    const days = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
    const max = Math.max(...days.map(([, v]) => v), 1)
    return { days, max }
  }, [filtered])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Wallet className="w-5 h-5 text-vr-red" />
        Financeiro
      </h1>

      {/* Filtro por tipo */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${typeFilter === f.key ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtro por data */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setDatePreset(p.key); setCustomFrom(''); setCustomTo('') }}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${datePreset === p.key && !customFrom && !customTo ? 'bg-white text-vr-black' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-vr-graphite border border-white/10 text-white text-sm outline-none focus:border-vr-red [color-scheme:dark]"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-vr-graphite border border-white/10 text-white text-sm outline-none focus:border-vr-red [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Filtro por forma de pagamento */}
      {availablePaymentMethods.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setPaymentFilter('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${paymentFilter === 'all' ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
          >
            Todas as formas
          </button>
          {availablePaymentMethods.map((m) => (
            <button
              key={m}
              onClick={() => setPaymentFilter(m)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${paymentFilter === m ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Totais */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-vr-graphite rounded-2xl p-3.5 col-span-2">
          <p className="text-xs text-vr-silver/50">Total no período</p>
          <p className="text-2xl font-black text-white">{currency(totals.total)}</p>
        </div>
        <div className="bg-vr-graphite rounded-2xl p-3.5">
          <p className="text-xs text-vr-silver/50 flex items-center gap-1"><Wrench className="w-3 h-3 text-vr-red" /> Manutenção</p>
          <p className="text-base font-bold text-white">{currency(totals.manutencao)}</p>
          {total3 > 0 && <p className="text-xs text-vr-silver/40">{pctManutencao}% do total</p>}
        </div>
        <div className="bg-vr-graphite rounded-2xl p-3.5">
          <p className="text-xs text-vr-silver/50 flex items-center gap-1"><ShoppingBag className="w-3 h-3 text-green-500" /> Venda</p>
          <p className="text-base font-bold text-white">{currency(totals.venda)}</p>
          {total3 > 0 && <p className="text-xs text-vr-silver/40">{pctVenda}% do total</p>}
        </div>
        <div className="bg-vr-graphite rounded-2xl p-3.5 col-span-2">
          <p className="text-xs text-vr-silver/50 flex items-center gap-1"><Truck className="w-3 h-3 text-blue-400" /> Frete (coleta + entrega)</p>
          <p className="text-base font-bold text-white">{currency(totals.frete)}</p>
          {total3 > 0 && <p className="text-xs text-vr-silver/40">{pctFrete}% do total</p>}
        </div>
      </div>

      {/* Proporção visual */}
      {total3 > 0 && (
        <div className="bg-vr-graphite rounded-2xl p-4 space-y-2">
          <div className="flex h-3 rounded-full overflow-hidden bg-vr-black">
            <div style={{ width: `${pctManutencao}%` }} className="bg-vr-red transition-all" />
            <div style={{ width: `${pctVenda}%` }} className="bg-green-500 transition-all" />
            <div style={{ width: `${pctFrete}%` }} className="bg-blue-400 transition-all" />
          </div>
          <div className="flex justify-between text-xs text-vr-silver/60">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-vr-red inline-block" /> Manutenção {pctManutencao}%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Venda {pctVenda}%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Frete {pctFrete}%</span>
          </div>
        </div>
      )}

      {/* Faturamento por dia */}
      {dailyBreakdown.days.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">Por dia</h2>
          {dailyBreakdown.days.map(([day, value]) => (
            <div key={day} className="flex items-center gap-2">
              <span className="text-xs text-vr-silver/50 w-10 flex-shrink-0">{formatDay(day)}</span>
              <div className="flex-1 h-5 bg-vr-black rounded-lg overflow-hidden">
                <div
                  className="h-full bg-vr-red rounded-lg transition-all"
                  style={{ width: `${(value / dailyBreakdown.max) * 100}%` }}
                />
              </div>
              <span className="text-xs text-white font-semibold w-24 text-right flex-shrink-0">{currency(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lista de transações */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">
          Lançamentos ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-vr-silver/40">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum lançamento no período selecionado</p>
          </div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 bg-vr-graphite rounded-xl px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    t.type === 'manutencao' ? 'bg-vr-red/15 text-vr-red' : 'bg-green-500/15 text-green-500'
                  }`}
                >
                  {t.type === 'manutencao' ? <Wrench className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-white truncate">{t.title}</p>
                    {t.phone && <p className="text-xs text-vr-silver/40 flex-shrink-0">{t.phone}</p>}
                  </div>
                  {t.subtitle && <p className="text-xs text-vr-silver/50 truncate">{t.subtitle}</p>}
                  {t.paymentMethods.length > 0 && (
                    <p className="text-xs text-vr-silver/40 truncate">{t.paymentMethods.join(' + ')}</p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-white">{currency(typeFilter === 'frete' ? t.freteValue : t.value)}</p>
                {typeFilter === 'frete' && t.value > 0 && (
                  <p className="text-xs text-vr-silver/40">serviço: {currency(t.value)}</p>
                )}
                <p className="text-xs text-vr-silver/40">{new Date(t.date).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
