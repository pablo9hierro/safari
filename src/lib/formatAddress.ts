type AddressLike = {
  address_street?: string | null
  address_neighborhood?: string | null
  address_number?: string | null
  address_cep?: string | null
}

type AddressWithLatLng = AddressLike & {
  address_lat?: number | null
  address_lng?: number | null
}

/** Link do Google Maps pra um ponto exato (lat/lng) -- mesmo formato usado
 * pro endereço da loja em PickupOnlyNotice/ServicoDeslocamentoClient, agora
 * reaproveitado pra qualquer lat/lng de cliente também. */
export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/**
 * Formato único de endereço em toda a UI: "$rua, $bairro, $numero" (número
 * só entra quando existe). Sem rua/bairro nenhum, cai pro CEP ou pro aviso
 * de endereço não informado -- nunca mistura formatos diferentes entre
 * telas (achado real: /consultar, o painel e o modal de detalhe cada um
 * montava o texto de um jeito). Não trata self_pickup -- cada tela já
 * decide essa frase com o POV certo (cliente vs. lojista), chame isto só
 * pro ramo "tem endereço de verdade". Puro texto -- pra tela com link
 * clicável de verdade, monte o <a> à parte com googleMapsLink; pra
 * WhatsApp/texto puro, use formatAddressWithMapLink abaixo.
 */
export function formatAddress(req: AddressLike): string {
  const parts = [req.address_street, req.address_neighborhood, req.address_number].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (req.address_cep) return `CEP ${req.address_cep}`
  return 'Endereço não informado'
}

/**
 * Mesmo texto de formatAddress, mas com o link do Google Maps pro ponto
 * exato (lat/lng) anexado quando existe -- pra mensagem de WhatsApp/texto
 * puro (o link vem sozinho numa linha, o próprio WhatsApp linkifica).
 * Endereço em texto (rua/bairro/número) pode ser aproximado ou mal
 * digitado na hora do reverse-geocode; o pin de verdade é a garantia real
 * de "é este o lugar exato" (achado real: cliente reclamou que só o texto
 * do endereço não bastava pro entregador achar o local certo).
 */
export function formatAddressWithMapLink(req: AddressWithLatLng): string {
  const base = formatAddress(req)
  if (req.address_lat != null && req.address_lng != null) {
    return `${base}\n📍 ${googleMapsLink(req.address_lat, req.address_lng)}`
  }
  return base
}
