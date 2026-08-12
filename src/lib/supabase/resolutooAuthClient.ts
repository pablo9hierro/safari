import { createBrowserClient } from '@supabase/ssr'

// Login único do Resolutoo — projeto Supabase da PLATAFORMA (Rodoletas),
// não o do vrtech. Usado SÓ pra auth (signInWithPassword/getSession) — o
// token daqui é o mesmo JWT que o ecommerce-api/ufersin-api validam
// (AuthSubscriber), então dá pra chamar as APIs autenticadas do Resolutoo
// (ex: Mercado Pago OAuth) direto com a session daqui. Nunca usar `.from()`
// nesse client — não tem o schema `vrtech`, é outro projeto.
export function createResolutooAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY!,
  )
}
