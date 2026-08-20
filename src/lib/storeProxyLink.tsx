'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  if (href === '/') return prefix
  const [path, rest] = [href.split('?')[0], href.includes('?') ? '?' + href.split('?')[1] : '']
  if (path in PROXY_MAP) return `${prefix}${PROXY_MAP[path]}${rest}`
  if (path.startsWith('/loja/')) return `${prefix}/catalogo${path.slice('/loja'.length)}${rest}`
  return href
}

function currentPrefix(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.startsWith('/loja/eletronica-loja') ? '/loja/eletronica-loja' : ''
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
 * do app. Resolve o prefixo NO MOMENTO DO CLIQUE (não no render): calcular
 * cedo via useEffect deixava uma janela de corrida entre o mount e um
 * clique rápido, onde o href ainda apontava pro path cru e escapava do
 * proxy pro domínio errado (achado real, via teste automatizado).
 */
export function StoreLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter()
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        e.preventDefault()
        router.push(resolveHref(currentPrefix(), href))
      }}
      {...rest}
    />
  )
}
