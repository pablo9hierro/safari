'use client'

import { useMemo, useState } from 'react'
import type { CatalogCategory, CatalogItem } from './page'
import { Search, Wrench, ShoppingCart, Check } from 'lucide-react'
import { useCart } from '@/lib/carrinho/context'

interface Props {
  categories: CatalogCategory[]
  items: CatalogItem[]
}

export default function CatalogoClient({ categories, items }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(categories[0]?.slug ?? null)
  const [search, setSearch] = useState('')
  const [selectedRepairTypes, setSelectedRepairTypes] = useState<Set<string>>(new Set())
  const { add, items: cartItems } = useCart()
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set())

  const activeCategory = categories.find((c) => c.slug === activeSlug)

  const categoryItems = useMemo(() => {
    return activeCategory ? items.filter((i) => i.category_id === activeCategory.id) : items
  }, [items, activeCategory])

  // All unique repair types for the active category
  const allRepairTypes = useMemo(() => {
    const types = new Set<string>()
    for (const i of categoryItems) types.add(i.repair_type)
    return Array.from(types).sort()
  }, [categoryItems])

  // When brand changes, reset filters
  const handleBrandChange = (slug: string) => {
    setActiveSlug(slug)
    setSelectedRepairTypes(new Set())
    setSearch('')
  }

  const toggleRepairType = (rt: string) => {
    setSelectedRepairTypes((prev) => {
      const next = new Set(prev)
      if (next.has(rt)) next.delete(rt)
      else next.add(rt)
      return next
    })
  }

  const filtered = useMemo(() => {
    let base = categoryItems
    if (selectedRepairTypes.size > 0) {
      base = base.filter((i) => selectedRepairTypes.has(i.repair_type))
    }
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (i) =>
        i.model_name.toLowerCase().includes(q) ||
        i.repair_type.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
    )
  }, [categoryItems, selectedRepairTypes, search])

  // Group by model_name
  const byModel = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    for (const item of filtered) {
      const list = map.get(item.model_name) ?? []
      list.push(item)
      map.set(item.model_name, list)
    }
    return map
  }, [filtered])

  const handleAdd = (item: CatalogItem) => {
    add({
      id: item.id,
      type: 'service',
      name: item.repair_type,
      subtitle: `${activeCategory?.name ?? ''} ${item.model_name}`.trim(),
      price: Number(item.price),
    })
    setRecentlyAdded((prev) => {
      const next = new Set(prev)
      next.add(item.id)
      setTimeout(() => setRecentlyAdded((p) => { const n = new Set(p); n.delete(item.id); return n }), 1500)
      return next
    })
  }

  const isInCart = (id: string) => cartItems.some((i) => i.id === id)

  if (categories.length === 0) {
    return (
      <div className="text-center py-16 text-vr-silver/40">
        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Catálogo em construção. Em breve!</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Filtro por marca */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => handleBrandChange(cat.slug)}
            className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${activeSlug === cat.slug
                ? 'bg-vr-red text-white shadow-lg shadow-vr-red/20'
                : 'bg-vr-graphite border border-white/5 text-vr-silver hover:border-vr-red/30'
              }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Filtros por tipo de reparo (multi-select) */}
      {allRepairTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allRepairTypes.map((rt) => {
            const selected = selectedRepairTypes.has(rt)
            return (
              <button
                key={rt}
                onClick={() => toggleRepairType(rt)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border
                  ${selected
                    ? 'bg-vr-red/20 border-vr-red text-vr-red'
                    : 'bg-transparent border-white/10 text-vr-silver/60 hover:border-white/30 hover:text-white'
                  }`}
              >
                {selected && <Check className="w-3 h-3" />}
                {rt}
              </button>
            )
          })}
        </div>
      )}

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

      {/* Resultados agrupados por modelo */}
      {byModel.size === 0 ? (
        <div className="text-center py-12 text-vr-silver/40">
          <p>Nenhum serviço encontrado.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byModel.entries()).map(([modelName, modelItems]) => (
            <section key={modelName}>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-vr-red rounded-full" />
                {modelName}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modelItems.map((item) => {
                  const added = recentlyAdded.has(item.id)
                  const inCart = isInCart(item.id)
                  return (
                    <div
                      key={item.id}
                      className="bg-vr-graphite border border-white/5 rounded-2xl p-4 hover:border-vr-red/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="min-w-0">
                          <span className="inline-block text-xs font-semibold bg-vr-red/15 text-vr-red px-2 py-0.5 rounded-full mb-1.5">
                            {item.repair_type}
                          </span>
                          {item.description && (
                            <p className="text-xs text-vr-silver/55 leading-relaxed">{item.description}</p>
                          )}
                        </div>
                        <span className="text-vr-red font-bold text-sm whitespace-nowrap shrink-0">
                          R$ {Number(item.price).toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleAdd(item)}
                        className={`mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all
                          ${added
                            ? 'bg-green-600 text-white'
                            : inCart
                            ? 'bg-vr-red/20 border border-vr-red text-vr-red'
                            : 'bg-vr-black border border-white/10 text-vr-silver hover:border-vr-red/40 hover:text-white'
                          }`}
                      >
                        {added ? (
                          <><Check className="w-3.5 h-3.5" /> Adicionado!</>
                        ) : inCart ? (
                          <><ShoppingCart className="w-3.5 h-3.5" /> No carrinho</>
                        ) : (
                          <><ShoppingCart className="w-3.5 h-3.5" /> Adicionar ao carrinho</>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
