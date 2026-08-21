import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { envOr } from '@/lib/envGuard'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    envOr(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://zncpcsdpdkvjfknmmhpu.supabase.co'),
    envOr(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_EZvF3PaCyc6vLn63-_ardg_xj_TwiYG'),
    {
      db: { schema: 'vrtech' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
