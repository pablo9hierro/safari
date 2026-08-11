import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Mesmo caminho ("/api/mercadopago/oauth/disconnect") e mesmo efeito do
// fluxo do lojista no Resolutoo (mercadopago_oauth.rs::oauth_disconnect):
// zera as credenciais e volta pro estado desconectado.
export async function POST() {
  const supabase = createServiceClient()
  await supabase.from('mercadopago_config').upsert({
    id: 'default',
    access_token: null,
    refresh_token: null,
    public_key: null,
    mp_user_id: null,
    expires_at: null,
    connected_at: null,
    connection_status: null,
    status: 'disconnected',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  return NextResponse.json({ ok: true })
}
