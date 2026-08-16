// Config da loja que vive na PLATAFORMA (/meu-plano), não no Supabase do
// vrtech — mesmo endpoint público usado por checkout.ts, mas sem 'use client'
// pra poder ser chamado de código server-side (ex: pipeline.ts da assistente).
const RESOLUTOO_API_URL = process.env.NEXT_PUBLIC_RESOLUTOO_API_URL ?? 'https://ufersin-api-production.up.railway.app'
const TENANT_SLUG = process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG ?? 'vrtech'

export async function fetchPaymentOnDeliveryEnabledServer(): Promise<boolean> {
  try {
    const res = await fetch(`${RESOLUTOO_API_URL}/api/public/tenant-config/${TENANT_SLUG}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.pagamento_produto_na_entrega
  } catch {
    return false
  }
}
