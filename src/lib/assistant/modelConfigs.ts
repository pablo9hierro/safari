import { createServiceClient } from '@/lib/supabase/service'

export type AiProvider = 'openai' | 'openrouter'

export type AiModelConfig = {
  id: string
  provider: AiProvider
  model_id: string
  api_key: string
  label: string | null
  priority: number
  enabled: boolean
  last_used_at: string | null
  last_failure_at: string | null
  last_failure_reason: string | null
}

/** Lista ordenada por prioridade, só os habilitados — a ordem de tentativa do fallback. */
export async function resolveOrderedModels(): Promise<AiModelConfig[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true })
  if (error) throw new Error(`Falha ao carregar modelos de IA: ${error.message}`)
  return (data ?? []) as AiModelConfig[]
}

export async function markModelUsed(id: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('ai_model_configs').update({ last_used_at: new Date().toISOString() }).eq('id', id)
}

export async function markModelFailure(id: string, reason: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('ai_model_configs')
    .update({ last_failure_at: new Date().toISOString(), last_failure_reason: reason })
    .eq('id', id)
}

function maskKey(key: string): string {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`
}

export type AiModelConfigPublic = Omit<AiModelConfig, 'api_key'> & { api_key_mask: string }

export function toPublic(m: AiModelConfig): AiModelConfigPublic {
  const { api_key, ...rest } = m
  return { ...rest, api_key_mask: maskKey(api_key) }
}

export async function listAllModels(): Promise<AiModelConfigPublic[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ai_model_configs').select('*').order('priority', { ascending: true })
  if (error) throw new Error(`Falha ao listar modelos de IA: ${error.message}`)
  return ((data ?? []) as AiModelConfig[]).map(toPublic)
}

export async function createModel(input: {
  provider: AiProvider
  model_id: string
  api_key: string
  label?: string | null
}): Promise<AiModelConfigPublic> {
  if (!input.model_id.trim()) throw new Error('model_id é obrigatório.')
  if (!input.api_key.trim()) throw new Error('api_key é obrigatória.')
  const supabase = createServiceClient()
  const { data: maxRow } = await supabase
    .from('ai_model_configs')
    .select('priority')
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPriority = (maxRow?.priority ?? -1) + 1
  const { data, error } = await supabase
    .from('ai_model_configs')
    .insert({
      provider: input.provider,
      model_id: input.model_id.trim(),
      api_key: input.api_key.trim(),
      label: input.label?.trim() || null,
      priority: nextPriority,
      enabled: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Falha ao criar modelo de IA: ${error.message}`)
  return toPublic(data as AiModelConfig)
}

export async function updateModel(
  id: string,
  patch: Partial<{ model_id: string; api_key: string; label: string | null; priority: number; enabled: boolean }>,
): Promise<AiModelConfigPublic> {
  const supabase = createServiceClient()
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  // api_key vazia/omitida = mantém a salva (nunca sobrescreve com string vazia).
  if (!patch.api_key?.trim()) delete update.api_key
  const { data, error } = await supabase.from('ai_model_configs').update(update).eq('id', id).select('*').single()
  if (error) throw new Error(`Falha ao atualizar modelo de IA: ${error.message}`)
  return toPublic(data as AiModelConfig)
}

export async function deleteModel(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { count } = await supabase.from('ai_model_configs').select('id', { count: 'exact', head: true })
  if ((count ?? 0) <= 1) throw new Error('Precisa manter pelo menos um modelo de IA configurado.')
  const { error } = await supabase.from('ai_model_configs').delete().eq('id', id)
  if (error) throw new Error(`Falha ao remover modelo de IA: ${error.message}`)
}
