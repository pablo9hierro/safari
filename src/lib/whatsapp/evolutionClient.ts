function getConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE
  if (!baseUrl || !apiKey || !instance) {
    throw new Error('Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE)')
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, instance }
}

function toEvolutionNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

export async function sendWhatsAppText(phone: string, text: string) {
  const { baseUrl, apiKey, instance } = getConfig()
  const number = toEvolutionNumber(phone)

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number, text }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao enviar mensagem (${res.status}) ${body}`)
  }

  return res.json()
}

// Pede pra Evolution API (re)iniciar a conexão da instância e gerar um QR code.
// Chamado automaticamente pelo painel quando detecta status "disconnected" — sem ação manual no Manager.
export async function connectInstance() {
  const { baseUrl, apiKey, instance } = getConfig()

  const res = await fetch(`${baseUrl}/instance/connect/${instance}`, {
    headers: { apikey: apiKey },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao conectar instância (${res.status}) ${body}`)
  }

  return res.json()
}
