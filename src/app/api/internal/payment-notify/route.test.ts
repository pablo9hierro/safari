import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/templates/store', () => ({
  renderMessage: vi.fn(async (_key: string, vars: Record<string, unknown>, fallback: string) =>
    vars.nome ? `RENDERIZADO para ${vars.nome}` : fallback,
  ),
}))

const OLD_ENV = process.env.VRTECH_INTERNAL_KEY

beforeEach(() => {
  process.env.VRTECH_INTERNAL_KEY = 'segredo-teste'
})

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/internal/payment-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/internal/payment-notify', () => {
  it('recusa sem a chave interna', async () => {
    const { POST } = await import('./route')
    const res = await POST(req({ nome: 'João' }))
    expect(res.status).toBe(401)
  })

  it('recusa com a chave errada', async () => {
    const { POST } = await import('./route')
    const res = await POST(req({ nome: 'João' }, { 'x-internal-key': 'errada' }))
    expect(res.status).toBe(401)
  })

  it('recusa sem VRTECH_INTERNAL_KEY configurada no servidor (nunca abre sem querer)', async () => {
    process.env.VRTECH_INTERNAL_KEY = ''
    const { POST } = await import('./route')
    const res = await POST(req({ nome: 'João' }, { 'x-internal-key': '' }))
    expect(res.status).toBe(401)
    process.env.VRTECH_INTERNAL_KEY = 'segredo-teste'
  })

  it('exige nome', async () => {
    const { POST } = await import('./route')
    const res = await POST(req({}, { 'x-internal-key': 'segredo-teste' }))
    expect(res.status).toBe(400)
  })

  it('renderiza a mensagem com o template payment_intro', async () => {
    const { POST } = await import('./route')
    const res = await POST(req({ nome: 'João', pedido: '4821', valor: 'R$ 89,90' }, { 'x-internal-key': 'segredo-teste' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message).toBe('RENDERIZADO para João')
  })
})

afterAll(() => {
  process.env.VRTECH_INTERNAL_KEY = OLD_ENV
})
