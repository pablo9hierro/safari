import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logError } from '@/lib/logging/logError'
import { platformSupabaseUrl, platformSupabaseAnonKey } from '@/lib/supabase/platformCredentials'

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

  // Este middleware existe SÓ pra renovar a sessão da plataforma. Sem as
  // credenciais (build sem env inlinado, deploy de prebuilt antigo, etc),
  // `createServerClient` lança "Invalid supabaseUrl" e, por rodar no
  // matcher de TODAS as rotas, derrubava o site inteiro com
  // MIDDLEWARE_INVOCATION_FAILED -- inclusive a vitrine pública, que nem
  // usa sessão. O fallback abaixo cobre o caso comum (env var stale de
  // cache); o guard continua existindo como rede de segurança pro caso
  // extremo de o fallback também estar inválido -- degradar aqui é sempre
  // melhor que 500 global: quem depende de sessão cai no /login
  // normalmente, o resto do site continua de pé.
  const platformUrl = platformSupabaseUrl()
  const platformKey = platformSupabaseAnonKey()
  if (!platformUrl?.startsWith('http') || !platformKey) {
    const msg = '[middleware] NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL/ANON_KEY ausentes ou inválidas mesmo com fallback — pulando refresh de sessão desta request.'
    console.error(msg)
    logError('middleware', msg, { route: request.nextUrl.pathname })
    return response
  }

  const supabase = createServerClient(
    platformUrl,
    platformKey,
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
      if (at && rt) {
        const { data } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
        // Pedidos/Financeiro usam um SEGUNDO token (AdminUser JWT do
        // ecommerce-api, lido de localStorage — ver adminApi.ts), que só
        // era emitido no formulário de login COM SENHA. Quem entra pela
        // ponte nunca passa por ali, então essas duas páginas sempre
        // caíam de volta pro login (achado real, reportado ao vivo). O
        // ecommerce-api ganhou um endpoint interno pra emitir esse mesmo
        // token só com tenant+email, confiando que este middleware já
        // validou a sessão Supabase — resultado vai num cookie legível
        // por JS (não HttpOnly) pro client bootstrap em adminApi.ts pegar.
        const email = data.user?.email
        if (email) {
          try {
            const res = await fetch(`${process.env.ECOMMERCE_API_URL}/internal/mint-admin-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY! },
              body: JSON.stringify({ tenant_slug: process.env.ECOMMERCE_TENANT_SLUG ?? 'vrtech', admin_email: email }),
            })
            if (res.ok) {
              const { token } = await res.json()
              response.cookies.set('vrtech_admin_bridge', token, {
                maxAge: 60 * 60 * 24 * 7,
                sameSite: 'lax',
                secure: true,
              })
            }
          } catch {}
        }
      }
    } catch {}
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
  // Instabilidade de rede com o Supabase não pode virar 500 no site inteiro
  // (mesmo motivo do guard de env acima) — pior caso a sessão não renova
  // nesta request e o usuário revalida na próxima.
  try {
    await supabase.auth.getUser()
  } catch (e) {
    console.error('[middleware] refresh de sessão falhou (seguindo sem renovar):', e)
    logError('middleware', 'refresh de sessão falhou (seguindo sem renovar)', {
      route: request.nextUrl.pathname,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return response
}

export const config = {
  // /api/* de propósito fora do matcher: páginas como Agenda disparam
  // vários fetch() em paralelo pras próprias API routes ao carregar — cada
  // uma rodando o middleware batia o getUser()/refresh AO MESMO TEMPO.
  // Refresh token do Supabase é de uso único; requests concorrentes
  // corriam pra trocar o MESMO refresh token, um vencia e os outros
  // ficavam com token já usado — o Set-Cookie de uma resposta podia
  // sobrescrever o de outra com um valor inválido, derrubando a sessão
  // sem motivo (achado real: "sessão caindo toda hora" ao navegar em
  // páginas com múltiplas chamadas simultâneas). A navegação de PÁGINA já
  // passa por aqui e renova o cookie antes das chamadas de API acontecerem
  // — elas só precisam LER o cookie já válido, não disparar refresh de novo.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
