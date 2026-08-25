import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { STATUS_MESSAGES } from '@/lib/whatsapp/messages'
import { renderMessage, isTemplateEnabled } from '@/lib/templates/store'
import { buildTrackingLink, ensureTrackingLinkPresent } from '@/lib/tracking'
import type { ServiceRequest, ServiceStatus as MessagesServiceStatus } from '@/lib/types'

const TEMPLATE_KEY: Partial<Record<string, string>> = {
  accepted: 'status_accepted',
  rejected: 'status_rejected',
  cancelled: 'status_cancelled',
  // Aprovação de orçamento pós-diagnóstico vai direto pro reparo -- mesmo
  // template que o painel usa ao entrar em in_progress (confirmação com
  // tempo estimado), não mais "status_accepted" (aquele texto pede
  // localização pra coleta, que já aconteceu antes do diagnóstico agora).
  in_progress: 'status_in_progress',
}

function currency(v: number | null | undefined) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

/**
 * Avisa o cliente de uma transição de status (aprovação, recusa ou
 * cancelamento), pelo mesmo template (Template Zap) e fallback já usados
 * quando o LOJISTA faz essa mesma transição no painel — nenhuma mensagem
 * nova foi inventada, é o texto que `status_accepted`/`status_rejected`/
 * `status_cancelled` já cobrem.
 */
export async function notifyQuoteDecision(
  requestId: string,
  status: 'accepted' | 'rejected' | 'cancelled' | 'in_progress',
): Promise<boolean> {
  const db = createServiceClient()
  const { data } = await db.from('service_requests').select('*').eq('id', requestId).single()
  if (!data) return false

  const req = data as ServiceRequest
  const templateKey = TEMPLATE_KEY[status]!
  if (!(await isTemplateEnabled(templateKey))) return false
  // Link de acompanhamento -- faltava aqui por completo (achado real: essa
  // é a única das duas rotas de notificação de status que o assistente de
  // IA usa via aprovar_orcamento, então a aprovação feita pelo cliente
  // dentro da conversa nunca levava o link, mesmo quando o template citava).
  const link = await buildTrackingLink(req.customer_phone)
  const fallbackFn = STATUS_MESSAGES[status as MessagesServiceStatus]
  const fallback = fallbackFn ? fallbackFn(req, null, link) : ''

  // /tempo_estimado: minutos entre agora e busy_until (setado por
  // approveServiceQuote logo antes desta notificação).
  const tempoEstimado = req.busy_until
    ? `${Math.max(1, Math.round((new Date(req.busy_until).getTime() - Date.now()) / 60_000))} minutos`
    : ''

  const rendered = await renderMessage(
    templateKey,
    { nome: req.customer_name, aparelho: req.phone_model, valor: currency(req.quote_value), tempo_estimado: tempoEstimado, link_acompanhamento: link },
    fallback,
  )
  const text = ensureTrackingLinkPresent(rendered, link)
  try {
    await sendWhatsAppText(req.customer_phone, text)
    return true
  } catch (e) {
    console.error('[serviceLifecycle] falha ao notificar decisão de orçamento:', e instanceof Error ? e.message : e)
    return false
  }
}
