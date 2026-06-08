import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const supabase = makeClient()

  const { data, error } = await supabase.rpc('search_requests_by_phone', { phone_digits: digits })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { id, phone } = body ?? {}
  if (!id || !phone) return NextResponse.json({ error: 'id and phone required' }, { status: 400 })

  const digits = phone.replace(/\D/g, '')
  const supabase = makeClient()

  // Verifica se o telefone bate com a solicitação e status é cancelável
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

  const cancellable = ['pending', 'quoted']
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
