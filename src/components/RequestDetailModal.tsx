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
} from 'lucide-react'

const STATUS_OPTIONS: { value: ServiceStatus; label: string }[] = [
  { value: 'pending',        label: 'Pendente' },
  { value: 'quoted',         label: 'Orçado' },
  { value: 'accepted',       label: 'Aceito pelo cliente' },
  { value: 'rejected',       label: 'Recusado pelo cliente' },
  { value: 'retirada_local', label: '🏠 Retirada/entrega no local' },
  { value: 'em_busca',       label: '🛵 Em rota de recolhimento' },
  { value: 'in_progress',    label: '🔧 Em reparo' },
  { value: 'em_entrega',     label: '📦 Em rota de entrega' },
  { value: 'completed',      label: '✅ Reparo concluído' },
  { value: 'cancelled',      label: '❌ Cancelado' },
]

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
  const [ownerNotes, setOwnerNotes] = useState(request.owner_notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const initialStatus = request.status

  const phoneDigits = request.customer_phone.replace(/\D/g, '')

  const buildWaMessage = (s: ServiceStatus, qv: string): string | undefined => {
    const qFormatted = `R$ ${Number(qv || 0).toFixed(2)}`
    const messages: Partial<Record<ServiceStatus, string>> = {
      quoted:         `Olá *${request.customer_name}*! Seu orçamento para o *${request.phone_model}* está pronto: ${qFormatted}. Responda SIM para aceitar ou NÃO para recusar.`,
      accepted:       `Agradecemos pela preferência em nosso serviço! Por favor, compartilhe a sua localização fixa através do WhatsApp. Em breve recolheremos o aparelho celular para dar continuidade ao serviço. 📍`,
      rejected:       `Entendemos, *${request.customer_name}*. Se mudar de ideia, pode nos chamar aqui!`,
      retirada_local: `Deseja trazer ou retirar o aparelho em nosso endereço?\n📍 ${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood}, ${STORE_ADDRESS.city}\n${STORE_ADDRESS.mapsUrl}`,
      em_busca:       `🛵 Recebemos sua localização e estamos iniciando a busca do seu aparelho celular.`,
      in_progress:    `🔧 Seu aparelho celular está sendo reparado neste momento. Acompanhe qualquer atualização do serviço em tempo real através do link:\n${SITE_URL}/consultar?phone=${phoneDigits}`,
      em_entrega:     `📦 Em rota de entrega para devolução do aparelho.`,
    }
    return messages[s]
  }

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const updates = {
        status,
        quote_value: quoteValue ? parseFloat(quoteValue) : null,
        owner_notes: ownerNotes || null,
      }
      const { data, error: updateError } = await supabase
        .from('service_requests')
        .update(updates)
        .eq('id', request.id)
        .select()
        .single()
      if (updateError) throw updateError
      onUpdate(data as ServiceRequest)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      // Auto-open WhatsApp if status changed and has a message template
      if (status !== initialStatus) {
        const waMsg = buildWaMessage(status, quoteValue)
        if (waMsg) {
          const link = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(waMsg)}`
          window.open(link, '_blank')
        }
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

          {/* Ações do dono */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orçamento & Status</h3>

            <div>
              <label className="label">Status da solicitação</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceStatus)}
                className="input-field"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

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

            <div>
              <label className="label">Observações internas</label>
              <textarea
                value={ownerNotes}
                onChange={(e) => setOwnerNotes(e.target.value)}
                placeholder="Notas sobre o reparo, peças necessárias..."
                rows={3}
                className="input-field resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={loading}
              className={`btn-primary w-full flex items-center justify-center gap-2 transition-all
                ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              ) : saved ? (
                '✓ Salvo! Abrindo WhatsApp...'
              ) : (
                'Salvar e notificar cliente'
              )}
            </button>

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

          {/* Ordem de serviço */}
          {isServiceOrderStatus(status) && (
            <ServiceOrderPanel
              requestId={request.id}
              status={status}
              quoteValue={request.quote_value}
              customerPhone={request.customer_phone}
              phoneModel={request.phone_model}
            />
          )}

          <p className="text-xs text-gray-400 text-center pb-2">
            Solicitado em {new Date(request.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  )
}
