'use client'

import { useMemo, useState } from 'react'
import { Search, X, Plus, Loader2 } from 'lucide-react'
import { capitalizeFirst } from '@/lib/utils/text'

export interface SearchCreateOption {
  id: string
  name: string
}

/**
 * Busca com seleção múltipla + criação inline: filtra as opções já
 * cadastradas, e quando a busca não bate com nada oferece "cadastrar
 * '<texto>'" -- cria na hora (via onCreate) e já adiciona à seleção.
 * Reutilizado 3x no form de serviço (aparelho/marca/modelo) pra não
 * triplicar a mesma lógica.
 */
export default function SearchCreateMultiSelect({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  onCreate,
}: {
  label: string
  placeholder?: string
  options: SearchCreateOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onCreate: (name: string) => Promise<SearchCreateOption>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => selectedIds.map((id) => options.find((o) => o.id === id)).filter((o): o is SearchCreateOption => !!o),
    [selectedIds, options],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return options
      .filter((o) => !selectedIds.includes(o.id) && o.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, options, selectedIds])

  const exactMatch = useMemo(
    () => options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase()),
    [options, query],
  )

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
    setQuery('')
  }

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id))

  const create = async () => {
    const name = capitalizeFirst(query)
    if (!name || exactMatch) return
    setCreating(true)
    setError(null)
    try {
      const created = await onCreate(name)
      onChange([...selectedIds, created.id])
      setQuery('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-vr-silver/60 mb-1.5">{label}</label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((o) => (
            <span
              key={o.id}
              className="flex items-center gap-1 bg-vr-red/15 text-vr-red text-xs font-semibold px-2 py-1 rounded-lg"
            >
              {o.name}
              <button type="button" onClick={() => remove(o.id)} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? 'Buscar...'}
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-vr-black border border-white/10 text-white placeholder-white/25 text-xs outline-none focus:border-vr-red/50"
        />
      </div>

      {query.trim() && (
        <div className="mt-1.5 bg-vr-graphite border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          {matches.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors"
            >
              {o.name}
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-xs font-semibold text-vr-red hover:bg-vr-red/10 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Cadastrar "{capitalizeFirst(query)}"
            </button>
          )}
          {matches.length === 0 && exactMatch && (
            <p className="px-3 py-2 text-xs text-vr-silver/40">Já cadastrado — selecione na lista acima.</p>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}
