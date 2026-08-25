import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do client Supabase: cada teste decide o que a leitura de
// agenda_settings devolve (linha real, erro, ou tabela inexistente).
const settingsResult = { value: { data: null as unknown, error: null as unknown } }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => settingsResult.value }),
      }),
    }),
  }),
}))

const { AGENDA_TOOLS, AGENDA_TOOL_NAMES, agendaToolsEnabled } = await import('./tools')
const { TOOLS, resolveTools } = await import('@/lib/assistant/tools')
const { SERVICE_TOOL_NAMES } = await import('@/lib/serviceLifecycle/tools')

describe('contrato das tools de agenda', () => {
  it('expõe exatamente as seis operações de agenda', () => {
    expect(AGENDA_TOOL_NAMES.sort()).toEqual([
      'cancelar_agendamento',
      'consultar_agenda',
      'consultar_agendamento',
      'consultar_disponibilidade',
      'criar_agendamento',
      'remarcar_agendamento',
    ])
  })

  it('não colide com as tools já existentes do assistente', () => {
    const existentes = TOOLS.map((t) => t.name)
    for (const name of AGENDA_TOOL_NAMES) {
      expect(existentes).not.toContain(name)
    }
  })

  it('toda tool tem schema de parâmetros válido', () => {
    for (const tool of AGENDA_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20)
      const params = tool.parameters as { type: string; properties: Record<string, unknown>; required?: string[] }
      expect(params.type).toBe('object')
      expect(Object.keys(params.properties).length).toBeGreaterThan(0)
      // Todo campo obrigatório precisa existir em properties.
      for (const req of params.required ?? []) {
        expect(params.properties).toHaveProperty(req)
      }
    }
  })

  it('criar_agendamento exige cliente, contato, data e horário', () => {
    const tool = AGENDA_TOOLS.find((t) => t.name === 'criar_agendamento')!
    const required = (tool.parameters as { required: string[] }).required
    expect(required).toEqual(
      expect.arrayContaining(['cliente_nome', 'cliente_telefone', 'data', 'horario']),
    )
  })

  it('consultar_disponibilidade deixa horário opcional (pra listar vagas)', () => {
    const tool = AGENDA_TOOLS.find((t) => t.name === 'consultar_disponibilidade')!
    const required = (tool.parameters as { required?: string[] }).required ?? []
    expect(required).not.toContain('horario')
  })

  it('instrui o modelo a nunca afirmar disponibilidade sem consultar', () => {
    const tool = AGENDA_TOOLS.find((t) => t.name === 'consultar_disponibilidade')!
    expect(tool.description).toMatch(/OBRIGATÓRIO/)
  })

  it('deixa explícito que serviço "agora" também exige agendamento', () => {
    const tool = AGENDA_TOOLS.find((t) => t.name === 'criar_agendamento')!
    expect(tool.description).toMatch(/agora/i)
  })
})

describe('feature flag por loja', () => {
  beforeEach(() => {
    settingsResult.value = { data: null, error: null }
  })

  it('oferece as tools de agenda (+ entrega) quando a flag está ligada', async () => {
    settingsResult.value = { data: { appointment_ai_enabled: true }, error: null }
    expect(await agendaToolsEnabled()).toBe(true)
    const tools = (await resolveTools()).map((t) => t.name)
    expect(tools).toEqual(expect.arrayContaining(AGENDA_TOOL_NAMES))
    expect(tools).toContain('agendar_entrega_aparelho')
    expect(tools).toHaveLength(TOOLS.length + SERVICE_TOOL_NAMES.length + AGENDA_TOOLS.length + 3)
  })

  it('esconde as tools de agenda (e a de entrega) quando a flag está desligada', async () => {
    settingsResult.value = { data: { appointment_ai_enabled: false }, error: null }
    expect(await agendaToolsEnabled()).toBe(false)
    const tools = (await resolveTools()).map((t) => t.name)
    for (const name of AGENDA_TOOL_NAMES) expect(tools).not.toContain(name)
    expect(tools).not.toContain('agendar_entrega_aparelho')
    expect(tools).toHaveLength(TOOLS.length + SERVICE_TOOL_NAMES.length)
  })

  it('sem a tabela no banco, a assistente continua com produto/serviço/pedido + ciclo de atendimento', async () => {
    // Estado real antes da migration ser aplicada: a leitura falha. A
    // assistente NÃO pode quebrar por causa de uma feature ainda não migrada.
    settingsResult.value = {
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'vrtech.agenda_settings'" },
    }
    expect(await agendaToolsEnabled()).toBe(false)
    const tools = (await resolveTools()).map((t) => t.name)
    expect(tools).toEqual([
      'buscar_produtos', 'buscar_servicos', 'criar_pedido_e_gerar_cobranca', 'calcular_frete', 'consultar_pedido', 'consultar_atendimento_em_andamento', ...SERVICE_TOOL_NAMES,
    ])
  })
})

describe('separação produto x serviço', () => {
  it('nenhuma tool de agenda menciona carrinho/produto como fluxo próprio', () => {
    // Agenda é só de serviço — produto segue o fluxo de venda existente.
    for (const tool of AGENDA_TOOLS) {
      expect(tool.description).not.toMatch(/carrinho/i)
    }
  })

  it('as tools de produto/pedido continuam intactas', () => {
    const nomes = TOOLS.map((t) => t.name)
    expect(nomes).toContain('buscar_produtos')
    expect(nomes).toContain('buscar_servicos')
    expect(nomes).toContain('consultar_pedido')
  })
})
