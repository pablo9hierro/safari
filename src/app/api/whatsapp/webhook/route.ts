import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// qrCode === undefined -> preserva o QR já salvo (não sobrescreve).
// qrCode === null ou string -> atualiza explicitamente (limpa ou define um novo QR).
async function setState(status: 'connected' | 'connecting' | 'disconnected', qrCode?: string | null) {
  const supabase = makeClient()
  const row: Record<string, unknown> = { id: 1, status, updated_at: new Date().toISOString() }
  if (qrCode !== undefined) row.qr_code = qrCode
  await supabase.from('whatsapp_state').upsert(row, { onConflict: 'id' })
}

// Recebe os eventos de webhook configurados na instância da Evolution API
// (QRCODE_UPDATED e CONNECTION_UPDATE) e mantém a tabela whatsapp_state
// sincronizada para o painel do dashboard.
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

  if (event === 'connection.update' || event === 'connection_update') {
    const state = body?.data?.state ?? body?.data?.connection
    // 'open' e 'close' limpam o QR explicitamente (não é mais relevante).
    // 'connecting' NÃO passa qrCode — preserva o QR que o QRCODE_UPDATED já salvou.
    if (state === 'open') await setState('connected', null)
    else if (state === 'connecting') await setState('connecting')
    else if (state === 'close' || state === 'closed') await setState('disconnected', null)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: true })
}
