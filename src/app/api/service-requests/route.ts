import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'vrtech' } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const row = {
    customer_name:        body.customer_name,
    customer_phone:       body.customer_phone,
    customer_email:       body.customer_email,
    phone_model:          body.phone_model ?? null,
    problem_description:  body.problem_description,
    diagnosis_requested:  !!body.diagnosis_requested,
    selected_service_ids: Array.isArray(body.selected_service_ids) ? body.selected_service_ids : [],
    estimated_quote:      body.estimated_quote ?? null,
    image_url:            body.image_url ?? null,
    self_pickup:          !!body.self_pickup,
    address_lat:          body.address_lat ?? null,
    address_lng:          body.address_lng ?? null,
    address_label:        body.address_label ?? null,
    address_neighborhood: body.address_neighborhood ?? null,
    address_city:         body.address_city ?? null,
    address_state:        body.address_state ?? null,
    shipping_price:       body.shipping_price ?? null,
    status:               'pending',
    quote_value:          null,
    owner_notes:          null,
    source:               'storefront_form',
  }

  const supabase = makeClient()
  const { data: inserted, error } = await supabase
    .from('service_requests')
    .insert([row])
    .select()
    .single()

  if (error) {
    console.error('Erro ao inserir service_request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted })
}
