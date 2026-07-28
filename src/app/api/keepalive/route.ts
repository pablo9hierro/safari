import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  await supabase.from('whatsapp_state').select('id').eq('id', 1)
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
