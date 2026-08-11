import type { AssistantConfig } from './types'

export type ToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCallRecord = { tool: string; input: Record<string, unknown>; output: string }

type OAIMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string }
type OAIToolCall = { id: string; function: { name: string; arguments: string } }

function resolveApiKey(config: AssistantConfig): string {
  return (config.api_key ?? process.env.OPENAI_API_KEY ?? '').trim()
}

function resolveModel(config: AssistantConfig): string {
  return config.ai_model || 'gpt-4o-mini'
}

async function callOpenAI(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${text}`)
  }
  return res.json()
}

/** Single-turn completion, no tools — for the interpreter layer. */
export async function completeSimple(config: AssistantConfig, system: string, userMessage: string): Promise<string> {
  const apiKey = resolveApiKey(config)
  if (!apiKey) throw new Error('API key da IA não configurada')
  const body = {
    model: resolveModel(config),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 256,
    temperature: 0,
  }
  const data = await callOpenAI(apiKey, body) as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
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
  const apiKey = resolveApiKey(config)
  if (!apiKey) throw new Error('API key da IA não configurada')
  const model = resolveModel(config)
  const allToolCalls: ToolCallRecord[] = []

  const messages: OAIMessage[] = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const oaiTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  let rounds = 0
  while (rounds < 5) {
    rounds++
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: config.max_response_chars ? Math.max(config.max_response_chars * 4, 512) : 1024,
      temperature: 0.3,
    }
    if (oaiTools.length > 0) body.tools = oaiTools

    const data = await callOpenAI(apiKey, body) as {
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

  return { reply: 'Não consegui processar sua solicitação agora.', toolCalls: allToolCalls }
}
