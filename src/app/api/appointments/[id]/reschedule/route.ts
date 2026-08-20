import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { rescheduleAppointment } from '@/lib/agenda/service'
import { notifyReschedule } from '@/lib/agenda/notifications'
import { parseStoreDateTime } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * PATCH /api/appointments/{id}/reschedule
 * Justificativa >= 20 caracteres é exigida aqui no servidor — o contador do
 * formulário é só conveniência, a regra vale mesmo chamando a API direto.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    if (!body.data || !body.horario) {
      return NextResponse.json({ error: 'Informe a nova data e o novo horário.' }, { status: 400 })
    }
    // use_default_message ausente/true = comportamento de sempre (template).
    // false exige texto próprio — validado aqui também, não só no form, pra
    // uma chamada direta à API não conseguir mandar mensagem vazia ao cliente.
    const useDefaultMessage = body.use_default_message !== false
    const customMessage = body.custom_message ? String(body.custom_message).trim() : ''
    if (!useDefaultMessage && customMessage.length < 10) {
      return NextResponse.json(
        { error: 'Mensagem personalizada precisa ter pelo menos 10 caracteres.' },
        { status: 400 },
      )
    }

    const { appointment, previous } = await rescheduleAppointment(
      id,
      parseStoreDateTime(String(body.data), String(body.horario)),
      {
        actor_type: 'admin',
        actor_id: auth.actor.email ?? auth.actor.id,
        justification: body.justification ? String(body.justification) : undefined,
        duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : undefined,
      },
    )

    // A justificativa (ou a mensagem personalizada) vai literal pro cliente
    // — nunca passa pelo modelo.
    const notified = await notifyReschedule(
      appointment,
      previous.starts_at,
      String(body.justification),
      useDefaultMessage ? undefined : customMessage,
    )
    return NextResponse.json({ ...appointment, previous, notified })
  } catch (e) {
    return errorResponse(e)
  }
}
