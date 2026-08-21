'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Package, Boxes, Check } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import { logStockEvent, stockTransitionEvent } from '@/lib/stockActivityLog'
import type { Product, StockItem } from '@/lib/types'

type AlertItem =
  | { kind: 'product'; id: string; name: string; quantity: number; threshold: number | null }
  | { kind: 'stock_item'; id: string; name: string; quantity: number; threshold: number | null }

const INPUT = 'w-full px-3 py-2 rounded-lg border border-white/10 bg-vr-black text-white placeholder-white/25 text-sm outline-none focus:border-vr-red/60 transition-all'

/**
 * Lista de produtos + itens de estoque filtrados por um critério de
 * quantidade (baixo estoque ou em falta) -- reutilizado pelas abas
 * "Alerta de reposição" e "Em falta". Busca os dados direto (não
 * compartilha state com ProdutosTab/EstoqueTab) pra refletir qualquer
 * cadastro/edição feita em qualquer aba sem precisar levantar state
 * global adicional.
 */
export default function StockAlertList({
  title,
  emptyMessage,
  filter,
}: {
  title: string
  emptyMessage: string
  filter: (quantity: number, threshold: number | null) => boolean
}) {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [target, setTarget] = useState<AlertItem | null>(null)
  const [newQuantity, setNewQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('stock_items').select('*'),
    ])
    setProducts((p as Product[]) ?? [])
    setStockItems((s as StockItem[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const items = useMemo<AlertItem[]>(() => {
    const fromProducts: AlertItem[] = products
      .filter((p) => filter(Number(p.quantity), p.low_stock_threshold ?? null))
      .map((p) => ({ kind: 'product', id: p.id, name: p.name, quantity: Number(p.quantity), threshold: p.low_stock_threshold ?? null }))
    const fromStock: AlertItem[] = stockItems
      .filter((s) => filter(Number(s.quantity), s.low_stock_threshold ?? null))
      .map((s) => ({ kind: 'stock_item', id: s.id, name: s.name, quantity: Number(s.quantity), threshold: s.low_stock_threshold ?? null }))
    return [...fromProducts, ...fromStock]
  }, [products, stockItems, filter])

  const openUpdate = (item: AlertItem) => { setTarget(item); setNewQuantity(String(item.quantity)); setSaved(false) }

  const saveQuantity = async () => {
    if (!target) return
    const qty = Number(newQuantity)
    if (!Number.isFinite(qty) || qty < 0) return
    setSaving(true)
    const supabase = createClient()
    const table = target.kind === 'product' ? 'products' : 'stock_items'
    const { error } = await supabase.from(table).update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', target.id)
    setSaving(false)
    if (error) return

    logStockEvent(supabase, target.kind, target.id, target.name, 'stock_updated', { delta: qty - target.quantity })
    const transition = stockTransitionEvent(target.quantity, qty, target.threshold)
    if (transition) logStockEvent(supabase, target.kind, target.id, target.name, transition)

    if (target.kind === 'product') setProducts((prev) => prev.map((p) => (p.id === target.id ? { ...p, quantity: qty } : p)))
    else setStockItems((prev) => prev.map((s) => (s.id === target.id ? { ...s, quantity: qty } : s)))

    setSaved(true)
    setTimeout(() => { setTarget(null); setSaved(false) }, 700)
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold text-vr-silver/50 uppercase tracking-wider">{title} ({items.length})</h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-vr-silver/40" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-vr-silver/40 text-center py-6">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => openUpdate(item)}
              className="bg-vr-graphite rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between gap-2 text-left hover:border-vr-red/30 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                {item.kind === 'product' ? <Package className="w-4 h-4 text-vr-silver/40 shrink-0" /> : <Boxes className="w-4 h-4 text-vr-silver/40 shrink-0" />}
                <span className="text-sm text-white truncate">{item.name}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold ${item.quantity <= 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {item.quantity}{item.threshold != null ? ` / ${item.threshold}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!target} onClose={() => setTarget(null)} title={target ? `Atualizar estoque — ${target.name}` : 'Atualizar estoque'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Nova quantidade</label>
            <input type="number" step="0.01" min="0" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} className={`${INPUT} mt-1`} />
          </div>
          <button
            onClick={saveQuantity}
            disabled={saving}
            className={`w-full font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2
              ${saved ? 'bg-green-600 text-white' : 'bg-vr-red text-white hover:bg-vr-red/90'}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saved ? 'Atualizado!' : saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
