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
    description: 'Consulta pedidos de produto do cliente por telefone. Confirme com o cliente qual número está cadastrado no pedido antes de chamar — normalmente é o da conversa, mas pode ser outro (ex: pedido feito com outro número, ou atendimento que começou em outro canal). Retorna status e itens.',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Telefone cadastrado no pedido (confirmado com o cliente), apenas dígitos.' } },
      required: ['phone'],
    },
  },
  {
    name: 'consultar_atendimento_em_andamento',
    description: 'Verifica TUDO que está em andamento pra um telefone: solicitação de serviço ativa, agendamento futuro e pedido de produto não finalizado, de qualquer origem (vitrine ou WhatsApp). Use quando o cliente informar um número diferente do da conversa atual dizendo que o atendimento dele está nesse outro número — aí você passa a dar continuidade usando os dados encontrados, sem repetir perguntas de triagem.',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Telefone a consultar, apenas dígitos.' } },
      required: ['phone'],
    },
  },
]

async function buscarProdutos(query: string): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, description, quantity, active')
    .eq('active', true)
    .ilike('name', `%${query}%`)
    .gt('quantity', 0)
    .order('name')
    .limit(8)

  if (error) return `Erro ao buscar produtos: ${error.message}`
  if (data && data.length > 0) return formatProducts(data)

  // Try broader search in description
  const { data: d2 } = await supabase
    .from('products')
    .select('id, name, price, description, quantity, active')
    .eq('active', true)
    .ilike('description', `%${query}%`)
    .gt('quantity', 0)
    .limit(5)
  if (d2 && d2.length > 0) return formatProducts(d2)

  // Cliente descreveu o problema em vez do nome do produto -- tags de
  // busca (geradas por IA no cadastro) cobrem sinônimo/sintoma. Catálogo é
  // pequeno, filtra em JS em vez de brigar com operador de array do
  // PostgREST pra substring parcial dentro de cada tag.
  const term = query.trim().toLowerCase()
  const { data: d3 } = await supabase
    .from('products')
    .select('id, name, price, description, quantity, active, tags')
    .eq('active', true)
    .gt('quantity', 0)
    .limit(200)
  const byTag = (d3 ?? []).filter((p) => (p.tags ?? []).some((t: string) => t.includes(term) || term.includes(t)))
  if (byTag.length > 0) return formatProducts(byTag.slice(0, 8))

  return `Nenhum produto encontrado para "${query}".`
}

function formatProducts(products: { id: string; name: string; price: number; description: string | null; quantity: number }[]) {
  return products.map((p) =>
    `- ${p.name} | R$ ${Number(p.price).toFixed(2).replace('.', ',')} | Estoque: ${p.quantity} | ID: ${p.id}${p.description ? `\n  ${p.description}` : ''}`
  ).join('\n')
}

function formatServices(rows: { id: string; model_name: string; repair_type: string; price: number; description: string | null; service_catalog_categories?: unknown }[]) {
  return rows.map((s) => {
    const cat = (s.service_catalog_categories as unknown as { name: string } | null)?.name ?? ''
    return `- ${cat} ${s.model_name} | ${s.repair_type} | R$ ${Number(s.price).toFixed(2).replace('.', ',')} | ID: ${s.id}${s.description ? `\n  ${s.description}` : ''}`
  }).join('\n')
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
  if (data && data.length > 0) return formatServices(data)

  // Mesma lógica de fallback por tags do buscarProdutos -- cliente
  // descreveu sintoma/problema em vez do nome do serviço.
  const term = query.trim().toLowerCase()
  const { data: d2 } = await supabase
    .from('service_catalog_items')
    .select('id, model_name, repair_type, price, description, active, tags, service_catalog_categories(name)')
    .eq('active', true)
    .limit(200)
  const byTag = (d2 ?? []).filter((s) => (s.tags ?? []).some((t: string) => t.includes(term) || term.includes(t)))
  if (byTag.length > 0) return formatServices(byTag.slice(0, 10))

  return `Nenhum serviço encontrado para "${query}".`
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

const ACTIVE_SERVICE_STATUSES = [
  'pending', 'aguardando_diagnostico', 'diagnostico_enviado', 'accepted',
  'retirada_local', 'em_busca', 'in_progress', 'completed', 'em_pagamento', 'em_entrega',
]

/**
 * Checa TUDO em andamento pra um telefone: solicitação de serviço ativa,
 * agendamento futuro vivo, pedido de produto não finalizado. Usado tanto
 * como tool explícita (cliente informa outro número) quanto automaticamente
 * no início de cada conversa (ver hydrateOngoingContext) -- por isso é uma
 * função separada da entrada do executor de tools, reaproveitável nos dois
 * casos sem duplicar a query.
 */
export async function consultarAtendimentoEmAndamento(phone: string): Promise<string> {
  const cleanPhone = phone.replace(/\D/g, '')
  if (!cleanPhone) return 'Informe um telefone válido.'
  const supabase = createServiceClient()

  const [reqRes, apptRes, orderRes] = await Promise.all([
    supabase
      .from('service_requests')
      .select('id, status, phone_model, problem_description, created_at')
      .eq('customer_phone', cleanPhone)
      .in('status', ACTIVE_SERVICE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('appointments')
      .select('id, service_label, starts_at, status')
      .eq('customer_phone', cleanPhone)
      .in('status', ['agendado', 'remarcado'])
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(3),
    supabase
      .from('store_orders')
      .select('id, status, total_value, created_at')
      .ilike('customer_whatsapp', `%${cleanPhone}%`)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const partes: string[] = []
  const reqs = reqRes.data ?? []
  if (reqs.length > 0) {
    partes.push(
      `Solicitações de serviço ativas:\n${reqs.map((r) => `- ID ${r.id} | ${r.phone_model ?? 'aparelho'} | status: ${r.status} | ${r.problem_description ?? ''}`).join('\n')}`,
    )
  }
  const appts = apptRes.data ?? []
  if (appts.length > 0) {
    partes.push(
      `Agendamentos futuros:\n${appts.map((a) => `- ID ${a.id} | ${a.service_label} | ${new Date(a.starts_at).toLocaleString('pt-BR')} | status: ${a.status}`).join('\n')}`,
    )
  }
  const orders = orderRes.data ?? []
  if (orders.length > 0) {
    partes.push(
      `Pedidos de produto em andamento:\n${orders.map((o) => `- ID ${o.id.slice(0, 8)} | status: ${o.status} | R$ ${Number(o.total_value).toFixed(2).replace('.', ',')}`).join('\n')}`,
    )
  }

  if (partes.length === 0) return `Nada em andamento para o telefone ${cleanPhone}.`
  return partes.join('\n\n')
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
    if (name === 'consultar_atendimento_em_andamento') return await consultarAtendimentoEmAndamento(String(input.phone ?? ''))
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
