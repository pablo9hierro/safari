import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AssistantConfig } from './types'

const mockModels = vi.fn()
const mockMarkUsed = vi.fn()
const mockMarkFailure = vi.fn()

vi.mock('./modelConfigs', () => ({
  resolveOrderedModels: () => mockModels(),
  markModelUsed: (...args: unknown[]) => mockMarkUsed(...args),
  markModelFailure: (...args: unknown[]) => mockMarkFailure(...args),
}))

// Import depois do mock, seguindo o padrão de hoisting do vi.mock.
const { completeSimple } = await import('./aiClient')

const CONFIG: AssistantConfig = {
  id: 'default', enabled: true, prompt_interpreter: '', prompt_validator: '',
  start_keywords: [], end_keywords: [], window_timeout_minutes: 30,
  message_batch_window_seconds: 8, min_response_chars: 40, max_response_chars: 300,
  ai_provider: 'openai', ai_model: 'gpt-4o-mini', api_key: null, updated_at: '',
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

const M1 = { id: 'm1', provider: 'openai' as const, model_id: 'gpt-4o-mini', api_key: 'sk-1', label: null, priority: 0, enabled: true, last_used_at: null, last_failure_at: null, last_failure_reason: null }
const M2 = { id: 'm2', provider: 'openrouter' as const, model_id: 'google/gemini-2.5-flash', api_key: 'sk-2', label: null, priority: 1, enabled: true, last_used_at: null, last_failure_at: null, last_failure_reason: null }

beforeEach(() => {
  vi.restoreAllMocks()
  mockMarkUsed.mockReset()
  mockMarkFailure.mockReset()
})

describe('fallback entre modelos de IA', () => {
  it('erro permanente (401) no primeiro modelo tenta o segundo automaticamente', async () => {
    mockModels.mockResolvedValue([M1, M2])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'invalid api key' } }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'ok do segundo modelo' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeSimple(CONFIG, 'system', 'oi')

    expect(result).toBe('ok do segundo modelo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockMarkFailure).toHaveBeenCalledWith('m1', expect.stringContaining('401'))
    expect(mockMarkUsed).toHaveBeenCalledWith('m2')
  })

  it('erro permanente por cota esgotada (429 + insufficient_quota) troca de modelo', async () => {
    mockModels.mockResolvedValue([M1, M2])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { code: 'insufficient_quota', message: 'You exceeded your quota' } }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'segundo modelo' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeSimple(CONFIG, 'system', 'oi')

    expect(result).toBe('segundo modelo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('erro transitório (500) NÃO troca de modelo — propaga na hora', async () => {
    mockModels.mockResolvedValue([M1, M2])
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(500, { error: 'internal server error' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeSimple(CONFIG, 'system', 'oi')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockMarkFailure).not.toHaveBeenCalled()
  })

  it('429 sem indicação de cota (rate limit de burst) é transitório — não troca de modelo', async () => {
    mockModels.mockResolvedValue([M1, M2])
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(429, { error: { message: 'rate limit exceeded, try again shortly' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeSimple(CONFIG, 'system', 'oi')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('quando todos os modelos falham permanentemente, propaga erro final', async () => {
    mockModels.mockResolvedValue([M1, M2])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'bad key' }))
      .mockResolvedValueOnce(jsonResponse(403, { error: 'forbidden' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeSimple(CONFIG, 'system', 'oi')).rejects.toThrow(/Todos os modelos/)
    expect(mockMarkFailure).toHaveBeenCalledTimes(2)
  })

  it('sem nenhum modelo configurado, recusa antes de tentar chamar a API', async () => {
    mockModels.mockResolvedValue([])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeSimple(CONFIG, 'system', 'oi')).rejects.toThrow(/Nenhum modelo/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
