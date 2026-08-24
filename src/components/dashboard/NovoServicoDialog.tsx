'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, X, CheckCircle2, Search, MapPin, Truck, Home } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'
import { createClient } from '@/lib/supabase/client'
import DateDropdown from '@/components/dashboard/DateDropdown'
import type { LocationPickerResult } from '@/components/LocationPicker'

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false })

const INPUT =
  'w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-vr-silver/30 outline-none focus:border-vr-red transition-colors'

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

/** Hora e minuto em dropdowns -- mesmo padrão de AgendaClient.tsx. */
function TimeDropdown({ value, onChange, step = 5 }: { value: string; onChange: (v: string) => void; step?: number }) {
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

type ServiceCatalogItem = { id: string; model_name: string; repair_type: string; price: number }

/** Barra de busca com resultados em dropdown, puxando do cadastro real de
 * serviços (service_catalog_items) -- mesmo componente usado em
 * /dashboard/agenda pra "Novo agendamento". */
function ServicePicker({
  value, onChange,
}: { value: { id: string | null; label: string }; onChange: (v: { id: string | null; label: string }) => void }) {
  const [query, setQuery] = useState(value.label)
  const [results, setResults] = useState<ServiceCatalogItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      let q = supabase
        .from('service_catalog_items')
        .select('id, model_name, repair_type, price')
        .eq('active', true)
        .order('model_name')
        .limit(20)
      if (query.trim()) {
        q = q.or(`model_name.ilike.%${query.trim()}%,repair_type.ilike.%${query.trim()}%`)
      }
      const { data } = await q
      setResults(data ?? [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  const select = (item: ServiceCatalogItem) => {
    const label = `${item.model_name} — ${item.repair_type}`
    setQuery(label)
    onChange({ id: item.id, label })
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange({ id: null, label: e.target.value })
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar no cadastro de serviços..."
          className={`${INPUT} pl-9`}
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-vr-graphite border border-white/10 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2.5 text-sm text-vr-silver/50 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-vr-silver/50">
              Nenhum serviço encontrado no cadastro — o texto digitado será usado como está.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={() => select(item)}
                className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              >
                <p className="text-sm text-white">{item.model_name} — {item.repair_type}</p>
                <p className="text-xs text-vr-silver/50">R$ {Number(item.price).toFixed(2)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * "PDV de serviço" -- lojista registra um atendimento com cliente já
 * combinado por fora (telefone, balcão, etc.), pesquisando o serviço no
 * cadastro real e já marcando o horário. Mesma rota POST /api/appointments
 * usada em /dashboard/agenda (source: admin_manual) -- cria a
 * service_request + o agendamento numa tacada só.
 */
export default function NovoServicoDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', service_label: '', service_id: '', notes: '' })
  const [dia, setDia] = useState(today)
  const [horario, setHorario] = useState('09:00')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Padrão: já atendido (balcão/telefone), sem coleta -- só vira coleta se
  // o lojista marcar e informar o endereço real (mapa), nunca inventado.
  const [selfPickup, setSelfPickup] = useState(true)
  const [address, setAddress] = useState<LocationPickerResult | null>(null)
  const [showMap, setShowMap] = useState(false)

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const { service_id, ...rest } = form
      const res = await fetch(apiPath('/api/appointments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          service_id: service_id || undefined,
          data: dia,
          horario,
          self_pickup: selfPickup,
          address_lat: selfPickup ? undefined : address?.lat,
          address_lng: selfPickup ? undefined : address?.lng,
          address_label: selfPickup ? undefined : address?.label,
          address_street: selfPickup ? undefined : address?.rua,
          address_number: selfPickup ? undefined : address?.numero,
          address_neighborhood: selfPickup ? undefined : address?.bairro,
          address_city: selfPickup ? undefined : address?.cidade,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao registrar o serviço.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao registrar o serviço.')
    } finally {
      setSaving(false)
    }
  }

  const field = (k: 'customer_name' | 'customer_phone' | 'notes', label: string) => (
    <div>
      <label className="block text-sm text-vr-silver mb-1.5">{label}</label>
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={INPUT} />
    </div>
  )

  return (
    <Dialog title="Registrar novo serviço" onClose={onClose}>
      {showMap && (
        <LocationPicker
          initial={address}
          onClose={() => setShowMap(false)}
          onConfirm={(r) => { setAddress(r); setShowMap(false) }}
        />
      )}
      {field('customer_name', 'Cliente')}
      {field('customer_phone', 'WhatsApp')}
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Serviço</label>
        <ServicePicker
          value={{ id: form.service_id || null, label: form.service_label }}
          onChange={(v) => setForm({ ...form, service_id: v.id ?? '', service_label: v.label })}
        />
      </div>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Data</label>
        <DateDropdown value={dia} onChange={setDia} />
      </div>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Horário de início</label>
        <TimeDropdown value={horario} onChange={setHorario} />
      </div>
      <div>
        <label className="block text-sm text-vr-silver mb-1.5">Aparelho</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelfPickup(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
              selfPickup ? 'border-vr-red bg-red-500/10 text-vr-red' : 'border-white/10 text-vr-silver'
            }`}
          >
            <Home className="w-3.5 h-3.5" /> Já com a loja
          </button>
          <button
            type="button"
            onClick={() => setSelfPickup(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
              !selfPickup ? 'border-vr-red bg-red-500/10 text-vr-red' : 'border-white/10 text-vr-silver'
            }`}
          >
            <Truck className="w-3.5 h-3.5" /> Buscar (coleta)
          </button>
        </div>
        {!selfPickup && (
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="w-full mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-vr-black text-sm text-left hover:border-vr-red/40 transition-colors"
          >
            <MapPin className="w-4 h-4 text-vr-red shrink-0" />
            <span className={address ? 'text-white truncate' : 'text-vr-silver/50'}>
              {address?.label ?? 'Selecionar endereço de coleta no mapa…'}
            </span>
          </button>
        )}
      </div>
      {field('notes', 'Observações')}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !form.customer_name || !form.customer_phone || !form.service_label || (!selfPickup && !address)}
        className="w-full bg-vr-red hover:bg-vr-red/90 disabled:opacity-40 disabled:cursor-not-allowed
          text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Registrar
      </button>
    </Dialog>
  )
}
