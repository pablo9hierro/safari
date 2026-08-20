/**
 * Handler principal de mensagens do WhatsApp para o Assistente IA.
 * Chamado pelo /api/whatsapp/webhook quando chega uma mensagem de texto.
 *
 * Fluxo:
 * 1. Verifica config do assistente (enabled, keywords)
 * 2. Abre/reutiliza conversa ativa
 * 3. Salva mensagem inbound
 * 4. Roda pipeline de IA (layer1 → layer2 + tools)
 * 5. Salva resposta e envia via Evolution API
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runPipeline, MSG_SPLIT_MARKER } from '@/lib/assistant/pipeline'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import type { AssistantConfig, ConversationRow, MessageRow } from '@/lib/assistant/types'

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().trim()
  return keywords.some((kw) => lower.includes(kw.toLowerCase().trim()))
}

export async function POST(req: NextRequest) {
  // Protect with internal secret
  const secret = process.env.ASSISTANT_WEBHOOK_SECRET
  if (secret && req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { phone, text, customerName } = await req.json().catch(() => ({}))
  if (!phone || !text) return NextResponse.json({ ok: true, skipped: 'no phone or text' })

  const supabase = createServiceClient()

  // Load config
  const { data: configRaw } = await supabase
    .from('assistant_config')
    .select('*')
    .eq('id', 'default')
    .single()
  const config = configRaw as AssistantConfig | null
  if (!config?.enabled) return NextResponse.json({ ok: true, skipped: 'assistant disabled' })

  const cleanPhone = normalizePhone(phone)

  // Check for end keyword — close any open conversation
  if (matchesKeywords(text, config.end_keywords ?? [])) {
    await supabase
      .from('assistant_conversations')
      .update({ status: 'fechada', closed_at: new Date().toISOString() })
      .eq('phone', cleanPhone)
      .eq('status', 'aberta')
    return NextResponse.json({ ok: true, action: 'conversation_closed' })
  }

  // Find or create conversation
  const timeoutAgo = new Date(Date.now() - config.window_timeout_minutes * 60 * 1000).toISOString()
  const { data: existingConvs } = await supabase
    .from('assistant_conversations')
    .select('*')
    .eq('phone', cleanPhone)
    .eq('status', 'aberta')
    .gt('last_message_at', timeoutAgo)
    .order('started_at', { ascending: false })
    .limit(1)

  let conversation = existingConvs?.[0] as ConversationRow | undefined

  if (!conversation) {
    // Only start a new conversation if start keyword matches
    if (!matchesKeywords(text, config.start_keywords ?? [])) {
      return NextResponse.json({ ok: true, skipped: 'no active conversation and no start keyword' })
    }
    const { data: newConv } = await supabase
      .from('assistant_conversations')
      .insert({ phone: cleanPhone, customer_name: customerName ?? null, status: 'aberta' })
      .select()
      .single()
    conversation = newConv as ConversationRow
  }

  if (!conversation) return NextResponse.json({ error: 'failed to create conversation' }, { status: 500 })

  // Skip if human override
  if (conversation.human_override) {
    return NextResponse.json({ ok: true, skipped: 'human_override' })
  }

  // Save inbound message
  await supabase.from('assistant_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    sender_type: 'cliente',
    content: text,
  })

  // Update last_message_at
  await supabase
    .from('assistant_conversations')
    .update({ last_message_at: new Date().toISOString(), customer_name: customerName ?? conversation.customer_name })
    .eq('id', conversation.id)

  // Load recent history (last 20 messages for context)
  const { data: historyRows } = await supabase
    .from('assistant_messages')
    .select('sender_type, content, direction')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const history = ((historyRows ?? []) as MessageRow[])
    .reverse()
    .slice(0, -1) // exclude the message we just inserted
    .map((m) => ({
      role: m.sender_type === 'cliente' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }))

  // Run AI pipeline
  let reply: string
  try {
    const result = await runPipeline(config, history, text, cleanPhone)
    reply = result.reply
  } catch (e) {
    console.error('[assistant] pipeline error:', e)
    reply = 'Desculpe, estou com uma dificuldade técnica agora. Em breve alguém te atende!'
  }

  // Save outbound message(s) and send via WhatsApp
  const parts = reply.split(MSG_SPLIT_MARKER)
  for (const part of parts) {
    const content = part.trim()
    if (!content) continue
    await supabase.from('assistant_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      sender_type: 'assistente',
      content,
    })
    try {
      await sendWhatsAppText(phone, content)
    } catch (e) {
      console.error('[assistant] send whatsapp error:', e)
    }
  }

  return NextResponse.json({ ok: true, conversation_id: conversation.id })
}
