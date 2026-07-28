'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Plus, Trash2, Loader2, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Category { id: string; name: string; slug: string; sort_order: number }
interface Item { id: string; category_id: string; model_name: string; repair_type: string; price: number; description: string | null; sort_order: number; active: boolean }

const INPUT = 'w-full px-3 py-2 rounded-lg border border-white/10 bg-vr-black text-white placeholder-white/25 text-sm outline-none focus:border-vr-red/60 transition-all'

interface Props {
  initialCategories: Category[]
  initialItems: Item[]
}

export default function CatalogoDashboardClient({ initialCategories, initialItems }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [items, setItems] = useState<Item[]>(initialItems)
  const [activeCatId, setActiveCatId] = useState<string | null>(initialCategories[0]?.id ?? null)

  // Nova categoria
  const [newCatName, setNewCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  // Novo item
  const [newModel, setNewModel] = useState('')
  const [newRepair, setNewRepair] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [savedItem, setSavedItem] = useState(false)

  const activeItems = items.filter((i) => i.category_id === activeCatId)

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setSavingCat(true)
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('service_catalog_categories')
      .insert({ name, slug, sort_order: categories.length })
      .select()
      .single()
    setSavingCat(false)
    if (error || !data) return
    setCategories((prev) => [...prev, data as Category])
    setActiveCatId(data.id)
    setNewCatName('')
  }

  const deleteCategory = async (id: string) => {
    const supabase = createClient()
    await supabase.from('service_catalog_categories').delete().eq('id', id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setItems((prev) => prev.filter((i) => i.category_id !== id))
    if (activeCatId === id) setActiveCatId(categories.find((c) => c.id !== id)?.id ?? null)
  }

  const addItem = async () => {
    if (!activeCatId || !newModel.trim() || !newRepair.trim() || !newPrice) return
    setSavingItem(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('service_catalog_items')
      .insert({
        category_id: activeCatId,
        model_name: newModel.trim(),
        repair_type: newRepair.trim(),
        price: parseFloat(newPrice),
        description: newDesc.trim() || null,
        sort_order: activeItems.length,
      })
      .select()
      .single()
    setSavingItem(false)
    if (error || !data) return
    setItems((prev) => [...prev, data as Item])
    setNewModel(''); setNewRepair(''); setNewPrice(''); setNewDesc('')
    setSavedItem(true); setTimeout(() => setSavedItem(false), 1500)
  }

  const deleteItem = async (id: string) => {
    const supabase = createClient()
    await supabase.from('service_catalog_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const toggleActive = async (item: Item) => {
    const supabase = createClient()
    await supabase.from('service_catalog_items').update({ active: !item.active }).eq('id', item.id)
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, active: !i.active } : i))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-vr-red" />
          Catálogo de serviços
        </h1>
        <Link href="/catalogo-servico" target="_blank" className="flex items-center gap-1.5 text-xs text-vr-silver/60 hover:text-vr-red transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Ver página pública
        </Link>
      </div>

      {/* Categorias (marcas) */}
      <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-vr-silver/70">Marcas / Categorias</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveCatId(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${activeCatId === cat.id ? 'bg-vr-red text-white' : 'bg-vr-black border border-white/10 text-vr-silver hover:border-vr-red/30'}`}
              >
                {cat.name}
              </button>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="w-5 h-5 rounded flex items-center justify-center text-vr-silver/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Nova marca..."
              className={`${INPUT} w-32`}
            />
            <button
              onClick={addCategory}
              disabled={savingCat || !newCatName.trim()}
              className="w-8 h-8 rounded-lg bg-vr-red text-white flex items-center justify-center disabled:opacity-40"
            >
              {savingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {activeCatId && (
        <>
          {/* Adicionar item */}
          <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-vr-silver/70">
              Adicionar serviço em <span className="text-white">{categories.find((c) => c.id === activeCatId)?.name}</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Modelo (ex: iPhone 14 Pro)" className={INPUT} />
              <input value={newRepair} onChange={(e) => setNewRepair(e.target.value)} placeholder="Tipo de reparo (ex: Troca de tela)" className={INPUT} />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs">R$</span>
                <input type="number" step="0.01" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0,00" className={`${INPUT} pl-8`} />
              </div>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descrição opcional" className={INPUT} />
            </div>
            <button
              onClick={addItem}
              disabled={savingItem || !newModel.trim() || !newRepair.trim() || !newPrice}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all
                ${savedItem ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40'}`}
            >
              {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedItem ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {savedItem ? 'Adicionado!' : 'Adicionar serviço'}
            </button>
          </div>

          {/* Lista de itens */}
          {activeItems.length > 0 && (
            <div className="bg-vr-graphite border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
              {activeItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white font-medium">{item.model_name}</span>
                      <span className="text-xs bg-vr-red/15 text-vr-red px-2 py-0.5 rounded-full">{item.repair_type}</span>
                      <span className="text-sm font-bold text-white">R$ {Number(item.price).toFixed(2)}</span>
                    </div>
                    {item.description && <p className="text-xs text-vr-silver/50 mt-0.5 truncate">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors
                        ${item.active ? 'bg-green-600/20 text-green-400' : 'bg-white/5 text-vr-silver/40'}`}
                    >
                      {item.active ? 'ativo' : 'oculto'}
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="text-vr-silver/30 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeItems.length === 0 && (
            <p className="text-center text-sm text-vr-silver/40 py-6">Nenhum serviço cadastrado nesta categoria.</p>
          )}
        </>
      )}
    </div>
  )
}
