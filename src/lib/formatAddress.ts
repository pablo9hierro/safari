/**
 * Formato único de endereço em toda a UI: "$rua, $bairro, $numero" (número
 * só entra quando existe). Sem rua/bairro nenhum, cai pro CEP ou pro aviso
 * de endereço não informado -- nunca mistura formatos diferentes entre
 * telas (achado real: /consultar, o painel e o modal de detalhe cada um
 * montava o texto de um jeito). Não trata self_pickup -- cada tela já
 * decide essa frase com o POV certo (cliente vs. lojista), chame isto só
 * pro ramo "tem endereço de verdade".
 */
export function formatAddress(req: {
  address_street?: string | null
  address_neighborhood?: string | null
  address_number?: string | null
  address_cep?: string | null
}): string {
  const parts = [req.address_street, req.address_neighborhood, req.address_number].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (req.address_cep) return `CEP ${req.address_cep}`
  return 'Endereço não informado'
}
