'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, Loader2, AlertCircle, Plus, X, Clock, User, MessageCircle,
  History, CalendarClock, Ban, CheckCircle2, Lock, Unlock, CalendarPlus, Search,
} from 'lucide-react'
import { MIN_JUSTIFICATION_LENGTH } from '@/lib/agenda/types'
import DateDropdown from '@/components/dashboard/DateDropdown'
import {adminAwareHref, apiPath } from '@/lib/storeProxyLink'
import { createClient } from '@/lib/supabase/client'
import AgendaSettingsCard from './AgendaSettingsCard'

type Appointment = {
  id: string
  service_id: string | null
  service_label: string
  customer_name: string
  customer_phone: string
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  created_by: string
}

type AppointmentEvent = {
  id: string
  action: string
  actor_type: string
  actor_id: string | null
  justification: string | null
  previous_starts_at: string | null
  new_starts_at: string | null
  created_at: string
}

type DaySlot = {
  starts_at: string
  ends_at: string
  available: boolean
  reason?: 'ocupado' | 'bloqueado' | 'muito_em_cima'
  label?: string
}

type AgendaBlock = {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  agendado: { label: 'Agendado', className: 'bg-green-500/15 text-green-400' },
  remarcado: { label: 'Remarcado', className: 'bg-blue-500/15 text-blue-400' },
  cancelado: { label: 'Cancelado', className: 'bg-red-500/15 text-red-400' },
  concluido: { label: 'Concluído', className: 'bg-white/10 text-vr-silver' },
  nao_compareceu: { label: 'Não compareceu', className: 'bg-yellow-500/15 text-yellow-400' },
}

const ACTION_LABEL: Record<string, string> = {
  created: 'Criado',
  rescheduled: 'Remarcado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
  no_show: 'Não compareceu',
}

const BR = { timeZone: 'America/Sao_Paulo' } as const

/** Hora no padrão brasileiro (24h). */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { ...BR, hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Data no padrão brasileiro (dd/mm/aaaa). */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { ...BR, day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} ${fmtTime(iso)}`
}

/** "AAAA-MM-DD" → "dd/mm/aaaa" sem passar por Date (evita erro de fuso). */
function dateKeyToBr(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : key
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA', BR)
}

function tomorrowKey() {
  return new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', BR)
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
}

const INPUT =
  'w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-vr-silver/30 outline-none focus:border-vr-red transition-colors'

function JustificationField({
  value, onChange, label, hint,
}: { value: string; onChange: (v: string) => void; label: string; hint?: string }) {
  const remaining = MIN_JUSTIFICATION_LENGTH - value.trim().length
  const ok = remaining <= 0
  return (
    <div>
      <label className="block text-sm text-vr-silver mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`${INPUT} resize-none`}
        placeholder={hint ?? 'Explique o motivo.'}
      />
      <p className={`text-xs mt-1 ${ok ? 'text-green-400' : 'text-vr-silver/50'}`}>
        {ok
          ? `${value.trim().length} caracteres — ok`
          : `Faltam ${remaining} caractere${remaining === 1 ? '' : 's'} (mínimo ${MIN_JUSTIFICATION_LENGTH})`}
      </p>
    </div>
  )
}

function Dialog({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-vr-graphite border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-vr-graphite z-10">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-vr-silver/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

/** Hora e minuto em dropdowns — 24h, padrão brasileiro. */
function TimeDropdown({
  value, onChange, step = 5,
}: { value: string; onChange: (v: string) => void; step?: number }) {
  const [h, m] = value.split(':')
  const pad = (n: number) => String(n).padStart(2, '0')
  const horas = Array.from({ length: 24 }, (_, i) => pad(i))
  const minutos = Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step))
  const SELECT =
    'bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-vr-red transition-colors'

  return (
    <div className="flex items-center gap-2">
      <select aria-label="Hora" value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} className={SELECT}>
        {horas.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-vr-silver/40">:</span>
      <select aria-label="Minuto" value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={SELECT}>
        {minutos.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-xs text-vr-silver/40 ml-1">h</span>
    </div>
  )
}

export default function AgendaClient() {
  const [date, setDate] = useState(todayKey())
  const [slots, setSlots] = useState<DaySlot[] | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [blocks, setBlocks] = useState<AgendaBlock[]>([])
  const [error, setError] = useState<string | null>(null)

  const [blocking, setBlocking] = useState(false)
  const [detail, setDetail] = useState<(Appointment & { events: AppointmentEvent[] }) | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [actionChooserId, setActionChooserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [dayRes, apptRes, blockRes] = await Promise.all([
        fetch(apiPath(`/api/agenda/day?date=${date}`)),
        fetch(apiPath(`/api/appointments?date=${date}`)),
        fetch(apiPath(`/api/agenda/blocks?date=${date}`)),
      ])
      if ([dayRes, apptRes, blockRes].some((r) => r.status === 401)) {
        window.location.href = adminAwareHref('/login')
        return
      }
      const day = await dayRes.json()
      if (!dayRes.ok) throw new Error(day.error ?? 'Falha ao carregar a agenda.')
      setSlots(day.slots ?? [])
      setAppointments(apptRes.ok ? await apptRes.json() : [])
      setBlocks(blockRes.ok ? await blockRes.json() : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a agenda.')
      setSlots([])
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    const res = await fetch(apiPath(`/api/appointments/${id}`))
    if (res.ok) setDetail(await res.json())
  }

  const completeAppt = async (id: string) => {
    const res = await fetch(apiPath(`/api/appointments/${id}/complete`), { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Falha ao concluir.'); return }
    if (json.freed_minutes > 0) {
      setError(null)
      alert(`Atendimento concluído. ${json.freed_minutes} min voltaram a ficar livres na agenda.`)
    }
    load()
  }

  const unblock = async (id: string) => {
    const res = await fetch(apiPath(`/api/agenda/blocks/${id}`), { method: 'DELETE' })
    if (res.ok) load()
  }

  const livres = slots?.filter((s) => s.available).length ?? 0
  const total = slots?.length ?? 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-vr-red" />
            Agenda
          </h1>
          <p className="text-sm text-vr-silver/50 mt-0.5">
            Mesma agenda usada pela assistente IA no WhatsApp.
          </p>
        </div>
        <button
          onClick={() => setBlocking(true)}
          className="shrink-0 flex items-center gap-1.5 bg-vr-red hover:bg-vr-red/90 text-white
            text-sm font-medium px-3.5 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Indisponibilizar horário
        </button>
      </div>

      <AgendaSettingsCard />

      {/* Dia */}
      <div className="flex flex-wrap items-center gap-2">
        <DateDropdown value={date} onChange={setDate} />
        <button
          onClick={() => setDate(todayKey())}
          className={`text-sm px-3 py-2 rounded-xl transition-colors ${
            date === todayKey() ? 'bg-vr-red text-white' : 'bg-vr-graphite text-vr-silver/70 hover:text-white'
          }`}
        >
          Hoje
        </button>
        <button
          onClick={() => setDate(tomorrowKey())}
          className={`text-sm px-3 py-2 rounded-xl transition-colors ${
            date === tomorrowKey() ? 'bg-vr-red text-white' : 'bg-vr-graphite text-vr-silver/70 hover:text-white'
          }`}
        >
          Amanhã
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl
          px-3 py-2.5 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Grade do dia — começa 100% livre e vai sendo ocupada */}
      {!slots ? (
        <div className="flex items-center gap-2 text-vr-silver/40 text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando agenda...
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-12 text-vr-silver/40">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>A loja não abre em {dateKeyToBr(date)}</p>
        </div>
      ) : (
        <section className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Disponibilidade — {dateKeyToBr(date)}
            </h2>
            <span className="text-xs text-vr-silver/50">
              {livres} de {total} horários livres
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {slots.map((s) => {
              const cls = s.available
                ? 'bg-green-500/10 border-green-500/25 text-green-400'
                : s.reason === 'bloqueado'
                  ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
                  : s.reason === 'muito_em_cima'
                    ? 'bg-white/[0.03] border-white/5 text-vr-silver/25'
                    : 'bg-red-500/10 border-red-500/25 text-red-400'
              return (
                <div
                  key={s.starts_at}
                  title={s.label ?? (s.available ? 'Livre' : s.reason === 'muito_em_cima' ? 'Muito em cima do horário' : '')}
                  className={`rounded-xl border px-2 py-2 text-center ${cls}`}
                >
                  <div className="text-sm font-semibold">{fmtTime(s.starts_at)}</div>
                  <div className="text-[10px] truncate opacity-80">
                    {s.available
                      ? 'livre'
                      : s.reason === 'bloqueado'
                        ? 'bloqueado'
                        : s.reason === 'muito_em_cima'
                          ? '—'
                          : 'ocupado'}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-vr-silver/40">
            O dia começa todo livre e vai sendo ocupado conforme os atendimentos são marcados —
            pelo cliente no WhatsApp ou por você aqui.
          </p>
        </section>
      )}

      {/* Bloqueios do dia */}
      {blocks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-yellow-400" /> Horários bloqueados
          </h2>
          {blocks.map((b) => (
            <div key={b.id} className="bg-vr-graphite rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-white">{fmtTime(b.starts_at)} – {fmtTime(b.ends_at)}</p>
                <p className="text-xs text-vr-silver/50 truncate">
                  {b.reason ?? 'Sem motivo registrado'}
                  <span className="text-vr-silver/30"> · só você vê isto</span>
                </p>
              </div>
              <button
                onClick={() => unblock(b.id)}
                className="shrink-0 flex items-center gap-1.5 text-sm text-vr-silver/70 hover:text-white bg-vr-graphite-light px-3 py-1.5 rounded-lg transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" /> Liberar
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Atendimentos do dia */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Atendimentos de {dateKeyToBr(date)}</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-vr-silver/40 py-4">Nenhum atendimento marcado neste dia.</p>
        ) : (
          appointments.map((a) => {
            const st = STATUS_CONFIG[a.status] ?? { label: a.status, className: 'bg-white/10 text-vr-silver' }
            const ativo = a.status === 'agendado' || a.status === 'remarcado'
            return (
              <div key={a.id} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-white font-semibold">
                      <Clock className="w-4 h-4 text-vr-red shrink-0" />
                      {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}
                    </div>
                    <p className="text-sm text-white mt-1 truncate">{a.service_label}</p>
                    <a
                      href={whatsappLink(a.customer_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-vr-silver/70 hover:text-white mt-1 transition-colors"
                    >
                      <User className="w-3.5 h-3.5" />
                      {a.customer_name}
                      <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                    </a>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.className}`}>
                    {st.label}
                  </span>
                </div>

                {a.notes && <p className="text-sm text-vr-silver/60 border-t border-white/5 pt-2">{a.notes}</p>}

                <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                  <button
                    onClick={() => openDetail(a.id)}
                    className="flex items-center gap-1.5 text-sm text-vr-silver/70 hover:text-white bg-vr-graphite-light px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <History className="w-3.5 h-3.5" /> Detalhes
                  </button>
                  {ativo && (
                    <>
                      <button
                        onClick={() => completeAppt(a.id)}
                        className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 bg-green-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        title="Concluir agora — se terminou antes do previsto, o tempo restante volta a ficar livre"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                      </button>
                      <button
                        onClick={() => setActionChooserId(a.id)}
                        className="flex items-center gap-1.5 text-sm text-vr-silver hover:text-white bg-white/5 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" /> Ação
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* "Agendar um atendimento" (CreateDialog/chooser) saiu daqui --
          registrar serviço/agendamento novo agora é só via /dashboard
          "Registrar serviço" (NovoServicoDialog). "+ Novo" abre direto o
          bloqueio de horário, única ação que ainda faz sentido aqui. */}
      {blocking && <BlockDialog date={date} onClose={() => setBlocking(false)} onDone={() => { setBlocking(false); load() }} />}

      {actionChooserId && (
        <Dialog title="O que você quer fazer?" onClose={() => setActionChooserId(null)}>
          <button
            onClick={() => { const id = actionChooserId; setActionChooserId(null); setReschedulingId(id) }}
            className="w-full text-left rounded-xl border border-white/10 bg-vr-black px-4 py-3 hover:border-blue-500 transition-colors"
          >
            <span className="flex items-center gap-2 text-white font-medium">
              <CalendarClock className="w-4 h-4 text-blue-400" /> Remarcar agendamento
            </span>
            <span className="block text-xs text-vr-silver/50 mt-1">
              Escolhe um novo horário e avisa o cliente.
            </span>
          </button>
          <button
            onClick={() => { const id = actionChooserId; setActionChooserId(null); setCancellingId(id) }}
            className="w-full text-left rounded-xl border border-white/10 bg-vr-black px-4 py-3 hover:border-red-500 transition-colors"
          >
            <span className="flex items-center gap-2 text-white font-medium">
              <Ban className="w-4 h-4 text-red-400" /> Cancelar agendamento
            </span>
            <span className="block text-xs text-vr-silver/50 mt-1">
              Desmarca o horário e avisa o cliente.
            </span>
          </button>
        </Dialog>
      )}

      {reschedulingId && (
        <RescheduleDialog id={reschedulingId} date={date} onClose={() => setReschedulingId(null)} onDone={() => { setReschedulingId(null); load() }} />
      )}
      {cancellingId && (
        <CancelDialog id={cancellingId} onClose={() => setCancellingId(null)} onDone={() => { setCancellingId(null); load() }} />
      )}
      {detail && <DetailDialog appointment={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// CreateDialog/ServicePicker ("Agendar um atendimento" daqui) removidos --
// registrar serviço/agendamento novo agora é só via /dashboard
// "Registrar serviço" (NovoServicoDialog), que já tem a mesma busca no
// catálogo real de serviços.

function BlockDialog({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const [dia, setDia] = useState(date)
  const [inicio, setInicio] = useState('12:00')
  const [fim, setFim] = useState('13:00')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = motivo.trim().length >= MIN_JUSTIFICATION_LENGTH && fim > inicio

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(apiPath('/api/agenda/blocks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dia, hora_inicio: inicio, hora_fim: fim, motivo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao bloquear horário.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao bloquear horário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Indisponibilizar horário" onClose={onClose}>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Data</label>
        <DateDropdown value={dia} onChange={setDia} />
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm text-vr-silver mb-1.5">Início</label>
          <TimeDropdown value={inicio} onChange={setInicio} />
        </div>
        <div>
          <label className="block text-sm text-vr-silver mb-1.5">Fim</label>
          <TimeDropdown value={fim} onChange={setFim} />
        </div>
      </div>
      {fim <= inicio && <p className="text-xs text-red-400">O fim precisa ser depois do início.</p>}
      <JustificationField
        value={motivo}
        onChange={setMotivo}
        label="Motivo (interno)"
        hint="Ex.: técnico em treinamento, manutenção do equipamento da bancada."
      />
      <p className="text-xs text-vr-silver/50 -mt-2">
        O cliente vê apenas que o horário está indisponível — este motivo é só para você.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !valid}
        className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed
          text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Indisponibilizar
      </button>
    </Dialog>
  )
}

/** Checkbox "mensagem padrão" (default true) + textarea obrigatória quando
 * desmarcado — mesmo padrão nos dois dialogs (reagendar/cancelar). */
function DefaultMessageToggle({
  useDefault, onToggle, customMessage, onCustomMessage, label,
}: {
  useDefault: boolean
  onToggle: (v: boolean) => void
  customMessage: string
  onCustomMessage: (v: string) => void
  label: string
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-vr-silver cursor-pointer">
        <input
          type="checkbox"
          checked={useDefault}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded border-white/20 bg-vr-black text-vr-red focus:ring-vr-red/50"
        />
        {label}
      </label>
      {!useDefault && (
        <textarea
          value={customMessage}
          onChange={(e) => onCustomMessage(e.target.value)}
          rows={3}
          placeholder="Escreva a mensagem que o cliente vai receber pelo WhatsApp..."
          className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-vr-silver/30 outline-none focus:border-vr-red transition-colors resize-none"
        />
      )}
    </div>
  )
}

function RescheduleDialog({
  id, date, onClose, onDone,
}: { id: string; date: string; onClose: () => void; onDone: () => void }) {
  const [dia, setDia] = useState(date)
  const [horario, setHorario] = useState('09:00')
  const [justification, setJustification] = useState('')
  const [useDefaultMessage, setUseDefaultMessage] = useState(true)
  const [customMessage, setCustomMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid =
    justification.trim().length >= MIN_JUSTIFICATION_LENGTH &&
    (useDefaultMessage || customMessage.trim().length >= 10)

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(apiPath(`/api/appointments/${id}/reschedule`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dia,
          horario,
          justification,
          use_default_message: useDefaultMessage,
          custom_message: useDefaultMessage ? undefined : customMessage,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao remarcar.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao remarcar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Remarcar agendamento" onClose={onClose}>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Nova data</label>
        <DateDropdown value={dia} onChange={setDia} />
      </div>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Novo horário</label>
        <TimeDropdown value={horario} onChange={setHorario} />
      </div>
      <JustificationField value={justification} onChange={setJustification} label="Justificativa da remarcação" />
      <DefaultMessageToggle
        useDefault={useDefaultMessage}
        onToggle={setUseDefaultMessage}
        customMessage={customMessage}
        onCustomMessage={setCustomMessage}
        label="Enviar mensagem de reagendamento padrão"
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !valid}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
          text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
        Remarcar e avisar o cliente
      </button>
    </Dialog>
  )
}

function CancelDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [justification, setJustification] = useState('')
  const [useDefaultMessage, setUseDefaultMessage] = useState(true)
  const [customMessage, setCustomMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid =
    justification.trim().length >= MIN_JUSTIFICATION_LENGTH &&
    (useDefaultMessage || customMessage.trim().length >= 10)

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(apiPath(`/api/appointments/${id}/cancel`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification,
          use_default_message: useDefaultMessage,
          custom_message: useDefaultMessage ? undefined : customMessage,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao cancelar.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao cancelar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Cancelar agendamento" onClose={onClose}>
      <JustificationField value={justification} onChange={setJustification} label="Justificativa do cancelamento" />
      <DefaultMessageToggle
        useDefault={useDefaultMessage}
        onToggle={setUseDefaultMessage}
        customMessage={customMessage}
        onCustomMessage={setCustomMessage}
        label="Enviar mensagem padrão de desmarcação"
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !valid}
        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed
          text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
        Cancelar e avisar o cliente
      </button>
    </Dialog>
  )
}

function DetailDialog({
  appointment, onClose,
}: { appointment: Appointment & { events: AppointmentEvent[] }; onClose: () => void }) {
  const st = STATUS_CONFIG[appointment.status] ?? { label: appointment.status, className: 'bg-white/10 text-vr-silver' }
  const dur = Math.round(
    (new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60_000,
  )
  return (
    <Dialog title="Detalhes do agendamento" onClose={onClose}>
      <div className="space-y-1.5 text-sm">
        <p className="text-white font-semibold">{appointment.service_label}</p>
        <p className="text-vr-silver">{appointment.customer_name} — {appointment.customer_phone}</p>
        <p className="text-vr-silver">
          {fmtDate(appointment.starts_at)}, {fmtTime(appointment.starts_at)}–{fmtTime(appointment.ends_at)}
          <span className="text-vr-silver/40"> ({dur} min)</span>
        </p>
        <p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
          <span className="text-vr-silver/40 text-xs ml-2">criado por {appointment.created_by}</span>
        </p>
        {appointment.notes && <p className="text-vr-silver/70 pt-1">{appointment.notes}</p>}
      </div>

      <div className="border-t border-white/5 pt-3">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
          <History className="w-4 h-4 text-vr-red" /> Histórico
        </h3>
        <div className="space-y-2.5">
          {appointment.events.map((ev) => (
            <div key={ev.id} className="text-sm border-l-2 border-white/10 pl-3">
              <p className="text-white">
                {ACTION_LABEL[ev.action] ?? ev.action}
                <span className="text-vr-silver/40 text-xs ml-2">
                  {ev.actor_type}{ev.actor_id ? ` · ${ev.actor_id}` : ''}
                </span>
              </p>
              <p className="text-vr-silver/50 text-xs">{fmtDateTime(ev.created_at)}</p>
              {ev.previous_starts_at && ev.new_starts_at && ev.previous_starts_at !== ev.new_starts_at && (
                <p className="text-vr-silver/70 text-xs mt-0.5">
                  {fmtDateTime(ev.previous_starts_at)} → {fmtDateTime(ev.new_starts_at)}
                </p>
              )}
              {ev.justification && (
                <p className="text-vr-silver/70 text-xs mt-0.5 italic">&ldquo;{ev.justification}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
