'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, ProductCategory } from '@/lib/types'
import { Package, Search, X, Pencil, Trash2, Loader2, ImagePlus } from 'lucide-react'

async function uploadProductImage(supabase: ReturnType<typeof createClient>, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('service-order-media').upload(fileName, file)
  if (error) return null
  const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
  return pub.publicUrl
}

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: ProductCategory[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories
    return list.slice(0, 8)
  }, [value, categories])

  const isNew = value.trim() && !categories.some((c) => c.name.toLowerCase() === value.trim().toLowerCase())

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar ou criar categoria..."
        className="w-full px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
      />
      {open && (suggestions.length > 0 || isNew) && (
        <ul className="absolute z-10 mt-1 w-full bg-vr-graphite-light border border-white/10 rounded-xl overflow-hidden shadow-lg">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(c.name); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-vr-red/20"
              >
                {c.name}
              </button>
            </li>
          ))}
          {isNew && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(false)}
                className="w-full text-left px-3 py-2 text-xs text-vr-silver/60 hover:bg-vr-red/20 border-t border-white/10"
              >
                Criar nova categoria &quot;{value.trim()}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function ProdutosClient({
  initialProducts,
  initialCategories,
}: {
  initialProducts: Product[]
  initialCategories: ProductCategory[]
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<ProductCategory[]>(initialCategories)

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [description, setDescription] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const [actionsProduct, setActionsProduct] = useState<Product | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, searchQuery])

  const resolveCategoryId = async (
    supabase: ReturnType<typeof createClient>,
    rawName: string
  ): Promise<string | null> => {
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

  const handlePickImage = (file: File | null) => {
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  const resetCreateForm = () => {
    setName('')
    setPrice('')
    setQuantity('')
    setDescription('')
    setCategoryName('')
    setImageFile(null)
    setImagePreview(null)
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

    const categoryId = await resolveCategoryId(supabase, categoryName)
    let imageUrl: string | null = null
    if (imageFile) imageUrl = await uploadProductImage(supabase, imageFile)

    const { data: created, error } = await supabase
      .from('products')
      .insert({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: description.trim() || null,
        category_id: categoryId,
        image_url: imageUrl,
      })
      .select('*, product_categories(name)')
      .single()

    if (error || !created) {
      setCreateError('Não foi possível cadastrar o produto.')
      setCreating(false)
      return
    }

    setProducts((prev) => [...prev, created as Product].sort((a, b) => a.name.localeCompare(b.name)))
    resetCreateForm()
    setCreating(false)
  }

  const openActions = (product: Product) => {
    setActionsProduct(product)
    setConfirmingDelete(false)
  }
  const closeActions = () => {
    setActionsProduct(null)
    setConfirmingDelete(false)
  }

  const openEdit = (product: Product) => {
    setEditProduct(product)
    setEditName(product.name)
    setEditPrice(String(Number(product.price)))
    setEditQuantity(String(Number(product.quantity)))
    setEditDescription(product.description ?? '')
    setEditCategoryName(product.product_categories?.name ?? '')
    setEditImageFile(null)
    setEditImagePreview(product.image_url)
    setEditError(null)
  }
  const closeEdit = () => setEditProduct(null)

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

    const categoryId = await resolveCategoryId(supabase, editCategoryName)
    let imageUrl = editProduct.image_url
    if (editImageFile) {
      const uploaded = await uploadProductImage(supabase, editImageFile)
      if (uploaded) imageUrl = uploaded
    }

    const { data: updated, error } = await supabase
      .from('products')
      .update({
        name: trimmedName,
        price: priceNum,
        quantity: qtyNum,
        description: editDescription.trim() || null,
        category_id: categoryId,
        image_url: imageUrl,
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
    setDeleting(false)
    closeActions()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Package className="w-5 h-5 text-vr-red" />
        Catálogo de produtos
      </h1>

      {/* Cadastrar produto */}
      <form onSubmit={handleCreate} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
        <p className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Cadastrar produto</p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 flex-shrink-0 rounded-xl bg-vr-black border border-white/10 border-dashed flex items-center justify-center overflow-hidden"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Pré-visualização" className="w-full h-full object-cover" />
            ) : (
              <ImagePlus className="w-5 h-5 text-vr-silver/40" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
          />
          <div className="flex-1">
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do produto *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Capinha iPhone 13"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Preço (R$) *</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Categoria</label>
          <CategoryPicker categories={categories} value={categoryName} onChange={setCategoryName} />
        </div>

        <div>
          <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes do produto..."
            rows={2}
            className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red resize-none"
          />
        </div>

        {createError && <p className="text-xs text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          Cadastrar produto
        </button>
      </form>

      {/* Busca + lista */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">Produtos cadastrados ({products.length})</h2>
        <div className="relative">
          <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar produto cadastrado..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
          />
        </div>

        {filteredProducts.length === 0 ? (
          <p className="text-sm text-vr-silver/40">
            {products.length === 0 ? 'Nenhum produto cadastrado ainda.' : 'Nenhum produto encontrado para essa busca.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => openActions(product)}
                onKeyDown={(e) => { if (e.key === 'Enter') openActions(product) }}
                className="bg-vr-graphite rounded-xl border border-white/5 px-3 py-3 flex items-center gap-3 cursor-pointer hover:border-vr-red/30 transition-colors"
              >
                <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-vr-black border border-white/10 overflow-hidden flex items-center justify-center">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-vr-silver/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{product.name}</p>
                  <p className="text-xs text-vr-silver/50 truncate">
                    {product.product_categories?.name ?? 'Sem categoria'} · {Number(product.quantity)} em estoque
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-vr-silver">R$ {Number(product.price).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(product) }}
                    className="text-vr-silver/40 hover:text-vr-red transition-colors p-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Popup: ações do produto */}
      {actionsProduct && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeActions}
        >
          <div
            className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">{actionsProduct.name}</h3>
                <p className="text-xs text-vr-silver/50">R$ {Number(actionsProduct.price).toFixed(2)} · {Number(actionsProduct.quantity)} em estoque</p>
              </div>
              <button onClick={closeActions} className="text-vr-silver/50 hover:text-white flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmingDelete ? (
              <div className="bg-vr-black border border-red-500/30 rounded-xl p-3 space-y-2">
                <p className="text-xs text-red-400">Tem certeza que deseja excluir este produto? Essa ação não pode ser desfeita.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Confirmar exclusão
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="text-xs font-semibold text-vr-silver/60 hover:text-white px-3 py-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => { openEdit(actionsProduct); closeActions() }}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-white bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-vr-red/40 transition-colors"
                >
                  <Pencil className="w-4 h-4 text-vr-red" />
                  Editar produto
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-red-400 bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-red-500/40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Deletar produto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Popup: editar produto */}
      {editProduct && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeEdit}
        >
          <div
            className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Editar produto</h3>
              <button onClick={closeEdit} className="text-vr-silver/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="w-16 h-16 flex-shrink-0 rounded-xl bg-vr-black border border-white/10 border-dashed flex items-center justify-center overflow-hidden cursor-pointer">
                {editImagePreview ? (
                  <img src={editImagePreview} alt="Pré-visualização" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-vr-silver/40" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setEditImageFile(file)
                    setEditImagePreview(file ? URL.createObjectURL(file) : editProduct.image_url)
                  }}
                />
              </label>
              <div className="flex-1">
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do produto *</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Preço (R$) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Categoria</label>
              <CategoryPicker categories={categories} value={editCategoryName} onChange={setEditCategoryName} />
            </div>

            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Descrição</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red resize-none"
              />
            </div>

            {editError && <p className="text-xs text-red-400">{editError}</p>}

            <button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              Salvar alterações
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
