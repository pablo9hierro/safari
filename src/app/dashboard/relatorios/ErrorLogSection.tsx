'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bug, Loader2, Check, AlertCircle } from 'lucide-react'

interface ErrorLogRow {
  id: string
  source: 'middleware' | 'api' | 'client' | 'webhook'
  level: 'error' | 'warn'
  message: string
  context: Record<string, unknown> | null
  route: string | null
  resolved: boolean
  created_at: string
}

const SOURCE_LABEL: Record<ErrorLogRow['source'], string> = {
  middleware: 'Middleware',
  api: 'API',
  client: 'Cliente',
  webhook: 'Webhook',
}

const FILTERS: { key: 'all' | ErrorLogRow['source']; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'middleware', label: 'Middleware' },
  { key: 'api', label: 'API' },
  { key: 'client', label: 'Cliente' },
  { key: 'webhook', label: 'Webhook' },
]

/** Módulo de rastreamento de erros -- erros reais e acionáveis capturados
 * por logError() em produção (middleware, rotas, webhooks), pra não
 * depender de rodar `vercel logs` manualmente toda vez que algo quebra. */
export default function ErrorLogSection() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ErrorLogRow[]>([])
  const [filter, setFilter] = useState<'all' | ErrorLogRow['source']>('all')
  const [showResolved, setShowResolved] = useState(false)

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('error_log').select('*').order('created_at', { ascending: false }).limit(100)
    setLogs((data as ErrorLogRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => logs.filter((l) => (filter === 'all' || l.source === filter) && (showResolved || !l.resolved)),
    [logs, filter, showResolved],
  )

  const markResolved = async (id: string) => {
    const supabase = createClient()
    await supabase.from('error_log').update({ resolved: true }).eq('id', id)
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, resolved: true } : l)))
  }

  return (
    <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-vr-silver/70 flex items-center gap-1.5">
        <Bug className="w-3.5 h-3.5" /> Erros
      </h2>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
                ${filter === f.key ? 'bg-vr-red text-white' : 'bg-vr-black border border-white/10 text-vr-silver/60 hover:border-vr-red/30'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowResolved((v) => !v)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
            ${showResolved ? 'bg-vr-red/20 text-vr-red' : 'bg-vr-black border border-white/10 text-vr-silver/60'}`}
        >
          {showResolved ? 'Ocultar resolvidos' : 'Mostrar resolvidos'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-vr-silver/40" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-vr-silver/40 text-center py-6">Nenhum erro registrado.</p>
      ) : (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto">
          {filtered.map((log) => (
            <li key={log.id} className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ${log.resolved ? 'bg-vr-black/50 opacity-50' : 'bg-vr-black'}`}>
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white break-words">{log.message}</p>
                  <p className="text-xs text-vr-silver/40">
                    {SOURCE_LABEL[log.source]}{log.route ? ` · ${log.route}` : ''} ·{' '}
                    {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              {!log.resolved && (
                <button onClick={() => markResolved(log.id)} className="shrink-0 text-vr-silver/40 hover:text-green-400 transition-colors p-1" title="Marcar como resolvido">
                  <Check className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
