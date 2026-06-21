'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StoreOrder, StoreOrderStatus } from '@/lib/types'
import { ShoppingBag, Phone, MapPin, Home, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

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

export default function PedidosClient({ initialOrders }: { initialOrders: StoreOrder[] }) {
  const [orders, setOrders] = useState<StoreOrder[]>(initialOrders)
  const [filter, setFilter] = useState<StoreOrderStatus | 'all'>('all')
  const [processing, setProcessing] = useState<Record<string, boolean>>({})

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const handleMarkSold = async (order: StoreOrder) => {
    setProcessing((prev) => ({ ...prev, [order.id]: true }))
    const supabase = createClient()

    for (const item of order.store_order_items ?? []) {
      if (!item.product_id) continue
      const { data: product } = await supabase.from('products').select('quantity').eq('id', item.product_id).single()
      if (product) {
        const newQty = Math.max(0, Number(product.quantity) - item.quantity)
        await supabase.from('products').update({ quantity: newQty }).eq('id', item.product_id)
      }
    }

    const { data: updated } = await supabase
      .from('store_orders')
      .update({ status: 'vendido', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select('*, store_order_items(*)')
      .single()

    if (updated) setOrders((prev) => prev.map((o) => (o.id === order.id ? (updated as StoreOrder) : o)))
    setProcessing((prev) => ({ ...prev, [order.id]: false }))
  }

  const handleReject = async (order: StoreOrder) => {
    setProcessing((prev) => ({ ...prev, [order.id]: true }))
    const supabase = createClient()
    const { data: updated } = await supabase
      .from('store_orders')
      .update({ status: 'recusado', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select('*, store_order_items(*)')
      .single()

    if (updated) setOrders((prev) => prev.map((o) => (o.id === order.id ? (updated as StoreOrder) : o)))
    setProcessing((prev) => ({ ...prev, [order.id]: false }))
  }

  const counts = useMemo(() => ({
    pendente: orders.filter((o) => o.status === 'pendente').length,
    vendido: orders.filter((o) => o.status === 'vendido').length,
    recusado: orders.filter((o) => o.status === 'recusado').length,
  }), [orders])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-vr-red" />
        Pedidos da loja
      </h1>

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
          filtered.map((order) => {
            const sc = STATUS_CONFIG[order.status]
            return (
              <div key={order.id} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                    <h3 className="font-semibold text-white mt-1">{order.customer_name}</h3>
                    <div className="flex items-center gap-1 text-vr-silver/70 text-sm">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      {order.customer_whatsapp}
                    </div>
                  </div>
                  <span className="text-xs text-vr-silver/40">
                    {new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <ul className="space-y-1">
                  {(order.store_order_items ?? []).map((item) => (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-vr-silver">{item.quantity}x {item.product_name}</span>
                      <span className="text-vr-silver/70">R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>

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

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-sm font-bold text-white">Total: R$ {Number(order.total_value).toFixed(2)}</span>
                  {order.status === 'pendente' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(order)}
                        disabled={processing[order.id]}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 px-3 py-2 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Recusar
                      </button>
                      <button
                        onClick={() => handleMarkSold(order)}
                        disabled={processing[order.id]}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 disabled:opacity-50"
                      >
                        {processing[order.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Marcar como vendido
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
