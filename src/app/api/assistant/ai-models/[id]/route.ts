import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { updateModel, deleteModel } from '@/lib/assistant/modelConfigs'

/** PUT /api/assistant/ai-models/{id} — edita/reordena/habilita-desabilita. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (typeof body.model_id === 'string') patch.model_id = body.model_id
    if (typeof body.api_key === 'string') patch.api_key = body.api_key
    if (typeof body.label === 'string' || body.label === null) patch.label = body.label
    if (typeof body.priority === 'number') patch.priority = body.priority
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    const updated = await updateModel(id, patch)
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 400 })
  }
}

/** DELETE /api/assistant/ai-models/{id} — recusa remover o último modelo restante. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await ctx.params
    await deleteModel(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 400 })
  }
}
