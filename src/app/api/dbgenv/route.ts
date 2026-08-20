import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({
    url: process.env.EVOLUTION_API_URL,
    instance: process.env.EVOLUTION_INSTANCE,
  })
}
