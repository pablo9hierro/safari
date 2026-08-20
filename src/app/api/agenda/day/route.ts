import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { getDayAvailability, getSettings } from '@/lib/agenda/service'
import { storeDateKey } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * GET /api/agenda/day?date=AAAA-MM-DD&duration=60
 * Grade do dia inteiro: começa 100% disponível e vai sendo ocupada conforme
 * atendimentos são marcados e horários são bloqueados. Como é rota do painel,
 * traz também os rótulos internos (cliente do atendimento, motivo do bloqueio).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const settings = await getSettings()
    const date = sp.get('date') ?? storeDateKey(new Date())
    const duration = Number(sp.get('duration')) || settings.default_duration_minutes

    const slots = await getDayAvailability(date, duration, undefined, { includePrivate: true })
    return NextResponse.json({
      date,
      duration_minutes: duration,
      lead_time_minutes: settings.lead_time_minutes,
      buffer_minutes: settings.buffer_minutes,
      slots,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
