import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { envOr } from '@/lib/envGuard'

/**
 * "Novo chat" / mensagem de teste em /dashboard/chat: repassa pro MESMO
 * endpoint que o webhook real do WhatsApp usa (/api/assistant/message),
 * com o mesmo pipeline de IA (keyword gate, janela de espera, tools) --
 * só o telefone é sintético, então o envio de verdade via Evolution API
 * falha silenciosamente (já é best-effort lá), sem afetar o resto do
 * fluxo. Existe como proxy (não chamado direto do browser) porque
 * ASSISTANT_WEBHOOK_SECRET é uma env var server-only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { phone, text, customerName } = await req.json().catch(() => ({}))
  if (!phone || !text) return NextResponse.json({ error: 'phone e text obrigatórios' }, { status: 400 })

  const appUrl = envOr(process.env.NEXT_PUBLIC_APP_URL, req.nextUrl.origin)
  const res = await fetch(`${appUrl}/api/assistant/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.ASSISTANT_WEBHOOK_SECRET ? { 'x-internal-secret': process.env.ASSISTANT_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ phone, text, customerName, isTest: true }),
  })
  const json = await res.json().catch(() => ({}))
  return NextResponse.json(json, { status: res.status })
}
