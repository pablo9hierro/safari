'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiPath } from '@/lib/storeProxyLink'
import { Product, ProductCategory } from '@/lib/types'
import { logStockEvent, stockTransitionEvent } from '@/lib/stockActivityLog'
import { Package, Search, X, Pencil, Trash2, Loader2, ImagePlus, ChevronDown, ChevronRight } from 'lucide-react'
import SearchCreateMultiSelect from '@/components/ui/SearchCreateMultiSelect'

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

interface Category { id: string; name: string; slug: string; sort_order: number; device_type_id: string | null }
interface DeviceType { id: string; name: string; slug: string; icon_key: string; sort_order: number }
interface CatalogModel { id: string; brand_id: string; name: string; sort_order: number }
interface ProductDeviceLink { product_id: string; device_type_id: string }
interface ProductBrandLink { product_id: string; brand_id: string }
interface ProductModelLink { product_id: string; model_id: string }

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

interface Props {
  initialProducts: Product[]
  initialCategories: ProductCategory[]
  // Aparelho/marca/modelo -- mesmo cadastro mestre compartilhado com
  // Serviços e a aba dedicada Aparelho/Marca/Modelo (elevado no
  // ProdutosClient), pra criar um aparelho/marca/modelo novo aqui já
  // refletir nas outras abas sem recarregar a página.
  categories: Category[]
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  deviceTypes: DeviceType[]
  setDeviceTypes: React.Dispatch<React.SetStateAction<DeviceType[]>>
  models: CatalogModel[]
  setModels: React.Dispatch<React.SetStateAction<CatalogModel[]>>
  initialProductDevices: ProductDeviceLink[]
  initialProductBrands: ProductBrandLink[]
  initialProductModels: ProductModelLink[]
}

export default function ProdutosTab({
  initialProducts, initialCategories,
  categories, setCategories, deviceTypes, setDeviceTypes, models, setModels,
  initialProductDevices, initialProductBrands, initialProductModels,
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [showForm, setShowForm] = useState(false)

  const [productDevices, setProductDevices] = useState<ProductDeviceLink[]>(initialProductDevices)
  const [productBrands, setProductBrands] = useState<ProductBrandLink[]>(initialProductBrands)
  const [productModels, setProductModels] = useState<ProductModelLink[]>(initialProductModels)

  // Create form
  const [name, setName] = useState('')
  // Aparelho(s)/marca(s)/modelo(s) via busca multi-select -- TODOS
  // opcionais. Vazio numa dimensão = universal PRA AQUELA DIMENSÃO (ver
  // matchesFilter): aparelho vazio + marca=Samsung + modelo vazio serve
  // pra qualquer aparelho Samsung de qualquer modelo, por exemplo.
  const [newDeviceIds, setNewDeviceIds] = useState<string[]>([])
  const [newBrandIds, setNewBrandIds] = useState<string[]>([])
  const [newModelIds, setNewModelIds] = useState<string[]>([])
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
  const [editDeviceIds, setEditDeviceIds] = useState<string[]>([])
  const [editBrandIds, setEditBrandIds] = useState<string[]>([])
  const [editModelIds, setEditModelIds] = useState<string[]>([])
  const [editPrice, setEditPrice] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLowStockThreshold, setEditLowStockThreshold] = useState('')
  const [editImageSlots, setEditImageSlots] = useState<ImageSlot[]>(emptySlots())
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Marcas com pelo menos um produto vinculado -- pros chips de filtro da
  // listagem (mesmo papel do antigo filtro por phone_brand texto, agora
  // batendo no vínculo many-to-many de verdade).
  const brands = useMemo(() => {
    const ids = new Set(productBrands.map((l) => l.brand_id))
    return categories.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [categories, productBrands])

  const filteredProducts = useMemo(() => {
    let base = products
    if (activeBrand) {
      const productIds = new Set(productBrands.filter((l) => l.brand_id === activeBrand).map((l) => l.product_id))
      base = base.filter((p) => productIds.has(p.id))
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.phone_model ?? '').toLowerCase().includes(q))
  }, [products, activeBrand, searchQuery, productBrands])

  // Group by phone_model (coluna de compatibilidade, sincronizada a partir
  // do 1º modelo selecionado -- "Sem modelo" cobre tanto produto universal
  // quanto produto com mais de um modelo selecionado).
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

  const modelOptionsForNewItem = newBrandIds.length > 0 ? models.filter((m) => newBrandIds.includes(m.brand_id)) : models
  const modelOptionsForEdit = editBrandIds.length > 0 ? models.filter((m) => editBrandIds.includes(m.brand_id)) : models

  const createDeviceInline = async (deviceName: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('device_types')
      .insert({ name: deviceName, slug: slugify(deviceName) || crypto.randomUUID(), icon_key: 'generic', sort_order: deviceTypes.length })
      .select().single()
    if (error || !data) throw new Error('Não foi possível cadastrar o aparelho.')
    setDeviceTypes((prev) => [...prev, data as DeviceType])
    return { id: data.id as string, name: data.name as string }
  }

  const createBrandInline = async (brandName: string, deviceIds: string[]) => {
    const deviceId = deviceIds[0] ?? deviceTypes[0]?.id
    const supabase = createClient()
    const { data, error } = await supabase
      .from('service_catalog_categories')
      .insert({ name: brandName, slug: slugify(brandName) || crypto.randomUUID(), sort_order: categories.length, device_type_id: deviceId ?? null })
      .select().single()
    if (error || !data) throw new Error('Não foi possível cadastrar a marca.')
    setCategories((prev) => [...prev, data as Category])
    return { id: data.id as string, name: data.name as string }
  }

  const createModelInline = async (modelName: string, brandIds: string[]) => {
    const brandId = brandIds[0]
    if (!brandId) throw new Error('Selecione ao menos uma marca antes de cadastrar um modelo.')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('catalog_models')
      .insert({ brand_id: brandId, name: modelName, sort_order: models.length })
      .select().single()
    if (error || !data) throw new Error('Não foi possível cadastrar o modelo.')
    setModels((prev) => [...prev, data as CatalogModel])
    return { id: data.id as string, name: data.name as string }
  }

  const resetForm = () => {
    setName(''); setNewDeviceIds([]); setNewBrandIds([]); setNewModelIds([])
    setPrice(''); setQuantity(''); setDescription('')
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
    const imageUrls = await uploadSlots(supabase, imageSlots)

    // phone_brand/phone_model continuam sincronizados (coluna de
    // compatibilidade) a partir da 1ª marca/1º modelo selecionado -- só
    // fica null quando nenhum foi escolhido (produto universal) ou mais de
    // um foi escolhido (não dá pra representar "vários" numa coluna só).
    const brandName = newBrandIds.length === 1 ? categories.find((c) => c.id === newBrandIds[0])?.name ?? null : null
    const modelName = newModelIds.length === 1 ? models.find((m) => m.id === newModelIds[0])?.name ?? null : null

    const { data: created, error } = await supabase
      .from('products')
      .insert({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: description.trim() || null,
        category_id: null,
        phone_brand: brandName,
        phone_model: modelName,
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

    const productId = created.id as string
    if (newDeviceIds.length > 0) {
      await supabase.from('product_devices').insert(newDeviceIds.map((device_type_id) => ({ product_id: productId, device_type_id })))
      setProductDevices((prev) => [...prev, ...newDeviceIds.map((device_type_id) => ({ product_id: productId, device_type_id }))])
    }
    if (newBrandIds.length > 0) {
      await supabase.from('product_brands').insert(newBrandIds.map((brand_id) => ({ product_id: productId, brand_id })))
      setProductBrands((prev) => [...prev, ...newBrandIds.map((brand_id) => ({ product_id: productId, brand_id }))])
    }
    if (newModelIds.length > 0) {
      await supabase.from('product_models').insert(newModelIds.map((model_id) => ({ product_id: productId, model_id })))
      setProductModels((prev) => [...prev, ...newModelIds.map((model_id) => ({ product_id: productId, model_id }))])
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
    setEditDeviceIds(productDevices.filter((l) => l.product_id === product.id).map((l) => l.device_type_id))
    setEditBrandIds(productBrands.filter((l) => l.product_id === product.id).map((l) => l.brand_id))
    setEditModelIds(productModels.filter((l) => l.product_id === product.id).map((l) => l.model_id))
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
    const imageUrls = await uploadSlots(supabase, editImageSlots)

    const brandName = editBrandIds.length === 1 ? categories.find((c) => c.id === editBrandIds[0])?.name ?? null : null
    const modelName = editModelIds.length === 1 ? models.find((m) => m.id === editModelIds[0])?.name ?? null : null

    const { data: updated, error } = await supabase
      .from('products')
      .update({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: editDescription.trim() || null,
        phone_brand: brandName,
        phone_model: modelName,
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

    await supabase.from('product_devices').delete().eq('product_id', editProduct.id)
    await supabase.from('product_brands').delete().eq('product_id', editProduct.id)
    await supabase.from('product_models').delete().eq('product_id', editProduct.id)
    if (editDeviceIds.length > 0) await supabase.from('product_devices').insert(editDeviceIds.map((device_type_id) => ({ product_id: editProduct.id, device_type_id })))
    if (editBrandIds.length > 0) await supabase.from('product_brands').insert(editBrandIds.map((brand_id) => ({ product_id: editProduct.id, brand_id })))
    if (editModelIds.length > 0) await supabase.from('product_models').insert(editModelIds.map((model_id) => ({ product_id: editProduct.id, model_id })))
    setProductDevices((prev) => [...prev.filter((l) => l.product_id !== editProduct.id), ...editDeviceIds.map((device_type_id) => ({ product_id: editProduct.id, device_type_id }))])
    setProductBrands((prev) => [...prev.filter((l) => l.product_id !== editProduct.id), ...editBrandIds.map((brand_id) => ({ product_id: editProduct.id, brand_id }))])
    setProductModels((prev) => [...prev.filter((l) => l.product_id !== editProduct.id), ...editModelIds.map((model_id) => ({ product_id: editProduct.id, model_id }))])

    setProducts((prev) => prev.map((p) => (p.id === editProduct.id ? (updated as Product) : p)).sort((a, b) => a.name.localeCompare(b.name)))
    logStockEvent(supabase, 'product', editProduct.id, (updated as Product).name, 'updated')
    const transition = stockTransitionEvent(Number(editProduct.quantity), qtyNum, (updated as Product).low_stock_threshold)
    if (transition) logStockEvent(supabase, 'product', editProduct.id, (updated as Product).name, transition)

    // Dado de compatibilidade mudou -- tags de busca reaproveitam o
    // aparelho/marca/modelo novo (ver /api/catalog/tags).
    fetch(apiPath('/api/catalog/tags'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'product', id: editProduct.id }),
    }).catch(() => {})

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
            <p className="text-xs text-vr-silver/40">
              Aparelho, marca e modelo são opcionais — deixe vazio pra "serve pra todos" naquela dimensão
              (ex: marca Samsung sem modelo = qualquer Samsung; tudo vazio = serve pra qualquer aparelho).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SearchCreateMultiSelect
                label="Aparelho(s) — opcional"
                placeholder="Buscar aparelho..."
                options={deviceTypes}
                selectedIds={newDeviceIds}
                onChange={setNewDeviceIds}
                onCreate={(n) => createDeviceInline(n)}
              />
              <SearchCreateMultiSelect
                label="Marca(s) — opcional"
                placeholder="Buscar marca..."
                options={categories}
                selectedIds={newBrandIds}
                onChange={(ids) => { setNewBrandIds(ids); setNewModelIds([]) }}
                onCreate={(n) => createBrandInline(n, newDeviceIds)}
              />
              <SearchCreateMultiSelect
                label="Modelo(s) — opcional"
                placeholder="Buscar modelo..."
                options={modelOptionsForNewItem}
                selectedIds={newModelIds}
                onChange={setNewModelIds}
                onCreate={(n) => createModelInline(n, newBrandIds)}
              />
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
              <button key={b.id} onClick={() => setActiveBrand(b.id)}
                className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${activeBrand === b.id ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:border-vr-red/30'}`}>
                {b.name}
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
            <div className="grid grid-cols-1 gap-2">
              <SearchCreateMultiSelect
                label="Aparelho(s) — opcional"
                placeholder="Buscar aparelho..."
                options={deviceTypes}
                selectedIds={editDeviceIds}
                onChange={setEditDeviceIds}
                onCreate={(n) => createDeviceInline(n)}
              />
              <SearchCreateMultiSelect
                label="Marca(s) — opcional"
                placeholder="Buscar marca..."
                options={categories}
                selectedIds={editBrandIds}
                onChange={(ids) => { setEditBrandIds(ids); setEditModelIds([]) }}
                onCreate={(n) => createBrandInline(n, editDeviceIds)}
              />
              <SearchCreateMultiSelect
                label="Modelo(s) — opcional"
                placeholder="Buscar modelo..."
                options={modelOptionsForEdit}
                selectedIds={editModelIds}
                onChange={setEditModelIds}
                onCreate={(n) => createModelInline(n, editBrandIds)}
              />
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
