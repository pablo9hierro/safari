import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SELECT_COLS = 'id, created_at, phone_model, problem_description, address_cep, address_number, address_street, address_neighborhood, address_city, status, quote_value, owner_notes'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const supabase = makeClient()

  // Primary: RPC strips non-digits from stored phone before comparing
  const { data: rpcData, error: rpcError } = await supabase.rpc('search_requests_by_phone', { phone_digits: digits })

  if (!rpcError) {
    return NextResponse.json({ requests: rpcData ?? [] })
  }

  // Fallback (if schema_v3 wasn't run yet): split last 8 digits into two 4-char groups.
  // Both parts will appear as contiguous substrings in any formatted Brazilian number.
  // e.g. "83987516699" → last8="87516699" → "8751" and "6699"
  // "(83) 98751-6699" contains both "8751" and "6699" ✓
  const last8 = digits.slice(-8)
  const part1 = last8.slice(0, 4)
  const part2 = last8.slice(4)

  const { data, error } = await supabase
    .from('service_requests')
    .select(SELECT_COLS)
    .ilike('customer_phone', `%${part1}%`)
    .ilike('customer_phone', `%${part2}%`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: `rpc: ${rpcError.message} | fallback: ${error.message}` }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { id, phone } = body ?? {}
  if (!id || !phone) return NextResponse.json({ error: 'id and phone required' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  const supabase = makeClient()

  const { data: existing, error: fetchErr } = await supabase
    .from('service_requests')
    .select('id, status, customer_phone')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

  const storedDigits = existing.customer_phone.replace(/\D/g, '')
  if (!storedDigits.includes(digits) && !digits.includes(storedDigits)) {
    return NextResponse.json({ error: 'Telefone não confere' }, { status: 403 })
  }

  const cancellable = ['pending']
  if (!cancellable.includes(existing.status)) {
    return NextResponse.json({ error: 'Esta solicitação não pode mais ser cancelada' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('service_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
