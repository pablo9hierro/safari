import type { createClient } from '@/lib/supabase/client'
import type { StockActivityEventType } from '@/lib/types'

type SupabaseClient = ReturnType<typeof createClient>

/**
 * Grava um evento no feed de atividade de estoque (visto em
 * /dashboard/relatorios). Best-effort -- nunca deixa a ação principal
 * (salvar produto/item) falhar por causa do log.
 */
export async function logStockEvent(
  supabase: SupabaseClient,
  entityType: 'product' | 'stock_item',
  entityId: string,
  entityName: string,
  eventType: StockActivityEventType,
  detail?: Record<string, unknown>,
) {
  try {
    await supabase.from('stock_activity_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      event_type: eventType,
      detail: detail ?? null,
    })
  } catch {
    // best-effort
  }
}

/**
 * Compara quantidade anterior/nova contra o threshold e retorna o evento de
 * transição (se houver) -- só loga 'low_stock'/'out_of_stock' quando o item
 * CRUZA o limiar, não em todo update, pra não poluir o feed.
 */
export function stockTransitionEvent(
  prevQuantity: number,
  nextQuantity: number,
  threshold: number | null | undefined,
): StockActivityEventType | null {
  const wasOut = prevQuantity <= 0
  const isOut = nextQuantity <= 0
  if (isOut && !wasOut) return 'out_of_stock'

  if (threshold != null) {
    const wasLow = prevQuantity > 0 && prevQuantity <= threshold
    const isLow = nextQuantity > 0 && nextQuantity <= threshold
    if (isLow && !wasLow) return 'low_stock'
  }
  return null
}
