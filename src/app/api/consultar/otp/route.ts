import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deliverReliable } from '@/lib/queue/whatsappQueue'
import { fetchUnifiedByPhone, hasAnyAttendance } from '@/lib/consultar'
import { PUBLIC_CONSULTAR_URL } from '@/lib/constants'

/**
 * Duas coisas nesta rota, gatilhadas por `send`:
 * - `send` ausente/false: só confere se existe atendimento pra esse
 *   telefone (usado ao digitar o número em /consultar) -- NÃO gera nem
 *   manda código novo. O código já mandado na criação do pedido/agendamento
 *   (ver src/lib/tracking.ts) continua valendo até expirar; gerar um novo
 *   a cada vez que alguém digita o telefone spamava WhatsApp à toa.
 * - `send: true` (botão explícito "Gerar novo código"): gera um código
 *   novo (invalida o anterior, ver RPC) e manda por WhatsApp. Nunca
 *   retorna o código na resposta HTTP.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const phone = body?.phone as string | undefined
  const send = body?.send === true
  if (!phone) return NextResponse.json({ error: 'Telefone obrigatório' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const unified = await fetchUnifiedByPhone(digits)
  if (!hasAnyAttendance(unified)) {
    return NextResponse.json({ found: false })
  }

  if (!send) {
    return NextResponse.json({ found: true, sent: false })
  }

  const supabase = createServiceClient()
  const { data: code, error } = await supabase.rpc('generate_consultation_otp', { p_phone: digits })
  if (error || !code) {
    return NextResponse.json({ error: 'Não foi possível gerar o código agora' }, { status: 500 })
  }

  const link = PUBLIC_CONSULTAR_URL(digits, code as string)
  const text = `Seu código de acesso é *${code}*\n\nOu clique direto no link pra acompanhar seu atendimento:\n${link}`
  await deliverReliable(digits, text, {
    priority: 'normal',
    relatedType: 'consultation_otp',
    relatedId: digits,
  })

  return NextResponse.json({ found: true, sent: true })
}
