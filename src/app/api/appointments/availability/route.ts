import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { checkAvailability, findAvailableSlots, getSettings } from '@/lib/agenda/service'
import { parseStoreDateTime } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * GET /api/appointments/availability?date=&time=&duration=
 * Com `time`: responde se aquele horário específico está livre (e por que não).
 * Sem `time`: lista as próximas vagas reais.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const settings = await getSettings()
    const duration = Number(sp.get('duration')) || settings.default_duration_minutes
    const date = sp.get('date')
    const time = sp.get('time')

    if (time) {
      if (!date) return NextResponse.json({ error: 'Informe a data.' }, { status: 400 })
      return NextResponse.json(await checkAvailability(parseStoreDateTime(date, time), duration))
    }

    const from = date ? parseStoreDateTime(date, '00:00') : new Date()
    const slots = await findAvailableSlots(from, duration, Number(sp.get('limit')) || 12)
    return NextResponse.json({
      slots: slots.map((s) => ({ starts_at: s.start.toISOString(), ends_at: s.end.toISOString() })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
