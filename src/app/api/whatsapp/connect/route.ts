import { NextResponse } from 'next/server'
import { connectInstance, logoutInstance } from '@/lib/whatsapp/evolutionClient'
import { setWhatsAppState } from '@/lib/whatsapp/state'

// Aciona a Evolution API para (re)iniciar a conexão e gerar um QR code novo.
// Chamado automaticamente pelo WhatsAppPanel quando o status não é "connected" —
// não exige nenhuma ação manual no Evolution Manager.
export async function POST() {
  try {
    // Limpa qualquer sessão travada/corrompida antes de tentar de novo — isso é
    // o que resolve o loop de reconexão sem precisar deslogar manualmente no Manager.
    try {
      await logoutInstance()
    } catch (e) {
      console.error('Logout antes de reconectar falhou (seguindo mesmo assim):', e)
    }

    const data = await connectInstance()
    console.log('Evolution API /instance/connect response:', JSON.stringify(data))

    // A resposta do /instance/connect costuma trazer o QR direto — grava já,
    // sem depender só do webhook (mais rápido pro painel mostrar o QR).
    let base64: string | null = data?.base64 ?? data?.qrcode?.base64 ?? null
    if (base64 && !base64.startsWith('data:')) base64 = `data:image/png;base64,${base64}`

    if (base64) {
      await setWhatsAppState('connecting', base64)
    }

    return NextResponse.json({ ok: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao conectar instância'
    console.error('Erro ao conectar WhatsApp:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
