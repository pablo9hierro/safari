import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { completeAppointment } from '@/lib/agenda/service'
import { errorResponse } from '@/lib/agenda/http'

/**
 * POST /api/appointments/{id}/complete
 * Conclui o atendimento. Se terminou antes do previsto, o tempo restante
 * volta a ficar livre na agenda para outro cliente marcar.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    const { appointment, freed_minutes } = await completeAppointment(id, {
      actor_type: 'admin',
      actor_id: auth.actor.email ?? auth.actor.id,
    })
    return NextResponse.json({ ...appointment, freed_minutes })
  } catch (e) {
    return errorResponse(e)
  }
}
