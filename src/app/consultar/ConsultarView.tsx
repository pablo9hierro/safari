'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import {
  Smartphone, Search, Loader2, MapPin, Clock, CheckCircle,
  XCircle, Wrench, ChevronLeft, ChevronDown, Package, Truck, AlertTriangle, Home,
  PackageCheck, PartyPopper, CreditCard, ClipboardList, Eye, Download,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import {StoreLink, apiPath } from '@/lib/storeProxyLink'
import { formatAddress } from '@/lib/formatAddress'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:        { label: 'Aguardando avaliação',      color: 'text-yellow-700', bg: 'bg-yellow-100', icon: <Clock className="w-3.5 h-3.5" /> },
  accepted:       { label: 'Aceito',                    color: 'text-green-700',  bg: 'bg-green-100',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  rejected:       { label: 'Recusado',                  color: 'text-red-700',    bg: 'bg-red-100',    icon: <XCircle className="w-3.5 h-3.5" /> },
  retirada_local: { label: 'Retirada/entrega pelo cliente', color: 'text-teal-700', bg: 'bg-teal-100',  icon: <Home className="w-3.5 h-3.5" /> },
  em_busca:       { label: 'Motoboy a caminho',         color: 'text-orange-700', bg: 'bg-orange-100', icon: <Truck className="w-3.5 h-3.5" /> },
  in_progress:    { label: 'Em reparo',                 color: 'text-purple-700', bg: 'bg-purple-100', icon: <Wrench className="w-3.5 h-3.5" /> },
  completed:      { label: 'Concluído',                 color: 'text-gray-700',   bg: 'bg-gray-100',   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  em_pagamento:   { label: 'Em pagamento',              color: 'text-lime-700',   bg: 'bg-lime-100',   icon: <CreditCard className="w-3.5 h-3.5" /> },
  em_entrega:     { label: 'Em rota de entrega',        color: 'text-indigo-700', bg: 'bg-indigo-100', icon: <Truck className="w-3.5 h-3.5" /> },
  delivered:      { label: 'Aparelho entregue',         color: 'text-cyan-700',   bg: 'bg-cyan-100',   icon: <PackageCheck className="w-3.5 h-3.5" /> },
  finished:       { label: 'Atendimento concluído',     color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <PartyPopper className="w-3.5 h-3.5" /> },
  cancelled:      { label: 'Cancelado',                 color: 'text-rose-700',   bg: 'bg-rose-100',   icon: <XCircle className="w-3.5 h-3.5" /> },
}

// Etapas canônicas do atendimento — duas delas (busca/entrega) juntam os dois jeitos possíveis
// de acontecer (motoboy ou o próprio cliente) num rótulo só, já que só guardamos o status atual.
type Stage = { key: string; label: string; icon: React.ReactNode; statuses: ServiceStatus[] }

const STAGES: Stage[] = [
  // pending/accepted nunca acontecem como etapas sequenciais de verdade --
  // a solicitação já nasce direto em em_busca/retirada_local (ver
  // DashboardClient.tsx), então mostrar "Orçamento aceito" como um degrau
  // separado depois de "Solicitação realizada" é enganoso (nunca existiu
  // um orçamento pra aceitar nesse ponto). Um degrau só, cobrindo os dois.
  { key: 'pending', label: 'Solicitação recebida', icon: <ClipboardList className="w-3.5 h-3.5" />, statuses: ['pending', 'accepted'] },
  { key: 'pickup', label: 'Em rota de busca / cliente vai levar', icon: <Truck className="w-3.5 h-3.5" />, statuses: ['em_busca', 'retirada_local'] },
  { key: 'in_progress', label: 'Em reparo', icon: <Wrench className="w-3.5 h-3.5" />, statuses: ['in_progress'] },
  { key: 'completed', label: 'Reparo concluído', icon: <PackageCheck className="w-3.5 h-3.5" />, statuses: ['completed'] },
  { key: 'em_pagamento', label: 'Em pagamento', icon: <CreditCard className="w-3.5 h-3.5" />, statuses: ['em_pagamento'] },
  { key: 'delivery', label: 'Em rota de entrega / cliente vai buscar', icon: <Truck className="w-3.5 h-3.5" />, statuses: ['em_entrega', 'delivered'] },
  { key: 'finished', label: 'Atendimento concluído', icon: <PartyPopper className="w-3.5 h-3.5" />, statuses: ['finished'] },
]

function stageIndexForStatus(status: ServiceStatus): number {
  return STAGES.findIndex((s) => s.statuses.includes(status))
}

async function downloadFile(url: string, fileName: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

function TimelineStep({
  icon,
  label,
  current,
  last,
  children,
}: {
  icon: React.ReactNode
  label: string
  current?: boolean
  last?: boolean
  children?: React.ReactNode
}) {
  return (
    <li className="relative pl-8 pb-5 last:pb-0">
      {!last && <span className="absolute left-[11px] top-6 bottom-0 border-l-2 border-dashed border-red-200" />}
      <span
        className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center ${
          current ? 'bg-vr-red text-white' : 'bg-red-100 text-vr-red'
        }`}
      >
        {icon}
      </span>
      <p className={`text-sm leading-6 ${current ? 'font-bold text-vr-red' : 'font-medium text-gray-700'}`}>{label}</p>
      {children}
    </li>
  )
}

function RequestStatusTimeline({ request }: { request: ServiceRequest }) {
  const [expanded, setExpanded] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('service_orders')
      .select('pdf_url')
      .eq('request_id', request.id)
      .maybeSingle()
      .then(({ data }) => setPdfUrl(data?.pdf_url ?? null))
  }, [request.id])

  const current = STATUS_MAP[request.status] ?? STATUS_MAP.pending
  const isInterrupted = request.status === 'rejected' || request.status === 'cancelled'
  const currentIdx = stageIndexForStatus(request.status)

  const appointmentStartsAt = (request as ServiceRequest & { appointment_starts_at?: string | null }).appointment_starts_at
  const appointmentLabel = appointmentStartsAt
    ? new Date(appointmentStartsAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  // Nunca mistura os dois jeitos possíveis (motoboy busca vs. cliente
  // leva/retira) num rótulo só -- renderiza de acordo com o que ESTE
  // pedido pediu de verdade (self_pickup), com o horário agendado quando
  // já existe. apenasRetirada nem entra na conta: self_pickup já é sempre
  // true nesse caso, o resultado é o mesmo.
  const stages = STAGES.map((s) => {
    if (s.key === 'pickup') {
      return request.self_pickup
        ? { ...s, label: appointmentLabel ? `Aguardando você trazer o aparelho — ${appointmentLabel}` : 'Aguardando você trazer o aparelho na loja' }
        : { ...s, label: appointmentLabel ? `Em rota de coleta do aparelho — ${appointmentLabel}` : 'Em rota de coleta do aparelho' }
    }
    if (s.key === 'delivery') {
      return request.self_pickup
        ? { ...s, label: 'Aguardando você retirar o aparelho na loja' }
        : { ...s, label: 'Em rota de entrega do aparelho' }
    }
    return s
  })
  const visibleStages = isInterrupted ? [] : stages.slice(0, currentIdx + 1)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${current.bg} ${current.color}`}>
          {current.icon}
          {current.label}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <ol>
            {isInterrupted ? (
              <>
                <TimelineStep icon={<ClipboardList className="w-3.5 h-3.5" />} label="Solicitação realizada" />
                <TimelineStep icon={current.icon} label={current.label} current last />
              </>
            ) : (
              visibleStages.map((stage, i) => {
                const isLast = i === visibleStages.length - 1
                return (
                  <TimelineStep key={stage.key} icon={stage.icon} label={stage.label} current={isLast} last={isLast}>
                    {isLast && pdfUrl && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Visualizar OS
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadFile(pdfUrl, `OS-${request.id.slice(0, 8)}.pdf`)}
                          className="text-xs text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar PDF
                        </button>
                      </div>
                    )}
                  </TimelineStep>
                )
              })
            )}
          </ol>
        </div>
      )}
    </div>
  )
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

type ProductOrder = {
  id: string
  short_id: string
  status: string
  payment_status: string
  payment_method: string
  delivery_type: string
  total: number
  created_at: string
  updated_at: string
}

const ORDER_STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: 'Aguardando confirmação', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: <Clock className="w-3.5 h-3.5" /> },
  confirmed: { label: 'Confirmado', color: 'text-green-700', bg: 'bg-green-100', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  preparing: { label: 'Em preparo', color: 'text-purple-700', bg: 'bg-purple-100', icon: <Wrench className="w-3.5 h-3.5" /> },
  shipped: { label: 'Em rota de entrega', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: <Truck className="w-3.5 h-3.5" /> },
  delivered: { label: 'Entregue', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: <PackageCheck className="w-3.5 h-3.5" /> },
  completed: { label: 'Concluído', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <PartyPopper className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Cancelado', color: 'text-rose-700', bg: 'bg-rose-100', icon: <XCircle className="w-3.5 h-3.5" /> },
}

function ProductOrderCard({ order }: { order: ProductOrder }) {
  const current = ORDER_STATUS_MAP[order.status] ?? ORDER_STATUS_MAP.pending
  return (
    <div className="bg-white rounded-2xl p-5 shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${current.bg} ${current.color}`}>
          {current.icon}
          {current.label}
        </span>
        <span className="text-xs text-gray-400 flex-shrink-0 pt-1.5">
          {new Date(order.created_at).toLocaleDateString('pt-BR')}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="font-semibold text-gray-900">Pedido #{order.short_id}</span>
      </div>
      <p className="text-sm text-gray-500 pl-6">
        {order.delivery_type === 'delivery' ? 'Entrega' : 'Retirada na loja'} ·{' '}
        {order.payment_status === 'paid' ? 'Pago' : 'Pagamento pendente'}
      </p>
      <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mt-3">
        <p className="text-sm font-bold text-vr-red">💰 Total: R$ {Number(order.total).toFixed(2)}</p>
      </div>
    </div>
  )
}

function NotFoundCard() {
  return (
    <div className="bg-white rounded-2xl p-8 text-center shadow">
      <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-700 font-semibold mb-1">Não foi encontrada nenhuma solicitação neste WhatsApp</p>
      <p className="text-gray-400 text-sm mb-5">Você pode iniciar um atendimento agora mesmo:</p>
      <div className="flex flex-col gap-2">
        <StoreLink href="/vitrine" className="btn-primary py-3 text-sm">Ver vitrine da loja</StoreLink>
        <StoreLink href="/" className="text-xs text-gray-400 hover:text-gray-600">Voltar ao início</StoreLink>
      </div>
    </div>
  )
}

function ConsultarContent({ initialPhone, initialOtp }: { initialPhone?: string; initialOtp?: string }) {
  const searchParams = useSearchParams()
  const [step, setStep] = useState<'phone' | 'otp' | 'results' | 'not-found'>('phone')
  const [phone, setPhone] = useState(initialPhone ? formatPhone(initialPhone) : '')
  const [otp, setOtp] = useState('')
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null)
  const [orders, setOrders] = useState<ProductOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Só confere se existe atendimento -- NÃO gera nem manda código novo.
  // O código já mandado na criação do pedido/agendamento continua valendo;
  // gerar um novo toda vez que alguém digita o telefone mandaria WhatsApp
  // à toa. Gerar código novo é ação explícita, ver sendNewOtp.
  const checkPhone = useCallback(async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath('/api/consultar/otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, send: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao verificar telefone')
      if (!data.found) {
        setStep('not-found')
        return
      }
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar telefone')
    } finally {
      setLoading(false)
    }
  }, [])

  // Ação explícita do botão "Gerar novo código" -- essa sim gera e manda
  // um código novo por WhatsApp (invalida o anterior, ver RPC).
  const sendNewOtp = useCallback(async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath('/api/consultar/otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, send: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar código')
      if (!data.found) {
        setStep('not-found')
        return
      }
      setResendCooldown(30)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar código')
    } finally {
      setLoading(false)
    }
  }, [])

  const doVerify = useCallback(async (rawPhone: string, code: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 10 || code.length < 3) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath('/api/consultar/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) {
        setError('Código inválido ou expirado')
        return
      }
      setRequests(data.services ?? [])
      setOrders(data.orders ?? [])
      setStep('results')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar código')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const p = searchParams.get('phone')
    if (initialPhone && initialOtp) {
      doVerify(initialPhone, initialOtp)
    } else if (p && p.length >= 10) {
      const formatted = formatPhone(p)
      setPhone(formatted)
      checkPhone(p)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    await checkPhone(phone)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    await doVerify(phone, otp)
  }

  const confirmCancel = async () => {
    if (!cancelTargetId) return
    const id = cancelTargetId
    setCancellingId(id)
    try {
      const res = await fetch(apiPath('/api/consultar'), {
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
          <StoreLink href="/" className="flex items-center gap-1.5 text-vr-silver hover:text-white text-sm mb-5 w-fit transition-colors">
            <ChevronLeft className="w-4 h-4" /> Início
          </StoreLink>
          <Logo size="sm" className="mb-3" />
          <h1 className="text-2xl font-bold">Minhas solicitações</h1>
          <p className="text-vr-silver/70 text-sm mt-1">Digite seu WhatsApp para ver o status dos seus pedidos</p>
        </header>

        <div className="px-4 max-w-lg md:mx-auto">
          {step === 'phone' && (
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
          )}

          {step === 'not-found' && (
            <div className="mb-4">
              <NotFoundCard />
            </div>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerify} className="bg-white rounded-2xl p-5 shadow-xl mb-4">
              <label className="label">Código de 3 dígitos enviado pro seu WhatsApp</label>
              <div className="flex gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="000"
                  inputMode="numeric"
                  maxLength={3}
                  autoFocus
                  className="input-field flex-1 text-center text-2xl tracking-[0.5em] font-bold"
                />
                <button
                  type="submit"
                  disabled={loading || otp.length < 3}
                  className="btn-primary px-5 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  onClick={() => { setStep('phone'); setOtp('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Trocar número
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || loading}
                  onClick={() => sendNewOtp(phone)}
                  className="text-xs text-vr-red hover:text-vr-red-dark font-semibold disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Gerar novo código (${resendCooldown}s)` : 'Gerar novo código'}
                </button>
              </div>
            </form>
          )}

          {step === 'results' && (
            <div className="space-y-3 pb-8">
              {requests !== null && orders.length === 0 && requests.length === 0 ? (
                <NotFoundCard />
              ) : (
                <>
                  {orders.map((order) => (
                    <ProductOrderCard key={order.id} order={order} />
                  ))}
                  {(requests ?? []).map((req) => {
                  const cancellable = req.status === 'pending'
                  return (
                    <div key={req.id} className="bg-white rounded-2xl p-5 shadow">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <RequestStatusTimeline request={req} />
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 pt-2.5">
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
                            {req.self_pickup
                              ? 'Você vai levar/buscar o aparelho — sem coleta/entrega'
                              : formatAddress(req)}
                          </span>
                        </div>

                        {req.quote_value && (
                          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mt-1">
                            <p className="text-sm font-bold text-vr-red">
                              💰 Orçamento: R$ {Number(req.quote_value).toFixed(2)}
                            </p>
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
                })}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export function ConsultarView(props: { initialPhone?: string; initialOtp?: string }) {
  return (
    <Suspense fallback={null}>
      <ConsultarContent initialPhone={props?.initialPhone} initialOtp={props?.initialOtp} />
    </Suspense>
  )
}
