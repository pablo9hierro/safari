import { createServiceClient } from '@/lib/supabase/service'
import { runPipeline, MSG_SPLIT_MARKER } from '@/lib/assistant/pipeline'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import type { AssistantConfig, ConversationRow, MessageRow } from '@/lib/assistant/types'

export type AssistantMessageInput = {
  phone: string
  text: string
  customerName?: string | null
  isTest?: boolean
}

export type AssistantMessageResult = { ok: true; conversation_id?: string; skipped?: string; action?: string }

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().trim()
  return keywords.some((kw) => lower.includes(kw.toLowerCase().trim()))
}

/**
 * Núcleo do processamento de uma mensagem de cliente pelo Assistente IA --
 * extraído de /api/assistant/message pra ser chamado tanto pela rota HTTP
 * (usada pelo "Novo chat" de teste, que precisa da resposta síncrona com
 * conversation_id) quanto pela fila confiável (ver assistantQueue.ts), sem
 * duplicar a lógica de negócio nos dois lugares.
 */
export async function processAssistantMessage(input: AssistantMessageInput): Promise<AssistantMessageResult> {
  const { phone, text, customerName, isTest } = input
  if (!phone || !text) return { ok: true, skipped: 'no phone or text' }

  const supabase = createServiceClient()

  const { data: configRaw } = await supabase
    .from('assistant_config')
    .select('*')
    .eq('id', 'default')
    .single()
  const config = configRaw as AssistantConfig | null
  if (!config?.enabled) return { ok: true, skipped: 'assistant disabled' }

  const cleanPhone = normalizePhone(phone)

  if (matchesKeywords(text, config.end_keywords ?? [])) {
    await supabase
      .from('assistant_conversations')
      .update({ status: 'fechada', closed_at: new Date().toISOString() })
      .eq('phone', cleanPhone)
      .eq('status', 'aberta')
    return { ok: true, action: 'conversation_closed' }
  }

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
    if (!matchesKeywords(text, config.start_keywords ?? [])) {
      return { ok: true, skipped: 'no active conversation and no start keyword' }
    }
    const { data: newConv } = await supabase
      .from('assistant_conversations')
      .insert({ phone: cleanPhone, customer_name: customerName ?? null, status: 'aberta', is_test: !!isTest })
      .select()
      .single()
    conversation = newConv as ConversationRow
  }

  if (!conversation) throw new Error('failed to create conversation')

  if (conversation.human_override) {
    return { ok: true, skipped: 'human_override' }
  }

  const { data: insertedMsg } = await supabase
    .from('assistant_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      sender_type: 'cliente',
      content: text,
    })
    .select('id')
    .single()

  await supabase
    .from('assistant_conversations')
    .update({ last_message_at: new Date().toISOString(), customer_name: customerName ?? conversation.customer_name })
    .eq('id', conversation.id)

  // Agrupa mensagens em sequência do cliente numa resposta só (1 ou mais
  // mensagens recebidas : 1 resposta) -- NUNCA responde mensagem por
  // mensagem quando o cliente manda várias seguidas. Achado real: a versão
  // antiga só esperava enquanto `customer_typing_until` estivesse no
  // futuro (indicador de "digitando..." do WhatsApp) -- pra texto digitado
  // rápido e mandado em pedaços separados, esse indicador quase nunca
  // chega a tempo/dura o suficiente, então o código saía do loop na
  // primeira iteração e respondia cada mensagem isolada na hora. Agora
  // sempre espera `message_batch_window_seconds` de SILÊNCIO de verdade
  // (nenhuma mensagem nova) antes de processar, reiniciando a contagem
  // sempre que uma mensagem mais nova aparece -- e toda execução mais
  // antiga que descobre ter sido ultrapassada desiste (só a execução
  // disparada pela mensagem mais recente sobrevive até o silêncio e
  // processa TODO o histórico acumulado numa resposta só).
  const windowMs = (config.message_batch_window_seconds || 8) * 1000
  const hardCapMs = windowMs * 4
  const waitStarted = Date.now()
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const { data: conv } = await supabase
      .from('assistant_conversations')
      .select('human_override')
      .eq('id', conversation.id)
      .single()
    if (!conv || conv.human_override) {
      return { ok: true, skipped: 'human_override_during_wait' }
    }

    const { data: latest } = await supabase
      .from('assistant_messages')
      .select('id, created_at')
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latest && insertedMsg && latest.id !== insertedMsg.id) {
      return { ok: true, skipped: 'superseded_by_newer_message' }
    }

    const elapsedSinceLatest = latest ? Date.now() - new Date(latest.created_at).getTime() : windowMs
    if (elapsedSinceLatest >= windowMs) break
    if (Date.now() - waitStarted > hardCapMs) break
  }

  const { data: historyRows } = await supabase
    .from('assistant_messages')
    .select('sender_type, content, direction')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const history = ((historyRows ?? []) as MessageRow[])
    .reverse()
    .slice(0, -1)
    .map((m) => ({
      role: m.sender_type === 'cliente' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }))

  let reply: string
  try {
    const result = await runPipeline(config, history, text, cleanPhone, isTest)
    reply = result.reply
  } catch (e) {
    console.error('[assistant] pipeline error:', e)
    reply = 'Desculpe, estou com uma dificuldade técnica agora. Em breve alguém te atende!'
  }

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

  return { ok: true, conversation_id: conversation.id }
}
