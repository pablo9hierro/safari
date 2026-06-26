'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StockItem, StockMovement, StockUnit } from '@/lib/types'
import { Boxes, ArrowDownCircle, ArrowUpCircle, Loader2, Search, X, Pencil, Trash2 } from 'lucide-react'

export default function EstoqueClient({
  initialItems,
  initialMovements,
}: {
  initialItems: StockItem[]
  initialMovements: StockMovement[]
}) {
  const [items, setItems] = useState<StockItem[]>(initialItems)
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements)

  // Cadastro de item novo — nome + quantidade + unidade + valor do reparo + garantia.
  const [newName, setNewName] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newUnit, setNewUnit] = useState<StockUnit>('unidade')
  const [newPrice, setNewPrice] = useState('')
  const [newWarrantyDays, setNewWarrantyDays] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Busca sobre os itens já cadastrados
  const [searchQuery, setSearchQuery] = useState('')

  // Popup de ações do item selecionado
  const [actionsItem, setActionsItem] = useState<StockItem | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Popup de edição
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<StockUnit>('unidade')
  const [editPrice, setEditPrice] = useState('')
  const [editWarrantyDays, setEditWarrantyDays] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Popup de registrar saída
  const [exitItem, setExitItem] = useState<StockItem | null>(null)
  const [exitQuantity, setExitQuantity] = useState('')
  const [exitError, setExitError] = useState<string | null>(null)
  const [savingExit, setSavingExit] = useState(false)

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, searchQuery])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    const trimmedName = newName.trim()
    const qty = parseFloat(newQuantity)
    const priceNum = parseFloat(newPrice)
    if (!trimmedName) { setCreateError('Informe o nome do item.'); return }
    if (!newQuantity || isNaN(qty) || qty < 0) { setCreateError('Informe uma quantidade válida.'); return }
    if (!newPrice || isNaN(priceNum) || priceNum < 0) { setCreateError('Informe o valor do reparo.'); return }

    setCreating(true)
    const supabase = createClient()
    const { data: created, error } = await supabase
      .from('stock_items')
      .insert({
        name: trimmedName,
        quantity: qty,
        unit: newUnit,
        price: priceNum,
        warranty_days: newWarrantyDays.trim() ? parseInt(newWarrantyDays, 10) : null,
      })
      .select()
      .single()

    if (error || !created) {
      setCreateError(error?.code === '23505' ? 'Já existe um item com este nome.' : 'Não foi possível cadastrar o item.')
      setCreating(false)
      return
    }

    setItems((prev) => [...prev, created as StockItem].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    setNewQuantity('')
    setNewUnit('unidade')
    setNewPrice('')
    setNewWarrantyDays('')
    setCreating(false)
  }

  const openActions = (item: StockItem) => {
    setActionsItem(item)
    setConfirmingDelete(false)
  }

  const closeActions = () => {
    setActionsItem(null)
    setConfirmingDelete(false)
  }

  const openEdit = (item: StockItem) => {
    setEditItem(item)
    setEditName(item.name)
    setEditQuantity(String(Number(item.quantity)))
    setEditUnit(item.unit)
    setEditPrice(item.price != null ? String(item.price) : '')
    setEditWarrantyDays(item.warranty_days != null ? String(item.warranty_days) : '')
    setEditError(null)
  }

  const closeEdit = () => setEditItem(null)

  const handleSaveEdit = async () => {
    if (!editItem) return
    setEditError(null)

    const trimmedName = editName.trim()
    const qty = parseFloat(editQuantity)
    const priceNum = parseFloat(editPrice)
    if (!trimmedName) { setEditError('Informe o nome do item.'); return }
    if (!editQuantity || isNaN(qty) || qty < 0) { setEditError('Informe uma quantidade válida.'); return }
    if (!editPrice || isNaN(priceNum) || priceNum < 0) { setEditError('Informe o valor do reparo.'); return }

    setSavingEdit(true)
    const supabase = createClient()
    const { data: updated, error } = await supabase
      .from('stock_items')
      .update({
        name: trimmedName,
        quantity: qty,
        unit: editUnit,
        price: priceNum,
        warranty_days: editWarrantyDays.trim() ? parseInt(editWarrantyDays, 10) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editItem.id)
      .select()
      .single()

    if (error || !updated) {
      setEditError(error?.code === '23505' ? 'Já existe outro item com este nome.' : 'Não foi possível salvar as alterações.')
      setSavingEdit(false)
      return
    }

    setItems((prev) => prev.map((i) => (i.id === editItem.id ? (updated as StockItem) : i)).sort((a, b) => a.name.localeCompare(b.name)))
    setSavingEdit(false)
    setEditItem(null)
  }

  const openExit = (item: StockItem) => {
    setExitItem(item)
    setExitQuantity('')
    setExitError(null)
  }

  const closeExit = () => setExitItem(null)

  const handleRegisterExit = async () => {
    if (!exitItem) return
    setExitError(null)

    const qty = parseFloat(exitQuantity)
    if (!exitQuantity || isNaN(qty) || qty <= 0) { setExitError('Informe uma quantidade válida.'); return }
    if (qty > Number(exitItem.quantity)) { setExitError('Quantidade maior que o estoque disponível.'); return }

    setSavingExit(true)
    const supabase = createClient()
    const { data: movement, error } = await supabase
      .from('stock_movements')
      .insert({ item_id: exitItem.id, type: 'saida', quantity: qty, unit: exitItem.unit })
      .select()
      .single()

    if (error || !movement) {
      setExitError('Não foi possível registrar a saída.')
      setSavingExit(false)
      return
    }

    const itemId = exitItem.id
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: Number(i.quantity) - qty } : i)))
    setMovements((prev) => [
      { ...(movement as StockMovement), stock_items: { name: exitItem.name, unit: exitItem.unit } },
      ...prev,
    ])
    setSavingExit(false)
    setExitItem(null)
  }

  const handleDelete = async () => {
    if (!actionsItem) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('stock_items').delete().eq('id', actionsItem.id)

    if (error) {
      setDeleting(false)
      return
    }

    const itemId = actionsItem.id
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    setMovements((prev) => prev.filter((m) => m.item_id !== itemId))
    setDeleting(false)
    closeActions()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Boxes className="w-5 h-5 text-vr-red" />
        Controle de estoque
      </h1>

      {/* Cadastrar item */}
      <form onSubmit={handleCreate} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
        <p className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Cadastrar item</p>
        <div>
          <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do item *</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Tela iPhone 12"
            className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              placeholder="0"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Unidade *</label>
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value as StockUnit)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
            >
              <option value="unidade">Unidade</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Valor do reparo (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="0,00"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Garantia (dias)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={newWarrantyDays}
              onChange={(e) => setNewWarrantyDays(e.target.value)}
              placeholder="Ex: 90"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
        </div>

        {createError && <p className="text-xs text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
          Cadastrar item
        </button>
      </form>

      {/* Busca + lista de itens */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">Itens em estoque ({items.length})</h2>
        <div className="relative">
          <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar item cadastrado..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
          />
        </div>

        {filteredItems.length === 0 ? (
          <p className="text-sm text-vr-silver/40">
            {items.length === 0 ? 'Nenhum item cadastrado ainda.' : 'Nenhum item encontrado para essa busca.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openActions(item)}
                onKeyDown={(e) => { if (e.key === 'Enter') openActions(item) }}
                className="bg-vr-graphite rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:border-vr-red/30 transition-colors"
              >
                <span className="text-sm text-white truncate">{item.name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-bold ${Number(item.quantity) <= 0 ? 'text-red-400' : 'text-vr-silver'}`}>
                    {Number(item.quantity)} {item.unit}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(item) }}
                    className="text-vr-silver/40 hover:text-vr-red transition-colors p-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Últimas movimentações */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">Últimas movimentações</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-vr-silver/40">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {movements.map((m) => (
              <li key={m.id} className="bg-vr-graphite rounded-xl border border-white/5 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {m.type === 'entrada' ? (
                    <ArrowDownCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <ArrowUpCircle className="w-4 h-4 text-vr-red flex-shrink-0" />
                  )}
                  <span className="text-sm text-white truncate">{m.stock_items?.name ?? 'Item removido'}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-vr-silver">
                    {m.type === 'entrada' ? '+' : '-'}{Number(m.quantity)} {m.unit}
                  </span>
                  <span className="text-xs text-vr-silver/40">
                    {new Date(m.moved_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Popup: ações do item */}
      {actionsItem && (
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
                <h3 className="text-base font-bold text-white truncate">{actionsItem.name}</h3>
                <p className="text-xs text-vr-silver/50">Estoque atual: {Number(actionsItem.quantity)} {actionsItem.unit}</p>
              </div>
              <button onClick={closeActions} className="text-vr-silver/50 hover:text-white flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmingDelete ? (
              <div className="bg-vr-black border border-red-500/30 rounded-xl p-3 space-y-2">
                <p className="text-xs text-red-400">Tem certeza que deseja excluir este item? Essa ação não pode ser desfeita.</p>
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
                  onClick={() => { openExit(actionsItem); closeActions() }}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-white bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-vr-red/40 transition-colors"
                >
                  <ArrowUpCircle className="w-4 h-4 text-vr-red" />
                  Registrar saída
                </button>
                <button
                  onClick={() => { openEdit(actionsItem); closeActions() }}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-white bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-vr-red/40 transition-colors"
                >
                  <Pencil className="w-4 h-4 text-vr-red" />
                  Editar item
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full flex items-center gap-2.5 text-sm font-semibold text-red-400 bg-vr-black border border-white/10 rounded-xl px-4 py-3 hover:border-red-500/40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Deletar item
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Popup: editar item */}
      {editItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeEdit}
        >
          <div
            className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Editar item</h3>
              <button onClick={closeEdit} className="text-vr-silver/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do item *</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Unidade *</label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value as StockUnit)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
                >
                  <option value="unidade">Unidade</option>
                  <option value="caixa">Caixa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Valor do reparo (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Garantia (dias)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editWarrantyDays}
                  onChange={(e) => setEditWarrantyDays(e.target.value)}
                  placeholder="Ex: 90"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
                />
              </div>
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

      {/* Popup: registrar saída */}
      {exitItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeExit}
        >
          <div
            className="bg-vr-graphite w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-white/10 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white">Registrar saída</h3>
                <p className="text-xs text-vr-silver/50 truncate">{exitItem.name} — estoque atual: {Number(exitItem.quantity)} {exitItem.unit}</p>
              </div>
              <button onClick={closeExit} className="text-vr-silver/50 hover:text-white flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade de saída *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={exitQuantity}
                onChange={(e) => setExitQuantity(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
              />
            </div>

            {exitError && <p className="text-xs text-red-400">{exitError}</p>}

            <button
              onClick={handleRegisterExit}
              disabled={savingExit}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {savingExit ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
              Confirmar saída
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
