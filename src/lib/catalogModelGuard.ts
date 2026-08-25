// "Modelo" (catalog_models) é nome de APARELHO (ex: "iPhone 12", "Galaxy
// A54"), nunca descrição de serviço (ex: "Troca de Tela iPhone 12"). Achado
// real (VRTECH-BUG-009): uma migration antiga promoveu ~20 descrições de
// serviço pro cadastro mestre de modelo sem validar nada, porque o campo
// "Modelo" era texto livre antes do multi-select por busca existir --
// contaminação que só ficou visível quando o cadastro de produto passou a
// listar esse mesmo cadastro mestre numa busca de verdade.
//
// Mesmo regex espelhado como CHECK constraint no banco (ver migration
// 20260825000002) -- este arquivo é só a primeira linha de defesa (erro
// amigável na hora de criar), não a única.
const SERVICE_PHRASE_RE =
  /^(troca|reparo|conserto|manuten[cç][aã]o|formata[cç][aã]o|avalia[cç][aã]o|compra|entrega|instala[cç][aã]o|atualiza[cç][aã]o|backup|diagn[oó]stico|limpeza|revis[aã]o|or[cç]amento)(\s|$)/i

export function isLikelyServicePhrase(name: string): boolean {
  return SERVICE_PHRASE_RE.test(name.trim())
}

export const SERVICE_PHRASE_ERROR =
  'Isso parece descrição de serviço, não nome de modelo de aparelho (ex: "iPhone 12", "Galaxy A54") — cadastre o modelo separadamente do serviço.'
