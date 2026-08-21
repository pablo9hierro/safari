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

const SYSTEM_PROMPT = [
  'Você gera tags de busca (palavras-chave e frases-chave) pra um item de catálogo de uma loja de assistência técnica de celular.',
  'As tags servem pra um algoritmo de busca e uma assistente de IA encontrarem o item certo quando o cliente descreve um PROBLEMA ou necessidade, não só o nome do item.',
  'Gere de 8 a 14 tags em português, misturando: sinônimos, termos técnicos e informais, sintomas/problemas que o item resolve, e frases curtas de busca real (ex: "carregador que carrega rápido", "tela quebrada não liga a tela").',
  'Nunca invente característica que não esteja implícita no nome/descrição dado.',
  'Responda APENAS com um JSON array de strings, sem markdown, sem explicação. Ex: ["tag um","tag dois","frase de busca aqui"]',
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
      .slice(0, 16)
  } catch {
    return []
  }
}

export async function generateProductTags(name: string, description: string | null): Promise<string[]> {
  const userMessage = `Produto: ${name}${description ? `\nDescrição: ${description}` : ''}`
  const text = await completeSimple(DUMMY_CONFIG, SYSTEM_PROMPT, userMessage)
  return parseTags(text)
}

export async function generateServiceTags(
  modelName: string,
  repairType: string,
  description: string | null,
): Promise<string[]> {
  const userMessage = `Serviço: ${modelName} — ${repairType}${description ? `\nDescrição: ${description}` : ''}`
  const text = await completeSimple(DUMMY_CONFIG, SYSTEM_PROMPT, userMessage)
  return parseTags(text)
}
