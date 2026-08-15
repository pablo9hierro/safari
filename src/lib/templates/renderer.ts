/**
 * Renderer de templates de WhatsApp.
 *
 * Uma única implementação alimenta o preview da tela e a mensagem realmente
 * enviada — se fossem duas, o lojista veria uma coisa e o cliente receberia
 * outra.
 *
 *   Template ──► renderTemplate ──► Preview
 *   Template ──► renderTemplate ──► Mensagem real
 */

/** Variáveis usam `/nome`. Letras, números e `_` fazem parte do nome. */
const VARIABLE_RE = /\/([a-z_][a-z0-9_]*)/gi

export type TemplateVars = Record<string, string | number | null | undefined>

/** Todas as variáveis citadas no texto, em ordem de aparição e sem repetir. */
export function extractVariables(content: string): string[] {
  const found = content.match(VARIABLE_RE) ?? []
  return [...new Set(found.map((v) => v.toLowerCase()))]
}

/**
 * Substitui as variáveis pelos valores informados.
 *
 * Variável sem valor é apagada em vez de aparecer crua: o cliente receber
 * "Olá, /nome!" seria pior do que receber "Olá!". Os espaços/linhas que
 * sobram são compactados para o texto não ficar esburacado.
 */
export function renderTemplate(content: string, vars: TemplateVars): string {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) {
    const key = (k.startsWith('/') ? k.slice(1) : k).toLowerCase()
    normalized[key] = v === null || v === undefined ? '' : String(v)
  }

  return content
    .replace(VARIABLE_RE, (_match, name: string) => normalized[String(name).toLowerCase()] ?? '')
    // Sobras de variável vazia: espaço duplicado e linha que ficou só com pontuação.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]*[:—-][ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Variáveis obrigatórias ausentes no texto. Vazio = template válido. */
export function missingRequiredVariables(
  content: string,
  required: string[],
): string[] {
  const present = new Set(extractVariables(content))
  return required
    .map((r) => (r.startsWith('/') ? r : `/${r}`).toLowerCase())
    .filter((r) => !present.has(r))
}

/**
 * Valores de demonstração do preview. Ficam aqui (e não na tela) para o
 * preview ser sempre coerente, venha de onde vier.
 */
export const PREVIEW_VARS: TemplateVars = {
  nome: 'João',
  telefone: '(83) 98888-7777',
  aparelho: 'iPhone 13',
  problema: 'Tela trincada',
  pedido: '4821',
  valor: 'R$ 89,90',
  servico: 'iPhone 13 — Troca de tela',
  servicos: 'Troca de tela, Limpeza interna',
  garantia: '90 dias',
  data_hora: '15/08 às 14:00',
  horario_anterior: '15/08 às 10:00',
  motivo: 'O técnico responsável ficará indisponível no horário agendado.',
  endereco: 'Rua João Suassuna, Centro, Campina Grande - PB',
  mapa: 'https://maps.google.com/?q=VR+Tech',
  link_os: 'https://vrtech.com.br/os/4821.pdf',
  link_acompanhamento: 'https://vrtech.com.br/consultar?phone=83988887777',
  link_pagamento: '00020126580014BR.GOV.BCB.PIX0136f4e2...5204000053039865802BR',
}

/** Preview de um template, com os valores de demonstração. */
export function previewTemplate(content: string): string {
  return renderTemplate(content, PREVIEW_VARS)
}
