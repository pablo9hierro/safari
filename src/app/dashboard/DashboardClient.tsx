'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import {
  Smartphone,
  MapPin,
  Clock,
  CheckCircle,
  Wrench,
  LogOut,
  ChevronRight,
  Package,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import RequestDetailModal from '@/components/RequestDetailModal'
import WhatsAppPanel from '@/components/WhatsAppPanel'
import Logo from '@/components/ui/Logo'

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  pending:        { label: 'Pendente',                  color: 'text-yellow-700', bg: 'bg-yellow-100' },
  quoted:         { label: 'Orçado',                    color: 'text-blue-700',   bg: 'bg-blue-100'   },
  accepted:       { label: 'Aceito',                    color: 'text-green-700',  bg: 'bg-green-100'  },
  rejected:       { label: 'Recusado',                  color: 'text-red-700',    bg: 'bg-red-100'    },
  retirada_local: { label: 'Retirada/entrega no local', color: 'text-teal-700',   bg: 'bg-teal-100'   },
  em_busca:       { label: 'Em rota de recolhimento',   color: 'text-orange-700', bg: 'bg-orange-100' },
  in_progress:    { label: 'Em reparo',                 color: 'text-purple-700', bg: 'bg-purple-100' },
  em_entrega:     { label: 'Em rota de entrega',        color: 'text-indigo-700', bg: 'bg-indigo-100' },
  completed:      { label: 'Concluído',                 color: 'text-gray-700',   bg: 'bg-gray-100'   },
  cancelled:      { label: 'Cancelado',                 color: 'text-rose-700',   bg: 'bg-rose-100'   },
}

const FILTERS: { key: ServiceStatus | 'all'; label: string }[] = [
  { key: 'all',            label: 'Todos' },
  { key: 'pending',        label: 'Pendentes' },
  { key: 'quoted',         label: 'Orçados' },
  { key: 'accepted',       label: 'Aceitos' },
  { key: 'retirada_local', label: 'Retirada local' },
  { key: 'em_busca',       label: 'Em busca' },
  { key: 'in_progress',    label: 'Em reparo' },
  { key: 'em_entrega',     label: 'Em entrega' },
  { key: 'completed',      label: 'Concluídos' },
  { key: 'cancelled',      label: 'Cancelados' },
]

export default function DashboardClient({ initialRequests }: { initialRequests: ServiceRequest[] }) {
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests)
  const [filter, setFilter] = useState<ServiceStatus | 'all'>('all')
  const [selected, setSelected] = useState<ServiceRequest | null>(null)
  const router = useRouter()

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size="sm" light />
          <span className="text-gray-400 text-sm hidden sm:inline">— Dashboard</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-gray-500 hover:text-vr-red text-sm transition-colors">
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <WhatsAppPanel />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pendentes', value: counts.pending, icon: <Clock className="w-5 h-5 text-yellow-600" />, bg: 'bg-yellow-50 border-yellow-100' },
            { label: 'Em reparo', value: counts.in_progress, icon: <Wrench className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50 border-purple-100' },
            { label: 'Concluídos', value: counts.completed, icon: <CheckCircle className="w-5 h-5 text-green-600" />, bg: 'bg-green-50 border-green-100' },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-4 ${s.bg}`}>
              {s.icon}
              <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
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
                ${filter === f.key ? 'bg-vr-red text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className={`ml-1.5 px-1.5 rounded-full text-xs ${filter === f.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {requests.filter((r) => r.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
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
                  className="w-full bg-white rounded-2xl border border-gray-100 p-4 text-left hover:shadow-md transition-all hover:border-vr-red/30 group"
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
                      <h3 className="font-semibold text-gray-900 truncate">{req.customer_name}</h3>
                      <div className="flex items-center gap-1 text-gray-500 text-sm">
                        <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{req.phone_model}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {[req.address_street, req.address_number, req.address_city].filter(Boolean).join(', ') || `CEP ${req.address_cep}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-vr-red transition-colors" />
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
    </div>
  )
}
