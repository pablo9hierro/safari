import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { listTemplates } from '@/lib/templates/store'

/** GET /api/templates — todos os templates de WhatsApp da loja, por seção. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await listTemplates())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
