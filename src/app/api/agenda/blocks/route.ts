import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createBlock, listBlocks } from '@/lib/agenda/service'
import { parseStoreDateTime } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * GET /api/agenda/blocks?date=AAAA-MM-DD
 * Bloqueios do dia. A justificativa só aparece aqui, para o lojista — o
 * cliente, ao consultar a agenda, vê apenas que o horário está indisponível.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const date = req.nextUrl.searchParams.get('date')
    const from = date ? parseStoreDateTime(date, '00:00') : new Date()
    const to = new Date(from.getTime() + 86_400_000)
    return NextResponse.json(await listBlocks(from, to))
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/agenda/blocks — bloqueia um intervalo (indisponibiliza horário). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    if (!body.data || !body.hora_inicio || !body.hora_fim) {
      return NextResponse.json(
        { error: 'Informe a data e os horários de início e fim.' },
        { status: 400 },
      )
    }
    const block = await createBlock(
      parseStoreDateTime(String(body.data), String(body.hora_inicio)),
      parseStoreDateTime(String(body.data), String(body.hora_fim)),
      String(body.motivo ?? ''),
    )
    return NextResponse.json(block, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
