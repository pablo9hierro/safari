import { ServiceRequest, ServiceStatus, StoreOrder } from '@/lib/types'
import { STORE_ADDRESS } from '@/lib/constants'

export type OrderSummary = {
  completed_services: string | null
  warranty: string | null
  final_value: number | null
  pdf_url: string | null
} | null

function currency(val: number | null | undefined) {
  return `R$ ${Number(val ?? 0).toFixed(2).replace('.', ',')}`
}

export function ownerNewRequestMessage(req: ServiceRequest) {
  const enderecoLine = req.self_pickup
    ? '🏠 *Entrega:* cliente vai levar/buscar o aparelho'
    : `📍 *Endereço:* ${[req.address_neighborhood, req.address_city].filter(Boolean).join(', ')}${req.address_reference ? ` — Ref: ${req.address_reference}` : ''}`

  return [
    '🔔 *Nova solicitação de serviço!*',
    '',
    `👤 *Cliente:* ${req.customer_name}`,
    `📞 *Tel:* ${req.customer_phone}`,
    `📱 *Aparelho:* ${req.phone_model}`,
    `🔧 *Problema:* ${req.problem_description}`,
    enderecoLine,
    '',
    '👉 Acesse o dashboard para responder.',
  ].join('\n')
}

// Enviada ao cliente assim que a solicitação é criada (status inicial: pending)
export function pendingCustomerMessage(req: ServiceRequest) {
  return [
    `Recebemos sua solicitação de serviço da VR Tech! 👋`,
    '',
    'Em breve te informo o orçamento inicial (pode variar pelo estado do aparelho quando analisado).',
  ].join('\n')
}

type StatusMessageFn = (req: ServiceRequest, order?: OrderSummary, link?: string) => string

export const STATUS_MESSAGES: Partial<Record<ServiceStatus, StatusMessageFn>> = {
  aguardando_diagnostico: (req, _order, link) => [
    `Olá *${req.customer_name}*! 👋`,
    '',
    'Recebemos seu aparelho para diagnóstico. Em breve finalizamos a avaliação e te enviamos um orçamento detalhado pelo WhatsApp.',
    '',
    link ? `Você pode acompanhar o andamento do diagnóstico em tempo real por aqui: ${link}` : null,
    '',
    'Obrigado pela confiança! 🙏',
  ].filter(Boolean).join('\n'),

  // Aprovação do orçamento REAL (pós-diagnóstico físico) -- precisa dizer
  // o serviço identificado e o valor explicitamente no texto (não só
  // "confira o PDF"), e perguntar se pode seguir pro reparo com esse valor.
  diagnostico_enviado: (req, order, link) => {
    const services = (order?.completed_services || '')
      .split(',').map((s) => s.trim()).filter(Boolean).join(', ')
    const valor = currency(order?.final_value ?? req.quote_value ?? 0)
    return [
      `Olá *${req.customer_name}*! 👋`,
      '',
      `Finalizamos o diagnóstico do seu${req.phone_model ? ` *${req.phone_model}*` : ' aparelho'}.`,
      services ? `Identificamos que é necessário: *${services}*.` : null,
      `Valor do reparo: *${valor}*.`,
      '',
      `Podemos seguir com o reparo por esse valor (${valor})?`,
      '',
      link ? `Acompanhe o diagnóstico completo (PDF) e todas as atualizações em tempo real por aqui: ${link}` : null,
    ].filter(Boolean).join('\n')
  },

  accepted: (req) => [
    `Olá *${req.customer_name}*! 👋`,
    '',
    `Seu orçamento para o *${req.phone_model}* ficou em ${currency(req.quote_value)}.`,
    '',
    'Agradecemos pela preferência em nosso serviço! 🙏',
    '',
    'Por favor, compartilhe a sua localização fixa através do WhatsApp (clique no clipe 📎 → Localização → Sua localização atual).',
    '',
    'Em breve recolheremos o aparelho celular para dar continuidade ao serviço.',
  ].join('\n'),

  rejected: (req) => [
    `Entendemos, *${req.customer_name}*. 😊`,
    '',
    'Se mudar de ideia ou precisar de outro serviço, pode nos chamar aqui a qualquer momento!',
  ].join('\n'),

  // Cliente optou por levar/retirar o aparelho na loja
  retirada_local: () => [
    'Deseja trazer ou retirar o aparelho em nosso endereço?',
    '',
    `📍 ${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood}, ${STORE_ADDRESS.city}`,
    STORE_ADDRESS.mapsUrl,
  ].join('\n'),

  em_busca: () => '🛵 Recebemos sua localização e estamos iniciando a busca do seu aparelho celular.',

  in_progress: (req, _order, link) => [
    `🔧 Seu aparelho celular está sendo reparado neste momento.`,
    '',
    'Acompanhe as atualizações da ordem de serviço (PDF) em tempo real através do link:',
    link ?? '',
  ].filter(Boolean).join('\n'),

  em_entrega: (req) => [
    `📦 *Seu aparelho está a caminho!*`,
    '',
    `Olá *${req.customer_name}*! Acabamos de sair com o *${req.phone_model}* para entrega no seu endereço.`,
    '',
    'Em breve chegamos! 🛵',
  ].join('\n'),

  completed: (req, order, link) => {
    const services = (order?.completed_services || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `*${s}*`)
      .join(', ')

    return [
      `Seu aparelho${req.phone_model ? ` *${req.phone_model}*` : ''} foi reparado com sucesso! 🎉`,
      services ? `Serviços realizados: ${services}` : null,
      `Orçamento no valor de: ${currency(order?.final_value ?? req.quote_value ?? 0)}`,
      `Garantia do serviço: ${order?.warranty || 'não informada'}`,
      `Ordem de serviço: ${order?.pdf_url || link || ''}`,
      '',
      `Já pode combinar ${req.self_pickup ? 'a retirada na loja' : 'a entrega no seu endereço'} -- me diga o melhor horário que a gente agenda certinho.`,
    ].filter(Boolean).join('\n')
  },

  cancelled: (req) => [
    `*${req.customer_name}*, sua solicitação para o *${req.phone_model}* foi cancelada.`,
    '',
    'Se mudar de ideia, pode nos chamar aqui a qualquer momento! 😊',
  ].join('\n'),

  delivered: (req) => [
    `📬 Aparelho entregue!`,
    '',
    `Agradecemos a confiança, *${req.customer_name}*! Caso precise de algo, estamos à disposição.`,
  ].join('\n'),

  finished: (req) => [
    `✅ Atendimento concluído.`,
    '',
    `Agradecemos a confiança, *${req.customer_name}*! Caso precise de algo, estamos à disposição.`,
  ].join('\n'),
}

// Enviada ao dono quando um cliente finaliza um pedido na loja (carrinho do catálogo)
export function ownerNewStoreOrderMessage(order: StoreOrder) {
  const items = (order.store_order_items ?? []).map(
    (i) => `• ${i.quantity}x ${i.product_name} — ${currency(i.unit_price * i.quantity)}`
  )

  return [
    '🛒 *Novo pedido da loja!*',
    '',
    `👤 *Cliente:* ${order.customer_name}`,
    `📞 *WhatsApp:* ${order.customer_whatsapp}`,
    '',
    '*Itens:*',
    ...items,
    '',
    order.pickup_at_store
      ? '🏠 *Entrega:* cliente vai buscar no local'
      : `📍 *Bairro:* ${order.neighborhood || 'não informado'} — frete: ${currency(order.shipping_price)}`,
    `💰 *Total:* ${currency(order.total_value)}`,
    '',
    '👉 Acesse o dashboard de pedidos para continuar a negociação.',
  ].join('\n')
}

// Enviada automaticamente ao cliente assim que ele finaliza o pedido na loja
export function pendingStoreOrderCustomerMessage(order: StoreOrder) {
  return [
    `Olá, *${order.customer_name}*! 👋`,
    '',
    'Recebemos seu pedido na loja da VR Tech!',
    'Em breve nossa equipe continua por aqui mesmo no WhatsApp para fechar os detalhes da compra. 🙏',
  ].join('\n')
}
