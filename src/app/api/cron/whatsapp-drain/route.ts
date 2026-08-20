import { NextRequest, NextResponse } from 'next/server'
import { drainWhatsAppQueue } from '@/lib/queue/whatsappQueue'

/**
 * Drena a fila confiável de WhatsApp (ver whatsappQueue.ts) — chamado pelo
 * Vercel Cron a cada minuto. Vercel assina o request com
 * `Authorization: Bearer $CRON_SECRET` automaticamente quando o cron é
 * configurado via vercel.json; verificamos isso pra ninguém mais conseguir
 * disparar reenvios em massa batendo neste endpoint.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await drainWhatsAppQueue(20)
  return NextResponse.json(result)
}
