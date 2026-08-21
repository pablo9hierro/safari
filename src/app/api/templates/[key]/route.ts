import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { getTemplate, updateTemplate, setTemplateEnabled, TemplateError } from '@/lib/templates/store'

function errorResponse(e: unknown): NextResponse {
  if (e instanceof TemplateError) {
    const status =
      e.code === 'not_found' ? 404
      : e.code === 'not_editable' ? 403
      : e.code === 'missing_variables' ? 422
      : 400
    return NextResponse.json({ error: e.message, code: e.code }, { status })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

/** GET /api/templates/{key} */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { key } = await ctx.params
  const tpl = await getTemplate(key)
  if (!tpl) return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
  return NextResponse.json(tpl)
}

/**
 * PUT /api/templates/{key}
 * Salva o texto do template. Recusa (403) template não editável — a mesma
 * regra que o formulário já aplica, validada de novo aqui porque a proteção
 * não pode depender só do frontend. Recusa (422) quando falta variável
 * obrigatória no texto.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { key } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const updated = await updateTemplate(key, { content: String(body.content ?? '') })
    return NextResponse.json(updated)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * PATCH /api/templates/{key} — só o toggle ativo/inativo, separado do PUT
 * (que valida conteúdo/variáveis obrigatórias) porque desligar um disparo
 * não deveria exigir passar por essa validação.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { key } = await ctx.params
    const body = await req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) é obrigatório' }, { status: 400 })
    }
    await setTemplateEnabled(key, body.enabled)
    const updated = await getTemplate(key)
    return NextResponse.json(updated)
  } catch (e) {
    return errorResponse(e)
  }
}
