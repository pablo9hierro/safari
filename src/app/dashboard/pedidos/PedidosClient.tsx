'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PaymentMethodEntry, StoreOrder, StoreOrderItem, StoreOrderStatus } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/constants'
import { ShoppingBag, MapPin, Home, CheckCircle2, XCircle, Loader2, MessageCircle } from 'lucide-react'

const STATUS_CONFIG: Record<StoreOrderStatus, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  vendido: { label: 'Vendido', color: 'text-green-700', bg: 'bg-green-100' },
  recusado: { label: 'Recusado', color: 'text-red-700', bg: 'bg-red-100' },
}

const FILTERS: { key: StoreOrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'vendido', label: 'Vendidos' },
  { key: 'recusado', label: 'Recusados' },
]

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

export default function PedidosClient({ initialOrders }: { initialOrders: StoreOrder[] }) {
  const [orders, setOrders] = useState<StoreOrder[]>(initialOrders)
  const [filter, setFilter] = useState<StoreOrderStatus | 'all'>('all')
  const [processing, setProcessing] = useState<Record<string, boolean>>({})

  const [payingItemId, setPayingItemId] = useState<string | null>(null)
  const [payDiscount, setPayDiscount] = useState('')
  const [paySelectedMethods, setPaySelectedMethods] = useState<string[]>([])
  const [payMethodValues, setPayMethodValues] = useState<Record<string, string>>({})
  const [payError, setPayError] = useState<string | null>(null)

  const filtered = filter === 'all' ? orders : orders.filter((o) => (o.store_order_items ?? []).some((i) => i.status === filter))

  const handleItemDecision = async (order: StoreOrder, itemId: string, status: 'vendido' | 'recusado') => {
    setProcessing((prev) => ({ ...prev, [itemId]: true }))
    const supabase = createClient()

    const { data: updatedItem } = await supabase
      .from('store_order_items')
      .update({ status })
      .eq('id', itemId)
      .select()
      .single()

    if (updatedItem) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, store_order_items: (o.store_order_items ?? []).map((i) => (i.id === itemId ? updatedItem : i)) }
            : o
        )
      )
    }
    setProcessing((prev) => ({ ...prev, [itemId]: false }))
  }

  const openPayment = (item: StoreOrderItem) => {
    setPayingItemId(item.id)
    setPayDiscount('')
    setPaySelectedMethods([])
    setPayMethodValues({})
    setPayError(null)
  }

  const togglePayMethod = (method: string) => {
    setPaySelectedMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]))
  }

  // Aceite de venda: registra desconto (%) e a(s) forma(s) de pagamento antes de marcar como vendido.
  const handleConfirmSale = async (order: StoreOrder, item: StoreOrderItem) => {
    setPayError(null)
    if (paySelectedMethods.length === 0) {
      setPayError('Selecione ao menos uma forma de pagamento.')
      return
    }

    const total = item.unit_price * item.quantity
    const discountNum = parseInt(payDiscount || '0', 10) || 0
    const discountedTotal = total * (1 - discountNum / 100)
    // A última forma selecionada recebe o restante calculado automaticamente.
    const lastMethod = paySelectedMethods[paySelectedMethods.length - 1]
    const otherMethods = paySelectedMethods.slice(0, -1)
    const otherSum = otherMethods.reduce((s, m) => s + (parseFloat(payMethodValues[m] || '0') || 0), 0)
    const remainder = Math.max(0, discountedTotal - otherSum)
    const methodsValid = paySelectedMethods.length <= 1 || otherSum <= discountedTotal + 0.01

    if (!methodsValid) {
      setPayError('Os valores informados já passam do total com desconto.')
      return
    }

    const finalMethods: PaymentMethodEntry[] = paySelectedMethods.length === 1
      ? [{ method: paySelectedMethods[0], value: discountedTotal }]
      : [
          ...otherMethods.map((m) => ({ method: m, value: parseFloat(payMethodValues[m] || '0') || 0 })),
          { method: lastMethod, value: remainder },
        ]

    setProcessing((prev) => ({ ...prev, [item.id]: true }))
    const supabase = createClient()

    if (item.product_id) {
      const { data: product } = await supabase.from('products').select('quantity').eq('id', item.product_id).single()
      if (product) {
        const newQty = Math.max(0, Number(product.quantity) - item.quantity)
        await supabase.from('products').update({ quantity: newQty }).eq('id', item.product_id)
      }
    }

    const { data: updatedItem } = await supabase
      .from('store_order_items')
      .update({ status: 'vendido', discount_percent: discountNum || null, payment_methods: finalMethods })
      .eq('id', item.id)
      .select()
      .single()

    if (updatedItem) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, store_order_items: (o.store_order_items ?? []).map((i) => (i.id === item.id ? updatedItem : i)) }
            : o
        )
      )
    }
    setProcessing((prev) => ({ ...prev, [item.id]: false }))
    setPayingItemId(null)
  }

  const counts = useMemo(() => {
    const allItems = orders.flatMap((o) => o.store_order_items ?? [])
    return {
      pendente: allItems.filter((i) => i.status === 'pendente').length,
      vendido: allItems.filter((i) => i.status === 'vendido').length,
      recusado: allItems.filter((i) => i.status === 'recusado').length,
    }
  }, [orders])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-vr-red" />
        Pedidos da loja
      </h1>
      <p className="text-sm text-vr-silver/50">
        Clique no pedido para abrir a conversa de WhatsApp com o cliente. Decida vender ou recusar cada item individualmente.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${filter === f.key ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className={`ml-1.5 px-1.5 rounded-full text-xs ${filter === f.key ? 'bg-white/20 text-white' : 'bg-white/5 text-vr-silver/60'}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-vr-silver/40">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido encontrado</p>
          </div>
        ) : (
          filtered.map((order) => (
            <div key={order.id} className="bg-vr-graphite rounded-2xl border border-white/5 overflow-hidden">
              <a
                href={whatsappLink(order.customer_whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 p-4 hover:bg-vr-graphite-light transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-1.5">
                    {order.customer_name}
                    <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                  </h3>
                  <p className="text-sm text-vr-silver/70">{order.customer_whatsapp}</p>
                </div>
                <span className="text-xs text-vr-silver/40">
                  {new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </a>

              <div className="px-4 pb-4 space-y-3">
                <ul className="space-y-2">
                  {(order.store_order_items ?? []).map((item) => {
                    const sc = STATUS_CONFIG[item.status]
                    const isPaying = payingItemId === item.id
                    const total = item.unit_price * item.quantity
                    const discountNum = parseInt(payDiscount || '0', 10) || 0
                    const discountedTotal = total * (1 - discountNum / 100)
                    const payLastMethod = paySelectedMethods[paySelectedMethods.length - 1]
                    const payOtherMethods = paySelectedMethods.slice(0, -1)
                    const payOtherSum = payOtherMethods.reduce((s, m) => s + (parseFloat(payMethodValues[m] || '0') || 0), 0)
                    const payRemainder = Math.max(0, discountedTotal - payOtherSum)
                    return (
                      <li key={item.id} className="bg-vr-black rounded-xl px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{item.quantity}x {item.product_name}</p>
                            <p className="text-xs text-vr-silver/50">R$ {total.toFixed(2)}</p>
                          </div>
                          {item.status === 'pendente' ? (
                            !isPaying && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handleItemDecision(order, item.id, 'recusado')}
                                  disabled={processing[item.id]}
                                  className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 px-2 py-1.5 disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Recusar
                                </button>
                                <button
                                  onClick={() => openPayment(item)}
                                  disabled={processing[item.id]}
                                  className="flex items-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg px-2 py-1.5 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Vender
                                </button>
                              </div>
                            )
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sc.bg} ${sc.color}`}>
                              {sc.label}
                              {item.payment_methods?.length ? ` · ${item.payment_methods.map((p) => p.method).join(' + ')}` : ''}
                            </span>
                          )}
                        </div>

                        {isPaying && (
                          <div className="bg-vr-graphite rounded-xl p-3 space-y-2">
                            <div>
                              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Desconto (%)</label>
                              <input
                                type="number"
                                inputMode="numeric"
                                step="1"
                                min="0"
                                max="100"
                                value={payDiscount}
                                onChange={(e) => setPayDiscount(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="0"
                                className="w-full mt-1 px-3 py-2 rounded-lg bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                              />
                            </div>
                            {discountNum > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-vr-silver/60">Valor com desconto</span>
                                <span className="font-bold text-vr-red">R$ {discountedTotal.toFixed(2)}</span>
                              </div>
                            )}
                            <div>
                              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Forma de pagamento</label>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {PAYMENT_METHODS.map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => togglePayMethod(m)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors
                                      ${paySelectedMethods.includes(m) ? 'bg-vr-red text-white border-vr-red' : 'bg-vr-black text-vr-silver border-white/10 hover:border-vr-red/40'}`}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {paySelectedMethods.length > 1 && (
                              <div className="space-y-1.5">
                                <p className="text-xs text-vr-silver/50">Valor pago em cada forma — a última é calculada automaticamente:</p>
                                {payOtherMethods.map((m) => (
                                  <div key={m} className="flex items-center gap-2">
                                    <span className="text-xs text-vr-silver/70 flex-1">{m}</span>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.01"
                                      min="0"
                                      value={payMethodValues[m] ?? ''}
                                      onChange={(e) => setPayMethodValues((prev) => ({ ...prev, [m]: e.target.value }))}
                                      placeholder="0,00"
                                      className="w-24 px-2 py-1.5 rounded-lg bg-vr-black border border-white/10 text-white text-xs outline-none focus:border-vr-red"
                                    />
                                  </div>
                                ))}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-vr-silver/70 flex-1">{payLastMethod} <span className="text-vr-silver/40">(restante)</span></span>
                                  <input
                                    disabled
                                    value={payRemainder.toFixed(2)}
                                    className="w-24 px-2 py-1.5 rounded-lg bg-vr-black border border-white/10 text-white text-xs opacity-60"
                                  />
                                </div>
                              </div>
                            )}
                            {payError && <p className="text-xs text-red-400">{payError}</p>}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleConfirmSale(order, item)}
                                disabled={processing[item.id]}
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 disabled:opacity-50"
                              >
                                {processing[item.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Confirmar venda
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayingItemId(null)}
                                disabled={processing[item.id]}
                                className="text-xs font-semibold text-vr-silver/60 hover:text-white px-3 py-2"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-sm text-vr-silver/70">
                    {order.pickup_at_store ? (
                      <>
                        <Home className="w-3.5 h-3.5 flex-shrink-0" />
                        Cliente vai buscar no local
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        {order.neighborhood || 'Bairro não informado'} — frete R$ {Number(order.shipping_price).toFixed(2)}
                      </>
                    )}
                  </div>
                  <span className="text-sm font-bold text-white">Total: R$ {Number(order.total_value).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
