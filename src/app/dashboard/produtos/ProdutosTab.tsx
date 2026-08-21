'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiPath } from '@/lib/storeProxyLink'
import { Product, ProductCategory } from '@/lib/types'
import { logStockEvent, stockTransitionEvent } from '@/lib/stockActivityLog'
import { Package, Search, X, Pencil, Trash2, Loader2, ImagePlus, ChevronDown, ChevronRight } from 'lucide-react'

const MAX_IMAGES = 3

type ImageSlot = { url: string | null; file: File | null }

function emptySlots(urls: string[] = []): ImageSlot[] {
  return Array.from({ length: MAX_IMAGES }, (_, i) => ({ url: urls[i] ?? null, file: null }))
}

async function uploadImage(supabase: ReturnType<typeof createClient>, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('service-order-media').upload(fileName, file)
  if (error) return null
  const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
  return pub.publicUrl
}

async function uploadSlots(supabase: ReturnType<typeof createClient>, slots: ImageSlot[]): Promise<string[]> {
  const urls: string[] = []
  for (const slot of slots) {
    if (slot.file) {
      const uploaded = await uploadImage(supabase, slot.file)
      if (uploaded) urls.push(uploaded)
    } else if (slot.url) {
      urls.push(slot.url)
    }
  }
  return urls
}

function ImageSlotsPicker({ slots, onChange }: { slots: ImageSlot[]; onChange: (next: ImageSlot[]) => void }) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const pick = (idx: number, file: File | null) => {
    const next = [...slots]
    next[idx] = { url: file ? URL.createObjectURL(file) : next[idx].url, file }
    onChange(next)
  }
  const remove = (idx: number) => {
    const next = [...slots]
    next[idx] = { url: null, file: null }
    onChange(next)
  }
  return (
    <div className="flex items-center gap-2">
      {slots.map((slot, idx) => (
        <div key={idx} className="relative">
          <button type="button" onClick={() => refs[idx].current?.click()}
            className="w-16 h-16 rounded-xl bg-vr-black border border-white/10 border-dashed flex items-center justify-center overflow-hidden">
            {slot.url ? <img src={slot.url} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-vr-silver/40" />}
          </button>
          {slot.url && (
            <button type="button" onClick={() => remove(idx)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-vr-red text-white flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          )}
          <input ref={refs[idx]} type="file" accept="image/*" className="hidden" onChange={(e) => pick(idx, e.target.files?.[0] ?? null)} />
        </div>
      ))}
    </div>
  )
}

interface Props {
  initialProducts: Product[]
  initialCategories: ProductCategory[]
}

export default function ProdutosTab({ initialProducts, initialCategories }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<ProductCategory[]>(initialCategories)
  const [showForm, setShowForm] = useState(false)

  // Create form
  const [name, setName] = useState('')
  const [phoneBrand, setPhoneBrand] = useState('')
  const [phoneModel, setPhoneModel] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [description, setDescription] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>(emptySlots())
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeBrand, setActiveBrand] = useState<string | null>(null)

  const [actionsProduct, setActionsProduct] = useState<Product | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhoneBrand, setEditPhoneBrand] = useState('')
  const [editPhoneModel, setEditPhoneModel] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLowStockThreshold, setEditLowStockThreshold] = useState('')
  const [editImageSlots, setEditImageSlots] = useState<ImageSlot[]>(emptySlots())
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Unique brands from existing products
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) { if (p.phone_brand) set.add(p.phone_brand) }
    return Array.from(set).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    let base = products
    if (activeBrand) base = base.filter((p) => p.phone_brand === activeBrand)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.phone_model ?? '').toLowerCase().includes(q))
  }, [products, activeBrand, searchQuery])

  // Group by phone_model (or "Sem modelo" if not set)
  const byModel = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of filteredProducts) {
      const key = p.phone_model ?? 'Sem modelo'
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [filteredProducts])

  const resolveCategoryId = async (supabase: ReturnType<typeof createClient>, rawName: string): Promise<string | null> => {
    const trimmed = rawName.trim()
    if (!trimmed) return null
    const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.id
    const { data: created } = await supabase.from('product_categories').insert({ name: trimmed }).select().single()
    if (created) {
      setCategories((prev) => [...prev, created as ProductCategory].sort((a, b) => a.name.localeCompare(b.name)))
      return (created as ProductCategory).id
    }
    return null
  }

  const resetForm = () => {
    setName(''); setPhoneBrand(''); setPhoneModel(''); setPrice(''); setQuantity(''); setDescription('')
    setLowStockThreshold(''); setImageSlots(emptySlots())
    setCreateError(null); setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    const trimmedName = name.trim()
    const priceNum = parseFloat(price)
    const qtyNum = parseFloat(quantity)
    if (!trimmedName) { setCreateError('Informe o nome do produto.'); return }
    if (!price || isNaN(priceNum) || priceNum < 0) { setCreateError('Informe um preço válido.'); return }
    if (!quantity || isNaN(qtyNum) || qtyNum < 0) { setCreateError('Informe uma quantidade válida.'); return }

    setCreating(true)
    const supabase = createClient()
    const categoryId = phoneBrand.trim() ? await resolveCategoryId(supabase, phoneBrand.trim()) : null
    const imageUrls = await uploadSlots(supabase, imageSlots)

    const { data: created, error } = await supabase
      .from('products')
      .insert({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: description.trim() || null,
        category_id: categoryId,
        phone_brand: phoneBrand.trim() || null,
        phone_model: phoneModel.trim() || null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        low_stock_threshold: lowStockThreshold.trim() ? Number(lowStockThreshold) : null,
      })
      .select('*, product_categories(name)')
      .single()

    if (error || !created) {
      setCreateError('Não foi possível cadastrar o produto.')
      setCreating(false)
      return
    }

    setProducts((prev) => [...prev, created as Product].sort((a, b) => a.name.localeCompare(b.name)))
    logStockEvent(supabase, 'product', created.id, created.name, 'created')
    resetForm()
    setCreating(false)

    // Tags de busca (IA) geram em background -- não trava o cadastro nem
    // aparecem pro cliente, só alimentam busca/assistente (ver AccordionTags).
    fetch(apiPath('/api/catalog/tags'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'product', id: created.id }),
    }).catch(() => {})
  }

  const openEdit = (product: Product) => {
    setEditProduct(product)
    setEditName(product.name)
    setEditPhoneBrand(product.phone_brand ?? '')
    setEditPhoneModel(product.phone_model ?? '')
    setEditPrice(String(Number(product.price)))
    setEditQuantity(String(Number(product.quantity)))
    setEditDescription(product.description ?? '')
    setEditLowStockThreshold(product.low_stock_threshold != null ? String(product.low_stock_threshold) : '')
    setEditImageSlots(emptySlots(product.image_urls?.length ? product.image_urls : (product.image_url ? [product.image_url] : [])))
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!editProduct) return
    setEditError(null)
    const trimmedName = editName.trim()
    const priceNum = parseFloat(editPrice)
    const qtyNum = parseFloat(editQuantity)
    if (!trimmedName) { setEditError('Informe o nome do produto.'); return }
    if (!editPrice || isNaN(priceNum) || priceNum < 0) { setEditError('Informe um preço válido.'); return }
    if (!editQuantity || isNaN(qtyNum) || qtyNum < 0) { setEditError('Informe uma quantidade válida.'); return }

    setSavingEdit(true)
    const supabase = createClient()
    const categoryId = editPhoneBrand.trim() ? await resolveCategoryId(supabase, editPhoneBrand.trim()) : null
    const imageUrls = await uploadSlots(supabase, editImageSlots)

    const { data: updated, error } = await supabase
      .from('products')
      .update({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: editDescription.trim() || null,
        category_id: categoryId,
        phone_brand: editPhoneBrand.trim() || null,
        phone_model: editPhoneModel.trim() || null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        low_stock_threshold: editLowStockThreshold.trim() ? Number(editLowStockThreshold) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editProduct.id)
      .select('*, product_categories(name)')
      .single()

    if (error || !updated) {
      setEditError('Não foi possível salvar as alterações.')
      setSavingEdit(false)
      return
    }

    setProducts((prev) => prev.map((p) => (p.id === editProduct.id ? (updated as Product) : p)).sort((a, b) => a.name.localeCompare(b.name)))
    logStockEvent(supabase, 'product', editProduct.id, (updated as Product).name, 'updated')
    const transition = stockTransitionEvent(Number(editProduct.quantity), qtyNum, (updated as Product).low_stock_threshold)
    if (transition) logStockEvent(supabase, 'product', editProduct.id, (updated as Product).name, transition)
    setSavingEdit(false)
    setEditProduct(null)
  }

  const handleDelete = async () => {
    if (!actionsProduct) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('products').delete().eq('id', actionsProduct.id)
    if (error) { setDeleting(false); return }
    setProducts((prev) => prev.filter((p) => p.id !== actionsProduct.id))
    logStockEvent(supabase, 'product', actionsProduct.id, actionsProduct.name, 'deleted')
    setDeleting(false)
    setActionsProduct(null)
  }

  return (
    <div className="space-y-4">
      {/* Novo produto */}
      <div className="bg-vr-graphite rounded-2xl border border-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Package className="w-4 h-4 text-vr-red" />
            Novo produto
          </span>
          {showForm ? <ChevronDown className="w-4 h-4 text-vr-silver/50" /> : <ChevronRight className="w-4 h-4 text-vr-silver/50" />}
        </button>

        {showForm && (
          <form onSubmit={handleCreate} className="px-4 pb-4 space-y-3 border-t border-white/5">
            <div className="pt-3">
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Fotos (até {MAX_IMAGES})</label>
              <div className="mt-1"><ImageSlotsPicker slots={imageSlots} onChange={setImageSlots} /></div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do produto *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Tela OLED"
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Marca</label>
                <input value={phoneBrand} onChange={(e) => setPhoneBrand(e.target.value)} placeholder="Ex: iPhone"
                  list="brand-suggestions"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
                <datalist id="brand-suggestions">
                  {brands.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Modelo do aparelho</label>
                <input value={phoneModel} onChange={(e) => setPhoneModel(e.target.value)} placeholder="Ex: iPhone 14 Pro"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Preço (R$) *</label>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
                <input type="number" inputMode="numeric" step="1" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Descrição</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do produto..." rows={2}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red resize-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Alertar baixo estoque quando chegar em:</label>
              <input type="number" inputMode="numeric" step="1" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="Opcional -- ex: 5"
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
            </div>
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Cadastrar produto
              </button>
              <button type="button" onClick={resetForm} className="px-4 text-sm text-vr-silver/60 hover:text-white transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        {brands.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setActiveBrand(null)}
              className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all
                ${!activeBrand ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:border-vr-red/30'}`}>
              Todos
            </button>
            {brands.map((b) => (
              <button key={b} onClick={() => setActiveBrand(b)}
                className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${activeBrand === b ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:border-vr-red/30'}`}>
                {b}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar produto ou modelo..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red" />
        </div>
      </div>

      {/* Lista por modelo */}
      {filteredProducts.length === 0 ? (
        <p className="text-sm text-vr-silver/40 text-center py-6">
          {products.length === 0 ? 'Nenhum produto cadastrado ainda.' : 'Nenhum produto encontrado.'}
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(byModel.entries()).map(([modelName, modelProducts]) => (
            <section key={modelName}>
              <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1 h-3 bg-vr-red rounded-full" />
                {modelName}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modelProducts.map((product) => (
                  <div key={product.id} role="button" tabIndex={0}
                    onClick={() => { setActionsProduct(product); setConfirmingDelete(false) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setActionsProduct(product); setConfirmingDelete(false) } }}
                    className="bg-vr-graphite rounded-xl border border-white/5 px-3 py-3 flex items-center gap-3 cursor-pointer hover:border-vr-red/30 transition-colors"
                  >
                    <div className="w-12 h-12 shrink-0 rounded-lg bg-vr-black border border-white/10 overflow-hidden flex items-center justify-center">
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        : <Package className="w-4 h-4 text-vr-silver/30" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{product.name}</p>
                      <p className="text-xs text-vr-silver/50">{Number(product.quantity)} em estoque</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-vr-silver">R$ {Number(product.price).toFixed(2)}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(product) }}
                        className="text-vr-silver/40 hover:text-vr-red transition-colors p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Popup: ações */}
      {actionsProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActionsProduct(null)}>
          <div className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">{actionsProduct.name}</h3>
                <p className="text-xs text-vr-silver/50">R$ {Number(actionsProduct.price).toFixed(2)} · {Number(actionsProduct.quantity)} em estoque</p>
              </div>
              <button onClick={() => setActionsProduct(null)} className="text-vr-silver/50 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
            </div>
            {confirmingDelete ? (
              <div className="bg-vr-black border border-red-500/30 rounded-xl p-3 space-y-2">
                <p className="text-xs text-red-400">Tem certeza que deseja excluir este produto?</p>
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 disabled:opacity-50">
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Confirmar
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} className="text-xs font-semibold text-vr-silver/60 hover:text-white px-3 py-2">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => { openEdit(actionsProduct); setActionsProduct(null) }}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-white bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-vr-red/40 transition-colors">
                  <Pencil className="w-4 h-4 text-vr-red" /> Editar produto
                </button>
                <button onClick={() => setConfirmingDelete(true)}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-red-400 bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-red-500/40 transition-colors">
                  <Trash2 className="w-4 h-4" /> Deletar produto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Popup: editar */}
      {editProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditProduct(null)}>
          <div className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Editar produto</h3>
              <button onClick={() => setEditProduct(null)} className="text-vr-silver/50 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Fotos (até {MAX_IMAGES})</label>
              <div className="mt-1"><ImageSlotsPicker slots={editImageSlots} onChange={setEditImageSlots} /></div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome *</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Marca</label>
                <input value={editPhoneBrand} onChange={(e) => setEditPhoneBrand(e.target.value)} list="brand-suggestions-edit"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
                <datalist id="brand-suggestions-edit">
                  {brands.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Modelo</label>
                <input value={editPhoneModel} onChange={(e) => setEditPhoneModel(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Preço (R$) *</label>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
                <input type="number" inputMode="numeric" step="1" min="0" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Descrição</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red resize-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Alertar baixo estoque quando chegar em:</label>
              <input type="number" inputMode="numeric" step="1" min="0" value={editLowStockThreshold} onChange={(e) => setEditLowStockThreshold(e.target.value)} placeholder="Opcional -- ex: 5"
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red" />
            </div>
            {editError && <p className="text-xs text-red-400">{editError}</p>}
            <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary w-full flex items-center justify-center gap-2">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Salvar alterações
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
