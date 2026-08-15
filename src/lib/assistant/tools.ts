import { createServiceClient } from '@/lib/supabase/service'
import type { ToolDef, ToolCallRecord } from './aiClient'
import { AGENDA_TOOLS, agendaToolsEnabled, executeAgendaTool } from '@/lib/agenda/tools'
import { SERVICE_TOOLS, DEVICE_TOOLS, executeServiceTool } from '@/lib/serviceLifecycle/tools'

export const TOOLS: ToolDef[] = [
  {
    name: 'buscar_produtos',
    description: 'Busca produtos da loja por nome, categoria ou descrição. Retorna id, nome, preço, descrição e disponibilidade.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Termo de busca (ex: "capinha iPhone 12", "carregador", "fone")' } },
      required: ['query'],
    },
  },
  {
    name: 'buscar_servicos',
    description: 'Busca serviços de assistência técnica por aparelho, problema ou tipo de reparo. Retorna id, nome do serviço, modelo, preço e disponibilidade.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Termo de busca (ex: "tela iPhone 14", "bateria Samsung", "troca de tela")' } },
      required: ['query'],
    },
  },
  {
    name: 'consultar_pedido',
    description: 'Consulta pedidos recentes do cliente pelo número de telefone da conversa. Retorna status e itens.',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Número de telefone do cliente (apenas dígitos)' } },
      required: ['phone'],
    },
  },
]

async function buscarProdutos(query: string): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, description, stock_quantity, active')
    .eq('active', true)
    .ilike('name', `%${query}%`)
    .gt('stock_quantity', 0)
    .order('name')
    .limit(8)

  if (error) return `Erro ao buscar produtos: ${error.message}`
  if (!data || data.length === 0) {
    // Try broader search in description
    const { data: d2 } = await supabase
      .from('products')
      .select('id, name, price, description, stock_quantity, active')
      .eq('active', true)
      .ilike('description', `%${query}%`)
      .gt('stock_quantity', 0)
      .limit(5)
    if (!d2 || d2.length === 0) return `Nenhum produto encontrado para "${query}".`
    return formatProducts(d2)
  }
  return formatProducts(data)
}

function formatProducts(products: { id: string; name: string; price: number; description: string | null; stock_quantity: number }[]) {
  return products.map((p) =>
    `- ${p.name} | R$ ${Number(p.price).toFixed(2).replace('.', ',')} | Estoque: ${p.stock_quantity} | ID: ${p.id}${p.description ? `\n  ${p.description}` : ''}`
  ).join('\n')
}

async function buscarServicos(query: string): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('service_catalog_items')
    .select('id, model_name, repair_type, price, description, active, service_catalog_categories(name)')
    .eq('active', true)
    .or(`model_name.ilike.%${query}%,repair_type.ilike.%${query}%,description.ilike.%${query}%`)
    .order('model_name')
    .limit(10)

  if (error) return `Erro ao buscar serviços: ${error.message}`
  if (!data || data.length === 0) return `Nenhum serviço encontrado para "${query}".`

  return data.map((s) => {
    const cat = (s.service_catalog_categories as unknown as { name: string } | null)?.name ?? ''
    return `- ${cat} ${s.model_name} | ${s.repair_type} | R$ ${Number(s.price).toFixed(2).replace('.', ',')} | ID: ${s.id}${s.description ? `\n  ${s.description}` : ''}`
  }).join('\n')
}

async function consultarPedido(phone: string): Promise<string> {
  const supabase = createServiceClient()
  const cleanPhone = phone.replace(/\D/g, '')
  const { data, error } = await supabase
    .from('store_orders')
    .select('id, customer_name, status, total_value, created_at, store_order_items(product_name, quantity, status)')
    .or(`customer_whatsapp.ilike.%${cleanPhone}%`)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) return `Erro ao consultar pedido: ${error.message}`
  if (!data || data.length === 0) return 'Nenhum pedido encontrado para este número.'

  return data.map((o) => {
    const items = (o.store_order_items as { product_name: string; quantity: number; status: string }[] | null) ?? []
    const itensStr = items.map((i) => `${i.quantity}x ${i.product_name} (${i.status})`).join(', ')
    return `Pedido ${o.id.slice(0, 8)} — Status: ${o.status} — R$ ${Number(o.total_value).toFixed(2).replace('.', ',')} — ${itensStr} — ${new Date(o.created_at).toLocaleDateString('pt-BR')}`
  }).join('\n')
}

/**
 * Lista de tools oferecida ao modelo nesta interação. As de agenda só entram
 * quando a loja tem a feature ligada (agenda_settings.appointment_ai_enabled).
 */
export async function resolveTools(): Promise<ToolDef[]> {
  const base = [...TOOLS, ...SERVICE_TOOLS]
  return (await agendaToolsEnabled()) ? [...base, ...AGENDA_TOOLS, ...DEVICE_TOOLS] : base
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === 'buscar_produtos') return await buscarProdutos(String(input.query ?? ''))
    if (name === 'buscar_servicos') return await buscarServicos(String(input.query ?? ''))
    if (name === 'consultar_pedido') return await consultarPedido(String(input.phone ?? ''))
    const service = await executeServiceTool(name, input)
    if (service !== null) return service
    const agenda = await executeAgendaTool(name, input)
    if (agenda !== null) return agenda
    return `Ferramenta desconhecida: ${name}`
  } catch (e) {
    return `Erro ao executar ${name}: ${e instanceof Error ? e.message : String(e)}`
  }
}

export type { ToolCallRecord }
