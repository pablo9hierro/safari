import { NextResponse } from 'next/server'
import { PdvError } from './types'

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof PdvError) {
    const status =
      e.code === 'not_found' ? 404
      : e.code === 'conflict' ? 409
      : e.code === 'insufficient_stock' ? 409
      : 400
    return NextResponse.json({ error: e.message, code: e.code }, { status })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}
