'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Check, Loader2, Plus, X } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'

const LABEL = 'block text-xs font-semibold text-vr-silver/60 mb-1.5 uppercase tracking-wider'
const INPUT =
  'w-full px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors'

type Settings = {
  appointment_ai_enabled: boolean
  lead_time_minutes: number
  buffer_minutes: number
  default_duration_minutes: number
}

type Block = { id?: string; weekday: number; open_time: string; close_time: string }

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** HH:MM:SS (vindo do banco) -> HH:MM (input type=time). */
function toInputTime(t: string): string {
  return t.slice(0, 5)
}

/**
 * Ajustes da agenda: antecedência mínima, buffer entre atendimentos, e o
 * horário de funcionamento (múltiplos blocos por dia, ex: manhã + tarde).
 * A assistente calcula a disponibilidade real em cima disso — não tem mais
 * grade fixa de horários oferecidos, ela consulta a faixa livre de verdade.
 */
export default function AgendaSettingsCard() {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(apiPath('/api/agenda/settings')).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Falha ao carregar configuração')
        return r.json()
      }),
      fetch(apiPath('/api/agenda/business-hours')).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Falha ao carregar horário de funcionamento')
        return r.json()
      }),
    ])
      .then(([settings, hours]) => {
        setCfg(settings)
        setBlocks(
          (hours as { weekday: number; open_time: string; close_time: string }[]).map((h) => ({
            weekday: h.weekday,
            open_time: toInputTime(h.open_time),
            close_time: toInputTime(h.close_time),
          })),
        )
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar a agenda.'))
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setCfg((prev) => (prev ? { ...prev, [k]: v } : prev))

  const addBlock = (weekday: number) =>
    setBlocks((prev) => [...(prev ?? []), { weekday, open_time: '09:00', close_time: '18:00' }])

  const removeBlock = (index: number) =>
    setBlocks((prev) => (prev ?? []).filter((_, i) => i !== index))

  const updateBlock = (index: number, patch: Partial<Block>) =>
    setBlocks((prev) => (prev ?? []).map((b, i) => (i === index ? { ...b, ...patch } : b)))

  const save = async () => {
    if (!cfg || !blocks) return
    setSaving(true); setError(null)
    try {
      const [settingsRes, hoursRes] = await Promise.all([
        fetch(apiPath('/api/agenda/settings'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        }),
        fetch(apiPath('/api/agenda/business-hours'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks }),
        }),
      ])
      const settingsJson = await settingsRes.json()
      const hoursJson = await hoursRes.json()
      if (!settingsRes.ok) throw new Error(settingsJson.error ?? 'Falha ao salvar configuração')
      if (!hoursRes.ok) throw new Error(hoursJson.error ?? 'Falha ao salvar horário de funcionamento')
      setCfg(settingsJson)
      setBlocks(
        (hoursJson as { weekday: number; open_time: string; close_time: string }[]).map((h) => ({
          weekday: h.weekday,
          open_time: toInputTime(h.open_time),
          close_time: toInputTime(h.close_time),
        })),
      )
      setSaved(true); setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !cfg) {
    return (
      <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 text-sm text-red-400">
        {error}
      </div>
    )
  }
  if (!cfg || !blocks) {
    return (
      <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 flex items-center gap-2 text-sm text-vr-silver/40">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando agenda...
      </div>
    )
  }

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-vr-red" />
        Agendamento de atendimentos
      </h2>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={cfg.appointment_ai_enabled}
          onChange={(e) => set('appointment_ai_enabled', e.target.checked)}
          className="w-4 h-4 accent-vr-red"
        />
        <span className="text-sm text-white">
          Deixar a assistente agendar atendimentos
          <span className="block text-xs text-vr-silver/50">
            Desligado, ela não consulta nem marca horários no WhatsApp.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>Antecedência mínima (min)</label>
          <input
            type="number"
            min={0}
            step={5}
            value={cfg.lead_time_minutes}
            onChange={(e) => set('lead_time_minutes', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-xs text-vr-silver/50 mt-1">
            Folga entre agora e o próximo horário aceito. Com 30, às 9h a assistente só oferece a
            partir das 9h30.
          </p>
        </div>

        <div>
          <label className={LABEL}>Buffer entre atendimentos (min)</label>
          <input
            type="number"
            min={0}
            step={5}
            value={cfg.buffer_minutes}
            onChange={(e) => set('buffer_minutes', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-xs text-vr-silver/50 mt-1">
            Folga obrigatória depois de um atendimento e a partir de agora — evita marcar em
            sequência colada. Com 30, um atendimento até 10h00 só libera novo agendamento a partir
            das 10h31.
          </p>
        </div>

        <div>
          <label className={LABEL}>Duração de fallback (min)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={cfg.default_duration_minutes}
            onChange={(e) => set('default_duration_minutes', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-xs text-vr-silver/50 mt-1">
            Só vale quando o serviço não tem duração própria cadastrada — o normal é a duração vir
            do cadastro do serviço.
          </p>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 space-y-3">
        <p className={LABEL}>Horário de funcionamento</p>
        {WEEKDAY_LABELS.map((label, weekday) => {
          const dayBlocks = blocks
            .map((b, i) => ({ ...b, i }))
            .filter((b) => b.weekday === weekday)
          return (
            <div key={weekday} className="flex flex-wrap items-start gap-2">
              <span className="text-sm text-vr-silver/70 w-20 pt-2.5 shrink-0">{label}</span>
              <div className="flex-1 flex flex-col gap-2 min-w-[240px]">
                {dayBlocks.length === 0 && (
                  <span className="text-xs text-vr-silver/30 py-2.5">Fechado</span>
                )}
                {dayBlocks.map((b) => (
                  <div key={b.i} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={b.open_time}
                      onChange={(e) => updateBlock(b.i, { open_time: e.target.value })}
                      className={`${INPUT} w-32`}
                    />
                    <span className="text-vr-silver/40 text-sm">até</span>
                    <input
                      type="time"
                      value={b.close_time}
                      onChange={(e) => updateBlock(b.i, { close_time: e.target.value })}
                      className={`${INPUT} w-32`}
                    />
                    <button
                      onClick={() => removeBlock(b.i)}
                      className="p-1.5 rounded-lg text-vr-silver/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addBlock(weekday)}
                  className="self-start flex items-center gap-1 text-xs text-vr-red hover:text-vr-red/80 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar bloco
                </button>
              </div>
            </div>
          )
        })}
        <p className="text-xs text-vr-silver/40">
          Um dia pode ter mais de um bloco (ex: 08:00–12:00 e 14:00–18:00). Dia sem nenhum bloco
          fica fechado pra agendamento.
        </p>
      </div>

      <p className="text-xs text-vr-silver/40">
        A loja agenda apenas para <strong className="text-vr-silver/60">hoje e amanhã</strong>. O
        tempo que cada atendimento ocupa vem da duração cadastrada no serviço (coleta + manutenção
        + entrega).
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors
          ${saved ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40'}`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? 'Salvo!' : 'Salvar agendamento'}
      </button>
    </div>
  )
}
