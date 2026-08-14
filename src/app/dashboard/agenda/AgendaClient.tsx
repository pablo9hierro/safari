'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Loader2, AlertCircle, Plus, X, Clock, User, MessageCircle,
  History, CalendarClock, Ban, CheckCircle2,
} from 'lucide-react'
import { MIN_JUSTIFICATION_LENGTH } from '@/lib/agenda/types'

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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  })
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
}

/** Campo de justificativa com o mínimo do negócio visível pro lojista. */
function JustificationField({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const remaining = MIN_JUSTIFICATION_LENGTH - value.trim().length
  const ok = remaining <= 0
  return (
    <div>
      <label className="block text-sm text-vr-silver mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white
          placeholder:text-vr-silver/30 focus:outline-none focus:border-vr-red resize-none"
        placeholder="Explique o motivo — o cliente vai receber esta justificativa por WhatsApp."
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-vr-graphite">
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

export default function AgendaClient() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(todayKey())
  const [customer, setCustomer] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<(Appointment & { events: AppointmentEvent[] }) | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    if (customer.trim()) params.set('customer', customer.trim())
    if (statusFilter) params.set('status', statusFilter)
    try {
      const res = await fetch(`/api/appointments?${params}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar a agenda.')
      setAppointments(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a agenda.')
      setAppointments([])
    }
  }, [date, customer, statusFilter])

  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    const res = await fetch(`/api/appointments/${id}`)
    if (res.ok) setDetail(await res.json())
  }

  const grouped = useMemo(() => appointments ?? [], [appointments])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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
          onClick={() => setCreating(true)}
          className="shrink-0 flex items-center gap-1.5 bg-vr-red hover:bg-vr-red/90 text-white
            text-sm font-medium px-3.5 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-vr-graphite border border-white/10 rounded-xl px-3 py-2 text-sm text-white
            focus:outline-none focus:border-vr-red"
        />
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Cliente"
          className="flex-1 min-w-32 bg-vr-graphite border border-white/10 rounded-xl px-3 py-2 text-sm
            text-white placeholder:text-vr-silver/30 focus:outline-none focus:border-vr-red"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-vr-graphite border border-white/10 rounded-xl px-3 py-2 text-sm text-white
            focus:outline-none focus:border-vr-red"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([v, c]) => (
            <option key={v} value={v}>{c.label}</option>
          ))}
        </select>
        {date && (
          <button
            onClick={() => setDate('')}
            className="text-sm text-vr-silver/60 hover:text-white px-2 transition-colors"
          >
            Limpar data
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl
          px-3 py-2.5 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!appointments ? (
        <div className="flex items-center gap-2 text-vr-silver/40 text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando agenda...
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-vr-silver/40">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum agendamento {date ? 'nesta data' : 'encontrado'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((a) => {
            const st = STATUS_CONFIG[a.status] ?? { label: a.status, className: 'bg-white/10 text-vr-silver' }
            const active = a.status === 'agendado' || a.status === 'remarcado'
            return (
              <div key={a.id} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-white font-semibold">
                      <Clock className="w-4 h-4 text-vr-red shrink-0" />
                      {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}
                      <span className="text-vr-silver/40 text-sm font-normal">
                        {new Date(a.starts_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </span>
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
                    className="flex items-center gap-1.5 text-sm text-vr-silver/70 hover:text-white
                      bg-vr-graphite-light px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <History className="w-3.5 h-3.5" /> Detalhes
                  </button>
                  {active && (
                    <>
                      <button
                        onClick={() => setReschedulingId(a.id)}
                        className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300
                          bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" /> Remarcar
                      </button>
                      <button
                        onClick={() => setCancellingId(a.id)}
                        className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300
                          bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); load() }} />}
      {reschedulingId && (
        <RescheduleDialog
          id={reschedulingId}
          onClose={() => setReschedulingId(null)}
          onDone={() => { setReschedulingId(null); load() }}
        />
      )}
      {cancellingId && (
        <CancelDialog
          id={cancellingId}
          onClose={() => setCancellingId(null)}
          onDone={() => { setCancellingId(null); load() }}
        />
      )}
      {detail && <DetailDialog appointment={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', service_label: '',
    data: todayKey(), horario: '09:00', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao criar agendamento.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao criar agendamento.')
    } finally {
      setSaving(false)
    }
  }

  const field = (k: keyof typeof form, label: string, type = 'text') => (
    <div>
      <label className="block text-sm text-vr-silver mb-1.5">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white
          placeholder:text-vr-silver/30 focus:outline-none focus:border-vr-red"
      />
    </div>
  )

  return (
    <Dialog title="Novo agendamento" onClose={onClose}>
      {field('customer_name', 'Cliente')}
      {field('customer_phone', 'WhatsApp')}
      {field('service_label', 'Serviço')}
      <div className="grid grid-cols-2 gap-3">
        {field('data', 'Data', 'date')}
        {field('horario', 'Horário', 'time')}
      </div>
      {field('notes', 'Observações')}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !form.customer_name || !form.customer_phone || !form.service_label}
        className="w-full bg-vr-red hover:bg-vr-red/90 disabled:opacity-40 disabled:cursor-not-allowed
          text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Agendar
      </button>
    </Dialog>
  )
}

function RescheduleDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState(todayKey())
  const [horario, setHorario] = useState('09:00')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = justification.trim().length >= MIN_JUSTIFICATION_LENGTH

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/appointments/${id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, horario, justification }),
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-vr-silver mb-1.5">Nova data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-vr-red" />
        </div>
        <div>
          <label className="block text-sm text-vr-silver mb-1.5">Novo horário</label>
          <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)}
            className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-vr-red" />
        </div>
      </div>
      <JustificationField value={justification} onChange={setJustification} label="Justificativa da remarcação" />
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
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = justification.trim().length >= MIN_JUSTIFICATION_LENGTH

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification }),
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
  return (
    <Dialog title="Detalhes do agendamento" onClose={onClose}>
      <div className="space-y-1.5 text-sm">
        <p className="text-white font-semibold">{appointment.service_label}</p>
        <p className="text-vr-silver">{appointment.customer_name} — {appointment.customer_phone}</p>
        <p className="text-vr-silver">{fmtDateTime(appointment.starts_at)} até {fmtTime(appointment.ends_at)}</p>
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
              {ev.previous_starts_at && ev.new_starts_at && (
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
