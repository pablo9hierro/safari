'use client'

// Frete + pedido — client-side, chama direto o ecommerce-api público
// (endpoints sem segredo, mesma API que o checkout normal do Resolutoo usa).
const ECOMMERCE_API_URL =
  process.env.NEXT_PUBLIC_ECOMMERCE_API_URL ?? 'https://ecommerce-api-production-d447.up.railway.app'
const TENANT_SLUG = process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG ?? 'vrtech'

export type EstimateDeliveryResult = { km: number; price: number; within_range: boolean }

export async function estimateDelivery(lat: number, lng: number): Promise<EstimateDeliveryResult> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/estimate-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? 'Não foi possível calcular o frete.')
  }
  return res.json()
}

export type AssistantOrderItem = { product_id?: string; service_id?: string; quantity: number }

export type AssistantOrder = { id: string; total: number }

export async function createAssistantOrder(input: {
  customer_name: string
  customer_whatsapp: string
  items: AssistantOrderItem[]
  shipping_price?: number
}): Promise<AssistantOrder> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/assistant-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? 'Erro ao criar pedido.')
  }
  return res.json()
}
