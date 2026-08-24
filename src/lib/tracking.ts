import { createServiceClient } from '@/lib/supabase/service'
import { PUBLIC_CONSULTAR_URL } from '@/lib/constants'

/**
 * Gera o código de acesso (OTP de 3 dígitos, ver migration
 * 20260823000001_consultation_otp.sql) e monta o link de acompanhamento
 * pronto -- ponto único usado por todo emissor de "link pra acompanhar o
 * atendimento" (pipeline da IA, notificações de status). Se a geração
 * falhar por qualquer motivo, cai pro link sem OTP (fluxo manual antigo)
 * em vez de quebrar o envio da mensagem inteira.
 */
export async function buildTrackingLink(phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, '')
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('generate_consultation_otp', { p_phone: digits })
    if (error || !data) return PUBLIC_CONSULTAR_URL(digits)
    return PUBLIC_CONSULTAR_URL(digits, data as string)
  } catch {
    return PUBLIC_CONSULTAR_URL(digits)
  }
}
