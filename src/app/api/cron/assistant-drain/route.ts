import { NextRequest, NextResponse } from 'next/server'
import { drainAssistantQueue } from '@/lib/queue/assistantQueue'

/**
 * Drena a fila confiável de processamento do Assistente IA (ver
 * assistantQueue.ts). Mesmo padrão de autenticação de /api/cron/whatsapp-drain.
 * Não é a única forma de drenar -- toda entrega bem-sucedida já dispara um
 * piggyback drain de alguns jobs atrasados, já que o plano usado aqui só
 * permite cron diário na Vercel (não dá pra confiar só nisso pra retry
 * em minutos). Este endpoint serve pra forçar/agendar externamente também.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await drainAssistantQueue(20)
  return NextResponse.json(result)
}
