const OWNER_PHONE = process.env.OWNER_PHONE || '5583987516699'
const SITE_URL = process.env.SITE_URL || 'https://safari-nine-silk.vercel.app'

const STORE_ADDRESS = {
  street: process.env.STORE_STREET || 'Rua Aposentado Cláudio de Santana, 37',
  neighborhood: process.env.STORE_NEIGHBORHOOD || 'Valentina de Figueiredo',
  city: process.env.STORE_CITY || 'João Pessoa - PB',
  mapsUrl: process.env.STORE_MAPS_URL || 'https://www.google.com/maps/search/?api=1&query=Rua+Aposentado+Cl%C3%A1udio+de+Santana+37+Valentina+de+Figueiredo+Jo%C3%A3o+Pessoa',
}

function fmt(phone) {
  const d = phone.replace(/\D/g, '')
  const n = d.startsWith('55') ? d : `55${d}`
  return `${n}@c.us`
}

function currency(val) {
  return `R$ ${Number(val).toFixed(2).replace('.', ',')}`
}

module.exports = {
  OWNER_PHONE,
  fmt,

  newRequest(req) {
    return [
      '🔔 *Nova solicitação de serviço!*',
      '',
      `👤 *Cliente:* ${req.customer_name}`,
      `📞 *Tel:* ${req.customer_phone}`,
      `📱 *Celular:* ${req.phone_model}`,
      `🔧 *Problema:* ${req.problem_description}`,
      `📍 *Endereço:* ${[req.address_street, req.address_number, req.address_neighborhood, req.address_city].filter(Boolean).join(', ')}`,
      `🏠 *Ref:* ${req.address_reference}`,
      '',
      '👉 Acesse o dashboard para responder.',
    ].join('\n')
  },

  // Enviada ao cliente assim que a solicitação é criada (status inicial: pending)
  pendingCustomer(req) {
    return [
      `Recebemos sua solicitação de serviço da VR Tech! 👋`,
      '',
      'Em breve te informo o orçamento inicial (pode variar pelo estado do aparelho quando analisado).',
    ].join('\n')
  },

  accepted(req) {
    return [
      `Olá *${req.customer_name}*! 👋`,
      '',
      `Seu orçamento para o *${req.phone_model}* ficou em ${currency(req.quote_value)}.`,
      '',
      `Agradecemos pela preferência em nosso serviço! 🙏`,
      '',
      'Por favor, compartilhe a sua localização fixa através do WhatsApp (clique no clipe 📎 → Localização → Sua localização atual).',
      '',
      'Em breve recolheremos o aparelho celular para dar continuidade ao serviço.',
    ].join('\n')
  },

  rejected(req) {
    return [
      `Entendemos, *${req.customer_name}*. 😊`,
      '',
      'Se mudar de ideia ou precisar de outro serviço, pode nos chamar aqui a qualquer momento!',
    ].join('\n')
  },

  // Cliente optou por levar/retirar o aparelho na loja
  retirada_local(req) {
    return [
      'Deseja trazer ou retirar o aparelho em nosso endereço?',
      '',
      `📍 ${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood}, ${STORE_ADDRESS.city}`,
      STORE_ADDRESS.mapsUrl,
    ].join('\n')
  },

  em_busca(req) {
    return [
      '🛵 Recebemos sua localização e estamos iniciando a busca do seu aparelho celular.',
    ].join('\n')
  },

  in_progress(req) {
    const digits = req.customer_phone.replace(/\D/g, '')
    return [
      `🔧 Seu aparelho celular está sendo reparado neste momento.`,
      '',
      'Acompanhe qualquer atualização do serviço em tempo real através do link:',
      `${SITE_URL}/consultar?phone=${digits}`,
    ].join('\n')
  },

  em_entrega(req) {
    return [
      '📦 Em rota de entrega para devolução do aparelho.',
    ].join('\n')
  },

  // order: linha da tabela service_orders (pode ser null se ainda não existir)
  completed(req, order) {
    const services = (order?.completed_services || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `*${s}*`)
      .join(', ')
    const digits = req.customer_phone.replace(/\D/g, '')

    return [
      `Seu aparelho${req.phone_model ? ` *${req.phone_model}*` : ''} foi reparado com sucesso! 🎉`,
      services ? `Serviços realizados: ${services}` : null,
      `Orçamento no valor de: ${currency(order?.final_value ?? req.quote_value ?? 0)}`,
      `Garantia do serviço: ${order?.warranty || 'não informada'}`,
      `Ordem de serviço: ${order?.pdf_url || `${SITE_URL}/consultar?phone=${digits}`}`,
    ].filter(Boolean).join('\n')
  },

  cancelled(req) {
    return [
      `*${req.customer_name}*, sua solicitação para o *${req.phone_model}* foi cancelada.`,
      '',
      'Se mudar de ideia, pode nos chamar aqui a qualquer momento! 😊',
    ].join('\n')
  },
}
