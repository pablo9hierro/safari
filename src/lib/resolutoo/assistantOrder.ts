import { envOr } from '@/lib/envGuard'

// Versão server-safe de createAssistantOrder/create-pix-payment (checkout.ts
// é 'use client', usado pelo carrinho da vitrine) -- chamadas pela tool
// criar_pedido_e_gerar_cobranca do assistente, que roda em rota de API,
// nunca no browser. Mesma API que o carrinho da vitrine usa (fonte real de
// catálogo/pedido/pagamento -- ver decisão de arquitetura: buscar_produtos
// e este módulo usam o ecommerce-api, não o Supabase do vrtech, porque é lá
// que o pedido fica visível pro lojista e o Pix é gerado de verdade).
const ECOMMERCE_API_URL =
  envOr(process.env.NEXT_PUBLIC_ECOMMERCE_API_URL, 'https://ecommerce-api-production-d447.up.railway.app')
const TENANT_SLUG = envOr(process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG, 'vrtech')

export type OrderDto = {
  id: string
  customer_name: string
  customer_whatsapp: string
  payment_method: string
  payment_status: string
  status: string
  shipping_price: number
  total: number
  pix_payment_id: string | null
  pix_qr_base64: string | null
  pix_copia_cola: string | null
  pix_provider: string | null
}

export async function createAssistantOrderServer(input: {
  customer_name: string
  customer_whatsapp: string
  items: { product_id: string; quantity: number }[]
  shipping_price?: number
}): Promise<OrderDto> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/assistant-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      customer_name: input.customer_name,
      customer_whatsapp: input.customer_whatsapp,
      items: input.items,
      payment_method: 'pix',
      shipping_price: input.shipping_price && input.shipping_price > 0 ? input.shipping_price : undefined,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `Erro ao criar pedido (${res.status}).`)
  }
  return res.json()
}

export type EstimateDeliveryResult = { km: number; price: number; within_range: boolean }

export async function estimateDeliveryServer(lat: number, lng: number): Promise<EstimateDeliveryResult> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/estimate-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ lat, lng }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? 'Não foi possível calcular o valor da entrega.')
  }
  return res.json()
}

/** Cancela um pedido pendente -- usado quando um novo pedido precisa
 * substituir um anterior ainda não pago (dado do cliente mudou e o
 * checkout foi refeito), pra nunca deixar 2 pedidos pendentes duplicados
 * pro mesmo atendimento. Mesmo modelo de confiança do /consultar: o
 * whatsapp do pedido precisa bater. Bloqueado se já saiu pra entrega
 * (nesse ponto não é mais "pendente" de qualquer forma). */
export async function cancelOrderServer(orderId: string, whatsapp: string): Promise<void> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ whatsapp }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `Erro ao cancelar pedido anterior (${res.status}).`)
  }
}

export async function createPixPaymentServer(orderId: string): Promise<OrderDto> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/orders/${orderId}/create-pix-payment`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `Erro ao gerar cobrança Pix (${res.status}).`)
  }
  return res.json()
}
