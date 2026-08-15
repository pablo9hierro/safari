import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { STATUS_MESSAGES } from '@/lib/whatsapp/messages'
import { renderMessage } from '@/lib/templates/store'
import type { ServiceRequest, ServiceStatus as MessagesServiceStatus } from '@/lib/types'

const TEMPLATE_KEY: Partial<Record<string, string>> = {
  accepted: 'status_accepted',
  rejected: 'status_rejected',
}

function currency(v: number | null | undefined) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

/**
 * Avisa o cliente da aprovação/recusa do orçamento, pelo mesmo template
 * (Template Zap) e fallback já usados quando o LOJISTA faz essa mesma
 * transição no painel — nenhuma mensagem nova foi inventada, é o texto que
 * `status_accepted`/`status_rejected` já cobrem.
 */
export async function notifyQuoteDecision(
  requestId: string,
  status: 'accepted' | 'rejected',
): Promise<boolean> {
  const db = createServiceClient()
  const { data } = await db.from('service_requests').select('*').eq('id', requestId).single()
  if (!data) return false

  const req = data as ServiceRequest
  const fallbackFn = STATUS_MESSAGES[status as MessagesServiceStatus]
  const fallback = fallbackFn ? fallbackFn(req) : ''

  const text = await renderMessage(
    TEMPLATE_KEY[status]!,
    { nome: req.customer_name, aparelho: req.phone_model, valor: currency(req.quote_value) },
    fallback,
  )
  try {
    await sendWhatsAppText(req.customer_phone, text)
    return true
  } catch (e) {
    console.error('[serviceLifecycle] falha ao notificar decisão de orçamento:', e instanceof Error ? e.message : e)
    return false
  }
}
