import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { renderMessage } from '@/lib/templates/store'

const OWNER_PHONE = process.env.OWNER_PHONE || '5583920021373'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { orderId, total, customerName, customerWhatsapp, pickupAtStore, addressLabel } = body ?? {}
  if (!orderId || !customerName || !customerWhatsapp) {
    return NextResponse.json({ error: 'orderId/customerName/customerWhatsapp required' }, { status: 400 })
  }

  const ownerMessage = [
    '🛒 *Novo pedido da loja!*',
    '',
    `👤 *Cliente:* ${customerName}`,
    `📞 *WhatsApp:* ${customerWhatsapp}`,
    `💰 *Total:* ${currency(Number(total) || 0)}`,
    '',
    pickupAtStore
      ? '🏠 *Entrega:* cliente vai buscar no local'
      : `🚚 *Entrega:* ${addressLabel ?? 'endereço combinado no checkout'}`,
    '',
    `Pedido #${orderId}`,
  ].join('\n')

  const customerFallback = [
    `Olá, *${customerName}*! 👋`,
    '',
    'Recebemos seu pedido na loja da VR Tech!',
    'Em breve nossa equipe continua por aqui mesmo no WhatsApp para fechar os detalhes da compra. 🙏',
  ].join('\n')

  try {
    await sendWhatsAppText(OWNER_PHONE, ownerMessage)
    const customerMessage = await renderMessage(
      'store_order_pending',
      { nome: customerName, pedido: String(orderId).slice(0, 8), valor: currency(Number(total) || 0) },
      customerFallback,
    )
    await sendWhatsAppText(customerWhatsapp, customerMessage)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp'
    console.error('Erro WhatsApp notify-store-order:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
