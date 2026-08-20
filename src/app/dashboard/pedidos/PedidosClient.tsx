'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, MapPin, Home, MessageCircle, Loader2, AlertCircle } from 'lucide-react'
import { fetchOrders, AdminAuthError, type Order } from '@/lib/resolutoo/adminApi'
import { adminAwareHref } from '@/lib/storeProxyLink'

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pagamento pendente', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  pago: { label: 'Pago', color: 'text-green-700', bg: 'bg-green-100' },
  cancelado: { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-100' },
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

export default function PedidosClient() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders()
      .then(setOrders)
      .catch((e) => {
        if (e instanceof AdminAuthError) {
          window.location.href = adminAwareHref('/login')
          return
        }
        setError(e instanceof Error ? e.message : 'Não foi possível carregar os pedidos.')
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-vr-red" />
        Pedidos da loja
      </h1>
      <p className="text-sm text-vr-silver/50">
        Pedidos reais feitos pela vitrine — clique no cliente pra abrir a conversa de WhatsApp.
      </p>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!orders && !error ? (
        <div className="flex items-center gap-2 text-vr-silver/40 text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedidos...
        </div>
      ) : (
        <div className="space-y-3">
          {orders && orders.length === 0 ? (
            <div className="text-center py-16 text-vr-silver/40">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido ainda</p>
            </div>
          ) : (
            orders?.map((order) => {
              const ps = PAYMENT_STATUS_CONFIG[order.payment_status] ?? {
                label: order.payment_status,
                color: 'text-vr-silver',
                bg: 'bg-white/5',
              }
              return (
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${ps.bg} ${ps.color}`}>
                      {ps.label}
                    </span>
                  </a>

                  <div className="px-4 pb-4 space-y-3">
                    <ul className="space-y-1.5">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-white truncate">{item.quantity}x {item.product_name}</span>
                          <span className="text-vr-silver/50 shrink-0 ml-3">
                            R$ {(item.unit_price * item.quantity).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <div className="flex items-center gap-1.5 text-sm text-vr-silver/70">
                        {order.delivery_type === 'balcao' ? (
                          <>
                            <Home className="w-3.5 h-3.5 shrink-0" />
                            Retirada no local
                          </>
                        ) : (
                          <>
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {order.neighborhood || order.address || 'Entrega'}
                            {order.shipping_price > 0 && ` — frete R$ ${order.shipping_price.toFixed(2)}`}
                          </>
                        )}
                      </div>
                      <span className="text-sm font-bold text-white">Total: R$ {order.total.toFixed(2)}</span>
                    </div>
                    {order.payment_on_delivery && (
                      <p className="text-xs font-semibold text-amber-400">
                        Cliente vai pagar no ato da entrega — não cobrado ainda.
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
