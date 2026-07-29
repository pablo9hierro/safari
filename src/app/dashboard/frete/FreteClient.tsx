'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarEnderecos } from '@/lib/mapa/geocodificacao'
import { Truck, Loader2, Check, MapPin, Navigation } from 'lucide-react'

interface ShippingSettings {
  price_per_km: number
  store_lat: number
  store_lng: number
  max_km: number | null
  store_address: string
}

const INPUT = 'w-full px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-white placeholder-white/25 focus:border-vr-red/60 outline-none transition-all'

export default function FreteClient({ initial }: { initial: ShippingSettings }) {
  const [settings, setSettings] = useState<ShippingSettings>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    if (settings.price_per_km < 0) { setError('Preço por km não pode ser negativo'); return }
    if (settings.max_km !== null && settings.max_km <= 0) { setError('Distância máxima deve ser positiva'); return }
    if (!settings.store_address.trim()) { setError('Informe o endereço da loja'); return }

    setSaving(true)

    let lat = settings.store_lat
    let lng = settings.store_lng

    try {
      const results = await buscarEnderecos(settings.store_address)
      if (results.length === 0) {
        setError('Endereço não encontrado. Tente ser mais específico.')
        setSaving(false)
        return
      }
      lat = results[0].lat
      lng = results[0].lng
    } catch {
      setError('Erro ao buscar coordenadas. Verifique sua conexão.')
      setSaving(false)
      return
    }

    const supabase = createClient()
    const { error: err } = await supabase
      .from('shipping_settings')
      .upsert(
        {
          id: 1,
          price_per_km: settings.price_per_km,
          max_km: settings.max_km,
          store_address: settings.store_address.trim(),
          store_lat: lat,
          store_lng: lng,
        },
        { onConflict: 'id' }
      )

    setSaving(false)
    if (err) { setError(err.message); return }

    setSettings((s) => ({ ...s, store_lat: lat, store_lng: lng }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Truck className="w-5 h-5 text-vr-red" />
        Configuração de frete
      </h1>
      <p className="text-sm text-vr-silver/50">
        O frete é calculado pela distância em linha reta entre a loja e o endereço do cliente (fórmula de Haversine).
      </p>

      <div className="bg-vr-graphite border border-white/5 rounded-2xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-vr-silver/80 mb-1.5">
            Preço por km <span className="text-vr-silver/40 font-normal">(R$/km, ida + volta)</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-vr-silver/50 text-sm font-medium">R$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.10"
              min="0"
              value={settings.price_per_km}
              onChange={(e) => setSettings((s) => ({ ...s, price_per_km: Number(e.target.value) }))}
              className={`${INPUT} pl-10`}
              placeholder="2.00"
            />
          </div>
          <p className="text-xs text-vr-silver/40 mt-1.5">
            Ex: 5 km × R$ {settings.price_per_km.toFixed(2)}/km = frete R$ {(5 * settings.price_per_km).toFixed(2)} por trecho
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-vr-silver/80 mb-1.5">
            Raio máximo de atendimento <span className="text-vr-silver/40 font-normal">(km) — deixe vazio = sem limite</span>
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="1"
              min="1"
              value={settings.max_km ?? ''}
              onChange={(e) =>
                setSettings((s) => ({ ...s, max_km: e.target.value === '' ? null : Number(e.target.value) }))
              }
              className={`${INPUT} pr-12`}
              placeholder="Sem limite"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-vr-silver/40 text-sm">km</span>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-vr-silver/80">
            <MapPin className="w-4 h-4 text-vr-red" />
            Endereço da loja (ponto de partida do frete)
          </div>
          <div>
            <input
              type="text"
              value={settings.store_address}
              onChange={(e) => setSettings((s) => ({ ...s, store_address: e.target.value }))}
              className={INPUT}
              placeholder="Ex: Rua das Trincheiras, 500 — João Pessoa, PB"
            />
            <p className="text-xs text-vr-silver/40 mt-1.5">
              Digite o endereço como no Google Maps. As coordenadas serão calculadas automaticamente ao salvar.
            </p>
          </div>
          {settings.store_lat !== 0 && settings.store_lng !== 0 && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${settings.store_lat},${settings.store_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-vr-red/70 hover:text-vr-red transition-colors"
            >
              <Navigation className="w-3 h-3" />
              Ver localização atual no mapa
            </a>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all
          ${saved ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90'}`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar configurações'}
      </button>
    </div>
  )
}
