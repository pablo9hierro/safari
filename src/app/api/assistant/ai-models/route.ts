import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { listAllModels, createModel, type AiProvider } from '@/lib/assistant/modelConfigs'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await listAllModels())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  const provider: AiProvider = body.provider === 'openrouter' ? 'openrouter' : 'openai'
  try {
    const created = await createModel({
      provider,
      model_id: String(body.model_id ?? ''),
      api_key: String(body.api_key ?? ''),
      label: body.label ? String(body.label) : null,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 400 })
  }
}
