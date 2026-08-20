import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { confirmPayment } from '@/lib/pdv/service'
import { errorResponse } from '@/lib/pdv/http'

/**
 * POST /api/pdv/sales/[id]/payments/[paymentId]/confirm — lojista clicou
 * "confirmar recebimento" (cartão/dinheiro). Se cobrir o total, fecha a
 * venda (baixa de estoque + solicitação de serviço).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const { id, paymentId } = await params
    const sale = await confirmPayment(id, paymentId)
    return NextResponse.json(sale)
  } catch (e) {
    return errorResponse(e)
  }
}
