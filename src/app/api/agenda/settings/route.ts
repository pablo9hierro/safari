import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/agenda/auth'
import { getSettings } from '@/lib/agenda/service'
import { errorResponse } from '@/lib/agenda/http'

/** GET /api/agenda/settings — configuração da agenda usada pela assistente. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json(await getSettings())
  } catch (e) {
    return errorResponse(e)
  }
}

/** PUT /api/agenda/settings — ajusta antecedência mínima, grade e duração padrão. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const num = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
    }
    const current = await getSettings()

    const payload = {
      appointment_ai_enabled: body.appointment_ai_enabled ?? current.appointment_ai_enabled,
      // Antecedência mínima: impede o cliente de marcar "pra agora". A
      // assistente já oferece a primeira vaga considerando essa folga.
      lead_time_minutes: num(body.lead_time_minutes, 0, 24 * 60, current.lead_time_minutes),
      slot_minutes: num(body.slot_minutes, 5, 240, current.slot_minutes),
      default_duration_minutes: num(
        body.default_duration_minutes, 5, 1440, current.default_duration_minutes,
      ),
      updated_at: new Date().toISOString(),
    }

    const db = createServiceClient()
    const { data, error } = await db
      .from('agenda_settings')
      .update(payload)
      .eq('id', 'default')
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return errorResponse(e)
  }
}
