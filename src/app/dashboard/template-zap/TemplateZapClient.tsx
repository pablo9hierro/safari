'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Loader2, AlertCircle, Check, Lock, Smartphone } from 'lucide-react'
import AccordionSection from '@/components/dashboard/AccordionSection'

type Template = {
  id: string
  template_key: string
  section: string
  label: string
  description: string | null
  content: string
  required_variables: string[]
  available_variables: string[]
  editable: boolean
  sort_order: number
}

const TEXTAREA =
  'w-full min-h-32 px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors resize-y font-mono leading-relaxed'

/**
 * Substitui as variáveis pelo mock de demonstração — mesma lógica de
 * src/lib/templates/renderer.ts, reimplementada aqui em cliente pra não
 * puxar código de servidor (createServiceClient) pro bundle do navegador.
 * A fonte da verdade continua sendo o renderer do backend: é ele quem
 * processa o envio real.
 */
const PREVIEW_VARS: Record<string, string> = {
  nome: 'João', telefone: '(83) 98888-7777', aparelho: 'iPhone 13', problema: 'Tela trincada',
  pedido: '4821', valor: 'R$ 89,90', servico: 'iPhone 13 — Troca de tela',
  servicos: 'Troca de tela, Limpeza interna', garantia: '90 dias',
  data_hora: '15/08 às 14:00', horario_anterior: '15/08 às 10:00',
  motivo: 'O técnico responsável ficará indisponível no horário agendado.',
  endereco: 'Rua João Suassuna, Centro, Campina Grande - PB',
  mapa: 'https://maps.google.com/?q=VR+Tech',
  link_os: 'https://vrtech.com.br/os/4821.pdf',
  link_acompanhamento: 'https://vrtech.com.br/consultar?phone=83988887777',
  link_pagamento: '00020126580014BR.GOV.BCB.PIX0136f4e2...5204000053039865802BR',
}

function localPreview(content: string): string {
  return content
    .replace(/\/([a-z_][a-z0-9_]*)/gi, (m, name: string) => {
      const v = PREVIEW_VARS[name.toLowerCase()]
      return v ?? m
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function missingVars(content: string, required: string[]): string[] {
  const present = new Set(
    (content.match(/\/([a-z_][a-z0-9_]*)/gi) ?? []).map((v) => v.toLowerCase()),
  )
  return required.filter((r) => !present.has((r.startsWith('/') ? r : `/${r}`).toLowerCase()))
}

function WhatsAppBubble({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-[#0b141a] p-3">
      <div className="rounded-lg rounded-tl-none bg-[#005c4b] px-3 py-2 text-sm text-white whitespace-pre-wrap break-words max-w-full">
        {text || <span className="text-white/40 italic">Mensagem vazia</span>}
      </div>
    </div>
  )
}

function VariablesHint({ tpl }: { tpl: Template; content: string }) {
  return (
    <div className="space-y-1.5 text-xs">
      {tpl.required_variables.length > 0 && (
        <p>
          <span className="text-vr-silver/50">Variáveis obrigatórias: </span>
          {tpl.required_variables.map((v) => (
            <code key={v} className="text-vr-red bg-vr-red/10 px-1.5 py-0.5 rounded mr-1">{v}</code>
          ))}
        </p>
      )}
      {tpl.available_variables.length > 0 && (
        <p>
          <span className="text-vr-silver/50">Disponíveis: </span>
          {tpl.available_variables.map((v) => (
            <code key={v} className="text-vr-silver/70 bg-white/5 px-1.5 py-0.5 rounded mr-1">{v}</code>
          ))}
        </p>
      )}
    </div>
  )
}

function EditableTemplateCard({ tpl, onSaved }: { tpl: Template; onSaved: (t: Template) => void }) {
  const [content, setContent] = useState(tpl.content)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = content !== tpl.content

  const missing = useMemo(() => missingVars(content, tpl.required_variables), [content, tpl.required_variables])
  const preview = useMemo(() => localPreview(content), [content])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/templates/${tpl.template_key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao salvar.')
      onSaved(json)
      setSaved(true); setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-vr-black/40 border border-white/5 rounded-xl p-3.5 space-y-3">
      <div>
        <p className="text-sm font-medium text-white">{tpl.label}</p>
        {tpl.description && <p className="text-xs text-vr-silver/50 mt-0.5">{tpl.description}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-vr-silver/50 uppercase tracking-wider mb-1.5">
            Editor
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={TEXTAREA}
            rows={6}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-vr-silver/50 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Smartphone className="w-3 h-3" /> Preview
          </label>
          <WhatsAppBubble text={preview} />
        </div>
      </div>

      <VariablesHint tpl={tpl} content={content} />

      {missing.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Faltam as variáveis obrigatórias: {missing.join(', ')}
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !dirty || missing.length > 0}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors
            ${saved ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40 disabled:cursor-not-allowed'}`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saved ? 'Salvo!' : dirty ? 'Salvar alterações' : 'Salvo'}
        </button>
        {dirty && !saved && <span className="text-xs text-yellow-400/80">Alterações não salvas</span>}
      </div>
    </div>
  )
}

function ProtectedTemplateCard({ tpl }: { tpl: Template }) {
  const preview = useMemo(() => localPreview(tpl.content), [tpl.content])
  return (
    <div className="bg-vr-black/40 border border-yellow-500/20 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <p className="text-sm font-medium text-white">{tpl.label}</p>
      </div>
      <p className="text-xs text-yellow-400/80">
        Mensagem automática gerada pelo sistema de pagamento — não editável. Alterá-la quebraria a cobrança.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-vr-silver/50 uppercase tracking-wider mb-1.5">
            Conteúdo (somente leitura)
          </label>
          <textarea value={tpl.content} readOnly className={`${TEXTAREA} opacity-60 cursor-not-allowed`} rows={3} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-vr-silver/50 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Smartphone className="w-3 h-3" /> Preview
          </label>
          <WhatsAppBubble text={preview} />
        </div>
      </div>
      <VariablesHint tpl={tpl} content={tpl.content} />
    </div>
  )
}

export default function TemplateZapClient() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then(async (r) => {
        if (r.status === 401) { window.location.href = '/login'; return null }
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Falha ao carregar templates.')
        return j
      })
      .then((j) => { if (j) setTemplates(j) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar templates.'))
  }, [])

  const bySection = useMemo(() => {
    const map = new Map<string, Template[]>()
    for (const t of templates ?? []) {
      if (!map.has(t.section)) map.set(t.section, [])
      map.get(t.section)!.push(t)
    }
    return map
  }, [templates])

  const updateOne = (updated: Template) => {
    setTemplates((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-vr-red" />
          Template Zap
        </h1>
        <p className="text-sm text-vr-silver/50 mt-0.5">
          Textos das mensagens automáticas enviadas ao cliente pelo WhatsApp — pedido, status do
          atendimento, entrega, agendamento e pagamento. Isto não é a Assistente IA: são as mensagens
          fixas disparadas por eventos do sistema.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!templates ? (
        <div className="flex items-center gap-2 text-vr-silver/40 text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando templates...
        </div>
      ) : (
        [...bySection.entries()].map(([section, items]) => (
          <AccordionSection key={section} title={section} subtitle={`${items.length} mensagem${items.length === 1 ? '' : 'ns'}`}>
            {items.map((tpl) =>
              tpl.editable ? (
                <EditableTemplateCard key={tpl.id} tpl={tpl} onSaved={updateOne} />
              ) : (
                <ProtectedTemplateCard key={tpl.id} tpl={tpl} />
              ),
            )}
          </AccordionSection>
        ))
      )}
    </div>
  )
}
