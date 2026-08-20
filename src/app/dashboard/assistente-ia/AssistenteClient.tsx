'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Bot, Save, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Upload, FileText, Trash2, Loader2 } from 'lucide-react'
import type { AssistantConfig } from '@/lib/assistant/types'
import AgendaSettingsCard from './AgendaSettingsCard'
import { apiPath } from '@/lib/storeProxyLink'

const LABEL = 'block text-xs font-semibold text-vr-silver/60 mb-1.5 uppercase tracking-wider'
const INPUT = 'w-full px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors'
const TEXTAREA = `${INPUT} resize-none leading-relaxed`

export default function AssistenteClient({ initialConfig }: { initialConfig: AssistantConfig }) {
  const [cfg, setCfg] = useState<AssistantConfig>(initialConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLayer1, setShowLayer1] = useState(true)
  const [showLayer2, setShowLayer2] = useState(true)

  const set = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(apiPath('/api/assistant/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cfg,
          start_keywords: Array.isArray(cfg.start_keywords)
            ? cfg.start_keywords
            : String(cfg.start_keywords).split(',').map((s) => s.trim()).filter(Boolean),
          end_keywords: Array.isArray(cfg.end_keywords)
            ? cfg.end_keywords
            : String(cfg.end_keywords).split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setCfg(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const startKwStr = Array.isArray(cfg.start_keywords) ? cfg.start_keywords.join(', ') : String(cfg.start_keywords)
  const endKwStr = Array.isArray(cfg.end_keywords) ? cfg.end_keywords.join(', ') : String(cfg.end_keywords)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Bot className="w-5 h-5 text-vr-red" />
        Assistente IA (BETA)
      </h1>
      <p className="text-xs text-vr-silver/50 -mt-4">
        Responde clientes automaticamente no WhatsApp usando 2 camadas de IA (interpretação de intenção + resposta com dados reais do catálogo). Desativado por padrão até você configurar e testar.
      </p>

      {/* Toggle ativar */}
      <div className={`rounded-2xl border p-4 transition-colors ${cfg.enabled ? 'bg-vr-red/8 border-vr-red/25' : 'bg-vr-graphite border-white/5'}`}>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => set('enabled', !cfg.enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${cfg.enabled ? 'bg-vr-red' : 'bg-white/15'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${cfg.enabled ? 'translate-x-5' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Ativar Assistente IA</p>
            <p className="text-xs text-vr-silver/50">
              {cfg.enabled
                ? 'Ativo — respondendo clientes no WhatsApp automaticamente.'
                : 'Quando desativado, mensagens chegam normalmente mas a resposta automática fica suspensa.'}
            </p>
          </div>
        </label>
      </div>

      {/* Prompt Layer 1 */}
      <div className="bg-vr-graphite rounded-2xl border border-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLayer1((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-white">Prompt da 1ª camada (interpretação de intenção)</span>
          {showLayer1 ? <ChevronUp className="w-4 h-4 text-vr-silver/40" /> : <ChevronDown className="w-4 h-4 text-vr-silver/40" />}
        </button>
        {showLayer1 && (
          <div className="px-4 pb-4">
            <textarea
              rows={8}
              value={cfg.prompt_interpreter}
              onChange={(e) => set('prompt_interpreter', e.target.value)}
              className={TEXTAREA}
              placeholder="Descreva ao modelo como identificar a intenção do cliente..."
            />
          </div>
        )}
      </div>

      {/* Prompt Layer 2 */}
      <div className="bg-vr-graphite rounded-2xl border border-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLayer2((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-white">Prompt da 2ª camada (atendimento, ferramentas e resposta final)</span>
          {showLayer2 ? <ChevronUp className="w-4 h-4 text-vr-silver/40" /> : <ChevronDown className="w-4 h-4 text-vr-silver/40" />}
        </button>
        {showLayer2 && (
          <div className="px-4 pb-4">
            <textarea
              rows={10}
              value={cfg.prompt_validator}
              onChange={(e) => set('prompt_validator', e.target.value)}
              className={TEXTAREA}
              placeholder="Descreva o tom de voz, contexto do negócio e regras específicas..."
            />
          </div>
        )}
      </div>

      {/* Keywords + timeout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Gatilhos de início (separados por vírgula)</label>
          <input
            value={startKwStr}
            onChange={(e) => set('start_keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            className={INPUT}
            placeholder="oi, olá, atendimento, quero comprar"
          />
        </div>
        <div>
          <label className={LABEL}>Gatilhos de encerramento</label>
          <input
            value={endKwStr}
            onChange={(e) => set('end_keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            className={INPUT}
            placeholder="tchau, encerrar"
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>Encerrar janela após quantos minutos sem mensagem</label>
        <input
          type="number"
          min={1}
          value={cfg.window_timeout_minutes}
          onChange={(e) => set('window_timeout_minutes', Number(e.target.value))}
          className={`${INPUT} w-32`}
        />
      </div>

      <AgendaSettingsCard />

      {/* Tuning de resposta */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>Agrupar mensagens em sequência (seg)</label>
          <input
            type="number"
            min={0}
            value={cfg.message_batch_window_seconds}
            onChange={(e) => set('message_batch_window_seconds', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-[10px] text-vr-silver/35 mt-1">Se o cliente mandar várias mensagens seguidas, a IA espera esse tempo antes de responder, junta tudo numa interpretação só.</p>
        </div>
        <div>
          <label className={LABEL}>Tamanho mínimo da resposta (chars)</label>
          <input
            type="number"
            min={20}
            value={cfg.min_response_chars}
            onChange={(e) => set('min_response_chars', Number(e.target.value))}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Tamanho máximo da resposta (chars)</label>
          <input
            type="number"
            min={40}
            value={cfg.max_response_chars}
            onChange={(e) => set('max_response_chars', Number(e.target.value))}
            className={INPUT}
          />
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Configuração salva com sucesso!
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Salvando...' : 'Salvar configuração'}
      </button>

      <RagSection />
    </div>
  )
}

type RagDoc = { id: string; filename: string; char_count: number; created_at: string }

function RagSection() {
  const [docs, setDocs] = useState<RagDoc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    const res = await fetch(apiPath('/api/assistant/rag'))
    if (res.ok) setDocs(await res.json())
    setLoaded(true)
  }, [])

  // load on first render
  useEffect(() => { loadDocs() }, [loadDocs])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    const allowed = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', '']
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(apiPath('/api/assistant/rag'), { method: 'POST', body: form })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? `Erro ao enviar ${file.name}`)
      }
    }
    setUploading(false)
    loadDocs()
  }

  const remove = async (id: string) => {
    await fetch(apiPath(`/api/assistant/rag?id=${id}`), { method: 'DELETE' })
    setDocs((d) => d.filter((x) => x.id !== id))
  }

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">BASE DE CONHECIMENTO (RAG)</h2>
      <p className="text-xs text-vr-silver/50">
        Envie PDFs, TXT, DOCX ou exportações de conversa do WhatsApp — o assistente consulta esse material antes de responder.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/8 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-vr-red/50 bg-vr-red/5' : 'border-white/10 hover:border-white/20'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-vr-silver/50 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> Processando arquivo...
          </div>
        ) : (
          <>
            <Upload className="w-5 h-5 text-vr-silver/30 mx-auto mb-1.5" />
            <p className="text-xs text-vr-silver/50">Arraste ou clique para enviar</p>
            <p className="text-[10px] text-vr-silver/30 mt-0.5">TXT, PDF, DOCX — incluindo exportação de conversa WhatsApp</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.pdf,.docx,.csv"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {loaded && docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 bg-vr-black/40 rounded-xl px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-vr-red shrink-0" />
              <span className="text-xs text-white truncate flex-1">{doc.filename}</span>
              <span className="text-[10px] text-vr-silver/40 shrink-0">{(doc.char_count / 1000).toFixed(1)}k chars</span>
              <button
                onClick={() => remove(doc.id)}
                className="text-vr-silver/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {loaded && docs.length === 0 && (
        <p className="text-xs text-vr-silver/30 text-center py-1">Nenhum documento carregado ainda.</p>
      )}
    </div>
  )
}
