import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { ownerNewRequestMessage, pendingCustomerMessage, STATUS_MESSAGES, OrderSummary } from '@/lib/whatsapp/messages'
import { ServiceRequest, ServiceStatus } from '@/lib/types'

const OWNER_PHONE = process.env.OWNER_PHONE || '558883920021373'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { requestId, event } = body ?? {}
  if (!requestId || !event) {
    return NextResponse.json({ error: 'requestId and event required' }, { status: 400 })
  }

  const supabase = makeClient()
  const { data: request, error } = await supabase
    .from('service_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (error || !request) {
    return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
  }

  const typedRequest = request as ServiceRequest

  try {
    if (event === 'created') {
      await sendWhatsAppText(OWNER_PHONE, ownerNewRequestMessage(typedRequest))
      await sendWhatsAppText(typedRequest.customer_phone, pendingCustomerMessage(typedRequest))
      return NextResponse.json({ ok: true })
    }

    const fn = STATUS_MESSAGES[event as ServiceStatus]
    if (!fn) return NextResponse.json({ ok: true, skipped: true })

    let order: OrderSummary = null
    if (event === 'completed') {
      const { data } = await supabase
        .from('service_orders')
        .select('completed_services, warranty, final_value, pdf_url')
        .eq('request_id', requestId)
        .maybeSingle()
      order = data
    }

    await sendWhatsAppText(typedRequest.customer_phone, fn(typedRequest, order))
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp'
    console.error('Erro WhatsApp notify:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
