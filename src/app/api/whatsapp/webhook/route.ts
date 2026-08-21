import { NextRequest, NextResponse } from 'next/server'
import { setWhatsAppState as setState } from '@/lib/whatsapp/state'
import { createServiceClient } from '@/lib/supabase/service'

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

      const text: string =
        msg?.message?.conversation ??
        msg?.message?.extendedTextMessage?.text ??
        msg?.message?.imageMessage?.caption ??
        ''
      if (!text.trim()) continue

      const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
      const pushName: string = msg?.pushName ?? ''

      // Fire-and-forget: não bloqueia a resposta do webhook
      const assistantUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/assistant/message`
        : `${req.nextUrl.origin}/api/assistant/message`

      fetch(assistantUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ASSISTANT_WEBHOOK_SECRET
            ? { 'x-internal-secret': process.env.ASSISTANT_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({ phone, text, customerName: pushName || null }),
      }).catch((e) => console.error('[webhook] forward to assistant failed:', e))
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: true })
}
