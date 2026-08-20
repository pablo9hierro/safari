'use client'

import { useEffect, useState } from 'react'
import { Product } from '@/lib/types'
import { Logo } from '@/components/ui'
import { ArrowLeft, Package, Minus, Plus, ShoppingCart, CheckCircle2 } from 'lucide-react'
import { StoreLink } from '@/lib/storeProxyLink'

const CART_STORAGE_KEY = 'vrtech_loja_cart'

type CartItem = { productId: string; quantity: number }

function currency(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

export default function ProductDetailClient({ product }: { product: Product }) {
  const images = product.image_urls?.length ? product.image_urls : (product.image_url ? [product.image_url] : [])
  const [activeImage, setActiveImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const outOfStock = Number(product.quantity) <= 0

  useEffect(() => {
    setAdded(false)
  }, [quantity])

  const addToCart = () => {
    let cart: CartItem[] = []
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY)
      if (raw) cart = JSON.parse(raw)
    } catch {
      cart = []
    }

    const existing = cart.find((i) => i.productId === product.id)
    const max = Number(product.quantity)
    if (existing) {
      existing.quantity = Math.min(max, existing.quantity + quantity)
    } else {
      cart.push({ productId: product.id, quantity: Math.min(max, quantity) })
    }

    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // ignora falha de armazenamento (modo privado, quota etc.)
    }
    setAdded(true)
  }

  return (
    <main className="min-h-screen bg-vr-black text-white">
      <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-4xl mx-auto">
        <StoreLink
          href="/loja"
          className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Catálogo
        </StoreLink>
        <Logo size="md" />
      </header>

      <div className="max-w-4xl mx-auto px-5 sm:px-10 pb-16">
        <div className="bg-white rounded-3xl overflow-hidden shadow-xl text-gray-900">
          <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
            {images.length > 0 ? (
              <img src={images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <Package className="w-16 h-16 text-gray-300" />
            )}
          </div>

          {images.length > 1 && (
            <div className="flex items-center gap-2 px-5 pt-4">
              {images.map((url, idx) => (
                <button
                  key={url}
                  onClick={() => setActiveImage(idx)}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-colors ${
                    idx === activeImage ? 'border-vr-red' : 'border-transparent'
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="p-5 sm:p-6 space-y-4">
            <div>
              {product.product_categories?.name && (
                <p className="text-xs font-semibold text-vr-red uppercase tracking-wide mb-1">
                  {product.product_categories.name}
                </p>
              )}
              <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            </div>

            <p className="text-3xl font-black text-vr-red">{currency(Number(product.price))}</p>

            {product.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Descrição</p>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              {outOfStock ? (
                <p className="text-sm font-semibold text-gray-400">Produto esgotado no momento.</p>
              ) : added ? (
                <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Adicionado à sacola!
                  <StoreLink href="/loja" className="text-vr-red underline ml-1">Ver sacola</StoreLink>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-2 py-1.5">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 flex items-center justify-center text-vr-red"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-gray-800 w-5 text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(Number(product.quantity), q + 1))}
                      disabled={quantity >= Number(product.quantity)}
                      className="w-8 h-8 flex items-center justify-center text-vr-red disabled:opacity-30"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={addToCart}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-vr-red hover:bg-vr-red-dark text-white rounded-xl py-3 transition-colors"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Adicionar à sacola
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
