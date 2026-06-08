require('dotenv').config()
const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode')
const { createClient } = require('@supabase/supabase-js')
const msg = require('./messages')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const wClient = new Client({
  authStrategy: new LocalAuth({ dataPath: './wwa_session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  },
})

async function setState(status, qrCode = null) {
  await supabase.from('whatsapp_state').upsert(
    { id: 1, status, qr_code: qrCode, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
}

wClient.on('qr', async (qr) => {
  console.log('QR gerado — escaneie no dashboard')
  const img = await qrcode.toDataURL(qr)
  await setState('connecting', img)
})

wClient.on('loading_screen', (pct) => {
  console.log(`Carregando WhatsApp: ${pct}%`)
})

wClient.on('authenticated', () => console.log('Autenticado!'))

wClient.on('ready', async () => {
  console.log('✅ WhatsApp conectado!')
  await setState('connected')
  startListening()
})

wClient.on('disconnected', async (reason) => {
  console.log('Desconectado:', reason)
  await setState('disconnected')
  setTimeout(() => wClient.initialize(), 5000)
})

wClient.on('auth_failure', async () => {
  console.log('Falha de autenticação')
  await setState('disconnected')
})

function startListening() {
  console.log('Ouvindo mudanças no Supabase...')

  supabase
    .channel('wwa_inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'service_requests' },
      async ({ new: req }) => {
        try {
          await wClient.sendMessage(msg.fmt(msg.OWNER_PHONE), msg.newRequest(req))
          console.log(`Nova solicitação notificada ao dono — cliente: ${req.customer_name}`)
        } catch (e) {
          console.error('Erro ao notificar dono:', e.message)
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'service_requests' },
      async ({ new: req, old: prev }) => {
        if (req.status === prev.status) return
        const fn = msg[req.status]
        if (!fn) return
        try {
          await wClient.sendMessage(msg.fmt(req.customer_phone), fn(req))
          console.log(`Mensagem '${req.status}' enviada para ${req.customer_phone}`)
        } catch (e) {
          console.error('Erro ao enviar mensagem:', e.message)
        }
      }
    )
    .subscribe((status) => console.log('Canal Supabase:', status))
}

console.log('🚀 TechFix WhatsApp Service iniciando...')
wClient.initialize()
