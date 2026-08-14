import { NextResponse } from 'next/server'
import { AgendaError } from './types'

/** Erros de domínio → status HTTP, num único lugar pra todas as rotas de agenda. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AgendaError) {
    const status =
      e.code === 'not_found' ? 404
      : e.code === 'conflict' ? 409
      : e.code === 'justification_too_short' ? 422
      : e.code === 'disabled' ? 403
      : 400
    return NextResponse.json({ error: e.message, code: e.code }, { status })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}
