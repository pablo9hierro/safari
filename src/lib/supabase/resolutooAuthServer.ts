import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Versão server-side do resolutooAuthClient — usada no DashboardLayout pra
// checar sessão via cookie (SSR). Ver resolutooAuthClient.ts pro porquê.
export async function createResolutooAuthServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY!,
    {
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
