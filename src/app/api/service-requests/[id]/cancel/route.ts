import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deliverReliable } from '@/lib/queue/whatsappQueue'

/**
 * Cancelamento com justificativa obrigatória -- usado no balde "Solicitação
 * nova" (status pending), onde o lojista ainda não aceitou o atendimento.
 * Diferente do cancelamento simples de retirada_local/em_busca (sem texto),
 * aqui o motivo é mandado pro cliente por WhatsApp, não só guardado interno.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const reason = (body?.reason as string | undefined)?.trim()
  if (!reason) return NextResponse.json({ error: 'Justificativa obrigatória' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: updated, error } = await supabase
    .from('service_requests')
    .update({ status: 'cancelled', owner_notes: reason })
    .eq('id', id)
    .select()
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Solicitação não encontrada' }, { status: 404 })
  }

  const text = `Seu pedido de orçamento/serviço foi cancelado pela loja. Motivo: ${reason}`
  await deliverReliable(updated.customer_phone, text, {
    priority: 'normal',
    relatedType: 'request_cancelled_reason',
    relatedId: id,
  })

  return NextResponse.json({ data: updated })
}
