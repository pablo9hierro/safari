'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NeighborhoodShippingRate, Product } from '@/lib/types'
import { Autocomplete, Logo } from '@/components/ui'
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  Package,
  Loader2,
  CheckCircle2,
  Home,
} from 'lucide-react'

const CART_STORAGE_KEY = 'vrtech_loja_cart'

type CartItem = { productId: string; quantity: number }

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

function currency(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

export default function LojaClient({
  initialProducts,
  shippingRates,
}: {
  initialProducts: Product[]
  shippingRates: NeighborhoodShippingRate[]
}) {
  const [products] = useState<Product[]>(initialProducts)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [pickupAtStore, setPickupAtStore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY)
      if (raw) setCartItems(JSON.parse(raw))
    } catch {
      // localStorage indisponível — carrinho começa vazio
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
    } catch {
      // ignora falha de armazenamento (modo privado, quota etc.)
    }
  }, [cartItems])

  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const rateByNeighborhood = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of shippingRates) map.set(r.neighborhood, Number(r.price))
    return map
  }, [shippingRates])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.product_categories?.name) set.add(p.product_categories.name)
    return Array.from(set).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    if (categoryFilter === 'all') return products
    return products.filter((p) => p.product_categories?.name === categoryFilter)
  }, [products, categoryFilter])

  const cartLines = useMemo(() => {
    return cartItems
      .map((item) => ({ item, product: productById.get(item.productId) }))
      .filter((line): line is { item: CartItem; product: Product } => !!line.product)
  }, [cartItems, productById])

  const cartCount = cartLines.reduce((sum, l) => sum + l.item.quantity, 0)
  const subtotal = cartLines.reduce((sum, l) => sum + l.product.price * l.item.quantity, 0)
  const shippingPrice = pickupAtStore ? 0 : (rateByNeighborhood.get(neighborhood) ?? 0)
  const total = subtotal + shippingPrice

  const quantityInCart = (productId: string) => cartItems.find((i) => i.productId === productId)?.quantity ?? 0

  const addToCart = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        if (existing.quantity >= Number(product.quantity)) return prev
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
      }
      return [...prev, { productId: product.id, quantity: 1 }]
    })
  }

  const changeQty = (productId: string, delta: number) => {
    setCartItems((prev) => {
      const product = productById.get(productId)
      return prev
        .map((i) => {
          if (i.productId !== productId) return i
          const max = product ? Number(product.quantity) : i.quantity
          const next = Math.min(max, Math.max(0, i.quantity + delta))
          return { ...i, quantity: next }
        })
        .filter((i) => i.quantity > 0)
    })
  }

  const removeFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((i) => i.productId !== productId))
  }

  const resetCheckout = () => {
    setCustomerName('')
    setWhatsapp('')
    setNeighborhood('')
    setPickupAtStore(false)
  }

  const handleFinalize = async () => {
    setError(null)
    if (cartLines.length === 0) { setError('Sua sacola está vazia.'); return }
    if (!customerName.trim()) { setError('Informe seu nome.'); return }
    const whatsappDigits = whatsapp.replace(/\D/g, '')
    if (whatsappDigits.length < 10) { setError('Informe um WhatsApp válido.'); return }
    if (!pickupAtStore && !neighborhood.trim()) { setError('Selecione seu bairro ou marque a opção de retirada no local.'); return }

    setSubmitting(true)
    const supabase = createClient()

    const { data: order, error: orderErr } = await supabase
      .from('store_orders')
      .insert({
        customer_name: customerName.trim(),
        customer_whatsapp: whatsapp.trim(),
        neighborhood: pickupAtStore ? null : neighborhood,
        shipping_price: shippingPrice,
        pickup_at_store: pickupAtStore,
        total_value: total,
        status: 'pendente',
      })
      .select()
      .single()

    if (orderErr || !order) {
      setError('Não foi possível enviar seu pedido. Tente novamente.')
      setSubmitting(false)
      return
    }

    const { error: itemsErr } = await supabase.from('store_order_items').insert(
      cartLines.map((l) => ({
        store_order_id: order.id,
        product_id: l.product.id,
        product_name: l.product.name,
        unit_price: l.product.price,
        quantity: l.item.quantity,
      }))
    )

    if (itemsErr) {
      setError('Não foi possível enviar seu pedido. Tente novamente.')
      setSubmitting(false)
      return
    }

    fetch('/api/whatsapp/notify-store-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    }).catch((e) => console.error('Erro ao notificar WhatsApp:', e))

    setCartItems([])
    resetCheckout()
    setSuccess(true)
    setSubmitting(false)
  }

  return (
    <main className="min-h-screen bg-vr-black text-white">
      <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Logo size="md" />
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 bg-vr-graphite border border-white/10 rounded-xl px-4 py-2.5 hover:border-vr-red/40 transition-colors"
        >
          <ShoppingCart className="w-4 h-4 text-vr-red" />
          <span className="text-sm font-medium text-white">Sacola</span>
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center text-xs font-bold bg-vr-red text-white rounded-full">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-10 pb-16">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Catálogo</h1>
        <p className="text-vr-silver/60 text-sm mb-6">Escolha os produtos e finalize seu pedido pelo WhatsApp.</p>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${categoryFilter === 'all' ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${categoryFilter === c ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-vr-silver/40">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const inCart = quantityInCart(product.id)
              const outOfStock = Number(product.quantity) <= 0
              return (
                <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-xl flex flex-col">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-10 h-10 text-gray-300" />
                    )}
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{product.name}</p>
                      {product.product_categories?.name && (
                        <p className="text-xs text-gray-400">{product.product_categories.name}</p>
                      )}
                    </div>
                    <p className="text-vr-red font-bold mt-auto">{currency(Number(product.price))}</p>

                    {outOfStock ? (
                      <span className="text-xs font-semibold text-gray-400 text-center py-2">Esgotado</span>
                    ) : inCart > 0 ? (
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-2 py-1">
                        <button
                          onClick={() => changeQty(product.id, -1)}
                          className="w-7 h-7 flex items-center justify-center text-vr-red"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-semibold text-gray-800">{inCart}</span>
                        <button
                          onClick={() => addToCart(product)}
                          disabled={inCart >= Number(product.quantity)}
                          className="w-7 h-7 flex items-center justify-center text-vr-red disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-vr-red hover:bg-vr-red-dark text-white rounded-xl py-2 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sacola / checkout */}
      {cartOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="bg-white text-gray-900 w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-vr-red" />
                Sua sacola
              </h2>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="px-5 py-10 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <h3 className="font-bold text-gray-900 text-lg">Pedido enviado!</h3>
                <p className="text-sm text-gray-500">
                  Recebemos seu pedido. Em breve entraremos em contato pelo WhatsApp para continuar a negociação.
                </p>
                <button
                  onClick={() => { setSuccess(false); setCartOpen(false) }}
                  className="btn-primary mt-2"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {cartLines.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sua sacola está vazia.</p>
                ) : (
                  <ul className="space-y-2">
                    {cartLines.map(({ item, product }) => (
                      <li key={product.id} className="flex items-center gap-3">
                        <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
                          <p className="text-xs text-gray-400">{currency(product.price)} cada</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => changeQty(product.id, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-vr-red">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => changeQty(product.id, 1)}
                            disabled={item.quantity >= Number(product.quantity)}
                            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-vr-red disabled:opacity-30"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeFromCart(product.id)} className="text-gray-300 hover:text-red-500 ml-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {cartLines.length > 0 && (
                  <>
                    <div className="border-t border-gray-100 pt-3 space-y-3">
                      <div>
                        <label className="label">Seu nome *</label>
                        <input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Nome completo"
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">WhatsApp *</label>
                        <input
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                          type="tel"
                          inputMode="numeric"
                          placeholder="(83) 99999-9999"
                          maxLength={15}
                          className="input-field"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={pickupAtStore}
                          onChange={(e) => setPickupAtStore(e.target.checked)}
                          className="w-4 h-4 accent-vr-red"
                        />
                        <Home className="w-3.5 h-3.5" />
                        Quero buscar o aparelho no local
                      </label>

                      {!pickupAtStore && (
                        <div>
                          <label className="label">Bairro *</label>
                          <Autocomplete
                            value={neighborhood}
                            onChange={setNeighborhood}
                            options={shippingRates.map((r) => r.neighborhood)}
                            placeholder="Digite para buscar o bairro em João Pessoa..."
                          />
                          {neighborhood && (
                            <p className="text-xs text-gray-400 mt-1">
                              Frete para {neighborhood}: {currency(shippingPrice)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span>{currency(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Frete</span>
                        <span>{pickupAtStore ? 'Retirada no local' : currency(shippingPrice)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
                        <span>Total</span>
                        <span>{currency(total)}</span>
                      </div>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button
                      onClick={handleFinalize}
                      disabled={submitting}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                      Finalizar pedido
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
