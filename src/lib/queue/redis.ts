import Redis from 'ioredis'

/**
 * Redis (Railway, mesmo projeto do resto da plataforma) usado como fila
 * confiável de disparos WhatsApp — ver whatsappQueue.ts. Singleton porque
 * cada invocação de função serverless da Vercel reusa a mesma instância de
 * módulo entre requests "quentes"; recriar a conexão a cada chamada
 * esgotaria o limite de conexões do Redis rapidinho.
 */
let client: Redis | null = null

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL
    if (!url) throw new Error('REDIS_URL não configurada')
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
    })
    client.on('error', (err) => console.error('[redis] erro de conexão:', err.message))
  }
  return client
}
