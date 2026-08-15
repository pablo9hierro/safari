import { describe, it, expect } from 'vitest'
import { SERVICE_TOOLS } from './tools'
import { TOOLS } from '@/lib/assistant/tools'

/**
 * O cliente pode estar consultando pelo WhatsApp um atendimento/pedido
 * registrado com outro número (continuação de um atendimento que começou
 * por outro canal). As tools sempre aceitaram um `telefone`/`phone`
 * explícito — nunca ficaram presas ao número da conversa — mas a
 * DESCRIÇÃO precisa deixar isso claro pro modelo, senão ele nunca pergunta
 * e assume o número errado por padrão.
 */
describe('tools de consulta orientam a confirmar o número, não assumir o da conversa', () => {
  it('consultar_meus_atendimentos instrui a confirmar o número com o cliente', () => {
    const tool = SERVICE_TOOLS.find((t) => t.name === 'consultar_meus_atendimentos')!
    expect(tool.description).toMatch(/confirme/i)
    expect(tool.description).toMatch(/outro canal|outro número/i)
  })

  it('consultar_pedido (produto) instrui a confirmar o número com o cliente', () => {
    const tool = TOOLS.find((t) => t.name === 'consultar_pedido')!
    expect(tool.description).toMatch(/confirme/i)
  })

  it('o parâmetro de telefone aceita qualquer número informado, não é fixo na conversa', () => {
    const svc = SERVICE_TOOLS.find((t) => t.name === 'consultar_meus_atendimentos')!
    const params = svc.parameters as { properties: Record<string, { description: string }> }
    expect(params.properties.telefone.description).not.toMatch(/da conversa/i)

    const pedido = TOOLS.find((t) => t.name === 'consultar_pedido')!
    const pedidoParams = pedido.parameters as { properties: Record<string, { description: string }> }
    expect(pedidoParams.properties.phone.description).not.toMatch(/da conversa/i)
  })
})
