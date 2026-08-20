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

  // Bridge de sessão vindo do hub da plataforma (resolutoo.com/meu-plano):
  // o login do lojista lá é uma SPA Vite com sessão só em localStorage
  // (nunca cookie), então o cookie que este middleware normalmente valida
  // nunca existe quando o usuário chega aqui via proxy pela primeira vez —
  // o hub manda o access/refresh token na querystring (?b=) só nesse
  // primeiro request, setSession() grava o cookie de verdade, e a URL é
  // limpa antes de renderizar (o token não fica visível/persistido na
  // barra de endereço).
  const bridge = request.nextUrl.searchParams.get('b')
  if (bridge) {
    try {
      // Middleware roda no Edge runtime por padrão — sem `Buffer` global
      // (era um bug real: o try/catch engolia o ReferenceError e o bridge
      // nunca rodava). atob() é Web API padrão, existe nos dois runtimes.
      const b64 = bridge.replace(/-/g, '+').replace(/_/g, '/')
      const json = decodeURIComponent(
        atob(b64)
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      )
      const { at, rt } = JSON.parse(json)
      const hadTokens = Boolean(at && rt)
      let errMsg = 'skipped'
      if (hadTokens) {
        const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
        errMsg = error?.message ?? 'none'
      }
      response.headers.set('x-bridge-had-tokens', String(hadTokens))
      response.headers.set('x-bridge-error', errMsg)
      response.headers.set('x-bridge-cookies-set', String(response.cookies.getAll().length))
    } catch (e) {
      response.headers.set('x-bridge-catch', String(e))
    }
    // Sem redirect aqui de propósito: `request.nextUrl` reflete o HOST
    // interno do vrtech (o proxy reescreve o path antes de chegar aqui),
    // não a URL que o navegador vê em resolutoo.com — um redirect
    // construído a partir dele escaparia do proxy pro domínio errado.
    // Deixa a MESMA requisição seguir com o cookie recém-setado; o `?b=`
    // fica visível na barra só nesse primeiro load (token de curta duração,
    // aberto pelo próprio dono da loja numa aba nova).
    return response
  }

  // getUser() (não getSession()) força a validação/refresh real do token.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
