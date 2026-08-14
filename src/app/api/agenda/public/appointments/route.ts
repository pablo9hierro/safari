import { NextRequest, NextResponse } from 'next/server'
import { createAppointment } from '@/lib/agenda/service'
import { bookingWindowDays, parseStoreDateTime } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * POST /api/agenda/public/appointments
 *
 * Agendamento feito pelo cliente no checkout da vitrine. Todo serviço exige
 * agendamento — é aqui que o horário escolhido no carrinho vira reserva.
 *
 * Pública (a vitrine não tem login), mas sem margem para abuso: o backend
 * revalida disponibilidade, antecedência mínima e janela (hoje/amanhã), e a
 * constraint do banco impede dois atendimentos no mesmo horário.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { data, horario, customer_name, customer_whatsapp } = body

    if (!data || !horario) {
      return NextResponse.json({ error: 'Escolha o dia e o horário do atendimento.' }, { status: 400 })
    }
    if (!customer_name?.trim() || !customer_whatsapp?.trim()) {
      return NextResponse.json({ error: 'Informe nome e WhatsApp.' }, { status: 400 })
    }
    if (!bookingWindowDays().some((d) => d.key === String(data))) {
      return NextResponse.json(
        { error: 'A loja agenda apenas para hoje ou amanhã.' },
        { status: 400 },
      )
    }

    const appointment = await createAppointment({
      service_id: body.service_id ?? null,
      service_label: body.service_label ?? null,
      customer_name: String(customer_name),
      customer_phone: String(customer_whatsapp),
      starts_at: parseStoreDateTime(String(data), String(horario)),
      // Liga a reserva ao pedido, para o lojista saber de onde veio.
      notes: body.order_id ? `Pedido ${String(body.order_id).slice(0, 8)}` : null,
      actor_type: 'cliente',
    })

    return NextResponse.json(appointment, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
