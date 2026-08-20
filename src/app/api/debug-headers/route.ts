import { headers, cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const h = await headers()
  const c = await cookies()
  return NextResponse.json({
    host: h.get('host'),
    'x-forwarded-host': h.get('x-forwarded-host'),
    'x-forwarded-for': h.get('x-forwarded-for'),
    'x-vercel-...': [...h.entries()].filter(([k]) => k.startsWith('x-')),
    cookieNames: c.getAll().map((x) => x.name),
  })
}
