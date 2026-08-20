import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { getBusinessHours, setBusinessHours, type BusinessHoursInput } from '@/lib/agenda/service'
import { errorResponse } from '@/lib/agenda/http'

/** GET /api/agenda/business-hours — todos os blocos de expediente (múltiplos por dia). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json(await getBusinessHours())
  } catch (e) {
    return errorResponse(e)
  }
}

/** PUT /api/agenda/business-hours — substitui o horário de funcionamento inteiro. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await req.json().catch(() => ({}))
    const blocks = Array.isArray(body.blocks) ? (body.blocks as BusinessHoursInput[]) : []
    return NextResponse.json(await setBusinessHours(blocks))
  } catch (e) {
    return errorResponse(e)
  }
}
