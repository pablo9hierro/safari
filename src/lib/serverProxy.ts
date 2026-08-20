import { headers } from 'next/headers'

/**
 * Versão server-side (Server Components) do que storeProxyLink.tsx faz
 * client-side: um redirect() feito aqui usa Location relativo, que o
 * NAVEGADOR resolve contra a origem que ele acha que está vendo
 * (resolutoo.com, sob o proxy) — "/dashboard/produtos" ou "/login" crus
 * escapam pro domínio errado (achado real: /catalogo, /estoque e o
 * redirect de sessão ausente em layout.tsx caíam nisso). Detecta o proxy
 * via x-forwarded-host (Vercel injeta isso nas rewrites externas;
 * confirmado via endpoint de debug — direto: x-forwarded-host === host;
 * via proxy: x-forwarded-host = "resolutoo.com", host = domínio real do
 * vrtech) e devolve o path certo pra cada caso.
 */
export async function adminRedirectTarget(internalPath: string): Promise<string> {
  const h = await headers()
  const forwardedHost = h.get('x-forwarded-host')
  const host = h.get('host')
  const proxied = Boolean(forwardedHost && forwardedHost !== host)
  if (!proxied) return internalPath

  if (internalPath === '/login') return '/loja/eletronica-admin-login'
  if (internalPath === '/dashboard') return '/loja/eletronica-admin'
  if (internalPath.startsWith('/dashboard/')) {
    return `/loja/eletronica-admin${internalPath.slice('/dashboard'.length)}`
  }
  return internalPath
}
