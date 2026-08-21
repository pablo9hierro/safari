import { createClient } from '@supabase/supabase-js'
import { envOr } from '@/lib/envGuard'

export function createServiceClient() {
  return createClient(
    // A URL não é segredo (pública por design) -- dá pra ter fallback. A
    // service role key É segredo de verdade: nunca hardcodar em código-fonte,
    // então continua sem fallback -- se ela vier poluída, é melhor falhar
    // alto (erro de auth do Supabase) do que arriscar commitar a chave.
    envOr(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://zncpcsdpdkvjfknmmhpu.supabase.co'),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'vrtech' } }
  )
}
