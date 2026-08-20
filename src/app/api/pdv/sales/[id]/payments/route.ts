import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { addPayment } from '@/lib/pdv/service'
import { errorResponse } from '@/lib/pdv/http'

/** POST /api/pdv/sales/[id]/payments — adiciona uma forma de pagamento (pendente até confirmar). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const payment = await addPayment(id, {
      method: body.method,
      amount: Number(body.amount),
      installments: body.installments ? Number(body.installments) : null,
      change_amount: body.change_amount != null ? Number(body.change_amount) : null,
    })
    return NextResponse.json(payment, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
