import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { ownerNewRequestMessage, pendingCustomerMessage, STATUS_MESSAGES, OrderSummary } from '@/lib/whatsapp/messages'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import { renderMessage } from '@/lib/templates/store'
import type { TemplateVars } from '@/lib/templates/renderer'

const OWNER_PHONE = process.env.OWNER_PHONE || '5583920021373'

/** status_* — mesma chave usada em vrtech.whatsapp_templates. */
const STATUS_TEMPLATE_KEY: Partial<Record<ServiceStatus, string>> = {
  aguardando_diagnostico: 'status_aguardando_diagnostico',
  diagnostico_enviado: 'status_diagnostico_enviado',
  accepted: 'status_accepted',
  rejected: 'status_rejected',
  retirada_local: 'status_retirada_local',
  em_busca: 'status_em_busca',
  in_progress: 'status_in_progress',
  em_entrega: 'status_em_entrega',
  completed: 'status_completed',
  cancelled: 'status_cancelled',
  delivered: 'status_delivered',
  finished: 'status_finished',
}

function requestVars(req: ServiceRequest, order: OrderSummary): TemplateVars {
  const digits = req.customer_phone.replace(/\D/g, '')
  return {
    nome: req.customer_name,
    telefone: req.customer_phone,
    aparelho: req.phone_model,
    problema: req.problem_description,
    valor: `R$ ${Number(order?.final_value ?? req.quote_value ?? 0).toFixed(2).replace('.', ',')}`,
    endereco: [req.address_neighborhood, req.address_city].filter(Boolean).join(', '),
    link_acompanhamento: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/consultar?phone=${digits}`,
    servicos: (order?.completed_services || '').split(',').map((s) => s.trim()).filter(Boolean).join(', '),
    garantia: order?.warranty ?? 'não informada',
    link_os: order?.pdf_url ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/consultar?phone=${digits}`,
  }
}

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'vrtech' } }
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
      // Aviso interno pro dono da loja não é mensagem ao cliente — fora do
      // escopo do Template Zap, segue como sempre foi.
      await sendWhatsAppText(OWNER_PHONE, ownerNewRequestMessage(typedRequest))
      const text = await renderMessage(
        'request_pending',
        requestVars(typedRequest, null),
        pendingCustomerMessage(typedRequest),
      )
      await sendWhatsAppText(typedRequest.customer_phone, text)
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

    const templateKey = STATUS_TEMPLATE_KEY[event as ServiceStatus]
    const fallback = fn(typedRequest, order)
    const text = templateKey
      ? await renderMessage(templateKey, requestVars(typedRequest, order), fallback)
      : fallback

    await sendWhatsAppText(typedRequest.customer_phone, text)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp'
    console.error('Erro WhatsApp notify:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
