'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Plus, Trash2, Loader2, Check, ExternalLink, Search, X, Wrench, Pencil, DollarSign } from 'lucide-react'
import { AdminToStoreLink } from '@/lib/storeProxyLink'
import type { StockItem } from '@/lib/types'
import Dialog from '@/components/ui/Dialog'

interface Category { id: string; name: string; slug: string; sort_order: number }
interface ItemPart { id: string; quantity: number; stock_item_id: string; stock_items: { name: string; unit: string } | null }
interface ItemExtraCost { id: string; name: string; value: number }
interface Item {
  id: string; category_id: string; model_name: string; repair_type: string
  price: number; cost_price: number; duration_minutes: number
  description: string | null; sort_order: number; active: boolean
  service_catalog_item_parts?: ItemPart[]
  service_catalog_item_extra_costs?: ItemExtraCost[]
}

const INPUT = 'w-full px-3 py-2 rounded-lg border border-white/10 bg-vr-black text-white placeholder-white/25 text-sm outline-none focus:border-vr-red/60 transition-all'

interface Props {
  initialCategories: Category[]
  initialItems: Item[]
  stockItems: StockItem[]
}

type SelectedPart = { stock_item_id: string; name: string; unit: string; price: number; quantity: number }
type ExtraCost = { name: string; value: number }

export default function ServicosTab({ initialCategories, initialItems, stockItems }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [items, setItems] = useState<Item[]>(initialItems)
  const [activeCatId, setActiveCatId] = useState<string | null>(initialCategories[0]?.id ?? null)

  const [newCatName, setNewCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  const [newModel, setNewModel] = useState('')
  const [newRepair, setNewRepair] = useState('')
  const [newPrice, setNewPrice] = useState('')
  // Duração cobre o atendimento inteiro: coleta + manutenção + entrega.
  // É ela que define quanto tempo o agendamento ocupa na agenda.
  const [newDuration, setNewDuration] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [savedItem, setSavedItem] = useState(false)

  // Peças de estoque usadas como dependência do serviço — o custo do
  // serviço é calculado automaticamente a partir delas (soma de preço × qtd).
  const [partsQuery, setPartsQuery] = useState('')
  const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([])

  // Custo avulso — não é peça de estoque nem produto (ex: mão de obra
  // externa, taxa de terceiro). Nome livre + valor, soma no custo total.
  // Um dialog só, compartilhado entre o form de criar e o de editar,
  // controlado por qual dos dois está "alvo" no momento.
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([])
  const [extraCostTarget, setExtraCostTarget] = useState<'new' | 'edit' | null>(null)
  const [extraCostName, setExtraCostName] = useState('')
  const [extraCostValue, setExtraCostValue] = useState('')

  const activeItems = items.filter((i) => i.category_id === activeCatId)

  const partMatches = useMemo(() => {
    const q = partsQuery.trim().toLowerCase()
    if (!q) return []
    return stockItems
      .filter((s) => s.name.toLowerCase().includes(q) && !selectedParts.some((p) => p.stock_item_id === s.id))
      .slice(0, 6)
  }, [partsQuery, stockItems, selectedParts])

  const costPrice =
    selectedParts.reduce((sum, p) => sum + p.price * p.quantity, 0) +
    extraCosts.reduce((sum, c) => sum + c.value, 0)

  const addExtraCost = () => {
    const value = Number(extraCostValue)
    if (!extraCostName.trim() || !Number.isFinite(value) || value < 0) return
    const cost = { name: extraCostName.trim(), value }
    if (extraCostTarget === 'edit') setEditExtraCosts((prev) => [...prev, cost])
    else setExtraCosts((prev) => [...prev, cost])
    setExtraCostName(''); setExtraCostValue(''); setExtraCostTarget(null)
  }

  const removeExtraCost = (index: number) => {
    setExtraCosts((prev) => prev.filter((_, i) => i !== index))
  }

  const addPart = (s: StockItem) => {
    setSelectedParts((prev) => [...prev, { stock_item_id: s.id, name: s.name, unit: s.unit, price: s.price ?? 0, quantity: 1 }])
    setPartsQuery('')
  }

  const removePart = (stockItemId: string) => {
    setSelectedParts((prev) => prev.filter((p) => p.stock_item_id !== stockItemId))
  }

  const setPartQty = (stockItemId: string, qty: number) => {
    setSelectedParts((prev) => prev.map((p) => (p.stock_item_id === stockItemId ? { ...p, quantity: qty } : p)))
  }

  // Editar serviço já cadastrado — mesmas regras de custo/preço final do
  // cadastro: custo sempre recalculado pela soma das peças selecionadas.
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [editModel, setEditModel] = useState('')
  const [editRepair, setEditRepair] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPartsQuery, setEditPartsQuery] = useState('')
  const [editSelectedParts, setEditSelectedParts] = useState<SelectedPart[]>([])
  const [editExtraCosts, setEditExtraCosts] = useState<ExtraCost[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const editPartMatches = useMemo(() => {
    const q = editPartsQuery.trim().toLowerCase()
    if (!q) return []
    return stockItems
      .filter((s) => s.name.toLowerCase().includes(q) && !editSelectedParts.some((p) => p.stock_item_id === s.id))
      .slice(0, 6)
  }, [editPartsQuery, stockItems, editSelectedParts])

  const editCostPrice =
    editSelectedParts.reduce((sum, p) => sum + p.price * p.quantity, 0) +
    editExtraCosts.reduce((sum, c) => sum + c.value, 0)

  const removeEditExtraCost = (index: number) => {
    setEditExtraCosts((prev) => prev.filter((_, i) => i !== index))
  }

  const openEditItem = (item: Item) => {
    setEditingItem(item)
    setEditModel(item.model_name)
    setEditRepair(item.repair_type)
    setEditPrice(String(item.price))
    setEditDuration(String(item.duration_minutes))
    setEditDesc(item.description ?? '')
    setEditSelectedParts(
      (item.service_catalog_item_parts ?? []).map((p) => ({
        stock_item_id: p.stock_item_id,
        name: p.stock_items?.name ?? '?',
        unit: p.stock_items?.unit ?? 'unidade',
        price: stockItems.find((s) => s.id === p.stock_item_id)?.price ?? 0,
        quantity: Number(p.quantity),
      }))
    )
    setEditExtraCosts((item.service_catalog_item_extra_costs ?? []).map((c) => ({ name: c.name, value: Number(c.value) })))
    setEditError(null)
  }

  const saveEditItem = async () => {
    if (!editingItem) return
    const duration = Number(editDuration)
    if (!editModel.trim() || !editRepair.trim() || !editPrice || !(duration > 0)) {
      setEditError('Preencha modelo, tipo de reparo, preço final e duração.')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    const supabase = createClient()

    const { data: updated, error } = await supabase
      .from('service_catalog_items')
      .update({
        model_name: editModel.trim(),
        repair_type: editRepair.trim(),
        price: parseFloat(editPrice),
        cost_price: editCostPrice,
        duration_minutes: duration,
        description: editDesc.trim() || null,
      })
      .eq('id', editingItem.id)
      .select()
      .single()

    if (error || !updated) {
      setEditError('Não foi possível salvar as alterações.')
      setSavingEdit(false)
      return
    }

    await supabase.from('service_catalog_item_parts').delete().eq('service_catalog_item_id', editingItem.id)
    let parts: ItemPart[] = []
    if (editSelectedParts.length > 0) {
      const { data: partRows } = await supabase
        .from('service_catalog_item_parts')
        .insert(editSelectedParts.map((p) => ({ service_catalog_item_id: editingItem.id, stock_item_id: p.stock_item_id, quantity: p.quantity })))
        .select('id, quantity, stock_item_id, stock_items(name, unit)')
      parts = (partRows as unknown as ItemPart[]) ?? []
    }

    await supabase.from('service_catalog_item_extra_costs').delete().eq('service_catalog_item_id', editingItem.id)
    let extras: ItemExtraCost[] = []
    if (editExtraCosts.length > 0) {
      const { data: extraRows } = await supabase
        .from('service_catalog_item_extra_costs')
        .insert(editExtraCosts.map((c) => ({ service_catalog_item_id: editingItem.id, name: c.name, value: c.value })))
        .select('id, name, value')
      extras = (extraRows as unknown as ItemExtraCost[]) ?? []
    }

    setItems((prev) => prev.map((i) => (i.id === editingItem.id ? { ...(updated as Item), service_catalog_item_parts: parts, service_catalog_item_extra_costs: extras } : i)))
    setSavingEdit(false)
    setEditingItem(null)
  }

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
    const duration = Number(newDuration)
    if (!activeCatId || !newModel.trim() || !newRepair.trim() || !newPrice) return
    if (!Number.isFinite(duration) || duration <= 0) return
    setSavingItem(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('service_catalog_items')
      .insert({
        category_id: activeCatId,
        model_name: newModel.trim(),
        repair_type: newRepair.trim(),
        price: parseFloat(newPrice),
        cost_price: costPrice,
        duration_minutes: duration,
        description: newDesc.trim() || null,
        sort_order: activeItems.length,
      })
      .select()
      .single()
    if (error || !data) { setSavingItem(false); return }

    let parts: ItemPart[] = []
    if (selectedParts.length > 0) {
      const { data: partRows } = await supabase
        .from('service_catalog_item_parts')
        .insert(selectedParts.map((p) => ({ service_catalog_item_id: data.id, stock_item_id: p.stock_item_id, quantity: p.quantity })))
        .select('id, quantity, stock_item_id, stock_items(name, unit)')
      parts = (partRows as unknown as ItemPart[]) ?? []
    }

    let extras: ItemExtraCost[] = []
    if (extraCosts.length > 0) {
      const { data: extraRows } = await supabase
        .from('service_catalog_item_extra_costs')
        .insert(extraCosts.map((c) => ({ service_catalog_item_id: data.id, name: c.name, value: c.value })))
        .select('id, name, value')
      extras = (extraRows as unknown as ItemExtraCost[]) ?? []
    }

    setSavingItem(false)
    setItems((prev) => [...prev, { ...(data as Item), service_catalog_item_parts: parts, service_catalog_item_extra_costs: extras }])
    setNewModel(''); setNewRepair(''); setNewPrice(''); setNewDuration(''); setNewDesc('')
    setSelectedParts([]); setExtraCosts([])
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          Catálogo de serviços
        </p>
        <AdminToStoreLink href="/catalogo-servico" target="_blank" className="flex items-center gap-1.5 text-xs text-vr-silver/60 hover:text-vr-red transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Ver página pública
        </AdminToStoreLink>
      </div>

      {/* Marcas */}
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
          <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-vr-silver/70">
              Adicionar serviço em <span className="text-white">{categories.find((c) => c.id === activeCatId)?.name}</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Modelo (ex: iPhone 14 Pro)" className={INPUT} />
              <input value={newRepair} onChange={(e) => setNewRepair(e.target.value)} placeholder="Tipo de reparo (ex: Troca de tela)" className={INPUT} />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs">R$</span>
                <input type="number" step="0.01" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Preço final 0,00" className={`${INPUT} pl-8`} />
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  placeholder="Duração *"
                  className={`${INPUT} pr-12`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs">min</span>
              </div>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descrição opcional" className={`${INPUT} col-span-2`} />
            </div>
            <p className="text-xs text-vr-silver/50 -mt-1">
              A <strong className="text-vr-silver/70">duração</strong> é obrigatória e conta o atendimento
              inteiro — coleta do aparelho + manutenção + entrega. É ela que define quanto tempo o
              horário fica ocupado na agenda.
            </p>

            {/* Peças de estoque (dependência do serviço) */}
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-vr-silver/70">
                <Wrench className="w-3.5 h-3.5 text-vr-red" />
                Peças usadas (item de estoque como dependência do serviço)
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={partsQuery}
                  onChange={(e) => setPartsQuery(e.target.value)}
                  placeholder="Buscar peça no estoque (ex: tela, bateria)..."
                  className={`${INPUT} pl-8`}
                />
                {partMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-vr-black border border-white/10 rounded-lg overflow-hidden shadow-lg">
                    {partMatches.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addPart(s)}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-vr-red/15 transition-colors flex items-center justify-between"
                      >
                        <span>{s.name}</span>
                        <span className="text-vr-silver/40 text-xs">R$ {Number(s.price ?? 0).toFixed(2)} · estoque {s.quantity}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedParts.length > 0 && (
                <div className="space-y-1.5">
                  {selectedParts.map((p) => (
                    <div key={p.stock_item_id} className="flex items-center gap-2 bg-vr-black border border-white/8 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={p.quantity}
                        onChange={(e) => setPartQty(p.stock_item_id, Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 rounded bg-vr-graphite border border-white/10 text-white text-xs text-center outline-none focus:border-vr-red/50"
                      />
                      <span className="text-xs text-vr-silver/40 w-8">{p.unit}</span>
                      <span className="text-xs text-vr-silver/60 w-20 text-right">R$ {(p.price * p.quantity).toFixed(2)}</span>
                      <button onClick={() => removePart(p.stock_item_id)} className="text-vr-silver/30 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custos avulsos — não é peça de estoque nem produto */}
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-vr-silver/70">
                  <DollarSign className="w-3.5 h-3.5 text-vr-red" />
                  Custos do serviço (avulso, externo)
                </div>
                <button
                  type="button"
                  onClick={() => setExtraCostTarget('new')}
                  className="flex items-center gap-1 text-xs font-semibold bg-vr-black border border-white/10 text-white px-2.5 py-1.5 rounded-lg hover:border-vr-red/40 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Custo
                </button>
              </div>
              {extraCosts.length > 0 && (
                <div className="space-y-1.5">
                  {extraCosts.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 bg-vr-black border border-white/8 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-vr-silver/60 w-20 text-right">R$ {c.value.toFixed(2)}</span>
                      <button onClick={() => removeExtraCost(i)} className="text-vr-silver/30 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-vr-silver/60">Custo do serviço (peças + avulsos)</span>
                <span className="font-bold text-white">R$ {costPrice.toFixed(2)}</span>
              </div>
              {newPrice && Number(newPrice) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-vr-silver/40">Margem (preço final − custo)</span>
                  <span className={Number(newPrice) - costPrice >= 0 ? 'text-green-400' : 'text-red-400'}>
                    R$ {(Number(newPrice) - costPrice).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={addItem}
              disabled={savingItem || !newModel.trim() || !newRepair.trim() || !newPrice || !(Number(newDuration) > 0)}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all
                ${savedItem ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40'}`}
            >
              {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedItem ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {savedItem ? 'Adicionado!' : 'Adicionar serviço'}
            </button>
          </div>

          {activeItems.length > 0 && (
            <div className="bg-vr-graphite border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
              {activeItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white font-medium">{item.model_name}</span>
                      <span className="text-xs bg-vr-red/15 text-vr-red px-2 py-0.5 rounded-full">{item.repair_type}</span>
                      <span className="text-sm font-bold text-white">R$ {Number(item.price).toFixed(2)}</span>
                      {item.cost_price > 0 && (
                        <span className="text-xs bg-white/5 text-vr-silver/50 px-2 py-0.5 rounded-full">custo R$ {Number(item.cost_price).toFixed(2)}</span>
                      )}
                      <span className="text-xs bg-white/5 text-vr-silver/70 px-2 py-0.5 rounded-full">
                        {item.duration_minutes} min
                      </span>
                    </div>
                    {item.description && <p className="text-xs text-vr-silver/50 mt-0.5 truncate">{item.description}</p>}
                    {item.service_catalog_item_parts && item.service_catalog_item_parts.length > 0 && (
                      <p className="text-xs text-vr-silver/40 mt-0.5 truncate">
                        Peças: {item.service_catalog_item_parts.map((p) => `${p.quantity}x ${p.stock_items?.name ?? '?'}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors
                        ${item.active ? 'bg-green-600/20 text-green-400' : 'bg-white/5 text-vr-silver/40'}`}
                    >
                      {item.active ? 'ativo' : 'oculto'}
                    </button>
                    <button onClick={() => openEditItem(item)} className="text-vr-silver/30 hover:text-vr-red transition-colors">
                      <Pencil className="w-4 h-4" />
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

      <Dialog open={!!editingItem} onClose={() => setEditingItem(null)} title="Editar serviço">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="Modelo" className={INPUT} />
            <input value={editRepair} onChange={(e) => setEditRepair(e.target.value)} placeholder="Tipo de reparo" className={INPUT} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs">R$</span>
              <input type="number" step="0.01" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Preço final 0,00" className={`${INPUT} pl-8`} />
            </div>
            <div className="relative">
              <input type="number" min="1" step="5" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} placeholder="Duração *" className={`${INPUT} pr-12`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-vr-silver/40 text-xs">min</span>
            </div>
            <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrição opcional" className={`${INPUT} col-span-2`} />
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-vr-silver/70">
              <Wrench className="w-3.5 h-3.5 text-vr-red" />
              Peças usadas
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={editPartsQuery}
                onChange={(e) => setEditPartsQuery(e.target.value)}
                placeholder="Buscar peça no estoque..."
                className={`${INPUT} pl-8`}
              />
              {editPartMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-vr-black border border-white/10 rounded-lg overflow-hidden shadow-lg">
                  {editPartMatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setEditSelectedParts((prev) => [...prev, { stock_item_id: s.id, name: s.name, unit: s.unit, price: s.price ?? 0, quantity: 1 }])
                        setEditPartsQuery('')
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-vr-red/15 transition-colors flex items-center justify-between"
                    >
                      <span>{s.name}</span>
                      <span className="text-vr-silver/40 text-xs">R$ {Number(s.price ?? 0).toFixed(2)} · estoque {s.quantity}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {editSelectedParts.length > 0 && (
              <div className="space-y-1.5">
                {editSelectedParts.map((p) => (
                  <div key={p.stock_item_id} className="flex items-center gap-2 bg-vr-black border border-white/8 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={p.quantity}
                      onChange={(e) => setEditSelectedParts((prev) => prev.map((x) => (x.stock_item_id === p.stock_item_id ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
                      className="w-16 px-2 py-1 rounded bg-vr-graphite border border-white/10 text-white text-xs text-center outline-none focus:border-vr-red/50"
                    />
                    <span className="text-xs text-vr-silver/40 w-8">{p.unit}</span>
                    <span className="text-xs text-vr-silver/60 w-20 text-right">R$ {(p.price * p.quantity).toFixed(2)}</span>
                    <button onClick={() => setEditSelectedParts((prev) => prev.filter((x) => x.stock_item_id !== p.stock_item_id))} className="text-vr-silver/30 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-vr-silver/70">
                <DollarSign className="w-3.5 h-3.5 text-vr-red" />
                Custos do serviço (avulso, externo)
              </div>
              <button
                type="button"
                onClick={() => setExtraCostTarget('edit')}
                className="flex items-center gap-1 text-xs font-semibold bg-vr-black border border-white/10 text-white px-2.5 py-1.5 rounded-lg hover:border-vr-red/40 transition-colors"
              >
                <Plus className="w-3 h-3" /> Custo
              </button>
            </div>
            {editExtraCosts.length > 0 && (
              <div className="space-y-1.5">
                {editExtraCosts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-vr-black border border-white/8 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-vr-silver/60 w-20 text-right">R$ {c.value.toFixed(2)}</span>
                    <button onClick={() => removeEditExtraCost(i)} className="text-vr-silver/30 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-vr-silver/60">Custo do serviço (peças + avulsos)</span>
              <span className="font-bold text-white">R$ {editCostPrice.toFixed(2)}</span>
            </div>
            {editPrice && Number(editPrice) > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-vr-silver/40">Margem (preço final − custo)</span>
                <span className={Number(editPrice) - editCostPrice >= 0 ? 'text-green-400' : 'text-red-400'}>
                  R$ {(Number(editPrice) - editCostPrice).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {editError && <p className="text-xs text-red-400">{editError}</p>}

          <button
            onClick={saveEditItem}
            disabled={savingEdit}
            className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {savingEdit ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </Dialog>

      <Dialog open={extraCostTarget !== null} onClose={() => setExtraCostTarget(null)} title="Novo custo avulso">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do custo</label>
            <input
              value={extraCostName}
              onChange={(e) => setExtraCostName(e.target.value)}
              placeholder="Ex: mão de obra terceirizada"
              className={`${INPUT} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={extraCostValue}
              onChange={(e) => setExtraCostValue(e.target.value)}
              placeholder="0,00"
              className={`${INPUT} mt-1`}
            />
          </div>
          <button
            type="button"
            onClick={addExtraCost}
            disabled={!extraCostName.trim() || !extraCostValue}
            className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Adicionar custo
          </button>
        </div>
      </Dialog>
    </div>
  )
}
