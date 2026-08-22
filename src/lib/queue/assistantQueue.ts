import { randomUUID } from 'crypto'
import { getRedis } from './redis'
import { processAssistantMessage, type AssistantMessageInput } from '@/lib/assistant/processMessage'

/**
 * Fila confiável de PROCESSAMENTO de mensagem recebida pelo Assistente IA,
 * backed por Redis (sorted set) -- mesmo padrão de whatsappQueue.ts, mas
 * pro lado de RECEBER em vez de enviar.
 *
 * Por que existe: o webhook da Evolution API encaminhava a mensagem pro
 * pipeline de IA com um fetch solto (fire-and-forget, só um
 * `.catch(console.error)`) -- se esse fetch desse timeout, a função
 * serverless fosse encerrada no meio, ou qualquer falha de rede pontual
 * acontecesse, a mensagem do cliente se perdia pra sempre e ele nunca
 * recebia resposta nenhuma. Inaceitável pro canal principal de
 * atendimento da loja.
 *
 * Como funciona: `deliverAssistantMessageReliable` tenta processar a
 * mensagem NA HORA (path feliz, resposta rápida pro cliente -- não faz
 * sentido esperar um drain de fila pra latência normal). Se falhar
 * (exception em qualquer ponto de processAssistantMessage — pipeline de
 * IA, banco, etc.), o job vai pro sorted set `ai:queue` com backoff, pra
 * um drain posterior tentar de novo em vez de desistir. Depois de
 * MAX_ATTEMPTS, vai pro dead-letter `ai:dead` pra investigação manual.
 *
 * Drenagem: `/api/cron/assistant-drain` (chamado por cron externo/Vercel)
 * E também um "piggyback drain" oportunista -- toda vez que uma mensagem
 * nova é entregue com sucesso, tenta drenar alguns jobs atrasados junto,
 * já que o plano da Vercel usado aqui só permite cron diário (não dá pra
 * confiar só nisso pra retry em minutos).
 */

const QUEUE_KEY = 'ai:queue'
const DEAD_KEY = 'ai:dead'
const JOB_PREFIX = 'ai:job:'
const MAX_ATTEMPTS = 6
const JOB_TTL_SECONDS = 60 * 60 * 24 * 2 // 2 dias -- mensagem de WhatsApp velha demais não faz mais sentido responder

export interface AssistantJob extends AssistantMessageInput {
  id: string
  attempts: number
  createdAt: number
  lastError?: string
}

function score(readyAt: number): number {
  return readyAt
}

export async function enqueueAssistantMessage(input: AssistantMessageInput): Promise<string> {
  const redis = getRedis()
  const job: AssistantJob = { id: randomUUID(), ...input, attempts: 0, createdAt: Date.now() }
  await redis
    .multi()
    .set(JOB_PREFIX + job.id, JSON.stringify(job), 'EX', JOB_TTL_SECONDS)
    .zadd(QUEUE_KEY, score(job.createdAt), job.id)
    .exec()
  return job.id
}

function backoffMs(attempts: number): number {
  return Math.min(15_000 * 2 ** attempts, 10 * 60_000) // 15s, 30s, 1min... até 10min
}

/**
 * Tenta processar direto; se falhar, enfileira pra garantir que a
 * mensagem do cliente não seja perdida. Sempre dispara um piggyback
 * drain best-effort depois (não bloqueia o retorno pro chamador).
 */
export async function deliverAssistantMessageReliable(input: AssistantMessageInput): Promise<boolean> {
  let succeeded = false
  try {
    await processAssistantMessage(input)
    succeeded = true
  } catch (e) {
    console.error('[ai-queue] processamento direto falhou, enfileirando:', e instanceof Error ? e.message : e)
    try {
      await enqueueAssistantMessage(input)
    } catch (queueErr) {
      console.error('[ai-queue] falha CRÍTICA ao enfileirar (mensagem perdida):', queueErr)
    }
  }
  drainAssistantQueue(3).catch((e) => console.error('[ai-queue] piggyback drain falhou:', e))
  return succeeded
}

/** Chamado pelo cron e em piggyback. Drena até `limit` jobs prontos. */
export async function drainAssistantQueue(limit = 10): Promise<{ processed: number; requeued: number; dead: number }> {
  const redis = getRedis()
  const now = Date.now()
  const ids = await redis.zrangebyscore(QUEUE_KEY, 0, now, 'LIMIT', 0, limit)

  let processed = 0
  let requeued = 0
  let dead = 0

  for (const id of ids) {
    const raw = await redis.get(JOB_PREFIX + id)
    await redis.zrem(QUEUE_KEY, id)
    if (!raw) continue // expirou (TTL) ou já foi processado por outra execução concorrente

    const job: AssistantJob = JSON.parse(raw)
    try {
      await processAssistantMessage(job)
      await redis.del(JOB_PREFIX + id)
      processed++
    } catch (e) {
      job.attempts++
      job.lastError = e instanceof Error ? e.message : String(e)
      if (job.attempts >= MAX_ATTEMPTS) {
        await redis
          .multi()
          .lpush(DEAD_KEY, JSON.stringify(job))
          .ltrim(DEAD_KEY, 0, 199)
          .del(JOB_PREFIX + id)
          .exec()
        dead++
      } else {
        const readyAt = now + backoffMs(job.attempts)
        await redis
          .multi()
          .set(JOB_PREFIX + id, JSON.stringify(job), 'EX', JOB_TTL_SECONDS)
          .zadd(QUEUE_KEY, score(readyAt), id)
          .exec()
        requeued++
      }
    }
  }

  return { processed, requeued, dead }
}
