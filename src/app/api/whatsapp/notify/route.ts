import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient as makeClient } from '@/lib/supabase/service'
import { deliverReliable } from '@/lib/queue/whatsappQueue'
import { ownerNewRequestMessage, pendingCustomerMessage, STATUS_MESSAGES, OrderSummary } from '@/lib/whatsapp/messages'
import { ServiceRequest, ServiceStatus } from '@/lib/types'
import { renderMessage, isTemplateEnabled } from '@/lib/templates/store'
import type { TemplateVars } from '@/lib/templates/renderer'
import { buildTrackingLink } from '@/lib/tracking'

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

function requestVars(req: ServiceRequest, order: OrderSummary, link: string): TemplateVars {
  return {
    nome: req.customer_name,
    telefone: req.customer_phone,
    aparelho: req.phone_model,
    problema: req.problem_description,
    valor: `R$ ${Number(order?.final_value ?? req.quote_value ?? 0).toFixed(2).replace('.', ',')}`,
    endereco: [req.address_neighborhood, req.address_city].filter(Boolean).join(', '),
    link_acompanhamento: link,
    servicos: (order?.completed_services || '').split(',').map((s) => s.trim()).filter(Boolean).join(', '),
    garantia: order?.warranty ?? 'não informada',
    link_os: order?.pdf_url ?? link,
    tempo_estimado: req.busy_until
      ? `${Math.max(1, Math.round((new Date(req.busy_until).getTime() - Date.now()) / 60_000))} minutos`
      : '',
  }
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
      await deliverReliable(OWNER_PHONE, ownerNewRequestMessage(typedRequest), {
        priority: 'normal',
        relatedType: 'request_owner_notify',
        relatedId: requestId,
      })
      const createdLink = await buildTrackingLink(typedRequest.customer_phone)
      const text = await renderMessage(
        'request_pending',
        requestVars(typedRequest, null, createdLink),
        pendingCustomerMessage(typedRequest),
      )
      await deliverReliable(typedRequest.customer_phone, text, {
        priority: 'normal',
        relatedType: 'request_pending',
        relatedId: requestId,
      })
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
    // Diagnóstico enviado: precisa dos serviços identificados + valor real
    // pra falar isso explícito na mensagem (não só "confira o PDF") -- vem
    // de service_diagnostics, salvo por DiagnosticSection.tsx no mesmo
    // instante em que o status vira diagnostico_enviado.
    if (event === 'diagnostico_enviado') {
      const { data } = await supabase
        .from('service_diagnostics')
        .select('services_selected, pdf_url, quote_confirmed')
        .eq('service_request_id', requestId)
        .maybeSingle()
      if (data) {
        order = {
          completed_services: (data.services_selected ?? []).map((s: { repair_type: string }) => s.repair_type).join(', '),
          warranty: null,
          final_value: data.quote_confirmed,
          pdf_url: data.pdf_url,
        }
      }
    }

    const templateKey = STATUS_TEMPLATE_KEY[event as ServiceStatus]
    if (templateKey && !(await isTemplateEnabled(templateKey))) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })
    }
    const link = await buildTrackingLink(typedRequest.customer_phone)
    const fallback = fn(typedRequest, order, link)
    const text = templateKey
      ? await renderMessage(templateKey, requestVars(typedRequest, order, link), fallback)
      : fallback

    // em_pagamento/completed são o momento em que o cliente precisa saber
    // que já pode pagar / que o serviço terminou — mesma prioridade alta
    // do reagendamento, não pode atrasar por trás de mensagens comuns.
    const priority = event === 'em_pagamento' || event === 'completed' ? 'high' : 'normal'
    await deliverReliable(typedRequest.customer_phone, text, {
      priority,
      relatedType: `request_status_${event}`,
      relatedId: requestId,
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp'
    console.error('Erro WhatsApp notify:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
