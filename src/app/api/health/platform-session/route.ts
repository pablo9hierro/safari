import { NextResponse } from 'next/server'

/**
 * Confirma que as credenciais da plataforma (usadas pelo middleware pra
 * renovar a sessão do dashboard) resolvem de verdade num deploy real --
 * detecta o cenário de build-cache stale (ver comentário em
 * src/middleware.ts) logo após o deploy, em vez de esperar um usuário
 * reclamar de sessão caindo.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY

  const missing: string[] = []
  if (!url?.startsWith('http')) missing.push('NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL')
  if (!key) missing.push('NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY')

  if (missing.length > 0) {
    return NextResponse.json({ ok: false, missing }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
