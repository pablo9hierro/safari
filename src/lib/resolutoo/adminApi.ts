'use client'

import { envOr } from '@/lib/envGuard'

// Pedidos/Financeiro reais — endpoints admin do ecommerce-api, autenticados
// com o AdminUser JWT (token "sombra" gravado no login, ver login/page.tsx).
// Nunca usar `.from()` do Supabase pra isso — o pedido real vive no banco
// do motor de e-commerce, não no schema vrtech.
const ECOMMERCE_API_URL = envOr(process.env.NEXT_PUBLIC_ECOMMERCE_API_URL, 'https://ecommerce-api-production-d447.up.railway.app')

export class AdminAuthError extends Error {}

/**
 * Quem entra via bridge de sessão (Painel da loja no hub) nunca passa pelo
 * form de /login, que é o único lugar que gravava `vrtech_admin_token` em
 * localStorage — Pedidos/Financeiro sempre caíam em "sessão expirada"
 * mesmo com o Supabase válido. O middleware agora deixa esse mesmo token
 * pronto num cookie legível (`vrtech_admin_bridge`, setado só na primeira
 * visita via ?b=); aqui só promove ele pra localStorage na primeira
 * chamada, mesmo lugar de sempre que o resto do código já lê.
 */
function resolveAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  const existing = localStorage.getItem('vrtech_admin_token')
  if (existing) return existing
  const match = document.cookie.match(/(?:^|;\s*)vrtech_admin_bridge=([^;]+)/)
  if (!match) return null
  const bridged = decodeURIComponent(match[1])
  localStorage.setItem('vrtech_admin_token', bridged)
  return bridged
}

async function adminFetch(path: string, init?: RequestInit) {
  const token = resolveAdminToken()
  if (!token) throw new AdminAuthError('Sessão de admin não encontrada — saia e entre de novo.')
  const res = await fetch(`${ECOMMERCE_API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new AdminAuthError('Sessão de admin expirada — saia e entre de novo.')
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? body?.error ?? `Erro ${res.status} ao consultar ${path}`)
  }
  return res.json()
}

export type OrderItem = {
  id: string
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
}

export type Order = {
  id: string
  customer_name: string
  customer_whatsapp: string
  delivery_type: string
  neighborhood: string | null
  address: string | null
  payment_method: string
  payment_status: string
  status: string
  shipping_price: number
  total: number
  discount_amount: number
  created_at: string
  /** Cliente escolheu pagar produto (+ entrega) no ato da entrega. */
  payment_on_delivery: boolean
  items: OrderItem[]
}

export function fetchOrders(status?: string): Promise<Order[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return adminFetch(`/api/admin/orders${qs}`)
}

export type StatusCount = { status: string; count: number }
export type TopProduct = { product_id: string; product_name: string; quantity: number; revenue: number }

export type FinanceiroSummary = {
  total_revenue: number
  total_orders: number
  orders_by_status: StatusCount[]
  top_products: TopProduct[]
  recent_orders: Order[]
  pdv_sales: Order[]
  pdv_total_sales: number
  pdv_total_count: number
}

export function fetchFinanceiro(): Promise<FinanceiroSummary> {
  return adminFetch('/api/admin/financeiro')
}

export type PdvPix = { payment_id: string; qr_code: string; qr_code_base64: string }

/** Gera a cobrança Pix do PDV usando o Mercado Pago já conectado pelo lojista. */
export function createPdvPix(input: {
  amount: number
  customer_name: string
  customer_email?: string | null
  external_reference: string
}): Promise<PdvPix> {
  return adminFetch('/api/admin/pdv/pix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function getPdvPixStatus(paymentId: string): Promise<{ status: string }> {
  return adminFetch(`/api/admin/pdv/pix/${paymentId}/status`)
}
