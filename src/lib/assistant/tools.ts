import { createServiceClient } from '@/lib/supabase/service'
import type { ToolDef, ToolCallRecord } from './aiClient'
import { AGENDA_TOOLS, agendaToolsEnabled, executeAgendaTool } from '@/lib/agenda/tools'
import { SERVICE_TOOLS, DEVICE_TOOLS, executeServiceTool } from '@/lib/serviceLifecycle/tools'
import { fetchApenasRetiradaServer } from '@/lib/resolutoo/platformConfig'
import { fetchPublicProducts } from '@/lib/resolutoo/catalog'
import { createAssistantOrderServer, createPixPaymentServer, estimateDeliveryServer } from '@/lib/resolutoo/assistantOrder'
import { fetchProductOrdersByPhone } from '@/lib/consultar'
import { PUBLIC_PRODUCT_URL } from '@/lib/constants'

export const TOOLS: ToolDef[] = [
  {
    name: 'buscar_produtos',
    description:
      'Busca produtos da loja por nome, categoria ou descrição. Retorna id, nome, preço, descrição, link da página do produto na vitrine e disponibilidade. ' +
      'Se houver mais de uma opção compatível, apresente PELO MENOS 2 ao cliente (não só a primeira) — um nome + link por linha — e diga que ele pode finalizar a compra no site (usando o link) ou ali mesmo na conversa com você.',
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
    name: 'criar_pedido_e_gerar_cobranca',
    description:
      'Fecha a compra de produto(s) — cria o pedido de verdade (visível pro lojista) e, se o cliente quiser pagar agora, gera a cobrança Pix real. Cria um pedido REAL, com valor real — NUNCA chame mais de uma vez pros mesmos itens na mesma conversa (isso duplicaria o pedido e cobraria em dobro). Se você já chamou esta tool nesta conversa e ela retornou "PEDIDO CRIADO" com um ID, o pedido já existe — não chame de novo, só confirme o que já foi feito (reenvie o código Pix se o cliente pedir de novo, não gere um pedido novo). ' +
      'ANTES de chamar: peça nome e sobrenome do cliente (não precisa nome completo/documento, só nome e sobrenome mesmo) — o WhatsApp já é o desta conversa, não precisa perguntar/confirmar isso. Depois pergunte se ele quer RETIRAR na loja ou receber por ENTREGA. ' +
      'Se for retirada (entrega=false): não precisa de localização, chame direto. ' +
      'Se for entrega (entrega=true): peça pro cliente enviar a localização FIXA pelo WhatsApp (nunca em tempo real, ver calcular_frete) — depois de ter latitude/longitude reais, chame calcular_frete PRIMEIRO, informe o valor do frete ao cliente e espere ele confirmar explicitamente antes de chamar esta tool. Nunca chame esta tool com entrega=true sem essa confirmação do valor já ter acontecido na conversa. Se o endereço estiver fora da área de entrega, ofereça retirada em vez disso. Depois de calcular e confirmar a entrega, pergunte se o cliente quer pagar agora ou pagar na entrega, antes de gerar a cobrança. ' +
      'Se o cliente mudar de ideia no meio do fluxo (ex: pediu entrega mas depois disse que prefere retirar, ou vice-versa), siga a intenção mais recente dele, não a antiga. ' +
      'IMPORTANTE sobre pagamento: pagar_agora=false (pagar no ato/entrega) é uma opção VÁLIDA e NORMAL — feche o pedido normalmente com pagar_agora=false sempre que o cliente preferir isso, EXCETO quando as regras fixas desta conversa disserem explicitamente que esta loja não oferece pagamento depois (aí sempre pagar_agora=true). Nunca recuse fechar o pedido dizendo "não é possível" ou mandando o cliente pro site só porque ele quer pagar depois — isso É possível e é o comportamento padrão. ' +
      'Se pagar_agora=true, o retorno inclui o código Pix copia-e-cola real na última linha — repasse esse código pro cliente exatamente como veio, sem reescrever. Se pagar_agora=false, o pedido fica pendente pra pagamento no ato. ' +
      'Se o pedido já foi criado nesta conversa (você já chamou esta tool e recebeu "PEDIDO CRIADO") e o cliente só disser que prefere pagar de outro jeito (ex: já tem Pix mas quer pagar na entrega), NÃO chame a tool de novo e NÃO recuse — apenas informe que ele pode simplesmente pagar no ato em vez de usar o Pix, o pedido já está confirmado do mesmo jeito.',
    parameters: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          description: 'Produtos e quantidades, com o ID exato vindo de buscar_produtos.',
          items: {
            type: 'object',
            properties: {
              produto_id: { type: 'string', description: 'ID do produto (de buscar_produtos).' },
              quantidade: { type: 'number', description: 'Quantidade desse produto.' },
            },
            required: ['produto_id', 'quantidade'],
          },
        },
        cliente_nome: { type: 'string', description: 'Nome e sobrenome do cliente.' },
        cliente_telefone: { type: 'string', description: 'WhatsApp do cliente, só dígitos (o da conversa já vale).' },
        entrega: { type: 'boolean', description: 'true = entregar no endereço do cliente. false = cliente retira na loja.' },
        endereco_lat: { type: 'number', description: 'Latitude da localização enviada pelo cliente. Obrigatório quando entrega=true.' },
        endereco_lng: { type: 'number', description: 'Longitude da localização enviada pelo cliente. Obrigatório quando entrega=true.' },
        pagar_agora: { type: 'boolean', description: 'true = gera Pix agora. false = paga no ato (retirada ou entrega).' },
      },
      required: ['itens', 'cliente_nome', 'cliente_telefone', 'entrega', 'pagar_agora'],
    },
  },
  {
    name: 'calcular_frete',
    description:
      'Calcula o valor da entrega a partir da localização real do cliente -- OBRIGATÓRIO chamar esta tool e informar o valor ao cliente, pedindo confirmação explícita ("posso fechar o pedido com a entrega de R$X?"), ANTES de chamar criar_pedido_e_gerar_cobranca com entrega=true. Nunca pule direto pra criar o pedido só porque já tem a localização — o cliente precisa concordar com o valor do frete primeiro. Só aceita localização FIXA (mensagem de localização normal do WhatsApp) -- se a mensagem recebida for de localização EM TEMPO REAL (compartilhamento ao vivo), a conversa vai trazer um aviso "[localização em tempo real recebida]" em vez de coordenadas -- nesse caso, NÃO chame esta tool: peça pro cliente parar de compartilhar em tempo real e mandar a localização fixa (clipe → Localização → Localização atual, sem marcar "Compartilhar em tempo real").',
    parameters: {
      type: 'object',
      properties: {
        endereco_lat: { type: 'number', description: 'Latitude real da localização fixa que o cliente mandou.' },
        endereco_lng: { type: 'number', description: 'Longitude real da localização fixa que o cliente mandou.' },
      },
      required: ['endereco_lat', 'endereco_lng'],
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

// Busca no catálogo do ecommerce-api (mesmo que a vitrine pública usa pra
// venda de verdade) -- não no Supabase do próprio vrtech, que é um catálogo
// À PARTE, sem sincronia nenhuma com o que o cliente realmente compra (ver
// decisão de arquitetura: os dois bancos divergiram, e é o ecommerce-api
// quem tem o pedido/pagamento real). IDs retornados aqui são os mesmos IDs
// aceitos por criar_pedido_e_gerar_cobranca.
async function buscarProdutos(query: string): Promise<string> {
  const produtos = await fetchPublicProducts()
  const disponiveis = produtos.filter((p) => p.active && p.quantity > 0)

  const term = query.trim().toLowerCase()
  const tokens = term.split(/\s+/).filter(Boolean)
  const searchable = (p: (typeof disponiveis)[number]) =>
    [p.name, p.description ?? '', ...(p.tags ?? [])].join(' ').toLowerCase()

  const matches = disponiveis.filter((p) => {
    const text = searchable(p)
    return tokens.some((t) => text.includes(t))
  })
  if (matches.length === 0) return `Nenhum produto encontrado para "${query}".`

  const scored = matches
    .map((p) => ({ p, score: tokens.filter((t) => searchable(p).includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.p)

  return formatProducts(scored)
}

function formatProducts(products: { id: string; name: string; price: number; description: string | null; quantity: number }[]) {
  return products.map((p) =>
    `- ${p.name} | R$ ${Number(p.price).toFixed(2).replace('.', ',')} | Estoque: ${p.quantity} | ID: ${p.id} | Link: ${PUBLIC_PRODUCT_URL(p.id)}${p.description ? `\n  ${p.description}` : ''}`
  ).join('\n')
}

function formatServices(rows: { id: string; model_name: string | null; repair_type: string; price: number; description: string | null; service_catalog_categories?: unknown }[]) {
  return rows.map((s) => {
    const cat = (s.service_catalog_categories as unknown as { name: string } | null)?.name ?? ''
    const modelo = s.model_name ?? 'qualquer modelo'
    return `- ${cat} ${modelo} | ${s.repair_type} | R$ ${Number(s.price).toFixed(2).replace('.', ',')} | ID: ${s.id}${s.description ? `\n  ${s.description}` : ''}`
  }).join('\n')
}

// Query da IA costuma vir com marca + tipo de reparo juntos (ex: "Xiaomi
// trocar bateria") -- a marca só existe na categoria (JOIN), nunca em
// model_name/repair_type/description, e model_name agora é NULL pra
// serviço universal (many-to-many de aparelho/marca/modelo). Um .ilike()
// contra a string inteira nunca bateria com a marca nem com um universal
// sem modelo, então filtra em JS por token, casando qualquer palavra da
// busca contra marca, modelo, tipo de reparo, descrição ou tags.
async function buscarServicos(query: string): Promise<string> {
  const supabase = createServiceClient()
  // FK explícita obrigatória: desde a reformulação many-to-many do catálogo
  // (service_item_brands) existem DUAS relações entre service_catalog_items
  // e service_catalog_categories -- um embed simples "service_catalog_categories(name)"
  // fica ambíguo pro PostgREST (erro PGRST201) e a busca inteira quebra.
  const { data, error } = await supabase
    .from('service_catalog_items')
    .select('id, model_name, repair_type, price, description, active, tags, service_catalog_categories!service_catalog_items_category_id_fkey(name)')
    .eq('active', true)
    .limit(300)

  if (error) return `Erro ao buscar serviços: ${error.message}`

  const tokens = query.toLowerCase().split(/[\s,;]+/).filter(Boolean)
  if (tokens.length === 0) return `Nenhum serviço encontrado para "${query}".`

  const searchable = (s: (typeof data)[number]) => {
    const cat = (s.service_catalog_categories as unknown as { name: string } | null)?.name ?? ''
    return [cat, s.model_name ?? '', s.repair_type, s.description ?? '', ...(s.tags ?? [])].join(' ').toLowerCase()
  }

  const matches = (data ?? []).filter((s) => {
    const text = searchable(s)
    return tokens.some((t) => text.includes(t))
  })

  if (matches.length === 0) return `Nenhum serviço encontrado para "${query}".`

  // Prioriza itens que batem com mais tokens (mais relevantes primeiro).
  const scored = matches
    .map((s) => {
      const text = searchable(s)
      return { s, score: tokens.filter((t) => text.includes(t)).length }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.s)

  return formatServices(scored)
}

async function criarPedidoEGerarCobranca(input: {
  itens: { produto_id: string; quantidade: number }[]
  cliente_nome: string
  cliente_telefone: string
  entrega: boolean
  endereco_lat?: number
  endereco_lng?: number
  pagar_agora: boolean
}): Promise<string> {
  if (!input.itens || input.itens.length === 0) return 'FALHOU (validation): informe ao menos um item.'
  if (!input.cliente_nome?.trim() || !input.cliente_telefone?.trim()) {
    return 'FALHOU (validation): nome e telefone do cliente são obrigatórios.'
  }

  // Trava mecânica contra pedido duplicado -- confiar só na instrução do
  // prompt ("não chame de nono") não é garantido (achado real: modelo
  // chamou de novo quando o cliente só mudou a preferência de pagamento
  // depois do pedido já criado, gerando 2 pedidos reais pro mesmo item).
  // Pedido pendente pra este telefone criado nos últimos 15min já é
  // considerado o mesmo atendimento -- devolve ele em vez de criar outro.
  const digits = input.cliente_telefone.replace(/\D/g, '')
  const recentOrders = await fetchProductOrdersByPhone(digits).catch(() => [])
  const dup = recentOrders.find(
    (o) =>
      (o.status === 'pending' || o.status === 'confirmed') &&
      Date.now() - new Date(o.created_at).getTime() < 15 * 60_000,
  )
  if (dup) {
    return `PEDIDO JÁ EXISTE (não crie de novo): ID ${dup.id} | Total: R$ ${Number(dup.total).toFixed(2).replace('.', ',')} | ${dup.payment_status === 'paid' ? 'já pago' : 'pagamento pendente'}. Só confirme pro cliente que esse pedido já está registrado (e que ele pode pagar no ato se preferir, em vez do Pix já gerado) — NUNCA chame esta tool de novo pra este pedido.`
  }

  let shippingPrice = 0
  if (input.entrega) {
    if (input.endereco_lat == null || input.endereco_lng == null) {
      return 'FALHOU (validation): preciso da localização real do cliente pra calcular a entrega — peça pra ele enviar a localização pelo WhatsApp antes de chamar esta tool de novo.'
    }
    try {
      const est = await estimateDeliveryServer(input.endereco_lat, input.endereco_lng)
      if (!est.within_range) {
        return 'FALHOU (validation): esse endereço está fora da área de entrega da loja — ofereça retirada na loja em vez disso.'
      }
      shippingPrice = est.price
    } catch (e) {
      return `FALHOU (entrega): ${e instanceof Error ? e.message : String(e)}`
    }
  }

  let order
  try {
    order = await createAssistantOrderServer({
      customer_name: input.cliente_nome.trim(),
      customer_whatsapp: input.cliente_telefone.replace(/\D/g, ''),
      items: input.itens.map((i) => ({ product_id: i.produto_id, quantity: i.quantidade })),
      shipping_price: shippingPrice,
    })
  } catch (e) {
    return `FALHOU (pedido): ${e instanceof Error ? e.message : String(e)}`
  }

  const total = `R$ ${order.total.toFixed(2).replace('.', ',')}`
  const modo = input.entrega
    ? `Entrega no endereço informado (taxa: R$ ${shippingPrice.toFixed(2).replace('.', ',')}, já incluída no total)`
    : 'Retirada na loja'

  if (!input.pagar_agora) {
    return `PEDIDO CRIADO: ID ${order.id} | Total: ${total} | ${modo}, pagamento no ato.`
  }

  try {
    const withPix = await createPixPaymentServer(order.id)
    if (!withPix.pix_copia_cola) {
      return `PEDIDO CRIADO: ID ${order.id} | Total: ${total} | ${modo} | Não foi possível gerar o Pix agora — combine o pagamento no ato ou tente de novo em instantes.`
    }
    return `PEDIDO CRIADO: ID ${order.id} | Total: ${total} | ${modo}\n${withPix.pix_copia_cola}`
  } catch (e) {
    return `PEDIDO CRIADO: ID ${order.id} | Total: ${total} | ${modo} | Não foi possível gerar o Pix agora (${e instanceof Error ? e.message : String(e)}) — combine o pagamento no ato ou tente de novo.`
  }
}

// Pedido de PRODUTO real vive no ecommerce-api (mesma fonte que /consultar
// usa) -- 'store_orders' no Supabase do vrtech é tabela morta/legada, sem
// nenhum pedido de assistente real gravado ali. Achado real: consultar_pedido
// sempre respondia "nenhum pedido encontrado" mesmo pra pedido acabado de
// criar por criar_pedido_e_gerar_cobranca, porque consultava a base errada.
async function consultarPedido(phone: string): Promise<string> {
  const cleanPhone = phone.replace(/\D/g, '')
  const orders = await fetchProductOrdersByPhone(cleanPhone).catch(() => [])
  if (orders.length === 0) return 'Nenhum pedido encontrado para este número.'

  return orders.slice(0, 5).map((o) => {
    const pago = o.payment_status === 'paid' ? 'pago' : 'pagamento pendente'
    const entrega = o.delivery_type === 'delivery' ? 'entrega' : 'retirada na loja'
    return `Pedido #${o.short_id} — Status: ${o.status} — ${entrega} — ${pago} — Total: R$ ${Number(o.total).toFixed(2).replace('.', ',')} — ${new Date(o.created_at).toLocaleDateString('pt-BR')}`
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

  const [reqRes, apptRes, orders] = await Promise.all([
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
    // Pedido de produto real vive no ecommerce-api, não em 'store_orders'
    // (tabela morta do vrtech) -- mesma correção de consultarPedido acima.
    fetchProductOrdersByPhone(cleanPhone).catch(() => []),
  ])

  const partes: string[] = []
  const reqs = reqRes.data ?? []
  if (reqs.length > 0) {
    // Numerado + aparelho em destaque -- cada solicitação é claramente
    // distinta na resposta (achado real: com 2+ atendimentos o modelo
    // colapsava tudo numa frase genérica só, sem dizer qual é qual).
    partes.push(
      `Solicitações de serviço ativas (responda distinguindo cada uma pelo aparelho, nunca um resumo genérico só):\n${reqs
        .map((r, i) => `${i + 1}) Aparelho: ${r.phone_model ?? 'não informado'} | ID ${r.id} | status: ${r.status} | problema: ${r.problem_description ?? '—'}`)
        .join('\n')}`,
    )
  }
  const appts = apptRes.data ?? []
  if (appts.length > 0) {
    partes.push(
      `Agendamentos futuros:\n${appts.map((a) => `- ID ${a.id} | ${a.service_label} | ${new Date(a.starts_at).toLocaleString('pt-BR')} | status: ${a.status}`).join('\n')}`,
    )
  }
  const pendingOrders = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'completed')
  if (pendingOrders.length > 0) {
    partes.push(
      `Pedidos de produto em andamento:\n${pendingOrders.map((o) => `- Pedido #${o.short_id} | status: ${o.status} | ${o.payment_status === 'paid' ? 'pago' : 'pagamento pendente'} | R$ ${Number(o.total).toFixed(2).replace('.', ',')}`).join('\n')}`,
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
  if (!(await agendaToolsEnabled())) return base
  // Loja "apenas retirada" (preferência da plataforma, /meu-plano) não faz
  // deslocamento nenhum -- a IA nunca deve oferecer coleta/entrega
  // motorizada, só a retirada na loja (agendar_retirada_aparelho continua).
  const apenasRetirada = await fetchApenasRetiradaServer()
  const deviceTools = apenasRetirada
    ? DEVICE_TOOLS.filter((t) => t.name !== 'agendar_coleta_aparelho' && t.name !== 'agendar_entrega_aparelho')
    : DEVICE_TOOLS
  return [...base, ...AGENDA_TOOLS, ...deviceTools]
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === 'buscar_produtos') return await buscarProdutos(String(input.query ?? ''))
    if (name === 'buscar_servicos') return await buscarServicos(String(input.query ?? ''))
    if (name === 'criar_pedido_e_gerar_cobranca') {
      const itensRaw = Array.isArray(input.itens) ? input.itens : []
      return await criarPedidoEGerarCobranca({
        itens: itensRaw.map((i) => ({
          produto_id: String((i as Record<string, unknown>).produto_id ?? ''),
          quantidade: Number((i as Record<string, unknown>).quantidade ?? 1),
        })),
        cliente_nome: String(input.cliente_nome ?? ''),
        cliente_telefone: String(input.cliente_telefone ?? ''),
        entrega: !!input.entrega,
        endereco_lat: typeof input.endereco_lat === 'number' ? input.endereco_lat : undefined,
        endereco_lng: typeof input.endereco_lng === 'number' ? input.endereco_lng : undefined,
        pagar_agora: !!input.pagar_agora,
      })
    }
    if (name === 'calcular_frete') {
      const lat = typeof input.endereco_lat === 'number' ? input.endereco_lat : null
      const lng = typeof input.endereco_lng === 'number' ? input.endereco_lng : null
      if (lat == null || lng == null) return 'FALHOU (validation): informe endereco_lat/endereco_lng reais da localização recebida.'
      try {
        const est = await estimateDeliveryServer(lat, lng)
        if (!est.within_range) {
          return 'FORA DA ÁREA DE ENTREGA: ofereça retirada na loja em vez disso.'
        }
        return `FRETE: R$ ${est.price.toFixed(2).replace('.', ',')} — informe esse valor ao cliente e peça confirmação explícita antes de chamar criar_pedido_e_gerar_cobranca.`
      } catch (e) {
        return `FALHOU (frete): ${e instanceof Error ? e.message : String(e)}`
      }
    }
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
