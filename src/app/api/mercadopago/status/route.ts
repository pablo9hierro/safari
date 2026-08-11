import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('mercadopago_config')
    .select('status, connected_at, mp_user_id, public_key, connection_status')
    .eq('id', 'default')
    .single()

  if (error || !data) return NextResponse.json({ status: 'disconnected' })
  return NextResponse.json(data)
}
