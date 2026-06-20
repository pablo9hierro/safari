import { NextResponse } from 'next/server'
import {
  connectInstance,
  logoutInstance,
  deleteInstance,
  createInstance,
  setInstanceWebhook,
} from '@/lib/whatsapp/evolutionClient'
import { setWhatsAppState } from '@/lib/whatsapp/state'
import { SITE_URL } from '@/lib/constants'

const WEBHOOK_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A instância recém-criada às vezes ainda não está "visível" pro endpoint de
// connect por um instante (race condition entre criar e registrar) — tenta
// de novo algumas vezes em vez de desistir no primeiro 404.
async function connectWithRetry(maxAttempts = 5, delayMs = 1500) {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await connectInstance()
    } catch (e) {
      lastErr = e
      console.error(`Tentativa ${i + 1}/${maxAttempts} de connect falhou:`, e)
      await sleep(delayMs)
    }
  }
  throw lastErr
}

// Aciona a Evolution API para (re)iniciar a conexão e gerar um QR code novo.
// Chamado automaticamente pelo WhatsAppPanel quando o status não é "connected" —
// não exige nenhuma ação manual no Evolution Manager.
//
// Sessões com credenciais corrompidas ficam em loop infinito de reconexão
// (statusReason 401 repetido) sem nunca gerar QR — só dá pra resolver isso
// apagando a instância e recriando do zero, não com logout sozinho.
export async function POST() {
  try {
    try {
      await logoutInstance()
    } catch (e) {
      console.error('Logout falhou (seguindo mesmo assim):', e)
    }

    try {
      await deleteInstance()
    } catch (e) {
      console.error('Delete da instância falhou (seguindo mesmo assim):', e)
    }

    // Dá tempo da Evolution API processar o delete antes de criar de novo com o mesmo nome.
    await sleep(1000)

    const created = await createInstance()
    console.log('Evolution API /instance/create response:', JSON.stringify(created))

    try {
      const webhookUrl = `${SITE_URL}/api/whatsapp/webhook`
      const webhookResult = await setInstanceWebhook(webhookUrl, WEBHOOK_EVENTS)
      console.log('Evolution API /webhook/set response:', JSON.stringify(webhookResult))
    } catch (e) {
      console.error('Configurar webhook falhou (seguindo mesmo assim):', e)
    }

    // /instance/create já costuma devolver o QR direto; se não vier, pede explicitamente
    // (com retry — a instância pode levar um instante pra "aparecer" pro endpoint de connect).
    let data = created
    let base64: string | null = data?.qrcode?.base64 ?? data?.base64 ?? null

    if (!base64) {
      data = await connectWithRetry()
      console.log('Evolution API /instance/connect response:', JSON.stringify(data))
      base64 = data?.base64 ?? data?.qrcode?.base64 ?? null
    }

    if (base64 && !base64.startsWith('data:')) base64 = `data:image/png;base64,${base64}`
    if (base64) await setWhatsAppState('connecting', base64)

    return NextResponse.json({ ok: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao conectar instância'
    console.error('Erro ao conectar WhatsApp:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
