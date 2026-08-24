import { createServiceClient as makeClient } from '@/lib/supabase/service'

// qrCode === undefined -> preserva o QR já salvo (não sobrescreve).
// qrCode === null ou string -> atualiza explicitamente (limpa ou define um novo QR).
export async function setWhatsAppState(status: 'connected' | 'connecting' | 'disconnected', qrCode?: string | null) {
  const supabase = makeClient()
  const row: Record<string, unknown> = { id: 1, status, updated_at: new Date().toISOString() }
  if (qrCode !== undefined) row.qr_code = qrCode
  await supabase.from('whatsapp_state').upsert(row, { onConflict: 'id' })
}
