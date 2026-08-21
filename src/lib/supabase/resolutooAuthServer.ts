import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { platformSupabaseUrl, platformSupabaseAnonKey } from './platformCredentials'

// Versão server-side do resolutooAuthClient — usada no DashboardLayout pra
// checar sessão via cookie (SSR). Ver resolutooAuthClient.ts pro porquê.
export async function createResolutooAuthServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    platformSupabaseUrl(),
    platformSupabaseAnonKey(),
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
