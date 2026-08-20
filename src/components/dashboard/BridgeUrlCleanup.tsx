'use client'

import { useEffect } from 'react'

/**
 * Depois do bridge de sessão (src/middleware.ts), a URL fica com
 * "?b=<access+refresh token em base64>" até a próxima navegação — o token
 * ficava exposto no histórico do navegador. replaceState não navega (só
 * reescreve a barra de endereços), então não precisa saber o prefixo de
 * proxy pra fazer isso com segurança (diferente de um redirect real).
 */
export default function BridgeUrlCleanup() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('b')) return
    url.searchParams.delete('b')
    window.history.replaceState(null, '', url.toString())
  }, [])
  return null
}
