import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchUnifiedByPhone } from '@/lib/consultar'

/**
 * Valida telefone+código (RPC verify_consultation_otp, ver migration
 * 20260823000001_consultation_otp.sql) e, se válido, retorna os
 * atendimentos (serviço + pedido de produto) desse telefone -- mesmo
 * payload usado tanto pelo fluxo manual (digitar código) quanto pelo link
 * direto /consultar/{phone}/{otp}.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const phone = body?.phone as string | undefined
  const code = body?.code as string | undefined
  if (!phone || !code) return NextResponse.json({ error: 'Telefone e código obrigatórios' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: valid, error } = await supabase.rpc('verify_consultation_otp', {
    p_phone: digits,
    p_code: code,
  })
  if (error) return NextResponse.json({ error: 'Erro ao verificar código' }, { status: 500 })
  if (!valid) return NextResponse.json({ valid: false }, { status: 401 })

  const unified = await fetchUnifiedByPhone(digits)
  return NextResponse.json({ valid: true, ...unified })
}
