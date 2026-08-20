'use client'

import { useEffect, useState } from 'react'
import type { AnchorHTMLAttributes } from 'react'

/**
 * resolutoo.com faz proxy reverso (Vercel rewrite) deste app sob
 * /loja/eletronica-loja e /loja/eletronica-admin — o Next.js router daqui
 * nunca sabe disso (usePathname() sempre devolve o caminho INTERNO, tipo
 * "/loja", não o que o navegador mostra). Um <Link href="/loja"> normal
 * some pro domínio errado quando visto via proxy (achado real: "Catálogo de
 * serviços"/"Início" escapavam pro resolutoo.com bare, que não tem essas
 * rotas). Só window.location (client-side) revela o prefixo real.
 */
const PROXY_MAP: Record<string, string> = {
  '/': '',
  '/loja': '/catalogo',
  '/catalogo-servico': '/servicos',
  '/consultar': '/consultar',
}

function resolveHref(prefix: string, href: string): string {
  if (!prefix) return href
  // separa path de querystring/hash (ex.: "/#orcamento", "/loja?x=1") sem
  // perdê-los na hora de remontar com o prefixo do proxy.
  const m = href.match(/^([^?#]*)([?#].*)?$/)
  const path = m?.[1] || href
  const rest = m?.[2] || ''
  if (path === '/') return `${prefix}${rest}`
  if (path in PROXY_MAP) return `${prefix}${PROXY_MAP[path]}${rest}`
  if (path.startsWith('/loja/')) return `${prefix}/catalogo${path.slice('/loja'.length)}${rest}`
  return href
}

function currentPrefix(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.startsWith('/loja/eletronica-loja') ? '/loja/eletronica-loja' : ''
}

const ADMIN_PREFIX = '/loja/eletronica-admin'

function currentAdminPrefix(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.startsWith(ADMIN_PREFIX) ? ADMIN_PREFIX : ''
}

/** Igual resolveHref, pra rotas do /dashboard (proxy passthrough 1:1 —
 * /loja/eletronica-admin/:path* -> vrtech /dashboard/:path*), mais o alias
 * dedicado de /login (não existe rewrite pra "/login" bare). */
function resolveAdminHref(prefix: string, href: string): string {
  if (!prefix) return href
  if (href === '/login') return '/loja/eletronica-admin-login'
  if (href === '/dashboard') return prefix
  if (href.startsWith('/dashboard/')) return `${prefix}${href.slice('/dashboard'.length)}`
  return href
}

/**
 * Mesma lógica do StoreLink, mas pro namespace admin
 * (/loja/eletronica-admin -> vrtech /dashboard). Achado real: o menu
 * lateral inteiro (DashboardSidebar) usava next/link com "/dashboard/..."
 * cru, então TODO clique escapava pro resolutoo.com/dashboard/... (rota
 * que não existe lá) e a tela ficava preta.
 */
export function AdminLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        const prefix = currentAdminPrefix()
        if (!prefix) return
        e.preventDefault()
        window.location.href = resolveAdminHref(prefix, href)
      }}
      {...rest}
    />
  )
}

/** Pra navegação programática (ex.: depois de logout) fora de um clique de <a>. */
export function adminAwareHref(href: string): string {
  return resolveAdminHref(currentAdminPrefix(), href)
}

const STORE_PREFIX = '/loja/eletronica-loja'

/**
 * Link de dentro do painel admin (/loja/eletronica-admin) apontando pra
 * uma rota da VITRINE pública (/loja/eletronica-loja) — namespace de proxy
 * diferente do admin, então nem StoreLink nem AdminLink servem sozinhos.
 * Usa o prefixo admin atual só pra confirmar que está mesmo sob proxy, e
 * remonta o destino sob o prefixo da vitrine.
 */
export function AdminToStoreLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (!currentAdminPrefix()) return
        e.preventDefault()
        const target = window.open(resolveHref(STORE_PREFIX, href), '_blank', 'noreferrer')
        void target
      }}
      {...rest}
    />
  )
}

/** Só pra exibição condicional (ex.: esconder algo fora do proxy) — nunca
 * usar o valor pra computar um href, que corre risco de ficar defasado
 * entre o mount e o clique. Ver StoreLink. */
export function useStoreProxyPrefix(): string {
  const [prefix, setPrefix] = useState('')
  useEffect(() => setPrefix(currentPrefix()), [])
  return prefix
}

/**
 * Link ciente do proxy — usar em vez de next/link pra qualquer rota interna
 * do app. Duas coisas de propósito, as duas confirmadas por teste real:
 * 1) Resolve o prefixo NO MOMENTO DO CLIQUE, não no render — calcular cedo
 *    via useEffect deixava uma janela de corrida com um clique rápido.
 * 2) window.location.href, NUNCA o router do Next — um path tipo
 *    /loja/eletronica-loja/servicos só existe pro REWRITE do projeto
 *    "ufersin" por fora; o router deste app não tem essa rota na própria
 *    tabela (só conhece "/", "/loja", "/catalogo-servico", "/consultar"),
 *    então router.push() nessa URL sempre falhava — precisa de navegação
 *    de página inteira, que passa pelo proxy de novo.
 */
export function StoreLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        const prefix = currentPrefix()
        if (!prefix) return
        e.preventDefault()
        window.location.href = resolveHref(prefix, href)
      }}
      {...rest}
    />
  )
}
