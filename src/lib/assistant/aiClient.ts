import type { AssistantConfig } from './types'
import { resolveOrderedModels, markModelUsed, markModelFailure, type AiModelConfig } from './modelConfigs'

export type ToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCallRecord = { tool: string; input: Record<string, unknown>; output: string }

type OAIMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string }
type OAIToolCall = { id: string; function: { name: string; arguments: string } }

const PROVIDER_ENDPOINT: Record<AiModelConfig['provider'], string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

class PermanentModelError extends Error {}
class TransientModelError extends Error {}

/**
 * Chave/cota/modelo indisponível de vez (troca de modelo automaticamente) vs
 * erro de rede/instabilidade pontual (NÃO troca — propaga pro turno atual,
 * mesmo comportamento de antes desta feature). Nunca desabilita um modelo
 * permanentemente no banco por um erro transitório — só registra pra
 * visibilidade (`last_failure_at`/`last_failure_reason`).
 */
function classifyAndThrow(status: number, bodyText: string): never {
  const permanentStatus = status === 401 || status === 403 || status === 404
  const quotaHint = /insufficient_quota|billing_hard_limit|exceeded.*quota|model_not_found/i.test(bodyText)
  if (permanentStatus || (status === 429 && quotaHint)) {
    throw new PermanentModelError(`HTTP ${status}: ${bodyText.slice(0, 300)}`)
  }
  throw new TransientModelError(`HTTP ${status}: ${bodyText.slice(0, 300)}`)
}

async function callProvider(model: AiModelConfig, body: Record<string, unknown>): Promise<unknown> {
  if (!model.api_key.trim()) throw new PermanentModelError('API key vazia para este modelo.')
  let res: Response
  try {
    res = await fetch(PROVIDER_ENDPOINT[model.provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.api_key}` },
      body: JSON.stringify({ ...body, model: model.model_id }),
    })
  } catch (e) {
    throw new TransientModelError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) {
    const text = await res.text()
    classifyAndThrow(res.status, text)
  }
  return res.json()
}

/**
 * Tenta os modelos habilitados em ordem de prioridade. Erro permanente no
 * modelo atual pula pro próximo NA MESMA chamada; erro transitório propaga
 * imediatamente (não itera a lista) — ver classifyAndThrow.
 */
async function withFallback<T>(fn: (model: AiModelConfig) => Promise<T>): Promise<T> {
  const models = await resolveOrderedModels()
  if (models.length === 0) throw new Error('Nenhum modelo de IA configurado.')

  let lastError: Error | null = null
  for (const model of models) {
    try {
      const result = await fn(model)
      await markModelUsed(model.id)
      return result
    } catch (e) {
      if (e instanceof TransientModelError) throw e
      const reason = e instanceof Error ? e.message : String(e)
      await markModelFailure(model.id, reason)
      lastError = e instanceof Error ? e : new Error(reason)
      continue
    }
  }
  throw new Error(`Todos os modelos de IA configurados falharam. Último erro: ${lastError?.message}`)
}

/** Single-turn completion, no tools — for the interpreter layer. */
export async function completeSimple(config: AssistantConfig, system: string, userMessage: string): Promise<string> {
  return withFallback(async (model) => {
    const body = {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 256,
      temperature: 0,
    }
    const data = (await callProvider(model, body)) as { choices: { message: { content: string } }[] }
    return data.choices[0]?.message?.content ?? ''
  })
}

/** Multi-turn completion with tool calling — for the validator/responder layer. */
export async function completeWithTools(
  config: AssistantConfig,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  tools: ToolDef[],
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>,
): Promise<{ reply: string; toolCalls: ToolCallRecord[] }> {
  const oaiTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  return withFallback(async (model) => {
    const allToolCalls: ToolCallRecord[] = []
    const messages: OAIMessage[] = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userMessage },
    ]

    let rounds = 0
    while (rounds < 5) {
      rounds++
      const body: Record<string, unknown> = {
        messages,
        max_tokens: config.max_response_chars ? Math.max(config.max_response_chars * 4, 512) : 1024,
        temperature: 0.3,
      }
      if (oaiTools.length > 0) body.tools = oaiTools

      const data = (await callProvider(model, body)) as {
        choices: { message: { content: string | null; tool_calls?: OAIToolCall[] }; finish_reason: string }[]
      }
      const choice = data.choices[0]
      const assistantMsg = choice.message

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        messages.push({ role: 'assistant', content: assistantMsg.content ?? '', tool_calls: assistantMsg.tool_calls } as unknown as OAIMessage)
        for (const tc of assistantMsg.tool_calls) {
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
          const output = await executeTool(tc.function.name, input)
          allToolCalls.push({ tool: tc.function.name, input, output })
          messages.push({ role: 'tool', content: output, tool_call_id: tc.id, name: tc.function.name })
        }
        continue
      }

      return { reply: assistantMsg.content ?? '', toolCalls: allToolCalls }
    }

    // Estourou o limite de rounds chamando tools sem nunca fechar com texto
    // (ex: ficou tentando a mesma ação repetidas vezes porque faltava uma
    // informação do cliente) -- em vez de devolver uma mensagem morta sem
    // explicação, força uma resposta final SEM tools: o modelo já tem todo
    // o resultado das tentativas no histórico e consegue resumir o que
    // descobriu ou pedir o que falta pro cliente.
    const finalBody: Record<string, unknown> = {
      messages: [...messages, { role: 'user', content: 'Responda ao cliente agora com base no que você já sabe, sem chamar mais ferramentas.' }],
      max_tokens: config.max_response_chars ? Math.max(config.max_response_chars * 4, 512) : 1024,
      temperature: 0.3,
    }
    const finalData = (await callProvider(model, finalBody)) as {
      choices: { message: { content: string | null } }[]
    }
    const finalReply = finalData.choices[0]?.message?.content?.trim()
    return {
      reply: finalReply || 'Desculpe, não consegui concluir agora -- pode repetir o que você precisa?',
      toolCalls: allToolCalls,
    }
  })
}
