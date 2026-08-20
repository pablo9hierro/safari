'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'

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

export function useStoreProxyPrefix(): string {
  const [prefix, setPrefix] = useState('')
  useEffect(() => {
    if (window.location.pathname.startsWith('/loja/eletronica-loja')) {
      setPrefix('/loja/eletronica-loja')
    }
  }, [])
  return prefix
}

/** Link ciente do proxy — usar em vez de next/link pra qualquer rota interna do app. */
export function StoreLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const prefix = useStoreProxyPrefix()
  const resolvedHref = typeof href === 'string' ? resolveHref(prefix, href) : href
  return <Link href={resolvedHref} {...rest} />
}
