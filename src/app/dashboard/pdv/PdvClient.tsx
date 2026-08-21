'use client'

import { useEffect, useState } from 'react'
import { Search, Loader2, Plus, Minus, X, ShoppingCart, CreditCard, Banknote, QrCode, Check, Calendar } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'
import { createClient } from '@/lib/supabase/client'
import { createPdvPix, getPdvPixStatus, AdminAuthError } from '@/lib/resolutoo/adminApi'

const INPUT =
  'w-full px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors'
const LABEL = 'block text-xs font-semibold text-vr-silver/60 mb-1.5 uppercase tracking-wider'

const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

type CatalogResult = {
  id: string
  item_type: 'product' | 'service'
  label: string
  price: number
  stock?: number
}

type CartItem = {
  key: string
  item_type: 'product' | 'service'
  id: string
  label: string
  unit_price: number
  quantity: number
  stock?: number
  /** Só serviço -- null = próximo horário livre automático ao concluir a venda. */
  scheduledAt?: string | null
}

type PdvPayment = {
  id: string
  method: 'pix' | 'cartao' | 'dinheiro'
  amount: number
  status: 'pendente' | 'confirmado' | 'cancelado'
  installments: number | null
  change_amount: number | null
}

type PdvSale = {
  id: string
  status: 'aberta' | 'concluida' | 'cancelada'
  total_value: number
  payments: PdvPayment[]
}

/** Combobox único buscando produtos e serviços ao mesmo tempo. */
function CatalogSearch({ onAdd }: { onAdd: (item: CatalogResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      const term = query.trim()
      const [productsRes, servicesRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, quantity')
          .eq('active', true)
          .gt('quantity', 0)
          .ilike('name', `%${term}%`)
          .order('name')
          .limit(10),
        supabase
          .from('service_catalog_items')
          .select('id, model_name, repair_type, price')
          .eq('active', true)
          .or(`model_name.ilike.%${term}%,repair_type.ilike.%${term}%`)
          .order('model_name')
          .limit(10),
      ])
      const products: CatalogResult[] = (productsRes.data ?? []).map((p) => ({
        id: p.id, item_type: 'product', label: p.name, price: Number(p.price), stock: Number(p.quantity),
      }))
      const services: CatalogResult[] = (servicesRes.data ?? []).map((s) => ({
        id: s.id, item_type: 'service', label: `${s.model_name} — ${s.repair_type}`, price: Number(s.price),
      }))
      setResults([...products, ...services])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-vr-silver/40 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar produto ou serviço..."
          className={`${INPUT} pl-9`}
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-vr-graphite border border-white/10 rounded-xl shadow-xl max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2.5 text-sm text-vr-silver/50 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-vr-silver/50">Nada encontrado.</div>
          ) : (
            results.map((item) => (
              <button
                key={`${item.item_type}-${item.id}`}
                type="button"
                onMouseDown={() => { onAdd(item); setQuery(''); }}
                className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm text-white">{item.label}</p>
                  <p className="text-xs text-vr-silver/50">
                    {item.item_type === 'product' ? `Produto · estoque ${item.stock}` : 'Serviço'}
                  </p>
                </div>
                <span className="text-sm text-vr-red font-semibold shrink-0">{money(item.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Dialog "recebeu R$ X parcelando em Nx?" */
function CardConfirmDialog({
  amount, onClose, onConfirm,
}: { amount: number; onClose: () => void; onConfirm: (installments: number) => void }) {
  const [installments, setInstallments] = useState(1)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-vr-graphite rounded-2xl border border-white/10 p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-vr-red" />
          <h3 className="text-white font-semibold">Pagamento no cartão</h3>
        </div>
        <div>
          <label className={LABEL}>Parcelas</label>
          <select
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            className={INPUT}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}x{n > 1 ? ` de ${money(amount / n)}` : ''}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-vr-silver/80">
          Recebeu {money(amount)} parcelando em {installments}x?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-vr-silver/70 hover:text-white transition-colors">
            Fechar
          </button>
          <button
            onClick={() => onConfirm(installments)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-vr-red text-white hover:bg-vr-red/90 transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Confirmar recebimento
          </button>
        </div>
      </div>
    </div>
  )
}

/** Dialog "recebeu R$ X em dinheiro [troco R$ Y]" */
function CashConfirmDialog({
  amount, onClose, onConfirm,
}: { amount: number; onClose: () => void; onConfirm: (received: number) => void }) {
  const [received, setReceived] = useState(amount)
  const troco = Math.max(0, received - amount)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-vr-graphite rounded-2xl border border-white/10 p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-vr-red" />
          <h3 className="text-white font-semibold">Pagamento em dinheiro</h3>
        </div>
        <div>
          <label className={LABEL}>Valor recebido</label>
          <input
            type="number"
            step="0.01"
            min={amount}
            value={received}
            onChange={(e) => setReceived(Number(e.target.value) || 0)}
            className={INPUT}
          />
        </div>
        <p className="text-sm text-vr-silver/80">
          Recebeu {money(amount)} em dinheiro{troco > 0 ? ` — troco ${money(troco)}` : ''}?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-vr-silver/70 hover:text-white transition-colors">
            Fechar
          </button>
          <button
            onClick={() => onConfirm(received)}
            disabled={received < amount}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Confirmar recebimento
          </button>
        </div>
      </div>
    </div>
  )
}

type PixDialogState = {
  amount: number
  payment_id: string
  qr_code: string
  qr_code_base64: string
  status: 'pendente' | 'aprovado' | 'erro'
}

/** Dialog com QR Pix + copia-e-cola, com polling do status real na Mercado Pago. */
function PixDialog({
  state, onClose,
}: { state: PixDialogState; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-vr-graphite rounded-2xl border border-white/10 p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-vr-red" />
          <h3 className="text-white font-semibold">Pix — {money(state.amount)}</h3>
        </div>
        {state.status === 'aprovado' ? (
          <p className="text-sm text-green-400 flex items-center gap-1.5 py-6 justify-center">
            <Check className="w-5 h-5" /> Pagamento aprovado!
          </p>
        ) : (
          <>
            {state.qr_code_base64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.qr_code_base64} alt="QR Code Pix" className="w-full rounded-xl bg-white p-2" />
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(state.qr_code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="w-full px-3 py-2.5 rounded-xl text-xs font-mono text-vr-silver/70 bg-vr-black border border-white/8 hover:border-vr-red/40 transition-colors truncate"
            >
              {copied ? 'Copiado!' : 'Copiar código copia-e-cola'}
            </button>
            <p className="text-xs text-vr-silver/50 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aguardando pagamento...
            </p>
          </>
        )}
        <button onClick={onClose} className="w-full px-4 py-2 rounded-xl text-sm text-vr-silver/70 hover:text-white transition-colors">
          Fechar
        </button>
      </div>
    </div>
  )
}

export default function PdvClient() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [sale, setSale] = useState<PdvSale | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [cardDialogAmount, setCardDialogAmount] = useState<number | null>(null)
  const [cashDialogAmount, setCashDialogAmount] = useState<number | null>(null)
  const [pixDialog, setPixDialog] = useState<PixDialogState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const addToCart = (item: CatalogResult) => {
    setCart((prev) => {
      const key = `${item.item_type}-${item.id}`
      const existing = prev.find((c) => c.key === key)
      if (existing) {
        if (item.item_type === 'product' && item.stock != null && existing.quantity >= item.stock) return prev
        return prev.map((c) => (c.key === key ? { ...c, quantity: c.quantity + 1 } : c))
      }
      return [...prev, {
        key, item_type: item.item_type, id: item.id, label: item.label,
        unit_price: item.price, quantity: 1, stock: item.stock,
        scheduledAt: item.item_type === 'service' ? null : undefined,
      }]
    })
  }

  const changeQty = (key: string, delta: number) => {
    setCart((prev) => prev
      .map((c) => (c.key === key ? { ...c, quantity: Math.max(1, Math.min(c.stock ?? Infinity, c.quantity + delta)) } : c))
    )
  }

  const setScheduledAt = (key: string, value: string) => {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, scheduledAt: value || null } : c)))
  }

  const removeFromCart = (key: string) => setCart((prev) => prev.filter((c) => c.key !== key))

  const total = cart.reduce((sum, c) => sum + c.unit_price * c.quantity, 0)
  const confirmedTotal = (sale?.payments ?? []).filter((p) => p.status === 'confirmado').reduce((s, p) => s + p.amount, 0)
  const pendingTotal = (sale?.payments ?? []).filter((p) => p.status === 'pendente').reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, (sale?.total_value ?? total) - confirmedTotal - pendingTotal)

  const startCheckout = async () => {
    setError(null); setBusy(true)
    try {
      const res = await fetch(apiPath('/api/pdv/sales'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({
            item_type: c.item_type,
            product_id: c.item_type === 'product' ? c.id : undefined,
            service_id: c.item_type === 'service' ? c.id : undefined,
            quantity: c.quantity,
            scheduled_at: c.item_type === 'service' && c.scheduledAt ? new Date(c.scheduledAt).toISOString() : undefined,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao abrir venda')
      setSale(json)
      setCheckingOut(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir venda.')
    } finally {
      setBusy(false)
    }
  }

  const refreshSale = async (saleId: string) => {
    const res = await fetch(apiPath(`/api/pdv/sales/${saleId}`))
    const json = await res.json()
    if (res.ok) setSale(json)
    return json as PdvSale
  }

  const addPayment = async (method: 'pix' | 'cartao' | 'dinheiro', amount: number, extra?: { installments?: number; change_amount?: number; mp_payment_id?: string }) => {
    if (!sale) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(apiPath(`/api/pdv/sales/${sale.id}/payments`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, amount, ...extra }),
      })
      const payment = await res.json()
      if (!res.ok) throw new Error(payment.error ?? 'Falha ao adicionar pagamento')

      if (method !== 'pix') {
        const confirmRes = await fetch(apiPath(`/api/pdv/sales/${sale.id}/payments/${payment.id}/confirm`), { method: 'POST' })
        const confirmedSale = await confirmRes.json()
        if (!confirmRes.ok) throw new Error(confirmedSale.error ?? 'Falha ao confirmar pagamento')
        setSale(confirmedSale)
        if (confirmedSale.status === 'concluida') {
          setTimeout(() => { setCart([]); setSale(null); setCheckingOut(false) }, 1800)
        }
      } else {
        await refreshSale(sale.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao processar pagamento.')
    } finally {
      setBusy(false)
    }
  }

  const startPix = async () => {
    if (!sale) return
    setBusy(true); setError(null)
    try {
      const pix = await createPdvPix({
        amount: remaining,
        customer_name: 'Cliente balcão',
        external_reference: sale.id,
      })
      setPixDialog({ amount: remaining, payment_id: pix.payment_id, qr_code: pix.qr_code, qr_code_base64: pix.qr_code_base64, status: 'pendente' })
    } catch (e) {
      setError(e instanceof AdminAuthError ? e.message : e instanceof Error ? e.message : 'Falha ao gerar Pix.')
    } finally {
      setBusy(false)
    }
  }

  // Poll do status real na Mercado Pago enquanto o dialog Pix está aberto.
  useEffect(() => {
    if (!pixDialog || pixDialog.status !== 'pendente' || !sale) return
    const t = setInterval(async () => {
      try {
        const { status } = await getPdvPixStatus(pixDialog.payment_id)
        if (status === 'approved') {
          clearInterval(t)
          setPixDialog((prev) => (prev ? { ...prev, status: 'aprovado' } : prev))
          await addPayment('pix', pixDialog.amount, { mp_payment_id: pixDialog.payment_id })
          // addPayment não confirma pix sozinho (feito abaixo, já sabemos que foi pago de verdade).
          const refreshed = await refreshSale(sale.id)
          const pending = refreshed.payments.find((p) => p.method === 'pix' && p.status === 'pendente')
          if (pending) {
            const res = await fetch(apiPath(`/api/pdv/sales/${sale.id}/payments/${pending.id}/confirm`), { method: 'POST' })
            const confirmedSale = await res.json()
            if (res.ok) {
              setSale(confirmedSale)
              if (confirmedSale.status === 'concluida') {
                setTimeout(() => { setCart([]); setSale(null); setCheckingOut(false); setPixDialog(null) }, 1800)
              }
            }
          }
        }
      } catch {
        // erro de rede pontual no polling não precisa travar a UI -- tenta de novo no próximo tick.
      }
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixDialog?.payment_id, pixDialog?.status])

  const cancelCheckout = async () => {
    if (sale && sale.status === 'aberta') {
      await fetch(apiPath(`/api/pdv/sales/${sale.id}`), { method: 'DELETE' }).catch(() => {})
    }
    setSale(null); setCheckingOut(false); setError(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-vr-red" />
          PDV — Venda presencial
        </h1>
        <p className="text-sm text-vr-silver/50 mt-0.5">Vender produto ou serviço direto no balcão.</p>
      </div>

      {!checkingOut ? (
        <>
          <CatalogSearch onAdd={addToCart} />

          <div className="bg-vr-graphite rounded-2xl border border-white/5 divide-y divide-white/5">
            {cart.length === 0 ? (
              <p className="p-6 text-center text-sm text-vr-silver/40">Carrinho vazio — busque um produto ou serviço acima.</p>
            ) : (
              cart.map((item) => (
                <div key={item.key} className="p-3.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.label}</p>
                      <p className="text-xs text-vr-silver/50">
                        {money(item.unit_price)} {item.item_type === 'product' ? `· estoque ${item.stock}` : '· serviço'}
                      </p>
                    </div>
                    {item.item_type === 'product' ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQty(item.key, -1)} className="p-1.5 rounded-lg bg-vr-black text-vr-silver/60 hover:text-white transition-colors">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm text-white">{item.quantity}</span>
                        <button onClick={() => changeQty(item.key, 1)} className="p-1.5 rounded-lg bg-vr-black text-vr-silver/60 hover:text-white transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-vr-silver/40 px-2">qtd. 1</span>
                    )}
                    <span className="text-sm font-semibold text-white w-20 text-right">{money(item.unit_price * item.quantity)}</span>
                    <button onClick={() => removeFromCart(item.key)} className="p-1.5 rounded-lg text-vr-silver/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {item.item_type === 'service' && (
                    <div className="flex items-center gap-2 pl-0.5">
                      <Calendar className="w-3.5 h-3.5 text-vr-silver/40 shrink-0" />
                      {item.scheduledAt ? (
                        <>
                          <input
                            type="datetime-local"
                            value={item.scheduledAt}
                            onChange={(e) => setScheduledAt(item.key, e.target.value)}
                            className="text-xs bg-vr-black border border-white/8 rounded-lg px-2 py-1 text-white"
                          />
                          <button
                            onClick={() => setScheduledAt(item.key, '')}
                            className="text-xs text-vr-silver/40 hover:text-white transition-colors"
                          >
                            usar próximo horário livre
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setScheduledAt(item.key, new Date(Date.now() + 3600_000).toISOString().slice(0, 16))}
                          className="text-xs text-vr-silver/50 hover:text-vr-red transition-colors underline decoration-dotted"
                        >
                          Agenda automática pro próximo horário livre — escolher outro horário
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="flex items-center justify-between bg-vr-graphite rounded-2xl border border-white/5 p-4">
              <span className="text-sm text-vr-silver/70">Total</span>
              <span className="text-xl font-bold text-white">{money(total)}</span>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={startCheckout}
            disabled={cart.length === 0 || busy}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Finalizar venda — {money(total)}
          </button>
        </>
      ) : sale ? (
        <div className="space-y-4">
          <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-vr-silver/70">Total da venda</span>
              <span className="text-xl font-bold text-white">{money(sale.total_value)}</span>
            </div>
            {sale.payments.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-vr-silver/60 capitalize">
                      {p.method}{p.installments && p.installments > 1 ? ` (${p.installments}x)` : ''}
                    </span>
                    <span className={p.status === 'confirmado' ? 'text-green-400' : 'text-vr-silver/40'}>
                      {money(p.amount)} {p.status === 'confirmado' ? '✓' : '(pendente)'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {sale.status === 'concluida' ? (
              <p className="text-sm text-green-400 flex items-center gap-1.5 pt-2 border-t border-white/5">
                <Check className="w-4 h-4" /> Venda concluída! Estoque e solicitações já atualizados.
              </p>
            ) : (
              <p className="text-sm text-vr-silver/50 pt-2 border-t border-white/5">
                Falta {money(remaining)} — escolha a forma de pagamento abaixo.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {sale.status !== 'concluida' && (
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={startPix}
                disabled={busy}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl bg-vr-graphite border border-white/5 text-white hover:border-vr-red/40 transition-colors disabled:opacity-40"
              >
                <QrCode className="w-5 h-5 text-vr-red" />
                <span className="text-xs">Pix</span>
              </button>
              <button
                onClick={() => setCardDialogAmount(remaining)}
                disabled={busy}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl bg-vr-graphite border border-white/5 text-white hover:border-vr-red/40 transition-colors"
              >
                <CreditCard className="w-5 h-5 text-vr-red" />
                <span className="text-xs">Cartão</span>
              </button>
              <button
                onClick={() => setCashDialogAmount(remaining)}
                disabled={busy}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl bg-vr-graphite border border-white/5 text-white hover:border-vr-red/40 transition-colors"
              >
                <Banknote className="w-5 h-5 text-vr-red" />
                <span className="text-xs">Dinheiro</span>
              </button>
            </div>
          )}

          <button
            onClick={cancelCheckout}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-vr-silver/60 hover:text-white transition-colors"
          >
            {sale.status === 'concluida' ? 'Nova venda' : 'Cancelar venda'}
          </button>
        </div>
      ) : null}

      {cardDialogAmount != null && (
        <CardConfirmDialog
          amount={cardDialogAmount}
          onClose={() => setCardDialogAmount(null)}
          onConfirm={(installments) => { addPayment('cartao', cardDialogAmount, { installments }); setCardDialogAmount(null) }}
        />
      )}
      {cashDialogAmount != null && (
        <CashConfirmDialog
          amount={cashDialogAmount}
          onClose={() => setCashDialogAmount(null)}
          onConfirm={(received) => { addPayment('dinheiro', cashDialogAmount, { change_amount: Math.max(0, received - cashDialogAmount) }); setCashDialogAmount(null) }}
        />
      )}
      {pixDialog && <PixDialog state={pixDialog} onClose={() => setPixDialog(null)} />}
    </div>
  )
}
