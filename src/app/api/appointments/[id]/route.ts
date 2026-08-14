import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { getAppointment, getAppointmentEvents } from '@/lib/agenda/service'
import { errorResponse } from '@/lib/agenda/http'

/** GET /api/appointments/{id} — detalhe + histórico de alterações. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    const appointment = await getAppointment(id)
    if (!appointment) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
    }
    const events = await getAppointmentEvents(id)
    return NextResponse.json({ ...appointment, events })
  } catch (e) {
    return errorResponse(e)
  }
}
