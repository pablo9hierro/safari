import { NextResponse } from 'next/server'
import { buildAgendaOpenApi } from '@/lib/agenda/openapi'

/** Documento OpenAPI da agenda + tools da Assistente IA. */
export async function GET() {
  return NextResponse.json(buildAgendaOpenApi())
}
