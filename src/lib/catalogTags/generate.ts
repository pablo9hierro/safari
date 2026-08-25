import { completeSimple } from '@/lib/assistant/aiClient'
import type { AssistantConfig } from '@/lib/assistant/types'

// completeSimple recebe um AssistantConfig só por assinatura histórica —
// internamente ele nunca lê nenhum campo (o modelo/chave vêm do ranking
// global do superadmin, ver aiClient.ts/modelConfigs.ts). Stub vazio evita
// ter que buscar a config de verdade só pra gerar tags.
const DUMMY_CONFIG: AssistantConfig = {
  id: 'tags', enabled: true, prompt_interpreter: '', prompt_validator: '',
  start_keywords: [], end_keywords: [], window_timeout_minutes: 30,
  message_batch_window_seconds: 8, min_response_chars: 0, max_response_chars: 0,
  ai_provider: '', ai_model: '', api_key: null, updated_at: '',
}

// Dobrado (8-14 -> 16-28, teto 16 -> 32) a pedido explícito do lojista:
// mais superfície de busca pra IA do WhatsApp achar o item certo E mais
// frases-chave de cauda longa pra SEO (rankeamento no Google) na página
// pública. Pede EXPLICITAMENTE pra pensar como alguém pesquisando no
// Google, não só como sinônimo de nome de produto/serviço -- sem isso o
// modelo tende a gerar variação de palavra em vez de frase de busca real.
const SYSTEM_PROMPT = [
  'Você gera tags de busca (palavras-chave e frases-chave) pra um item de catálogo de uma loja de assistência técnica de celular.',
  'As tags servem pra TRÊS coisas ao mesmo tempo: (1) um algoritmo de busca interno achar o item certo quando o cliente descreve um PROBLEMA ou necessidade, não só o nome; (2) uma assistente de IA no WhatsApp sugerir esse produto/serviço certo numa conversa; (3) SEO -- ajudar a página pública desse item a aparecer bem no Google quando alguém pesquisa por algo relacionado.',
  'Pra cumprir o objetivo (3), pense como um cliente de verdade digitando no Google -- gere várias frases de cauda longa realistas (4 a 8 palavras), não só palavras soltas. Ex: "tela quebrada iphone 13 conserto", "onde trocar bateria samsung perto de mim", "carregador rápido tipo c original".',
  'Se o item tiver aparelho/marca/modelo compatível informado, use isso pra gerar frases de compatibilidade específicas (ex: "capinha iphone 14 pro max", "bateria samsung a54"), além de uma versão mais genérica sem o modelo.',
  'Gere de 16 a 28 tags em português, misturando: sinônimos, termos técnicos e informais, sintomas/problemas que o item resolve, frases de busca real curtas E frases de cauda longa (as de SEO, mais compridas).',
  'Nunca invente característica que não esteja implícita no nome/descrição/compatibilidade dados.',
  'Responda APENAS com um JSON array de strings, sem markdown, sem explicação. Ex: ["tag um","tag dois","frase de busca de cauda longa aqui"]',
].join('\n')

function parseTags(text: string): string[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 32)
  } catch {
    return []
  }
}

/** aparelho/marca/modelo compatíveis, quando existem -- grounding real pra
 * IA gerar frase de compatibilidade específica em vez de só inventar. */
function compatLine(compat?: { devices?: string[]; brands?: string[]; models?: string[] }): string {
  if (!compat) return ''
  const parts: string[] = []
  if (compat.devices?.length) parts.push(`Aparelho(s): ${compat.devices.join(', ')}`)
  if (compat.brands?.length) parts.push(`Marca(s): ${compat.brands.join(', ')}`)
  if (compat.models?.length) parts.push(`Modelo(s): ${compat.models.join(', ')}`)
  return parts.length > 0 ? `\nCompatibilidade: ${parts.join(' | ')}` : ''
}

export type CompatContext = { devices?: string[]; brands?: string[]; models?: string[] }

export async function generateProductTags(
  name: string,
  description: string | null,
  compat?: CompatContext,
): Promise<string[]> {
  const userMessage = `Produto: ${name}${description ? `\nDescrição: ${description}` : ''}${compatLine(compat)}`
  const text = await completeSimple(DUMMY_CONFIG, SYSTEM_PROMPT, userMessage)
  return parseTags(text)
}

export async function generateServiceTags(
  modelName: string,
  repairType: string,
  description: string | null,
  compat?: CompatContext,
): Promise<string[]> {
  const userMessage = `Serviço: ${modelName} — ${repairType}${description ? `\nDescrição: ${description}` : ''}${compatLine(compat)}`
  const text = await completeSimple(DUMMY_CONFIG, SYSTEM_PROMPT, userMessage)
  return parseTags(text)
}
