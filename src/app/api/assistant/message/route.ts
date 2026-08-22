/**
 * Handler HTTP de mensagens do Assistente IA -- usado pelo "Novo chat" de
 * teste (/dashboard/chat), que precisa da resposta síncrona com
 * conversation_id. O tráfego real de WhatsApp (webhook) não bate mais
 * aqui direto: passa pela fila confiável em assistantQueue.ts (ver
 * comentário lá pro porquê), que chama processAssistantMessage() em
 * processo em vez de um fetch HTTP pra esta rota.
 */
import { NextRequest, NextResponse } from 'next/server'
import { processAssistantMessage } from '@/lib/assistant/processMessage'

export async function POST(req: NextRequest) {
  const secret = process.env.ASSISTANT_WEBHOOK_SECRET
  if (secret && req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { phone, text, customerName, isTest } = await req.json().catch(() => ({}))

  try {
    const result = await processAssistantMessage({ phone, text, customerName, isTest })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[assistant/message] erro:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal error' }, { status: 500 })
  }
}
