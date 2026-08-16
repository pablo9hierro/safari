import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * O login de /dashboard (DashboardLayout) é validado contra o projeto
 * Supabase da PLATAFORMA (Resolutoo — resolutooAuthServer.ts), não o do
 * vrtech: é essa sessão que precisa ser renovada aqui. Sem middleware, o
 * token expira (~1h) e nunca é renovado de volta pro browser — Server
 * Components não conseguem persistir cookie (só middleware/route handlers
 * conseguem) — e depois de um tempo logado o usuário é jogado pro /login
 * mesmo sem ter feito logout.
 *
 * As tabelas do PRÓPRIO projeto vrtech (stock_items, products, etc.), por
 * outro lado, nunca tiveram sessão nenhuma — o dashboard nunca fez login
 * contra esse projeto, só contra o da plataforma acima. Toda escrita
 * client-side nelas sempre rodou como role `anon`; ver migration
 * 20260816000001_fix_dashboard_rls_anon.sql pro fix disso (as policies
 * exigiam `authenticated`, que nunca existia, daí o 401 ao cadastrar item).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() (não getSession()) força a validação/refresh real do token.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
