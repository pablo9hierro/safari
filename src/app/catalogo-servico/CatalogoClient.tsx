'use client'

import { useMemo, useState } from 'react'
import type { CatalogCategory, CatalogItem } from './page'
import { Search, Wrench, ShoppingCart, Check, Battery, Smartphone, Camera, Zap } from 'lucide-react'
import { useCart } from '@/lib/carrinho/context'
import AccordionTags from '@/components/AccordionTags'

interface Props {
  categories: CatalogCategory[]
  items: CatalogItem[]
}

const REPAIR_ICONS: Record<string, React.ReactNode> = {
  'Troca de tela': <Smartphone className="w-4 h-4" />,
  'Troca de bateria': <Battery className="w-4 h-4" />,
  'Reparo de carregador': <Zap className="w-4 h-4" />,
  'Reparo de conector de carregador': <Zap className="w-4 h-4" />,
  'Troca de câmera traseira': <Camera className="w-4 h-4" />,
}

function repairIcon(repairType: string) {
  return REPAIR_ICONS[repairType] ?? <Wrench className="w-4 h-4" />
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

  const allRepairTypes = useMemo(() => {
    const types = new Set<string>()
    for (const i of categoryItems) types.add(i.repair_type)
    return Array.from(types).sort()
  }, [categoryItems])

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
    <div className="space-y-6">
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

      {/* Banner da marca ativa */}
      {activeCategory?.image_url && (
        <div className="relative w-full h-36 rounded-2xl overflow-hidden">
          <img
            src={activeCategory.image_url}
            alt={activeCategory.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-r from-vr-black/80 via-vr-black/40 to-transparent" />
          <div className="absolute inset-0 flex items-center px-6">
            <div>
              <p className="text-xs font-semibold text-vr-red uppercase tracking-widest mb-1">Reparos</p>
              <h2 className="text-2xl font-black text-white">{activeCategory.name}</h2>
              <p className="text-vr-silver/60 text-xs mt-0.5">{categoryItems.length} serviços disponíveis</p>
            </div>
          </div>
        </div>
      )}

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
        <div className="space-y-10">
          {Array.from(byModel.entries()).map(([modelName, modelItems]) => {
            const modelImage = modelItems[0]?.image_url
            return (
              <section key={modelName}>
                {/* Cabeçalho do modelo com foto */}
                <div className="flex items-center gap-3 mb-4">
                  {modelImage ? (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-vr-graphite">
                      <img src={modelImage} alt={modelName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-vr-graphite border border-white/10 shrink-0 flex items-center justify-center">
                      <Smartphone className="w-6 h-6 text-vr-silver/30" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-white font-bold text-base">{modelName}</h3>
                    <p className="text-vr-silver/40 text-xs">
                      {modelItems.length} serviço{modelItems.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Cards de reparo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {modelItems.map((item) => {
                    const added = recentlyAdded.has(item.id)
                    const inCart = isInCart(item.id)
                    return (
                      <div
                        key={item.id}
                        className="bg-vr-graphite border border-white/5 rounded-2xl overflow-hidden hover:border-vr-red/20 transition-all group"
                      >
                        {/* Faixa de imagem estreita no topo do card */}
                        {modelImage && (
                          <div className="h-24 overflow-hidden relative">
                            <img
                              src={modelImage}
                              alt={modelName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute inset-0 bg-linear-to-b from-transparent to-vr-graphite" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-vr-red shrink-0">
                                {repairIcon(item.repair_type)}
                              </span>
                              <span className="text-sm font-bold text-white leading-tight">
                                {item.repair_type}
                              </span>
                            </div>
                            <span className="text-vr-red font-black text-base whitespace-nowrap shrink-0">
                              R$ {Number(item.price).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-vr-silver/55 leading-relaxed mb-3">
                              {item.description}
                            </p>
                          )}
                          <button
                            onClick={() => handleAdd(item)}
                            className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all
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
                          <AccordionTags tags={item.tags} dark />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
