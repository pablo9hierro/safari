'use client'

// Pedidos/Financeiro reais — endpoints admin do ecommerce-api, autenticados
// com o AdminUser JWT (token "sombra" gravado no login, ver login/page.tsx).
// Nunca usar `.from()` do Supabase pra isso — o pedido real vive no banco
// do motor de e-commerce, não no schema vrtech.
const ECOMMERCE_API_URL = process.env.NEXT_PUBLIC_ECOMMERCE_API_URL ?? 'https://ecommerce-api-production-d447.up.railway.app'

export class AdminAuthError extends Error {}

async function adminFetch(path: string, init?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('vrtech_admin_token') : null
  if (!token) throw new AdminAuthError('Sessão de admin não encontrada — saia e entre de novo.')
  const res = await fetch(`${ECOMMERCE_API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new AdminAuthError('Sessão de admin expirada — saia e entre de novo.')
  if (!res.ok) throw new Error(`Erro ${res.status} ao consultar ${path}`)
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
