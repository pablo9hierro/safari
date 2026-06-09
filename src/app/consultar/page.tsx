'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ServiceRequest } from '@/lib/types'
import {
  Smartphone, Search, Loader2, MapPin, Clock, CheckCircle,
  XCircle, Wrench, ChevronLeft, Package, Truck, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import Logo from '@/components/ui/Logo'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:     { label: 'Aguardando avaliação',  color: 'text-yellow-700', bg: 'bg-yellow-100', icon: <Clock className="w-3.5 h-3.5" /> },
  quoted:      { label: 'Orçamento disponível',  color: 'text-blue-700',   bg: 'bg-blue-100',   icon: <Clock className="w-3.5 h-3.5" /> },
  accepted:    { label: 'Aceito',                color: 'text-green-700',  bg: 'bg-green-100',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  rejected:    { label: 'Recusado',              color: 'text-red-700',    bg: 'bg-red-100',    icon: <XCircle className="w-3.5 h-3.5" /> },
  em_busca:    { label: 'Motoboy a caminho',     color: 'text-orange-700', bg: 'bg-orange-100', icon: <Truck className="w-3.5 h-3.5" /> },
  in_progress: { label: 'Em reparo',             color: 'text-purple-700', bg: 'bg-purple-100', icon: <Wrench className="w-3.5 h-3.5" /> },
  em_entrega:  { label: 'Em rota de entrega',    color: 'text-indigo-700', bg: 'bg-indigo-100', icon: <Truck className="w-3.5 h-3.5" /> },
  completed:   { label: 'Concluído',             color: 'text-gray-700',   bg: 'bg-gray-100',   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelled:   { label: 'Cancelado',             color: 'text-rose-700',   bg: 'bg-rose-100',   icon: <XCircle className="w-3.5 h-3.5" /> },
}

function formatPhone(value: string) {
  const d = value.replace(/\D/g, '')
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function CancelModal({
  onConfirm,
  onDismiss,
  loading,
}: {
  onConfirm: () => void
  onDismiss: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-rose-100 mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Cancelar solicitação?</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Tem certeza que deseja cancelar esta solicitação de serviço? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-200 font-semibold text-gray-600 hover:bg-gray-50 transition-all text-sm"
          >
            Não, manter
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 font-semibold text-white transition-all text-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sim, cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConsultarContent() {
  const searchParams = useSearchParams()
  const [phone, setPhone] = useState('')
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const doSearch = useCallback(async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/consultar?phone=${encodeURIComponent(digits)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar')
      setRequests(data.requests)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar solicitações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const p = searchParams.get('phone')
    if (p && p.length >= 10) {
      const formatted = formatPhone(p)
      setPhone(formatted)
      doSearch(p)
    }
  }, [searchParams, doSearch])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    await doSearch(phone)
  }

  const confirmCancel = async () => {
    if (!cancelTargetId) return
    const id = cancelTargetId
    setCancellingId(id)
    try {
      const res = await fetch('/api/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, phone: phone.replace(/\D/g, '') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar')
      setRequests((prev) => prev?.map((r) => r.id === id ? { ...r, status: 'cancelled' } as ServiceRequest : r) ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar')
    } finally {
      setCancellingId(null)
      setCancelTargetId(null)
    }
  }

  return (
    <>
      {cancelTargetId && (
        <CancelModal
          onConfirm={confirmCancel}
          onDismiss={() => setCancelTargetId(null)}
          loading={cancellingId === cancelTargetId}
        />
      )}

      <main className="min-h-screen bg-gradient-to-b from-vr-graphite to-vr-black">
        <header className="px-5 pt-8 pb-6 text-white">
          <Link href="/" className="flex items-center gap-1.5 text-vr-silver hover:text-white text-sm mb-5 w-fit transition-colors">
            <ChevronLeft className="w-4 h-4" /> Início
          </Link>
          <Logo size="sm" className="mb-3" />
          <h1 className="text-2xl font-bold">Minhas solicitações</h1>
          <p className="text-vr-silver/70 text-sm mt-1">Digite seu WhatsApp para ver o status dos seus pedidos</p>
        </header>

        <div className="px-4 max-w-lg md:mx-auto">
          <form onSubmit={handleSearch} className="bg-white rounded-2xl p-5 shadow-xl mb-4">
            <label className="label">Seu WhatsApp cadastrado</label>
            <div className="flex gap-2">
              <input
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                maxLength={15}
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={loading || phone.replace(/\D/g, '').length < 10}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          </form>

          {requests !== null && (
            <div className="space-y-3 pb-8">
              {requests.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center shadow">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Nenhuma solicitação encontrada</p>
                  <p className="text-gray-400 text-sm mt-1">Verifique o número digitado</p>
                </div>
              ) : (
                requests.map((req) => {
                  const st = STATUS_MAP[req.status] ?? STATUS_MAP.pending
                  const cancellable = req.status === 'pending' || req.status === 'quoted'
                  return (
                    <div key={req.id} className="bg-white rounded-2xl p-5 shadow">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${st.bg} ${st.color}`}>
                          {st.icon}
                          {st.label}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(req.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-semibold text-gray-900">{req.phone_model}</span>
                        </div>
                        <p className="text-sm text-gray-600 pl-6 leading-relaxed">{req.problem_description}</p>

                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-500">
                            {[req.address_street, req.address_number, req.address_city].filter(Boolean).join(', ') || `CEP ${req.address_cep}`}
                          </span>
                        </div>

                        {req.quote_value && (
                          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mt-1">
                            <p className="text-sm font-bold text-vr-red">
                              💰 Orçamento: R$ {Number(req.quote_value).toFixed(2)}
                            </p>
                            {req.status === 'quoted' && (
                              <p className="text-xs text-vr-red/70 mt-0.5">Aguardando sua confirmação via WhatsApp</p>
                            )}
                          </div>
                        )}

                        {req.owner_notes && (
                          <p className="text-xs text-gray-500 pl-6 italic border-l-2 border-gray-100 ml-1">
                            {req.owner_notes}
                          </p>
                        )}

                        {cancellable && (
                          <div className="pt-2 border-t border-gray-100">
                            <button
                              onClick={() => setCancelTargetId(req.id)}
                              className="text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors"
                            >
                              Cancelar solicitação
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default function ConsultarPage() {
  return (
    <Suspense fallback={null}>
      <ConsultarContent />
    </Suspense>
  )
}
