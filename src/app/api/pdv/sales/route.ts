import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createSale, listOpenSales, type CreateSaleItemInput } from '@/lib/pdv/service'
import { errorResponse } from '@/lib/pdv/http'

/** GET /api/pdv/sales — vendas em aberto (carrinho ainda não fechado). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json(await listOpenSales())
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/pdv/sales — abre uma venda a partir do carrinho. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await req.json().catch(() => ({}))
    const items = Array.isArray(body.items) ? (body.items as CreateSaleItemInput[]) : []
    const sale = await createSale(items, body.notes ?? null)
    return NextResponse.json(sale, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
