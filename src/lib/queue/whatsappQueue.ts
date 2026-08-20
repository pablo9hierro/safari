import { randomUUID } from 'crypto'
import { getRedis } from './redis'
import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'

/**
 * Fila confiável de envio WhatsApp, backed por Redis (sorted set).
 *
 * Por que existe: sendWhatsAppText() é um fetch único, sem retry — se a
 * Evolution API der timeout ou estiver momentaneamente fora do ar, a
 * mensagem se perdia silenciosamente (só um console.error). Isso é
 * inaceitável pra mensagens transacionais (reagendamento, cancelamento,
 * mudança de status) que o cliente PRECISA receber.
 *
 * Como funciona: `deliverReliable` tenta o envio direto primeiro (path
 * feliz, latência mínima — a UI não fica esperando fila). Se falhar (ou
 * pra chamadas que já sabem que precisam de garantia), o job vai pro
 * sorted set `wa:queue`, com score = prioridade (maior primeiro) composta
 * com o timestamp de tentativa (FIFO dentro da mesma prioridade). Um cron
 * da Vercel (/api/cron/whatsapp-drain, a cada minuto) drena a fila,
 * tentando reenviar com backoff exponencial até um limite de tentativas —
 * depois disso, vai pro dead-letter `wa:dead` pra investigação manual.
 *
 * Prioridade: reagendamento/cancelamento = 10 (o cliente pode aparecer no
 * endereço/horário errado se não for avisado a tempo); confirmações/status
 * comuns = 5.
 */

const QUEUE_KEY = 'wa:queue'
const DEAD_KEY = 'wa:dead'
const JOB_PREFIX = 'wa:job:'
const MAX_ATTEMPTS = 8
const JOB_TTL_SECONDS = 60 * 60 * 24 * 3 // 3 dias — tempo o bastante pra qualquer instabilidade real da Evolution API se resolver

export type QueuePriority = 'high' | 'normal'

export interface WhatsAppJob {
  id: string
  phone: string
  content: string
  attempts: number
  priority: QueuePriority
  relatedType?: string
  relatedId?: string
  createdAt: number
  lastError?: string
}

function priorityValue(p: QueuePriority): number {
  return p === 'high' ? 10 : 5
}

/** Score do sorted set: prioridade domina, timestamp desempata (FIFO). Score
 * MENOR sai primeiro do ZPOPMIN, então prioridade alta precisa de score menor. */
function score(priority: QueuePriority, readyAt: number): number {
  return (10 - priorityValue(priority)) * 1e13 + readyAt
}

export async function enqueueWhatsApp(
  phone: string,
  content: string,
  opts: { priority?: QueuePriority; relatedType?: string; relatedId?: string } = {},
): Promise<string> {
  const redis = getRedis()
  const job: WhatsAppJob = {
    id: randomUUID(),
    phone,
    content,
    attempts: 0,
    priority: opts.priority ?? 'normal',
    relatedType: opts.relatedType,
    relatedId: opts.relatedId,
    createdAt: Date.now(),
  }
  await redis
    .multi()
    .set(JOB_PREFIX + job.id, JSON.stringify(job), 'EX', JOB_TTL_SECONDS)
    .zadd(QUEUE_KEY, score(job.priority, job.createdAt), job.id)
    .exec()
  return job.id
}

/**
 * Tenta envio direto; se falhar, enfileira pra garantir entrega eventual
 * via drain. Retorna true só quando o envio foi confirmado NA HORA — um
 * job enfileirado não é "sucesso" pro chamador, é "vai tentar de novo".
 */
export async function deliverReliable(
  phone: string,
  content: string,
  opts: { priority?: QueuePriority; relatedType?: string; relatedId?: string } = {},
): Promise<boolean> {
  try {
    await sendWhatsAppText(phone, content)
    return true
  } catch (e) {
    console.error('[wa-queue] envio direto falhou, enfileirando:', e instanceof Error ? e.message : e)
    try {
      await enqueueWhatsApp(phone, content, opts)
    } catch (queueErr) {
      console.error('[wa-queue] falha CRÍTICA ao enfileirar (mensagem perdida):', queueErr)
    }
    return false
  }
}

function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, 30 * 60_000) // 1min, 2min, 4min... até 30min
}

/** Chamado pelo cron. Drena até `limit` jobs prontos, tentando reenviar. */
export async function drainWhatsAppQueue(limit = 20): Promise<{ sent: number; requeued: number; dead: number }> {
  const redis = getRedis()
  const now = Date.now()
  // Duas faixas (alta e normal), não uma faixa só: cada prioridade tem seu
  // próprio "andar" de score (offset * 1e13), então o teto de prontidão
  // (readyAt <= now) precisa ser calculado por prioridade — um teto único
  // incluiria jobs de alta prioridade com retry agendado pro futuro antes
  // da hora, já que o offset deles é 0 e qualquer timestamp real é menor
  // que o teto da prioridade normal.
  const highIds = await redis.zrangebyscore(QUEUE_KEY, 0, score('high', now), 'LIMIT', 0, limit)
  const remaining = limit - highIds.length
  const normalIds = remaining > 0
    ? await redis.zrangebyscore(QUEUE_KEY, score('high', now) + 1, score('normal', now), 'LIMIT', 0, remaining)
    : []
  const ids = [...highIds, ...normalIds]

  let sent = 0
  let requeued = 0
  let dead = 0

  for (const id of ids) {
    const raw = await redis.get(JOB_PREFIX + id)
    await redis.zrem(QUEUE_KEY, id)
    if (!raw) continue // job expirou (TTL) ou já foi processado por outra execução concorrente

    const job: WhatsAppJob = JSON.parse(raw)
    try {
      await sendWhatsAppText(job.phone, job.content)
      await redis.del(JOB_PREFIX + id)
      sent++
    } catch (e) {
      job.attempts++
      job.lastError = e instanceof Error ? e.message : String(e)
      if (job.attempts >= MAX_ATTEMPTS) {
        await redis
          .multi()
          .lpush(DEAD_KEY, JSON.stringify(job))
          .ltrim(DEAD_KEY, 0, 199) // guarda só os 200 mais recentes, é só pra inspeção manual
          .del(JOB_PREFIX + id)
          .exec()
        dead++
      } else {
        const readyAt = now + backoffMs(job.attempts)
        await redis
          .multi()
          .set(JOB_PREFIX + id, JSON.stringify(job), 'EX', JOB_TTL_SECONDS)
          .zadd(QUEUE_KEY, score(job.priority, readyAt), id)
          .exec()
        requeued++
      }
    }
  }

  return { sent, requeued, dead }
}
