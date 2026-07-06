import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { ownerNewStoreOrderMessage, pendingStoreOrderCustomerMessage } from '@/lib/whatsapp/messages'
import { StoreOrder } from '@/lib/types'

const OWNER_PHONE = process.env.OWNER_PHONE || '5583920021373'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'vrtech' } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { orderId } = body ?? {}
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 })
  }

  const supabase = makeClient()
  const { data: order, error } = await supabase
    .from('store_orders')
    .select('*, store_order_items(*)')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  try {
    const typedOrder = order as StoreOrder
    await sendWhatsAppText(OWNER_PHONE, ownerNewStoreOrderMessage(typedOrder))
    await sendWhatsAppText(typedOrder.customer_whatsapp, pendingStoreOrderCustomerMessage(typedOrder))
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp'
    console.error('Erro WhatsApp notify-store-order:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
