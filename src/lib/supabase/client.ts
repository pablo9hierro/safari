import { createBrowserClient } from '@supabase/ssr'
import { envOr } from '@/lib/envGuard'

export function createClient() {
  return createBrowserClient(
    envOr(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://zncpcsdpdkvjfknmmhpu.supabase.co'),
    envOr(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_EZvF3PaCyc6vLn63-_ardg_xj_TwiYG'),
    { db: { schema: 'vrtech' } }
  )
}
