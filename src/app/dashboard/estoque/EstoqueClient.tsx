'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StockItem, StockMovement, StockMovementType, StockUnit } from '@/lib/types'
import { Boxes, ArrowDownCircle, ArrowUpCircle, Loader2, Search, X } from 'lucide-react'

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function EstoqueClient({
  initialItems,
  initialMovements,
}: {
  initialItems: StockItem[]
  initialMovements: StockMovement[]
}) {
  const [items, setItems] = useState<StockItem[]>(initialItems)
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements)

  const [name, setName] = useState('')
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [type, setType] = useState<StockMovementType>('entrada')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<StockUnit>('unidade')
  const [movedAt, setMovedAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q || selectedItem?.name.toLowerCase() === q) return []
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6)
  }, [name, items, selectedItem])

  const handleNameChange = (value: string) => {
    setName(value)
    setShowSuggestions(true)
    if (selectedItem && value !== selectedItem.name) setSelectedItem(null)
  }

  const handlePickSuggestion = (item: StockItem) => {
    setSelectedItem(item)
    setName(item.name)
    setUnit(item.unit)
    setShowSuggestions(false)
  }

  const resetForm = () => {
    setName('')
    setSelectedItem(null)
    setQuantity('')
    setUnit('unidade')
    setType('entrada')
    setMovedAt(toDatetimeLocalValue(new Date()))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const qty = parseFloat(quantity)
    if (!trimmedName) { setError('Informe o nome do item.'); return }
    if (!quantity || isNaN(qty) || qty <= 0) { setError('Informe uma quantidade válida.'); return }
    if (!movedAt) { setError('Informe a data/hora da movimentação.'); return }

    setSaving(true)
    const supabase = createClient()

    let item = selectedItem
    if (!item) {
      const { data: created, error: createErr } = await supabase
        .from('stock_items')
        .insert({ name: trimmedName, unit, quantity: 0 })
        .select()
        .single()
      if (createErr || !created) {
        setError(
          createErr?.code === '23505'
            ? 'Já existe um item com este nome — selecione-o na lista de sugestões.'
            : 'Não foi possível cadastrar o item.'
        )
        setSaving(false)
        return
      }
      item = created as StockItem
      setItems((prev) => [...prev, item as StockItem].sort((a, b) => a.name.localeCompare(b.name)))
    }

    const movedAtIso = new Date(movedAt).toISOString()
    const { data: movement, error: moveErr } = await supabase
      .from('stock_movements')
      .insert({ item_id: item.id, type, quantity: qty, unit: item.unit, moved_at: movedAtIso })
      .select()
      .single()

    if (moveErr || !movement) {
      setError('Não foi possível registrar a movimentação.')
      setSaving(false)
      return
    }

    const delta = type === 'entrada' ? qty : -qty
    const closedItem = item
    setItems((prev) => prev.map((i) => (i.id === closedItem.id ? { ...i, quantity: Number(i.quantity) + delta } : i)))
    setMovements((prev) => [
      { ...(movement as StockMovement), stock_items: { name: closedItem.name, unit: closedItem.unit } },
      ...prev,
    ])

    resetForm()
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Boxes className="w-5 h-5 text-vr-red" />
        Controle de estoque
      </h1>

      <form onSubmit={handleSubmit} className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
        <div className="relative">
          <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nome do item *</label>
          <div className="relative mt-1">
            <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Buscar ou cadastrar item..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-vr-graphite-light border border-white/10 rounded-xl overflow-hidden shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-vr-red/20 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-xs text-vr-silver/50 flex-shrink-0">{Number(s.quantity)} {s.unit}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedItem && (
            <p className="text-xs text-vr-silver/50 mt-1.5 flex items-center gap-1.5">
              Atualizando item existente — estoque atual: {Number(selectedItem.quantity)} {selectedItem.unit}
              <button
                type="button"
                onClick={() => { setSelectedItem(null); setName('') }}
                className="text-vr-red hover:text-vr-red-light"
              >
                <X className="w-3 h-3" />
              </button>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Quantidade *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white placeholder-vr-silver/40 text-sm outline-none focus:border-vr-red"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Unidade *</label>
            <select
              value={selectedItem ? selectedItem.unit : unit}
              onChange={(e) => setUnit(e.target.value as StockUnit)}
              disabled={!!selectedItem}
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red disabled:opacity-60"
            >
              <option value="unidade">Unidade</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Movimentação *</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setType('entrada')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${type === 'entrada' ? 'bg-green-600 text-white' : 'bg-vr-black border border-white/10 text-vr-silver/60'}`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setType('saida')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${type === 'saida' ? 'bg-vr-red text-white' : 'bg-vr-black border border-white/10 text-vr-silver/60'}`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                Saída
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Data/hora *</label>
            <input
              type="datetime-local"
              value={movedAt}
              onChange={(e) => setMovedAt(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-vr-black border border-white/10 text-white text-sm outline-none focus:border-vr-red"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
          Registrar movimentação
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">Itens em estoque ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-vr-silver/40">Nenhum item cadastrado ainda.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item) => (
              <div key={item.id} className="bg-vr-graphite rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-sm text-white truncate">{item.name}</span>
                <span className={`text-sm font-bold flex-shrink-0 ${Number(item.quantity) <= 0 ? 'text-red-400' : 'text-vr-silver'}`}>
                  {Number(item.quantity)} {item.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  )
}
