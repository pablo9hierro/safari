'use client'

import { useMemo, useState } from 'react'
import { PaymentMethodEntry, ServiceRequest, ServiceStatus } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import ServiceOrderPanel, { isServiceOrderStatus } from '@/components/ServiceOrderPanel'
import DiagnosticSection from '@/components/DiagnosticSection'
import PatternLockInput from '@/components/PatternLockInput'
import { formatAddress } from '@/lib/formatAddress'
import { apiPath } from '@/lib/storeProxyLink'
import { computeDiagnosisBusyUntil, computeRepairBusyUntil } from '@/lib/serviceLifecycle/busyUntil'
import {
  X,
  Smartphone,
  MapPin,
  User,
  Phone,
  Mail,
  MessageSquare,
  Loader2,
  AlertCircle,
  ExternalLink,
  ArrowRight,
} from 'lucide-react'

const STATUS_LABELS: Record<ServiceStatus, string> = {
  pending:                '🆕 Solicitação nova — aguardando aceite',
  accepted:               'Aceito pelo cliente (orçamento confirmado)',
  rejected:               '✅ Atendimento concluído — Recusado pelo cliente',
  retirada_local:         '🏠 Retirada/entrega pelo cliente',
  em_busca:               '🛵 Em rota de recolhimento',
  in_progress:            '🔧 Em reparo',
  completed:              '✅ Reparo concluído',
  em_pagamento:           '💳 Em pagamento',
  em_entrega:             '📦 Em rota de entrega',
  delivered:              '📬 Aparelho entregue',
  finished:               '✅ Atendimento concluído',
  cancelled:              '✅ Atendimento concluído — Cancelado pelo cliente',
  aguardando_diagnostico: '🔍 Aguardando diagnóstico físico do aparelho',
  diagnostico_enviado:    '📄 Diagnóstico enviado — aguardando aprovação do cliente',
}

type AdvanceConfig =
  | { type: 'terminal' }
  | { type: 'diagnostic' }
  | { type: 'single'; next: ServiceStatus; label: string; ready: boolean; blockedMessage?: string }
  | { type: 'choice'; options: { next: ServiceStatus; label: string }[]; ready: boolean; blockedMessage?: string }

function getAdvanceConfig(
  current: ServiceStatus,
  osState: { closed: boolean; hasUpdate: boolean },
  quoteValue: string,
  paymentReady: boolean,
  selfPickup: boolean,
  diagnosisRequested: boolean,
  estimatedQuoteValue: string,
  credentialSaved: boolean,
): AdvanceConfig {
  switch (current) {
    // "Solicitação nova" -- landing de toda solicitação recém-chegada do
    // cliente (vitrine/orçamento). Lojista decide: aceita (avança pra
    // coleta/aguardando aparelho) ou cancela com justificativa (ver botão
    // dedicado fora deste switch, mesmo padrão de retirada_local/em_busca).
    // Senha do cliente (PIN/padrão) é obrigatória antes de aceitar -- sem
    // ela não dá pra devolver o aparelho depois sem o desenho/senha certos.
    case 'pending': {
      const blockedMessage = credentialSaved ? undefined : 'Salve a senha do cliente (PIN ou padrão) antes de aceitar.'
      if (selfPickup) {
        return { type: 'single', next: 'retirada_local', label: '🏠 Aceitar — aguardando aparelho', ready: credentialSaved, blockedMessage }
      }
      return {
        type: 'choice',
        options: [
          { next: 'retirada_local', label: '🏠 Aceitar — cliente vai trazer/retirar o aparelho' },
          { next: 'em_busca', label: '🛵 Aceitar — em rota de coleta (motoboy)' },
        ],
        ready: credentialSaved,
        blockedMessage,
      }
    }

    // Card de coleta (self_pickup) ou deslocamento (motoboy): é aqui que o
    // lojista preenche o orçamento estimado (falado de boca) e a senha do
    // cliente, no momento físico da coleta/recebimento. Sem orçamento
    // estimado, não avança -- ele é a referência pra decidir depois, no
    // diagnóstico, se o atendimento segue sozinho pro reparo ou espera
    // aprovação do cliente (ver quoteDecision.ts).
    case 'retirada_local':
    case 'em_busca':
      return diagnosisRequested
        ? {
            type: 'single',
            next: 'aguardando_diagnostico',
            label: '🔍 Enviar para diagnóstico físico',
            ready: !!estimatedQuoteValue,
            blockedMessage: 'Preencha o orçamento estimado antes de avançar.',
          }
        : {
            type: 'single',
            next: 'in_progress',
            label: '🔧 Avançar para "Em reparo"',
            ready: !!estimatedQuoteValue,
            blockedMessage: 'Preencha o orçamento estimado antes de avançar.',
          }

    case 'aguardando_diagnostico':
      return { type: 'diagnostic' }

    case 'diagnostico_enviado':
      return {
        type: 'choice',
        options: [
          // Vai direto pro reparo -- "accepted" deixou de ser destino
          // funcional dessa transição (só o mesmo aprovação-via-IA em
          // store.ts::approveServiceQuote, mantido em paralelo).
          { next: 'in_progress', label: '✅ Cliente aprovou o orçamento' },
          { next: 'cancelled', label: '❌ Cliente cancelou' },
        ],
        ready: true,
      }
    case 'accepted':
      if (selfPickup) {
        // Cliente já avisou que vai trazer/buscar — confirma chegada diretamente
        return { type: 'single', next: 'retirada_local', label: '🏠 Confirmar chegada do aparelho', ready: true }
      }
      return {
        type: 'choice',
        options: [
          { next: 'retirada_local', label: '🏠 Cliente vai trazer/retirar o aparelho' },
          { next: 'em_busca', label: '🛵 Recolhimento do aparelho (motoboy)' },
        ],
        ready: true,
      }
    case 'in_progress':
      return {
        type: 'single',
        next: 'completed',
        label: '✅ Avançar para "Reparo concluído"',
        ready: osState.hasUpdate,
        blockedMessage: 'Preencha o checklist de avaliação (formulário 1) e registre ao menos uma atualização no acompanhamento (formulário 2) antes de avançar.',
      }
    case 'completed':
      return {
        type: 'single',
        next: 'em_pagamento',
        label: '💳 Avançar para forma de pagamento',
        ready: osState.closed,
        blockedMessage: 'Conclua a ordem de serviço (formulário de conclusão) antes de avançar.',
      }
    case 'em_pagamento':
      // Caminho de entrega determinado pelo que o cliente escolheu no formulário.
      // self_pickup=true → cliente vem buscar; false → motoboy entrega.
      if (selfPickup) {
        return {
          type: 'single',
          next: 'delivered',
          label: '📬 Confirmar retirada pelo cliente',
          ready: paymentReady,
          blockedMessage: 'Registre a forma de pagamento antes de avançar.',
        }
      }
      return {
        type: 'single',
        next: 'em_entrega',
        label: '📦 Confirmar saída para entrega (motoboy)',
        ready: paymentReady,
        blockedMessage: 'Registre a forma de pagamento antes de avançar.',
      }
    case 'em_entrega':
    case 'delivered':
      return { type: 'single', next: 'finished', label: '✅ Avançar para "Atendimento concluído"', ready: true }
    default:
      return { type: 'terminal' }
  }
}


export default function RequestDetailModal({
  request,
  onClose,
  onUpdate,
}: {
  request: ServiceRequest
  onClose: () => void
  onUpdate: (r: ServiceRequest) => void
}) {
  const [status, setStatus] = useState<ServiceStatus>(request.status)
  const [quoteValue, setQuoteValue] = useState(request.quote_value?.toString() ?? '')
  // Orçamento estimado: falado de boca na coleta -- referência pra decidir,
  // depois do diagnóstico, se o atendimento segue sozinho pro reparo ou
  // espera aprovação do cliente (real > estimado). Salvo assim que digitado
  // (onBlur), não só no clique de avançar -- não fica preso a um submit só.
  const [estimatedQuoteValue, setEstimatedQuoteValue] = useState(request.estimated_quote_value?.toString() ?? '')
  const [savingEstimate, setSavingEstimate] = useState(false)
  // Senha do cliente (PIN ou padrão de desenho) -- colapsável, salva em
  // service_request_credentials (RLS restrita a authenticated, nunca lida
  // pelo /consultar nem pela IA).
  // Já nasce aberto quando ainda pendente -- é obrigatória pra aceitar,
  // não faz sentido esconder atrás de um toggle nesse caso.
  const [credentialsOpen, setCredentialsOpen] = useState(request.status === 'pending')
  const [credentialKind, setCredentialKind] = useState<'pin' | 'pattern'>('pin')
  const [credentialValue, setCredentialValue] = useState('')
  const [credentialSaved, setCredentialSaved] = useState(false)
  const [savingCredential, setSavingCredential] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  // Cancelamento com justificativa (só pending/"Solicitação nova") -- motivo
  // obrigatório, mandado pro cliente por WhatsApp (ver /api/service-requests/[id]/cancel).
  const [reasonCancelOpen, setReasonCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancellingWithReason, setCancellingWithReason] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [osState, setOsState] = useState({ closed: false, hasUpdate: false })
  const [waError, setWaError] = useState<string | null>(null)

  const [selectedMethods, setSelectedMethods] = useState<string[]>((request.payment_methods ?? []).map((p) => p.method))
  const [methodValues, setMethodValues] = useState<Record<string, string>>(
    Object.fromEntries((request.payment_methods ?? []).map((p) => [p.method, String(p.value)]))
  )
  const [discountPercent, setDiscountPercent] = useState(request.discount_percent != null ? String(request.discount_percent) : '')
  const [paymentSaved, setPaymentSaved] = useState((request.payment_methods ?? []).length > 0)
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const phoneDigits = request.customer_phone.replace(/\D/g, '')

  const baseValue = Number(quoteValue || 0)
  const discountNum = parseInt(discountPercent || '0', 10) || 0
  const discountedValue = baseValue * (1 - discountNum / 100)
  // A última forma selecionada tem o valor calculado automaticamente (resto do total com
  // desconto) — assim o lojista nunca precisa fazer essa conta de cabeça.
  const lastMethod = selectedMethods[selectedMethods.length - 1]
  const otherMethods = selectedMethods.slice(0, -1)
  const otherSum = useMemo(
    () => otherMethods.reduce((s, m) => s + (parseFloat(methodValues[m] || '0') || 0), 0),
    [otherMethods, methodValues]
  )
  const remainder = Math.max(0, discountedValue - otherSum)
  const methodsValid = selectedMethods.length <= 1 || otherSum <= discountedValue + 0.01

  const toggleMethod = (method: string) => {
    setPaymentSaved(false)
    setSelectedMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]))
  }

  const handleSavePayment = async () => {
    setPaymentError(null)
    if (selectedMethods.length === 0) {
      setPaymentError('Selecione ao menos uma forma de pagamento.')
      return
    }
    if (!methodsValid) {
      setPaymentError('Os valores informados já passam do total com desconto.')
      return
    }

    const finalMethods: PaymentMethodEntry[] = selectedMethods.length === 1
      ? [{ method: selectedMethods[0], value: discountedValue }]
      : [
          ...otherMethods.map((m) => ({ method: m, value: parseFloat(methodValues[m] || '0') || 0 })),
          { method: lastMethod, value: remainder },
        ]

    setSavingPayment(true)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('service_requests')
      .update({ discount_percent: discountNum || null, payment_methods: finalMethods, quote_value: discountedValue })
      .eq('id', request.id)
      .select()
      .single()

    if (err || !data) {
      setPaymentError('Não foi possível salvar a forma de pagamento.')
      setSavingPayment(false)
      return
    }

    // Mantém o valor final da OS em sincronia com o valor efetivamente cobrado (após desconto).
    await supabase.from('service_orders').update({ final_value: discountedValue }).eq('request_id', request.id)

    setQuoteValue(String(discountedValue))
    onUpdate(data as ServiceRequest)
    setPaymentSaved(true)
    setSavingPayment(false)
  }

  // Dispara o envio via Evolution API no backend, sem qualquer redirecionamento manual.
  const notifyWhatsApp = async (event: ServiceStatus) => {
    setWaError(null)
    try {
      const res = await fetch(apiPath('/api/whatsapp/notify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, event }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Erro ao enviar WhatsApp')
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : 'Erro ao enviar WhatsApp')
    }
  }

  const handleCancelWithReason = async () => {
    if (!cancelReason.trim()) return
    setCancellingWithReason(true)
    setError(null)
    try {
      const res = await fetch(apiPath(`/api/service-requests/${request.id}/cancel`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Erro ao cancelar')
      setStatus('cancelled')
      onUpdate(data.data as ServiceRequest)
      setReasonCancelOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar')
    } finally {
      setCancellingWithReason(false)
    }
  }

  const handleAdvance = async (next: ServiceStatus) => {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const updates: Record<string, unknown> = {
        status: next,
        quote_value: quoteValue ? parseFloat(quoteValue) : null,
      }

      // Timer de ocupação da bancada: dois relógios (diagnóstico e reparo
      // são fases distintas, com durações próprias -- diagnóstico usa o
      // serviço "Diagnóstico" cadastrado no catálogo; reparo usa a soma dos
      // serviços selecionados de verdade). Entrar num desses status recalcula
      // busy_until; sair (avançar além) libera a agenda.
      if (next === 'aguardando_diagnostico') {
        updates.busy_until = await computeDiagnosisBusyUntil(supabase)
      } else if (next === 'in_progress') {
        updates.busy_until = await computeRepairBusyUntil(request.selected_service_ids ?? [], supabase)
      } else {
        // Qualquer outra transição libera a bancada -- diagnóstico/reparo
        // não estão mais em andamento neste atendimento.
        updates.busy_until = null
      }
      const { data, error: updateError } = await supabase
        .from('service_requests')
        .update(updates)
        .eq('id', request.id)
        .select()
        .single()
      if (updateError) throw updateError
      setStatus(next)
      onUpdate(data as ServiceRequest)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      // A mensagem de "completed" tem dados da OS (serviços/valor/garantia) e só é
      // enviada quando a OS é de fato fechada — ver ServiceOrderPanel.handleSaveCompletion.
      if (next !== 'completed') await notifyWhatsApp(next)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const saveEstimatedQuote = async () => {
    setSavingEstimate(true)
    setError(null)
    try {
      const supabase = createClient()
      const value = estimatedQuoteValue ? parseFloat(estimatedQuoteValue) : null
      const { error: updateError } = await supabase
        .from('service_requests')
        .update({ estimated_quote_value: value })
        .eq('id', request.id)
      if (updateError) throw updateError
      onUpdate({ ...request, estimated_quote_value: value })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar orçamento estimado')
    } finally {
      setSavingEstimate(false)
    }
  }

  const saveCredential = async () => {
    if (!credentialValue.trim()) return
    setSavingCredential(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: upsertError } = await supabase
        .from('service_request_credentials')
        .upsert(
          { service_request_id: request.id, kind: credentialKind, value: credentialValue.trim() },
          { onConflict: 'service_request_id' },
        )
      if (upsertError) throw upsertError
      setCredentialSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar senha do cliente')
    } finally {
      setSavingCredential(false)
    }
  }

  const advance = getAdvanceConfig(status, osState, quoteValue, paymentSaved, !!request.self_pickup, !!request.diagnosis_requested, estimatedQuoteValue, credentialSaved)
  const fullAddress = request.self_pickup
    ? 'Cliente vai levar/buscar o aparelho — sem coleta/entrega'
    : formatAddress(request)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="font-bold text-gray-900">Detalhes da solicitação</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Cliente */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente</h3>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900">{request.customer_name}</span>
              </div>
              <a href={`https://wa.me/55${phoneDigits}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-green-600 hover:text-green-700">
                <Phone className="w-4 h-4 shrink-0" />
                <span className="text-sm">{request.customer_phone}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-600">{request.customer_email}</span>
              </div>
            </div>
          </section>

          {/* Celular */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Celular</h3>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900">
                  {request.phone_model ?? (request.diagnosis_requested ? '🔍 Diagnóstico solicitado' : '—')}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">{request.problem_description}</p>
              </div>
              {request.image_url && (
                <a href={request.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={request.image_url}
                    alt="Foto do celular"
                    className="w-full max-h-48 object-cover rounded-xl mt-2"
                  />
                </a>
              )}
            </div>
          </section>

          {/* Diagnóstico — aparece apenas quando status = aguardando_diagnostico */}
          {advance.type === 'diagnostic' && (
            <DiagnosticSection
              request={request}
              onSaved={(newStatus) => {
                setStatus(newStatus)
                onUpdate({ ...request, status: newStatus })
              }}
            />
          )}

          {/* Endereço */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço</h3>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-900">{fullAddress}</p>
                  {!request.self_pickup && request.address_reference && (
                    <p className="text-xs text-gray-500 mt-0.5">Ref: {request.address_reference}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Orçamento estimado + senha do cliente. Orçamento é só na
              coleta/deslocamento (momento físico em que o lojista tem essa
              info em mãos); senha já aparece em "Solicitação nova" também,
              porque agora é obrigatória pra aceitar (ver getAdvanceConfig). */}
          {(status === 'pending' || status === 'retirada_local' || status === 'em_busca') && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Coleta do aparelho</h3>
              {(status === 'retirada_local' || status === 'em_busca') && (
                <div>
                  <label className="label">Orçamento estimado (R$) <span className="font-normal text-gray-400">— falado de boca, confirmado no diagnóstico</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-gray-400 font-medium">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={estimatedQuoteValue}
                      onChange={(e) => setEstimatedQuoteValue(e.target.value)}
                      onBlur={saveEstimatedQuote}
                      placeholder="0,00"
                      className="input-field pl-10"
                    />
                  </div>
                  {savingEstimate && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</p>}
                  {!request.self_pickup && request.shipping_price && (
                    <p className="text-xs text-amber-600 mt-1.5">
                      Frete (coleta): R$ {Number(request.shipping_price).toFixed(2)} — será somado automaticamente ao total. A entrega/retirada é decidida e cobrada à parte quando o reparo terminar.
                    </p>
                  )}
                </div>
              )}

              {/* Senha do cliente — colapsável: clique abre o form; ao salvar,
                  clique de novo revela o que foi cadastrado. */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCredentialsOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">🔒 Senha do cliente (PIN ou padrão)</span>
                  <span className="text-gray-400 text-xs">{credentialsOpen ? '▲' : '▼'}</span>
                </button>
                {credentialsOpen && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-gray-100">
                    {credentialSaved ? (
                      <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">{credentialKind === 'pin' ? 'PIN' : 'Padrão'} cadastrado</p>
                          <button
                            type="button"
                            onClick={() => setCredentialSaved(false)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Editar
                          </button>
                        </div>
                        {credentialKind === 'pin' ? (
                          <p className="text-sm font-mono font-semibold text-gray-900">{credentialValue}</p>
                        ) : (
                          <PatternLockInput value={credentialValue} readOnly />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          {(['pin', 'pattern'] as const).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setCredentialKind(k)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                credentialKind === k ? 'border-vr-red bg-red-50 text-vr-red' : 'border-gray-200 text-gray-500'
                              }`}
                            >
                              {k === 'pin' ? 'PIN numérico' : 'Padrão de desenho'}
                            </button>
                          ))}
                        </div>
                        {credentialKind === 'pin' ? (
                          <input
                            type="text"
                            value={credentialValue}
                            onChange={(e) => setCredentialValue(e.target.value)}
                            placeholder="Ex: 1234"
                            className="input-field"
                          />
                        ) : (
                          <PatternLockInput value={credentialValue} onChange={setCredentialValue} />
                        )}
                        <button
                          type="button"
                          onClick={saveCredential}
                          disabled={savingCredential || !credentialValue.trim()}
                          className="w-full py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white disabled:opacity-50"
                        >
                          {savingCredential ? 'Salvando...' : 'Salvar senha'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Orçamento — leitura, fora da etapa de coleta (valor já vem do
              diagnóstico ou de auto-avanço, ver quoteDecision.ts). */}
          {status !== 'retirada_local' && status !== 'em_busca' && Number(quoteValue) > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orçamento</h3>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-sm text-gray-600">
                  Valor atual: <span className="font-semibold text-gray-900">R$ {Number(quoteValue || 0).toFixed(2)}</span>
                </p>
                {!request.self_pickup && request.shipping_price && (
                  <p className="text-xs text-gray-400 mt-0.5">Inclui frete (coleta): R$ {Number(request.shipping_price).toFixed(2)}</p>
                )}
              </div>
            </section>
          )}

          {/* Pagamento — formulário só durante o status "em pagamento" */}
          {status === 'em_pagamento' && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pagamento</h3>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div>
                  <label className="label">Desconto (%)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => { setDiscountPercent(e.target.value.replace(/[^0-9]/g, '')); setPaymentSaved(false) }}
                    placeholder="0"
                    className="input-field"
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Valor original</span>
                  <span className="font-semibold text-gray-700">R$ {baseValue.toFixed(2)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Valor com desconto</span>
                    <span className="font-bold text-vr-red">R$ {discountedValue.toFixed(2)}</span>
                  </div>
                )}
                <div>
                  <label className="label">Forma de pagamento</label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMethod(m)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors
                          ${selectedMethods.includes(m) ? 'bg-vr-red text-white border-vr-red' : 'bg-white text-gray-600 border-gray-200 hover:border-vr-red/40'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedMethods.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">
                      Informe o valor pago em cada forma — a última é calculada automaticamente com o restante.
                    </p>
                    {otherMethods.map((m) => (
                      <div key={m} className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 flex-1">{m}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={methodValues[m] ?? ''}
                          onChange={(e) => { setMethodValues((prev) => ({ ...prev, [m]: e.target.value })); setPaymentSaved(false) }}
                          placeholder="0,00"
                          className="input-field w-28 text-sm"
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 flex-1">{lastMethod} <span className="text-gray-400">(restante)</span></span>
                      <input
                        disabled
                        value={remainder.toFixed(2)}
                        className="input-field w-28 text-sm opacity-60"
                      />
                    </div>
                    {!methodsValid && (
                      <p className="text-xs text-amber-600">Os valores informados já passam do total com desconto.</p>
                    )}
                  </div>
                )}
                {paymentError && <p className="text-xs text-red-500">{paymentError}</p>}
                <button
                  type="button"
                  onClick={handleSavePayment}
                  disabled={savingPayment || paymentSaved}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : paymentSaved ? '✓ Pagamento registrado' : 'Salvar forma de pagamento'}
                </button>
              </div>
            </section>
          )}

          {/* Pagamento — resumo somente leitura nas etapas seguintes */}
          {status !== 'em_pagamento' && !!request.payment_methods?.length && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pagamento</h3>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                {!!request.discount_percent && (
                  <p className="text-sm text-gray-600">Desconto aplicado: {request.discount_percent}%</p>
                )}
                {request.payment_methods.map((p) => (
                  <p key={p.method} className="text-sm text-gray-700 flex justify-between">
                    <span>{p.method}</span>
                    <span className="font-semibold">R$ {Number(p.value).toFixed(2)}</span>
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Ordem de serviço */}
          {isServiceOrderStatus(status) && (
            <ServiceOrderPanel
              request={request}
              status={status}
              onQuoteValueChange={(newValue) => {
                setQuoteValue(String(newValue))
                onUpdate({ ...request, quote_value: newValue })
              }}
              onOrderStateChange={setOsState}
            />
          )}

          {/* Status do atendimento */}
          <section className="space-y-3 pt-2 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status do atendimento</h3>

            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs text-gray-400 mb-1">Status atual</p>
              <p className="font-semibold text-gray-900">{STATUS_LABELS[status]}</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {advance.type !== 'terminal' && advance.type !== 'diagnostic' && !advance.ready && advance.blockedMessage && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                {advance.blockedMessage}
              </p>
            )}

            {advance.type === 'single' && (
              <button
                onClick={() => handleAdvance(advance.next)}
                disabled={loading || !advance.ready}
                className={`btn-primary w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50
                  ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : saved ? (
                  '✓ Status atualizado!'
                ) : (
                  <><ArrowRight className="w-4 h-4" /> {advance.label}</>
                )}
              </button>
            )}

            {advance.type === 'choice' && (
              <div className="space-y-2">
                {advance.options.map((opt) => (
                  <button
                    key={opt.next}
                    onClick={() => handleAdvance(opt.next)}
                    disabled={loading || !advance.ready}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : opt.label}
                  </button>
                ))}
              </div>
            )}

            {status === 'pending' && (
              <button
                onClick={() => setReasonCancelOpen(true)}
                disabled={loading}
                className="w-full text-sm font-medium text-red-600 border border-red-200 rounded-xl py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Recusar / cancelar solicitação
              </button>
            )}

            {(status === 'retirada_local' || status === 'em_busca') && (
              <button
                onClick={() => setCancelConfirmOpen(true)}
                disabled={loading}
                className="w-full text-sm font-medium text-red-600 border border-red-200 rounded-xl py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Cancelar solicitação
              </button>
            )}

            {reasonCancelOpen && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3">
                  <h3 className="font-bold text-gray-900">Recusar/cancelar solicitação</h3>
                  <p className="text-sm text-gray-500">
                    Esse motivo é enviado direto pro cliente por WhatsApp — seja claro e educado.
                  </p>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ex: No momento não atendemos esse modelo de aparelho."
                    rows={3}
                    className="input-field resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setReasonCancelOpen(false); setCancelReason('') }}
                      disabled={cancellingWithReason}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleCancelWithReason}
                      disabled={cancellingWithReason || !cancelReason.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      {cancellingWithReason ? 'Enviando...' : 'Confirmar e avisar cliente'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {cancelConfirmOpen && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3">
                  <h3 className="font-bold text-gray-900">Cancelar solicitação?</h3>
                  <p className="text-sm text-gray-500">
                    O atendimento vai pro histórico como cancelado. Essa ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setCancelConfirmOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={async () => { setCancelConfirmOpen(false); await handleAdvance('cancelled') }}
                      disabled={loading}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirmar cancelamento
                    </button>
                  </div>
                </div>
              </div>
            )}

            {waError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Falha ao enviar WhatsApp automático: {waError}
              </div>
            )}

          </section>

          <p className="text-xs text-gray-400 text-center pb-2">
            Solicitado em {new Date(request.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  )
}
