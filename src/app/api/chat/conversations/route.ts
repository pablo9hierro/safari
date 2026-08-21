import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'

/** GET /api/chat/conversations — lista pro painel de /dashboard/chat, mais recente primeiro. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('id, phone, customer_name, status, human_override, started_at, last_message_at, closed_at')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
