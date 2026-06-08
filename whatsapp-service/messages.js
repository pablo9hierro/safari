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

  in_progress(req) {
    return [
      `🔧 *${req.customer_name}*, seu *${req.phone_model}* está em reparo!`,
      '',
      'Assim que concluirmos, entraremos em contato. ⏳',
    ].join('\n')
  },

  completed(req) {
    return [
      `✅ Conserto concluído, *${req.customer_name}*! 🎉`,
      '',
      `Seu *${req.phone_model}* está pronto e será entregue em breve.`,
      '',
      'Obrigado pela confiança! 😊',
    ].join('\n')
  },
}
