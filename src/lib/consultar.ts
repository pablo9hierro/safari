import { createServiceClient } from '@/lib/supabase/service'
import { envOr } from '@/lib/envGuard'

const ECOMMERCE_API_URL =
  envOr(process.env.NEXT_PUBLIC_ECOMMERCE_API_URL, 'https://ecommerce-api-production-d447.up.railway.app')
const TENANT_SLUG = envOr(process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG, 'vrtech')

const SERVICE_REQUEST_COLS =
  'id, created_at, phone_model, problem_description, address_cep, address_number, address_street, address_neighborhood, address_city, address_lat, address_lng, status, quote_value, owner_notes, self_pickup, customer_phone'

export type PublicOrderStatus = {
  id: string
  short_id: string
  status: string
  payment_status: string
  payment_method: string
  delivery_type: string
  total: number
  created_at: string
  updated_at: string
  customer_lat: number | null
  customer_lng: number | null
}

/** Solicitações de serviço (reparo) do telefone -- Supabase do próprio
 * vrtech. Mesma lógica RPC + fallback já usada em /api/consultar. Anexa o
 * horário do agendamento vivo (coleta ou aguardando aparelho) de cada uma,
 * pra /consultar mostrar o horário real em vez de um texto genérico. */
export async function fetchServiceRequestsByPhone(digits: string) {
  const supabase = createServiceClient()
  const { data: rpcData, error: rpcError } = await supabase.rpc('search_requests_by_phone', { phone_digits: digits })

  let rows: Array<{ id: string; [key: string]: unknown }>
  if (!rpcError) {
    rows = (rpcData ?? []) as typeof rows
  } else {
    const last8 = digits.slice(-8)
    const part1 = last8.slice(0, 4)
    const part2 = last8.slice(4)
    const { data } = await supabase
      .from('service_requests')
      .select(SERVICE_REQUEST_COLS)
      .ilike('customer_phone', `%${part1}%`)
      .ilike('customer_phone', `%${part2}%`)
      .order('created_at', { ascending: false })
    rows = (data ?? []) as typeof rows
  }

  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return rows

  const { data: appts } = await supabase
    .from('appointments')
    .select('service_request_id, starts_at')
    .in('service_request_id', ids)
    .eq('status', 'agendado')
  const startsById = new Map((appts ?? []).map((a) => [a.service_request_id as string, a.starts_at as string]))

  return rows.map((r) => ({ ...r, appointment_starts_at: startsById.get(r.id) ?? null }))
}

/** Pedidos de produto do telefone -- ecommerce-api (fonte real de
 * pedido/pagamento, ver decisão de arquitetura desta sessão). Timeout
 * curto + fallback vazio: instabilidade lá não pode derrubar a consulta
 * de serviço junto. */
export async function fetchProductOrdersByPhone(digits: string): Promise<PublicOrderStatus[]> {
  try {
    const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/orders-by-phone/${digits}`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export type ConsultarUnified = {
  services: Awaited<ReturnType<typeof fetchServiceRequestsByPhone>>
  orders: PublicOrderStatus[]
}

export async function fetchUnifiedByPhone(digits: string): Promise<ConsultarUnified> {
  const [services, orders] = await Promise.all([
    fetchServiceRequestsByPhone(digits),
    fetchProductOrdersByPhone(digits),
  ])
  return { services, orders }
}

export function hasAnyAttendance(u: ConsultarUnified): boolean {
  return u.services.length > 0 || u.orders.length > 0
}
