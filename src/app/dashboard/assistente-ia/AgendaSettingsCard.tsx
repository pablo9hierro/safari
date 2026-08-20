'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Check, Loader2 } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'

const LABEL = 'block text-xs font-semibold text-vr-silver/60 mb-1.5 uppercase tracking-wider'
const INPUT =
  'w-full px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors'

type Settings = {
  appointment_ai_enabled: boolean
  lead_time_minutes: number
  slot_minutes: number
  default_duration_minutes: number
}

/**
 * Ajustes da agenda que a assistente usa ao oferecer horários no WhatsApp.
 * Fica aqui, junto da configuração da assistente, porque é ela quem negocia
 * o horário com o cliente.
 */
export default function AgendaSettingsCard() {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(apiPath('/api/agenda/settings'))
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Falha ao carregar')
        return r.json()
      })
      .then(setCfg)
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar a agenda.'))
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setCfg((prev) => (prev ? { ...prev, [k]: v } : prev))

  const save = async () => {
    if (!cfg) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(apiPath('/api/agenda/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao salvar')
      setCfg(json)
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
  if (!cfg) {
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
        Agendamento de serviços
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
            Folga entre agora e o próximo horário oferecido — evita o cliente marcar &ldquo;pra
            já&rdquo;. Com 30, às 9h a assistente só oferece a partir das 9h30.
          </p>
        </div>

        <div>
          <label className={LABEL}>Intervalo da grade (min)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={cfg.slot_minutes}
            onChange={(e) => set('slot_minutes', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-xs text-vr-silver/50 mt-1">
            De quanto em quanto tempo os horários são oferecidos (30 = 9h, 9h30, 10h...).
          </p>
        </div>

        <div>
          <label className={LABEL}>Duração padrão (min)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={cfg.default_duration_minutes}
            onChange={(e) => set('default_duration_minutes', Number(e.target.value))}
            className={INPUT}
          />
          <p className="text-xs text-vr-silver/50 mt-1">
            Só vale para serviço sem duração própria — normalmente vem do cadastro do serviço.
          </p>
        </div>
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
