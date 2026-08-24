import { NextRequest, NextResponse } from 'next/server'
import { setWhatsAppState as setState } from '@/lib/whatsapp/state'
import { createServiceClient } from '@/lib/supabase/service'
import { deliverAssistantMessageReliable } from '@/lib/queue/assistantQueue'

// Recebe os eventos de webhook da Evolution API.
// Trata: QR code, status de conexão e mensagens de texto (encaminha pro assistente IA).
export async function POST(req: NextRequest) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const event = (body?.event ?? body?.Event ?? '').toString().toLowerCase()

  if (event === 'qrcode.updated' || event === 'qrcode_updated') {
    let base64 = body?.data?.qrcode?.base64 ?? body?.data?.base64 ?? null
    if (base64 && !base64.startsWith('data:')) base64 = `data:image/png;base64,${base64}`
    await setState('connecting', base64)
    return NextResponse.json({ ok: true })
  }

  // Cliente digitando/gravando áudio — alimenta a folga de "esperar parar
  // de digitar" antes da IA responder (ver /api/assistant/message).
  if (event === 'presence.update' || event === 'presence_update') {
    const remoteJid: string = body?.data?.id ?? body?.data?.remoteJid ?? ''
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
    const presences = body?.data?.presences ?? {}
    const state: string = presences?.[remoteJid]?.lastKnownPresence ?? body?.data?.presence ?? ''
    if (phone && (state === 'composing' || state === 'recording')) {
      const supabase = createServiceClient()
      const { data: config } = await supabase
        .from('assistant_config')
        .select('message_batch_window_seconds')
        .eq('id', 'default')
        .single()
      const windowSeconds = (config?.message_batch_window_seconds as number | undefined) ?? 8
      const until = new Date(Date.now() + windowSeconds * 1000).toISOString()
      await supabase
        .from('assistant_conversations')
        .update({ customer_typing_until: until })
        .eq('phone', phone)
        .eq('status', 'aberta')
    }
    return NextResponse.json({ ok: true })
  }

  if (event === 'connection.update' || event === 'connection_update') {
    const state = body?.data?.state ?? body?.data?.connection
    if (state === 'open') await setState('connected', null)
    else if (state === 'connecting') await setState('connecting')
    else if (state === 'close' || state === 'closed') await setState('disconnected', null)
    return NextResponse.json({ ok: true })
  }

  // Mensagens de texto recebidas — encaminha pro assistente IA (fire-and-forget)
  if (event === 'messages.upsert' || event === 'message' || event === 'messages_upsert') {
    const msgs = body?.data?.messages ?? (body?.data ? [body.data] : [])
    for (const msg of msgs) {
      // Ignora mensagens de grupos, saídas e sem texto
      const remoteJid: string = msg?.key?.remoteJid ?? msg?.remoteJid ?? ''
      if (remoteJid.endsWith('@g.us')) continue
      if (msg?.key?.fromMe) continue

      // Mensagem de localização (Baileys/Evolution API): sem texto nenhum,
      // vem em locationMessage com lat/lng reais -- converte pra um texto
      // estruturado que a IA sabe extrair (ver instrução em pipeline.ts),
      // em vez de um tipo de mensagem à parte que o pipeline não entende.
      const location = msg?.message?.locationMessage
      const text: string =
        msg?.message?.conversation ??
        msg?.message?.extendedTextMessage?.text ??
        msg?.message?.imageMessage?.caption ??
        (location?.degreesLatitude != null && location?.degreesLongitude != null
          ? `[localização recebida] latitude: ${location.degreesLatitude}, longitude: ${location.degreesLongitude}`
          : '')
      if (!text.trim()) continue

      const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
      const pushName: string = msg?.pushName ?? ''

      // Não bloqueia a resposta do webhook (fire-and-forget do ponto de
      // vista da Evolution API), mas agora passa pela fila confiável --
      // se o processamento direto falhar (timeout, erro transitório etc),
      // fica enfileirado no Redis pra um drain tentar de novo em vez de a
      // mensagem do cliente se perder pra sempre (ver assistantQueue.ts).
      deliverAssistantMessageReliable({ phone, text, customerName: pushName || null })
        .catch((e) => console.error('[webhook] entrega confiável ao assistente falhou:', e))
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: true })
}
