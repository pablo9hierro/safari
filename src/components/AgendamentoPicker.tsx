'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, AlertCircle } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'

type Slot = { starts_at: string; ends_at: string }
type Day = { date: string; label: string; slots: Slot[] }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Escolha do horário do atendimento no checkout.
 *
 * Serviço sempre exige agendamento, então o cliente escolhe entre HOJE e
 * AMANHÃ e um dos horários realmente livres — a lista já vem do servidor
 * respeitando a antecedência mínima, então nunca aparece um horário
 * "pra agora" que a loja não teria como cumprir.
 */
export default function AgendamentoPicker({
  serviceId,
  value,
  onChange,
}: {
  serviceId?: string
  value: { date: string; time: string } | null
  onChange: (v: { date: string; time: string } | null) => void
}) {
  const [days, setDays] = useState<Day[] | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : ''
    fetch(apiPath(`/api/agenda/public/availability${q}`))
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Falha ao carregar horários.')
        return j
      })
      .then((j) => { setDays(j.days); setDuration(j.duration_minutes) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar horários.'))
  }, [serviceId])

  const selectedDay = value?.date ?? days?.find((d) => d.slots.length > 0)?.date ?? days?.[0]?.date

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-sm text-red-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }
  if (!days) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-vr-silver/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando horários...
      </div>
    )
  }

  const dia = days.find((d) => d.date === selectedDay)

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <CalendarClock className="h-4 w-4 text-vr-red" />
          Escolha o horário do atendimento
        </p>
        <p className="mt-0.5 text-xs text-vr-silver/50">
          O serviço precisa de horário marcado.
          {duration ? ` Reserva de ${duration} min (coleta + manutenção + entrega).` : ''}
        </p>
      </div>

      <div className="flex gap-2">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onChange({ date: d.date, time: '' })}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
              selectedDay === d.date
                ? 'border-vr-red bg-vr-red/10 text-white'
                : 'border-white/10 bg-vr-black text-vr-silver/70 hover:text-white'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {!dia || dia.slots.length === 0 ? (
        <p className="py-3 text-center text-sm text-vr-silver/50">
          Sem horários livres neste dia. Tente o outro dia.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {dia.slots.map((s) => {
            const hora = fmtTime(s.starts_at)
            const ativo = value?.date === dia.date && value?.time === hora
            return (
              <button
                key={s.starts_at}
                type="button"
                onClick={() => onChange({ date: dia.date, time: hora })}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
                  ativo
                    ? 'border-vr-red bg-vr-red text-white'
                    : 'border-white/10 bg-vr-black text-vr-silver hover:border-vr-red/50 hover:text-white'
                }`}
              >
                {hora}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
