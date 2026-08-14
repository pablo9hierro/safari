import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { cancelAppointment, getAppointment } from '@/lib/agenda/service'
import { notifyCancellation } from '@/lib/agenda/notifications'
import { errorResponse } from '@/lib/agenda/http'

/**
 * POST /api/appointments/{id}/cancel
 * Cancelamento é transição de status, nunca DELETE — o histórico permanece.
 * Justificativa >= 20 caracteres validada no servidor.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    // Guarda os dados originais: depois do cancelamento o cliente precisa
    // saber qual horário foi desmarcado.
    const before = await getAppointment(id)
    if (!before) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
    }

    const appointment = await cancelAppointment(id, {
      actor_type: 'admin',
      actor_id: auth.actor.email ?? auth.actor.id,
      justification: body.justification ? String(body.justification) : undefined,
    })

    const notified = await notifyCancellation(before, String(body.justification))
    return NextResponse.json({ ...appointment, notified })
  } catch (e) {
    return errorResponse(e)
  }
}
