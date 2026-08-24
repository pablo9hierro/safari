'use client'

import { useEffect, useState } from 'react'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import { STATUS_GROUP, STATUS_GROUP_LABEL, type StatusGroup } from '@/lib/serviceLifecycle/types'
import {
  Smartphone,
  MapPin,
  Clock,
  CheckCircle,
  Wrench,
  ChevronRight,
  Package,
  ShoppingBag,
  Home,
  MessageCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import RequestDetailModal from '@/components/RequestDetailModal'
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

function PedidosTab() {
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
    <div className="space-y-6">
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

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  pending:                 { label: 'Pendente',                     color: 'text-yellow-700',  bg: 'bg-yellow-100'  },
  accepted:                { label: 'Aceito',                       color: 'text-green-700',   bg: 'bg-green-100'   },
  rejected:                { label: 'Recusado',                     color: 'text-red-700',     bg: 'bg-red-100'     },
  retirada_local:          { label: 'Retirada/entrega pelo cliente', color: 'text-teal-700',    bg: 'bg-teal-100'    },
  em_busca:                { label: 'Em rota de recolhimento',      color: 'text-orange-700',  bg: 'bg-orange-100'  },
  in_progress:             { label: 'Em reparo',                    color: 'text-purple-700',  bg: 'bg-purple-100'  },
  completed:               { label: 'Concluído',                    color: 'text-gray-700',    bg: 'bg-gray-100'    },
  em_pagamento:            { label: 'Em pagamento',                 color: 'text-lime-700',    bg: 'bg-lime-100'    },
  em_entrega:              { label: 'Em rota de entrega',           color: 'text-indigo-700',  bg: 'bg-indigo-100'  },
  delivered:               { label: 'Aparelho entregue',            color: 'text-cyan-700',    bg: 'bg-cyan-100'    },
  finished:                { label: 'Atendimento concluído',        color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cancelled:               { label: 'Cancelado',                    color: 'text-rose-700',    bg: 'bg-rose-100'    },
  aguardando_diagnostico:  { label: 'Aguardando diagnóstico',       color: 'text-blue-700',    bg: 'bg-blue-100'    },
  diagnostico_enviado:     { label: 'Diagnóstico enviado',          color: 'text-violet-700',  bg: 'bg-violet-100'  },
}

// Painel enxuto: 6 baldes de exibição (o enum granular acima continua sendo
// a fonte de verdade real -- ver STATUS_GROUP em serviceLifecycle/types.ts).
// "em_busca"/"em_entrega" (dentro de em_deslocamento/retiradas) só existem
// de fato em lojas COM deslocamento -- apenasRetirada continua filtrando,
// só que agora nada some, porque loja de retirada nunca ocupa esses status.
const GROUP_FILTERS: { key: StatusGroup; label: string }[] = [
  { key: 'em_deslocamento', label: STATUS_GROUP_LABEL.em_deslocamento },
  { key: 'aguardando_aparelho', label: STATUS_GROUP_LABEL.aguardando_aparelho },
  { key: 'em_diagnostico', label: STATUS_GROUP_LABEL.em_diagnostico },
  { key: 'em_reparo', label: STATUS_GROUP_LABEL.em_reparo },
  { key: 'retiradas', label: STATUS_GROUP_LABEL.retiradas },
  { key: 'concluidos', label: STATUS_GROUP_LABEL.concluidos },
]

export default function DashboardClient({
  initialRequests,
  apenasRetirada = false,
}: {
  initialRequests: ServiceRequest[]
  /** Loja sem deslocamento: self_pickup é sempre true na criação, então
   * em_busca/em_entrega nunca acontecem de verdade -- os chips somem em
   * vez de ficar mostrando uma fila que nunca vai ter nada. */
  apenasRetirada?: boolean
}) {
  const [tab, setTab] = useState<'solicitacoes' | 'pedidos'>('solicitacoes')
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests)
  const [groupFilter, setGroupFilter] = useState<StatusGroup>('em_deslocamento')
  const [selected, setSelected] = useState<ServiceRequest | null>(null)

  // apenasRetirada não precisa mais filtrar baldes -- em_deslocamento (que
  // engloba em_busca) e retiradas (que engloba em_entrega) nunca são
  // ocupados por essa loja de qualquer forma (self_pickup sempre true).
  const visibleFilters = GROUP_FILTERS

  const filtered = requests.filter((r) => STATUS_GROUP[r.status] === groupFilter)

  const handleUpdate = (updated: ServiceRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setSelected(updated)
  }

  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    completed: requests.filter((r) => r.status === 'completed').length,
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-bold text-white">Solicitações</h1>

        {/* Solicitações (assistência técnica) x Pedidos (compras da vitrine) — entidades
            diferentes, então ficam em abas em vez de misturadas numa lista só, mas
            renderizadas e geridas aqui dentro, não mais numa rota /pedidos separada. */}
        <div className="flex gap-2 border-b border-white/5">
          {[
            { key: 'solicitacoes' as const, label: 'Solicitações' },
            { key: 'pedidos' as const, label: 'Vendas' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t.key ? 'border-vr-red text-white' : 'border-transparent text-vr-silver/60 hover:text-vr-silver'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'pedidos' ? (
          <PedidosTab />
        ) : (
          <>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pendentes', value: counts.pending, icon: <Clock className="w-5 h-5 text-vr-red" /> },
            { label: 'Em reparo', value: counts.in_progress, icon: <Wrench className="w-5 h-5 text-vr-red" /> },
            { label: 'Concluídos', value: counts.completed, icon: <CheckCircle className="w-5 h-5 text-vr-red" /> },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/5 bg-vr-graphite p-4">
              {s.icon}
              <div className="text-2xl font-bold text-white mt-1">{s.value}</div>
              <div className="text-xs text-vr-silver/60">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {visibleFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setGroupFilter(f.key)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${groupFilter === f.key ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
            >
              {f.label}
              <span className={`ml-1.5 px-1.5 rounded-full text-xs ${groupFilter === f.key ? 'bg-white/20 text-white' : 'bg-white/5 text-vr-silver/60'}`}>
                {requests.filter((r) => STATUS_GROUP[r.status] === f.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-vr-silver/40">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma solicitação encontrada</p>
            </div>
          ) : (
            filtered.map((req) => {
              const sc = STATUS_CONFIG[req.status]
              return (
                <button
                  key={req.id}
                  onClick={() => setSelected(req)}
                  className="w-full bg-vr-graphite rounded-2xl border border-white/5 p-4 text-left hover:shadow-md transition-all hover:border-vr-red/30 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>
                          {sc.label}
                        </span>
                        {req.quote_value && (
                          <span className="text-xs font-bold text-vr-red">
                            R$ {Number(req.quote_value).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-white truncate">{req.customer_name}</h3>
                      <div className="flex items-center gap-1 text-vr-silver/70 text-sm">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{req.phone_model ?? (req.diagnosis_requested ? '🔍 Diagnóstico solicitado' : '—')}</span>
                      </div>
                      <div className="flex items-center gap-1 text-vr-silver/40 text-xs mt-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {req.self_pickup ? 'Retirada pelo cliente'
                            : req.address_label
                              ? req.address_label
                              : [req.address_street, req.address_number, req.address_city].filter(Boolean).join(', ') || (req.address_cep ? `CEP ${req.address_cep}` : '—')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-vr-silver/40">
                        {new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <ChevronRight className="w-4 h-4 text-vr-silver/30 group-hover:text-vr-red transition-colors" />
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
          </>
        )}
      </div>

      {selected && (
        <RequestDetailModal
          request={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </>
  )
}
