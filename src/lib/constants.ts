// Endereço físico da loja -- só usado como FALLBACK se o lojista nunca
// preencheu shipping_settings.store_address em /dashboard/servicodeslocamento
// (ver fetchStoreAddressText em pipeline.ts, que é a fonte real).
export const STORE_ADDRESS = {
  street: 'Rua Aposentado Cláudio de Santana, 37',
  neighborhood: 'Água Fria',
  city: 'João Pessoa - PB',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rua+Aposentado+Cl%C3%A1udio+de+Santana+37+%C3%81gua+Fria+Jo%C3%A3o+Pessoa',
}

export const SITE_URL = 'https://vrtech-jp.vercel.app'

// Domínio público real da loja, sob o proxy da plataforma -- links
// mandados pro CLIENTE (mensagem do assistente, notificação de WhatsApp)
// precisam disso, nunca do vrtech-jp.vercel.app cru (esse é só o backend
// por trás do proxy; o cliente nunca deveria ver essa URL). Mapeamento
// (ver ufersin/frontend/vercel.json): /loja/eletronica-loja/catalogo/:id
// -> vrtech-jp.vercel.app/loja/:id, /loja/eletronica-loja/consultar ->
// vrtech-jp.vercel.app/consultar, /loja/eletronica-loja/servicos ->
// vrtech-jp.vercel.app/catalogo-servico.
export const PUBLIC_STORE_BASE = 'https://resolutoo.com/loja/eletronica-loja'
export const PUBLIC_PRODUCT_URL = (id: string) => `${PUBLIC_STORE_BASE}/catalogo/${id}`
export const PUBLIC_CONSULTAR_URL = (phone: string) => `${PUBLIC_STORE_BASE}/consultar?phone=${phone}`
export const PUBLIC_SERVICOS_URL = `${PUBLIC_STORE_BASE}/servicos`

export const PAYMENT_METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de débito',
  'Cartão de crédito',
  'Transferência',
] as const

export const SERVICE_ORDER_COMPONENTS = [
  'Touch',
  'Display/Tela',
  'Carcaça',
  'Botões',
  'Sinal/Rede',
  'Alto-falante',
  'Sensores',
  'Microfone',
  'Conector de carga',
  'Bateria',
  'Face ID / Digital',
  'Vibração',
  'Câmeras',
  'Flash',
  'Wi-Fi / Bluetooth',
  'Outro',
] as const
