import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createAppointment, ensureServiceRequestForAppointment, listAppointments, resolveService } from '@/lib/agenda/service'
import { notifyAppointmentCreated } from '@/lib/agenda/notifications'
import { parseStoreDateTime } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/** GET /api/appointments — lista com filtros de data, serviço, cliente e status. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const rows = await listAppointments({
      date: sp.get('date') ?? undefined,
      service_id: sp.get('service_id') ?? undefined,
      customer: sp.get('customer') ?? undefined,
      phone: sp.get('phone') ?? undefined,
      status: sp.get('status') ?? undefined,
    })
    return NextResponse.json(rows)
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/appointments — cria agendamento pelo painel. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    if (!body.data || !body.horario) {
      return NextResponse.json({ error: 'Informe data e horário.' }, { status: 400 })
    }

    const customerName = String(body.customer_name ?? '')
    const customerPhone = String(body.customer_phone ?? '')
    const service = await resolveService(body.service_id ?? null, body.service_label ?? null)
    const serviceRequestId = await ensureServiceRequestForAppointment({
      customer_name: customerName,
      customer_phone: customerPhone,
      problem_description: body.notes ?? null,
      service_label: service.service_label,
      source: 'admin_manual',
    })

    const appointment = await createAppointment({
      service_id: body.service_id ?? null,
      service_label: body.service_label ?? null,
      customer_name: customerName,
      customer_phone: customerPhone,
      starts_at: parseStoreDateTime(String(body.data), String(body.horario)),
      duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : undefined,
      notes: body.notes ?? null,
      actor_type: 'admin',
      actor_id: auth.actor.email ?? auth.actor.id,
      service_request_id: serviceRequestId,
    })

    const notified = await notifyAppointmentCreated(appointment)
    return NextResponse.json({ ...appointment, notified }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
