'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NeighborhoodShippingRate } from '@/lib/types'
import { JOAO_PESSOA_BAIRROS } from '@/lib/joaoPessoaBairros'
import { Truck, Search, Loader2, Check } from 'lucide-react'

export default function FreteClient({ initialRates }: { initialRates: NeighborhoodShippingRate[] }) {
  const [rates, setRates] = useState<NeighborhoodShippingRate[]>(initialRates)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')

  const rateByNeighborhood = useMemo(() => {
    const map = new Map<string, NeighborhoodShippingRate>()
    for (const r of rates) map.set(r.neighborhood, r)
    return map
  }, [rates])

  const filteredBairros = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return JOAO_PESSOA_BAIRROS
    return JOAO_PESSOA_BAIRROS.filter((b) => b.toLowerCase().includes(q))
  }, [searchQuery])

  const handleSave = async (neighborhood: string) => {
    const raw = edits[neighborhood]
    const price = parseFloat(raw)
    if (raw === undefined || isNaN(price) || price < 0) return

    setSaving((prev) => ({ ...prev, [neighborhood]: true }))
    const supabase = createClient()
    const { data, error } = await supabase
      .from('neighborhood_shipping_rates')
      .upsert({ neighborhood, price }, { onConflict: 'neighborhood' })
      .select()
      .single()

    if (!error && data) {
      const updated = data as NeighborhoodShippingRate
      setRates((prev) => {
        const exists = prev.some((r) => r.neighborhood === neighborhood)
        return exists ? prev.map((r) => (r.neighborhood === neighborhood ? updated : r)) : [...prev, updated]
      })
      setEdits((prev) => {
        const { [neighborhood]: _removed, ...rest } = prev
        return rest
      })
      setSaved((prev) => ({ ...prev, [neighborhood]: true }))
      setTimeout(() => setSaved((prev) => ({ ...prev, [neighborhood]: false })), 1500)
    }
    setSaving((prev) => ({ ...prev, [neighborhood]: false }))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Truck className="w-5 h-5 text-vr-red" />
        Frete por bairro
      </h1>
      <p className="text-sm text-vr-silver/50">
        Defina o valor de frete/entrega/busca para cada bairro de João Pessoa. Esse valor é usado automaticamente no checkout da loja.
      </p>

      <div className="relative">
        <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar bairro..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
        />
      </div>

      <div className="bg-vr-graphite rounded-2xl border border-white/5 divide-y divide-white/5">
        {filteredBairros.map((bairro) => {
          const rate = rateByNeighborhood.get(bairro)
          const value = edits[bairro] ?? (rate ? String(Number(rate.price)) : '')
          const dirty = edits[bairro] !== undefined
          return (
            <div key={bairro} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-white truncate">{bairro}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs font-medium">R$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={value}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [bairro]: e.target.value }))}
                    placeholder="0,00"
                    className="w-28 pl-8 pr-2 py-1.5 rounded-lg bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSave(bairro)}
                  disabled={!dirty || saving[bairro]}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg text-white transition-colors disabled:opacity-30 disabled:bg-vr-black disabled:border disabled:border-white/10
                    ${saved[bairro] ? 'bg-green-600' : 'bg-vr-red'}`}
                >
                  {saving[bairro] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
