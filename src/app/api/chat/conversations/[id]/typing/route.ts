import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/chat/conversations/[id]/typing — heartbeat de "lojista está
 * digitando" (chamado com debounce pelo front enquanto ele escreve na caixa
 * de /chat). Enquanto essa janela estiver no futuro, a IA não responde essa
 * conversa (ver /api/assistant/message) -- mesma folga de tolerância usada
 * pra digitação do cliente no WhatsApp.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const typing = !!body.typing

  const supabase = createServiceClient()
  const { data: config } = await supabase
    .from('assistant_config')
    .select('message_batch_window_seconds')
    .eq('id', 'default')
    .single()
  const windowSeconds = (config?.message_batch_window_seconds as number | undefined) ?? 8

  await supabase
    .from('assistant_conversations')
    .update({ lojista_typing_until: typing ? new Date(Date.now() + windowSeconds * 1000).toISOString() : null })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
