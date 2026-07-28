'use client'

import { useMemo, useState } from 'react'
import type { CatalogCategory, CatalogItem } from './page'
import { Search, Wrench } from 'lucide-react'

interface Props {
  categories: CatalogCategory[]
  items: CatalogItem[]
}

export default function CatalogoClient({ categories, items }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(categories[0]?.slug ?? null)
  const [search, setSearch] = useState('')

  const activeCategory = categories.find((c) => c.slug === activeSlug)

  const filtered = useMemo(() => {
    const base = activeCategory ? items.filter((i) => i.category_id === activeCategory.id) : items
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (i) =>
        i.model_name.toLowerCase().includes(q) ||
        i.repair_type.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
    )
  }, [items, activeCategory, search])

  // Agrupar por tipo de reparo
  const byRepairType = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    for (const item of filtered) {
      const list = map.get(item.repair_type) ?? []
      list.push(item)
      map.set(item.repair_type, list)
    }
    return map
  }, [filtered])

  if (categories.length === 0) {
    return (
      <div className="text-center py-16 text-vr-silver/40">
        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Catálogo em construção. Em breve!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filtro por marca */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => setActiveSlug(cat.slug)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${activeSlug === cat.slug
                ? 'bg-vr-red text-white shadow-lg shadow-vr-red/20'
                : 'bg-vr-graphite border border-white/5 text-vr-silver hover:border-vr-red/30'
              }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-vr-silver/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar modelo ou tipo de reparo..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-vr-graphite border border-white/5 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red/40 transition-colors"
        />
      </div>

      {/* Resultados */}
      {byRepairType.size === 0 ? (
        <div className="text-center py-12 text-vr-silver/40">
          <p>Nenhum serviço encontrado.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byRepairType.entries()).map(([repairType, repairItems]) => (
            <section key={repairType}>
              <h2 className="text-sm font-bold text-vr-red uppercase tracking-wider mb-3 flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5" />
                {repairType}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {repairItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-vr-graphite border border-white/5 rounded-2xl p-4 hover:border-vr-red/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="font-semibold text-white text-sm leading-snug">{item.model_name}</h3>
                      <span className="text-vr-red font-bold text-sm whitespace-nowrap">
                        R$ {Number(item.price).toFixed(2)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-vr-silver/55 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
