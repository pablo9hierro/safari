'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bot, Plus, Trash2, ArrowUp, ArrowDown, Loader2, AlertTriangle } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import type { AiModelConfigPublic, AiProvider } from '@/lib/assistant/modelConfigs'

const LABEL = 'block text-xs font-semibold text-vr-silver/60 mb-1.5 uppercase tracking-wider'
const INPUT = 'w-full px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors'

// Sugestões pesquisadas — todas com suporte real a tool/function calling
// confirmado na OpenRouter (ver relatório de custo entregue ao lojista).
const SUGGESTED_MODELS = [
  { model_id: 'google/gemini-2.5-flash', note: 'Gemini — mais caro, mas robusto em tool calling' },
  { model_id: 'deepseek/deepseek-v3.2', note: 'Custo-benefício intermediário' },
  { model_id: 'openai/gpt-5-nano', note: 'Mais barato — mesmo se a chave OpenAI direta acabar o crédito' },
]

function providerLabel(p: AiProvider) {
  return p === 'openai' ? 'OpenAI' : 'OpenRouter'
}

export default function AiModelsCard() {
  const [models, setModels] = useState<AiModelConfigPublic[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formModelId, setFormModelId] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/assistant/ai-models')
      if (!res.ok) throw new Error(await res.text())
      setModels(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar modelos.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    setError(null)
    if (!formModelId.trim() || !formApiKey.trim()) {
      setError('Preencha model_id e API key.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/assistant/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openrouter', model_id: formModelId.trim(), api_key: formApiKey.trim(), label: formLabel.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro ao criar.')
      setFormModelId(''); setFormApiKey(''); setFormLabel('')
      setDialogOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar modelo.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (m: AiModelConfigPublic) => {
    setBusyId(m.id)
    try {
      const res = await fetch(`/api/assistant/ai-models/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !m.enabled }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar.')
    } finally {
      setBusyId(null)
    }
  }

  const handleReorder = async (m: AiModelConfigPublic, direction: -1 | 1) => {
    if (!models) return
    const sorted = [...models].sort((a, b) => a.priority - b.priority)
    const idx = sorted.findIndex((x) => x.id === m.id)
    const swapWith = sorted[idx + direction]
    if (!swapWith) return
    setBusyId(m.id)
    try {
      await Promise.all([
        fetch(`/api/assistant/ai-models/${m.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: swapWith.priority }),
        }),
        fetch(`/api/assistant/ai-models/${swapWith.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: m.priority }),
        }),
      ])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reordenar.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (m: AiModelConfigPublic) => {
    setBusyId(m.id)
    try {
      const res = await fetch(`/api/assistant/ai-models/${m.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover.')
    } finally {
      setBusyId(null)
    }
  }

  const sorted = models ? [...models].sort((a, b) => a.priority - b.priority) : []

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Bot className="w-4 h-4 text-vr-red" /> Motores de IA (fallback)
        </h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-vr-red text-white px-3 py-2 rounded-xl hover:bg-vr-red/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Setar nova IA
        </button>
      </div>
      <p className="text-[11px] text-vr-silver/40">
        O primeiro da lista é o modelo ativo. Se a chamada falhar de vez (chave inválida, sem crédito), a
        próxima mensagem já tenta o próximo automaticamente — sem parar o atendimento.
      </p>

      {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}

      {!models ? (
        <p className="text-xs text-vr-silver/40">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((m, i) => (
            <div key={m.id} className="bg-vr-black border border-white/8 rounded-xl px-3 py-2.5 flex items-center gap-3">
              <span className="text-[10px] font-bold text-vr-silver/40 shrink-0 w-16">
                {i === 0 ? 'PADRÃO' : `FALLBACK ${i}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{m.label || m.model_id}</p>
                <p className="text-[11px] text-vr-silver/40 truncate">
                  {providerLabel(m.provider)} · {m.model_id} · {m.api_key_mask}
                  {m.last_failure_at && (
                    <span className="text-amber-400"> · última falha: {new Date(m.last_failure_at).toLocaleString('pt-BR')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button disabled={i === 0 || busyId === m.id} onClick={() => handleReorder(m, -1)} className="text-vr-silver/40 hover:text-white disabled:opacity-20 p-1">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button disabled={i === sorted.length - 1 || busyId === m.id} onClick={() => handleReorder(m, 1)} className="text-vr-silver/40 hover:text-white disabled:opacity-20 p-1">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <label className="flex items-center gap-1 text-[10px] text-vr-silver/50 px-1 cursor-pointer">
                  <input type="checkbox" checked={m.enabled} disabled={busyId === m.id} onChange={() => handleToggle(m)} className="w-3.5 h-3.5 accent-vr-red" />
                  ativo
                </label>
                <button disabled={busyId === m.id || sorted.length <= 1} onClick={() => handleDelete(m)} className="text-vr-silver/30 hover:text-red-400 disabled:opacity-20 p-1">
                  {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Setar nova IA (OpenRouter)">
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Modelo (id da OpenRouter)</label>
            <input
              value={formModelId}
              onChange={(e) => setFormModelId(e.target.value)}
              placeholder="google/gemini-2.5-flash"
              className={INPUT}
              list="suggested-models"
            />
            <datalist id="suggested-models">
              {SUGGESTED_MODELS.map((s) => <option key={s.model_id} value={s.model_id} />)}
            </datalist>
            <div className="mt-1.5 space-y-0.5">
              {SUGGESTED_MODELS.map((s) => (
                <button
                  key={s.model_id}
                  type="button"
                  onClick={() => setFormModelId(s.model_id)}
                  className="block text-[10px] text-vr-silver/40 hover:text-vr-red transition-colors"
                >
                  {s.model_id} — {s.note}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL}>Apelido (opcional)</label>
            <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="Fallback Gemini" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>API key da OpenRouter</label>
            <input type="password" value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} placeholder="sk-or-v1-..." className={INPUT} />
            <p className="text-[10px] text-vr-silver/35 mt-1">Gere em openrouter.ai/keys. Entra como o próximo fallback na fila.</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Salvando…' : 'Adicionar fallback'}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
