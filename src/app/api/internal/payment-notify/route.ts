import { NextRequest, NextResponse } from 'next/server'
import { renderMessage } from '@/lib/templates/store'

/**
 * POST /api/internal/payment-notify
 *
 * Chamado pelo ecommerce-api (Rust) logo depois de gerar uma cobrança Pix,
 * pra renderizar a mensagem 1 (o "aviso de pagamento") com o Template Zap
 * configurado pelo lojista — é o único ponto de contato entre os dois
 * backends para esta feature.
 *
 * NUNCA lida com a mensagem 2 (o copia-e-cola em si): esse valor sai direto
 * da Mercado Pago pro ecommerce-api, que manda literal pro cliente — este
 * endpoint não vê, não gera e não poderia alterar o código real.
 *
 * Backend-a-backend só, protegido por chave compartilhada — nunca chega ao
 * navegador do cliente nem do lojista.
 */
export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-internal-key') ?? ''
  const expected = process.env.VRTECH_INTERNAL_KEY ?? ''
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { nome, pedido, valor } = body ?? {}
  if (!nome) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  }

  const fallback = `Olá, ${nome}! Seu pedido está pronto. 💳\n\nValor: ${valor ?? ''}\n\nLogo abaixo mando o código para você pagar.`

  const message = await renderMessage(
    'payment_intro',
    { nome, pedido, valor },
    fallback,
  )

  return NextResponse.json({ message })
}
