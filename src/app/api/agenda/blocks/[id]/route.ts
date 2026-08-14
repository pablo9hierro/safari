import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { deleteBlock } from '@/lib/agenda/service'
import { errorResponse } from '@/lib/agenda/http'

/** DELETE /api/agenda/blocks/{id} — libera de volta um horário bloqueado. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    await deleteBlock(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
