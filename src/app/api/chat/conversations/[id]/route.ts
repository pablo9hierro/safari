import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'

/** GET /api/chat/conversations/[id] — conversa + histórico completo de mensagens. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const supabase = createServiceClient()
  const [{ data: conversation, error: convErr }, { data: messages, error: msgErr }] = await Promise.all([
    supabase.from('assistant_conversations').select('*').eq('id', id).single(),
    supabase
      .from('assistant_messages')
      .select('id, direction, sender_type, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true }),
  ])
  if (convErr || !conversation) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })
  return NextResponse.json({ conversation, messages: messages ?? [] })
}

/** PATCH /api/chat/conversations/[id] — liga/desliga human_override (assumir/devolver a conversa pra IA). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('assistant_conversations')
    .update({ human_override: !!body.human_override })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
