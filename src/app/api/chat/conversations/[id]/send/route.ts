import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'

/** POST /api/chat/conversations/[id]/send — lojista manda mensagem pro cliente direto do painel. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: conversation, error: convErr } = await supabase
    .from('assistant_conversations')
    .select('id, phone')
    .eq('id', id)
    .single()
  if (convErr || !conversation) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

  try {
    await sendWhatsAppText(conversation.phone, content)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao enviar pelo WhatsApp.' }, { status: 502 })
  }

  const { data: message, error: msgErr } = await supabase
    .from('assistant_messages')
    .insert({ conversation_id: id, direction: 'outbound', sender_type: 'humano', content })
    .select()
    .single()
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  await supabase
    .from('assistant_conversations')
    .update({ last_message_at: new Date().toISOString(), lojista_typing_until: null })
    .eq('id', id)

  return NextResponse.json(message)
}
