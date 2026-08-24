import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deliverReliable } from '@/lib/queue/whatsappQueue'
import { fetchUnifiedByPhone, hasAnyAttendance } from '@/lib/consultar'
import { PUBLIC_CONSULTAR_URL } from '@/lib/constants'

/**
 * Gera (ou reenvia) o código de acesso de 3 dígitos pro /consultar e manda
 * por WhatsApp junto do link já pronto. Nunca retorna o código na resposta
 * HTTP -- só confirma que foi enviado (ou avisa que não achou atendimento).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const phone = body?.phone as string | undefined
  if (!phone) return NextResponse.json({ error: 'Telefone obrigatório' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const unified = await fetchUnifiedByPhone(digits)
  if (!hasAnyAttendance(unified)) {
    return NextResponse.json({ found: false })
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

  return NextResponse.json({ found: true, ok: true })
}
