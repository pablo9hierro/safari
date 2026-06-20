'use client'

import { useState } from 'react'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import {
  Smartphone,
  MapPin,
  Clock,
  CheckCircle,
  Wrench,
  ChevronRight,
  Package,
} from 'lucide-react'
import RequestDetailModal from '@/components/RequestDetailModal'
import WhatsAppPanel from '@/components/WhatsAppPanel'

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  pending:        { label: 'Pendente',                     color: 'text-yellow-700', bg: 'bg-yellow-100' },
  accepted:       { label: 'Aceito',                       color: 'text-green-700',  bg: 'bg-green-100'  },
  rejected:       { label: 'Recusado',                     color: 'text-red-700',    bg: 'bg-red-100'    },
  retirada_local: { label: 'Retirada/entrega pelo cliente', color: 'text-teal-700',   bg: 'bg-teal-100'   },
  em_busca:       { label: 'Em rota de recolhimento',      color: 'text-orange-700', bg: 'bg-orange-100' },
  in_progress:    { label: 'Em reparo',                    color: 'text-purple-700', bg: 'bg-purple-100' },
  completed:      { label: 'Concluído',                    color: 'text-gray-700',   bg: 'bg-gray-100'   },
  em_entrega:     { label: 'Em rota de entrega',           color: 'text-indigo-700', bg: 'bg-indigo-100' },
  delivered:      { label: 'Aparelho entregue',            color: 'text-cyan-700',   bg: 'bg-cyan-100'   },
  finished:       { label: 'Atendimento concluído',        color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cancelled:      { label: 'Cancelado',                    color: 'text-rose-700',   bg: 'bg-rose-100'   },
}

const FILTERS: { key: ServiceStatus | 'all'; label: string }[] = [
  { key: 'all',            label: 'Todos' },
  { key: 'pending',        label: 'Pendentes' },
  { key: 'accepted',       label: 'Aceitos' },
  { key: 'rejected',       label: 'Recusados' },
  { key: 'retirada_local', label: 'Retirada/entrega' },
  { key: 'em_busca',       label: 'Em recolhimento' },
  { key: 'in_progress',    label: 'Em reparo' },
  { key: 'completed',      label: 'Concluídos' },
  { key: 'em_entrega',     label: 'Em entrega' },
  { key: 'delivered',      label: 'Entregues' },
  { key: 'finished',       label: 'Concluídos (final)' },
  { key: 'cancelled',      label: 'Cancelados' },
]

export default function DashboardClient({ initialRequests }: { initialRequests: ServiceRequest[] }) {
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests)
  const [filter, setFilter] = useState<ServiceStatus | 'all'>('all')
  const [selected, setSelected] = useState<ServiceRequest | null>(null)

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

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
        <WhatsAppPanel />

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
                  {requests.filter((r) => r.status === f.key).length}
                </span>
              )}
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
                        <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{req.phone_model}</span>
                      </div>
                      <div className="flex items-center gap-1 text-vr-silver/40 text-xs mt-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {[req.address_street, req.address_number, req.address_city].filter(Boolean).join(', ') || `CEP ${req.address_cep}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
