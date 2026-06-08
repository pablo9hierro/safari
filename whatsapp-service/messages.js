const OWNER_PHONE = process.env.OWNER_PHONE || '5583987516699'

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
      `📍 *Endereço:* CEP ${req.address_cep}, Nº ${req.address_number}`,
      `🏠 *Ref:* ${req.address_reference}`,
      '',
      '👉 Acesse o dashboard para responder.',
    ].join('\n')
  },

  quoted(req) {
    return [
      `Olá *${req.customer_name}*! 👋`,
      '',
      `Seu orçamento para o *${req.phone_model}* ficou pronto!`,
      '',
      `💰 *Valor:* ${currency(req.quote_value)}`,
      '',
      'Responda *SIM* para aceitar ou *NÃO* para recusar. 😊',
    ].join('\n')
  },

  accepted(req) {
    const addr = [req.address_street, req.address_number, req.address_neighborhood, req.address_city]
      .filter(Boolean).join(', ') || `CEP ${req.address_cep}, Nº ${req.address_number}`
    return [
      `✅ Ótimo, *${req.customer_name}*! Orçamento aceito!`,
      '',
      'Vamos buscar seu celular em breve. 🚗',
      '',
      '📍 Para facilitar a coleta, *compartilhe sua localização* nesta conversa (clique no clipe 📎 → Localização → Sua localização atual).',
      '',
      `Endereço cadastrado: ${addr}`,
      `Ponto de ref: ${req.address_reference}`,
    ].join('\n')
  },

  rejected(req) {
    return [
      `Entendemos, *${req.customer_name}*. 😊`,
      '',
      'Se mudar de ideia ou precisar de outro serviço, pode nos chamar aqui a qualquer momento!',
    ].join('\n')
  },

  em_busca(req) {
    return [
      `🛵 *${req.customer_name}*, nosso motoboy está a caminho para buscar seu *${req.phone_model}*!`,
      '',
      'Por favor, esteja disponível para recebê-lo. 😊',
    ].join('\n')
  },

  in_progress(req) {
    return [
      `🔧 *${req.customer_name}*, seu *${req.phone_model}* chegou e está em reparo!`,
      '',
      'Assim que concluirmos, entraremos em contato. ⏳',
    ].join('\n')
  },

  em_entrega(req) {
    return [
      `📦 *${req.customer_name}*, seu *${req.phone_model}* foi consertado!`,
      '',
      'Nosso motoboy está a caminho para entregá-lo. 🛵',
      '',
      'Esteja disponível para receber! 😊',
    ].join('\n')
  },

  completed(req) {
    return [
      `✅ Entrega concluída, *${req.customer_name}*! 🎉`,
      '',
      `Seu *${req.phone_model}* foi entregue. Obrigado pela confiança!`,
      '',
      'Se precisar de qualquer coisa, estamos aqui. 😊',
    ].join('\n')
  },

  cancelled(req) {
    return [
      `*${req.customer_name}*, sua solicitação para o *${req.phone_model}* foi cancelada.`,
      '',
      'Se mudar de ideia, pode nos chamar aqui a qualquer momento! 😊',
    ].join('\n')
  },
}
