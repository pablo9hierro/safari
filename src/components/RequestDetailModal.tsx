'use client'

import { useState } from 'react'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { STORE_ADDRESS, SITE_URL } from '@/lib/constants'
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
} from 'lucide-react'

const STATUS_LABELS: Record<ServiceStatus, string> = {
  pending:        'Pendente',
  accepted:       'Aceito pelo cliente (orçamento confirmado)',
  rejected:       '✅ Atendimento concluído — Recusado pelo cliente',
  retirada_local: '🏠 Retirada/entrega pelo cliente',
  em_busca:       '🛵 Em rota de recolhimento',
  in_progress:    '🔧 Em reparo',
  completed:      '✅ Reparo concluído',
  em_entrega:     '📦 Em rota de entrega',
  delivered:      '📬 Aparelho entregue',
  finished:       '✅ Atendimento concluído',
  cancelled:      '✅ Atendimento concluído — Cancelado pelo cliente',
}

type AdvanceConfig =
  | { type: 'terminal' }
  | { type: 'single'; next: ServiceStatus; label: string; ready: boolean; blockedMessage?: string }
  | { type: 'choice'; options: { next: ServiceStatus; label: string }[]; ready: boolean; blockedMessage?: string }

// O status só avança um passo por vez, nunca retrocede e nunca pula etapas.
// Algumas transições exigem que a OS correspondente já tenha sido preenchida.
function getAdvanceConfig(current: ServiceStatus, osState: { closed: boolean; hasUpdate: boolean }, quoteValue: string): AdvanceConfig {
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
      // O adm escolhe manualmente o caminho de entrega: retirada pelo cliente ou rota de entrega
      return {
        type: 'choice',
        options: [
          { next: 'delivered', label: '📬 Aparelho entregue (retirada pelo cliente)' },
          { next: 'em_entrega', label: '📦 Em rota de entrega (motoboy)' },
        ],
        ready: osState.closed,
        blockedMessage: 'Conclua a ordem de serviço (formulário de conclusão) antes de avançar.',
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

  const phoneDigits = request.customer_phone.replace(/\D/g, '')

  const buildWaMessage = (s: ServiceStatus, qv: string): string | undefined => {
    const qFormatted = `R$ ${Number(qv || 0).toFixed(2)}`
    const messages: Partial<Record<ServiceStatus, string>> = {
      accepted:       `Olá *${request.customer_name}*! Seu orçamento para o *${request.phone_model}* ficou em ${qFormatted}. Agradecemos pela preferência em nosso serviço! Por favor, compartilhe a sua localização fixa através do WhatsApp. Em breve recolheremos o aparelho celular para dar continuidade ao serviço. 📍`,
      rejected:       `Entendemos, *${request.customer_name}*. Se mudar de ideia, pode nos chamar aqui!`,
      retirada_local: `Deseja trazer ou retirar o aparelho em nosso endereço?\n📍 ${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood}, ${STORE_ADDRESS.city}\n${STORE_ADDRESS.mapsUrl}`,
      em_busca:       `🛵 Recebemos sua localização e estamos iniciando a busca do seu aparelho celular.`,
      in_progress:    `🔧 Seu aparelho celular está sendo reparado neste momento. Acompanhe qualquer atualização do serviço em tempo real através do link:\n${SITE_URL}/consultar?phone=${phoneDigits}`,
      em_entrega:     `📦 Em rota de entrega para devolução do aparelho.`,
      delivered:      `📬 Aparelho entregue! Agradecemos a confiança, *${request.customer_name}*. Caso precise de algo, estamos à disposição!`,
      finished:       `✅ Atendimento concluído. Agradecemos a confiança, *${request.customer_name}*! Caso precise de algo, estamos à disposição.`,
    }
    return messages[s]
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

      // Auto-open WhatsApp if there's a message template for the new status
      const waMsg = buildWaMessage(next, quoteValue)
      if (waMsg) {
        const link = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(waMsg)}`
        window.open(link, '_blank')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const waMsg = buildWaMessage(status, quoteValue)
  const waLinkWithMsg = waMsg
    ? `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(waMsg)}`
    : `https://wa.me/55${phoneDigits}`
  const advance = getAdvanceConfig(status, osState, quoteValue)
  const fullAddress = [
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
              <a href={waLinkWithMsg} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-green-600 hover:text-green-700">
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
                  <p className="text-xs text-gray-500 mt-0.5">Ref: {request.address_reference}</p>
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

            {advance.type === 'choice' && advance.ready && (
              <div className="space-y-2">
                {advance.options.map((opt) => (
                  <button
                    key={opt.next}
                    onClick={() => handleAdvance(opt.next)}
                    disabled={loading}
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

            {waMsg && (
              <a
                href={waLinkWithMsg}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-center text-green-600 hover:text-green-700 transition-colors block"
              >
                Reenviar mensagem manualmente
              </a>
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
