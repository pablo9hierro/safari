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
    if (body.includes('"exists":false')) {
      throw new Error(`O número ${phone} não está registrado no WhatsApp.`)
    }
    throw new Error(`Evolution API: falha ao enviar mensagem (${res.status}) ${body}`)
  }

  return res.json()
}

// Pede pra Evolution API (re)iniciar a conexão da instância e gerar um QR code.
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

// Limpa a sessão Baileys da instância (equivalente ao botão "Logout" do Manager).
// Falha silenciosamente se a instância já estiver deslogada/sem sessão — isso é esperado.
export async function logoutInstance() {
  const { baseUrl, apiKey, instance } = getConfig()

  const res = await fetch(`${baseUrl}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: { apikey: apiKey },
  })

  if (!res.ok && res.status !== 404 && res.status !== 400) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao deslogar instância (${res.status}) ${body}`)
  }

  return res.status
}

// Apaga a instância inteira (credenciais Baileys salvas no Postgres incluídas).
// Usado quando logout não é suficiente — sessão corrompida que fica em loop
// tentando reconectar com credenciais inválidas (statusReason 401) sem nunca
// cair no fluxo de gerar QR novo.
export async function deleteInstance() {
  const { baseUrl, apiKey, instance } = getConfig()

  const res = await fetch(`${baseUrl}/instance/delete/${instance}`, {
    method: 'DELETE',
    headers: { apikey: apiKey },
  })

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao apagar instância (${res.status}) ${body}`)
  }

  return res.status
}

// Recria a instância do zero (sem credenciais antigas) com a integração Baileys.
export async function createInstance() {
  const { baseUrl, apiKey, instance } = getConfig()

  const res = await fetch(`${baseUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao criar instância (${res.status}) ${body}`)
  }

  return res.json()
}

// Reaplica a config de webhook na instância (recriar a instância apaga o webhook anterior).
export async function setInstanceWebhook(url: string, events: string[]) {
  const { baseUrl, apiKey, instance } = getConfig()

  const secret = process.env.EVOLUTION_WEBHOOK_SECRET
  const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        events,
        ...(secret ? { headers: { 'x-webhook-secret': secret } } : {}),
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API: falha ao configurar webhook (${res.status}) ${body}`)
  }

  return res.json()
}
