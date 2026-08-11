import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

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
    status: 'disconnected',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  return NextResponse.json({ ok: true })
}
