import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { cancelSale, getSale } from '@/lib/pdv/service'
import { errorResponse } from '@/lib/pdv/http'

/** GET /api/pdv/sales/[id] — detalhe da venda (itens + pagamentos). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    return NextResponse.json(await getSale(id))
  } catch (e) {
    return errorResponse(e)
  }
}

/** DELETE /api/pdv/sales/[id] — cancela a venda (só se ainda estiver aberta). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    await cancelSale(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
