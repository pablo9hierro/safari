import { NextResponse } from 'next/server'
import { createResolutooAuthServerClient } from '@/lib/supabase/resolutooAuthServer'

export type AdminActor = { id: string; email: string | null }

/**
 * Exige sessão de lojista (mesma do /dashboard) nas rotas de agenda.
 * Diferente das rotas de leitura já existentes, estas criam/cancelam
 * atendimento e disparam WhatsApp pro cliente — não podem ficar abertas.
 */
export async function requireAdmin(): Promise<
  { ok: true; actor: AdminActor } | { ok: false; response: NextResponse }
> {
  try {
    const supabase = await createResolutooAuthServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
      }
    }
    return { ok: true, actor: { id: user.id, email: user.email ?? null } }
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Falha ao validar sessão: ${e instanceof Error ? e.message : String(e)}` },
        { status: 401 },
      ),
    }
  }
}
