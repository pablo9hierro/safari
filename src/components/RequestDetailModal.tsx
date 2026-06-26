'use client'

import { useMemo, useState } from 'react'
import { PaymentMethodEntry, ServiceRequest, ServiceStatus } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import ServiceOrderPanel, { isServiceOrderStatus } from '@/components/ServiceOrderPanel'
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
  Send,
} from 'lucide-react'

const STATUS_LABELS: Record<ServiceStatus, string> = {
  pending:        'Pendente',
  accepted:       'Aceito pelo cliente (orçamento confirmado)',
  rejected:       '✅ Atendimento concluído — Recusado pelo cliente',
  retirada_local: '🏠 Retirada/entrega pelo cliente',
  em_busca:       '🛵 Em rota de recolhimento',
  in_progress:    '🔧 Em reparo',
  completed:      '✅ Reparo concluído',
  em_pagamento:   '💳 Em pagamento',
  em_entrega:     '📦 Em rota de entrega',
  delivered:      '📬 Aparelho entregue',
  finished:       '✅ Atendimento concluído',
  cancelled:      '✅ Atendimento concluído — Cancelado pelo cliente',
}

// Statuses com template de mensagem automática (espelha STATUS_MESSAGES em src/lib/whatsapp/messages.ts)
const STATUS_MESSAGES_AVAILABLE: ServiceStatus[] = [
  'accepted', 'rejected', 'retirada_local', 'em_busca', 'in_progress',
  'em_entrega', 'cancelled', 'delivered', 'finished',
]

type AdvanceConfig =
  | { type: 'terminal' }
  | { type: 'single'; next: ServiceStatus; label: string; ready: boolean; blockedMessage?: string }
  | { type: 'choice'; options: { next: ServiceStatus; label: string }[]; ready: boolean; blockedMessage?: string }

// O status só avança um passo por vez, nunca retrocede e nunca pula etapas.
// Algumas transições exigem que a OS correspondente já tenha sido preenchida.
function getAdvanceConfig(
  current: ServiceStatus,
  osState: { closed: boolean; hasUpdate: boolean },
  quoteValue: string,
  paymentReady: boolean
): AdvanceConfig {
  switch (current) {
    case 'pending':
      return {
        type: 'single',
        next: 'accepted',
        label: 'Aceitar orçamento e avançar',
        ready: !!quoteValue,
        blockedMessage: 'Preencha o valor do orçamento antes de avançar.',
      }
    case 'accepted':
      // O adm escolhe manualmente como o aparelho será coletado/entregue
      return {
        type: 'choice',
        options: [
          { next: 'retirada_local', label: '🏠 Cliente vai trazer/retirar o aparelho' },
          { next: 'em_busca', label: '🛵 Recolhimento do aparelho (motoboy)' },
        ],
        ready: true,
      }
    case 'retirada_local':
    case 'em_busca':
      return { type: 'single', next: 'in_progress', label: '🔧 Avançar para "Em reparo"', ready: true }
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
      // O adm escolhe manualmente o caminho de entrega: retirada pelo cliente ou rota de entrega
      return {
        type: 'choice',
        options: [
          { next: 'delivered', label: '📬 Aparelho entregue (retirada pelo cliente)' },
          { next: 'em_entrega', label: '📦 Em rota de entrega (motoboy)' },
        ],
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

// Atendimento pode ser cancelado enquanto o aparelho ainda não foi devolvido/entregue.
function canCancel(current: ServiceStatus) {
  return (['pending', 'accepted', 'retirada_local', 'em_busca', 'in_progress'] as ServiceStatus[]).includes(current)
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [osState, setOsState] = useState({ closed: false, hasUpdate: false })
  const [waError, setWaError] = useState<string | null>(null)
  const [resendingWa, setResendingWa] = useState(false)

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
      const res = await fetch('/api/whatsapp/notify', {
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

  const handleResendWa = async () => {
    setResendingWa(true)
    await notifyWhatsApp(status)
    setResendingWa(false)
  }

  const handleAdvance = async (next: ServiceStatus) => {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const updates = {
        status: next,
        quote_value: quoteValue ? parseFloat(quoteValue) : null,
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

  const advance = getAdvanceConfig(status, osState, quoteValue, paymentSaved)
  const fullAddress = request.self_pickup
    ? 'Cliente vai levar/buscar o aparelho — sem coleta/entrega'
    : [
        request.address_street,
        request.address_number,
        request.address_neighborhood,
        request.address_city,
        request.address_state,
      ].filter(Boolean).join(', ') || (request.address_cep ? `CEP ${request.address_cep}` : 'Endereço não informado')

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
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="font-semibold text-gray-900">{request.customer_name}</span>
              </div>
              <a href={`https://wa.me/55${phoneDigits}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-green-600 hover:text-green-700">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{request.customer_phone}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-600">{request.customer_email}</span>
              </div>
            </div>
          </section>

          {/* Celular */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Celular</h3>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="font-semibold text-gray-900">{request.phone_model}</span>
              </div>
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
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

          {/* Endereço */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço</h3>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-900">{fullAddress}</p>
                  {!request.self_pickup && request.address_reference && (
                    <p className="text-xs text-gray-500 mt-0.5">Ref: {request.address_reference}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Orçamento */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orçamento</h3>
            {status === 'pending' ? (
              <div>
                <label className="label">Valor do orçamento (R$)</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-gray-400 font-medium">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quoteValue}
                    onChange={(e) => setQuoteValue(e.target.value)}
                    placeholder="0,00"
                    className="input-field pl-10"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-sm text-gray-600">
                  Valor atual: <span className="font-semibold text-gray-900">R$ {Number(quoteValue || 0).toFixed(2)}</span>
                </p>
              </div>
            )}
          </section>

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
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {advance.type !== 'terminal' && !advance.ready && advance.blockedMessage && (
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

            {canCancel(status) && (
              <div className="flex gap-2">
                {status === 'pending' && (
                  <button
                    onClick={() => handleAdvance('rejected')}
                    disabled={loading}
                    className="flex-1 text-sm font-medium text-red-600 border border-red-200 rounded-xl py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Recusar
                  </button>
                )}
                <button
                  onClick={() => handleAdvance('cancelled')}
                  disabled={loading}
                  className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar atendimento
                </button>
              </div>
            )}

            {waError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Falha ao enviar WhatsApp automático: {waError}
              </div>
            )}

            {STATUS_MESSAGES_AVAILABLE.includes(status) && (
              <button
                type="button"
                onClick={handleResendWa}
                disabled={resendingWa}
                className="flex items-center justify-center gap-1.5 text-xs text-center text-green-600 hover:text-green-700 transition-colors w-full disabled:opacity-50"
              >
                {resendingWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Reenviar mensagem do status atual
              </button>
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
