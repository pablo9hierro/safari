'use client'

import { useMemo, useState } from 'react'
import { Product } from '@/lib/types'
import Link from 'next/link'
import { Logo } from '@/components/ui'
import { ShoppingBag, Plus, Minus, Package, ArrowLeft } from 'lucide-react'
import { useCart } from '@/lib/carrinho/context'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export default function LojaClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products] = useState<Product[]>(initialProducts)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const { items, add, updateQty, count } = useCart()

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.product_categories?.name) set.add(p.product_categories.name)
    return Array.from(set).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    if (categoryFilter === 'all') return products
    return products.filter((p) => p.product_categories?.name === categoryFilter)
  }, [products, categoryFilter])

  const qtyInCart = (productId: string) => items.find((i) => i.id === productId)?.quantity ?? 0

  const handleAdd = (product: Product) => {
    add({
      id: product.id,
      type: 'product',
      name: product.name,
      subtitle: product.product_categories?.name ?? 'Produto',
      price: Number(product.price),
      maxQty: Number(product.quantity),
    })
  }

  return (
    <main className="min-h-screen bg-vr-black text-white">
      <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Início</span>
          </Link>
          <Logo size="md" />
        </div>
        <button
          onClick={() => document.getElementById('cart-icon')?.click()}
          className="relative flex items-center gap-2 bg-vr-graphite border border-white/10 rounded-xl px-4 py-2.5 hover:border-vr-red/40 transition-colors"
        >
          <ShoppingBag className="w-4 h-4 text-vr-red" />
          <span className="text-sm font-medium text-white">Sacola</span>
          {count > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center text-xs font-bold bg-vr-red text-white rounded-full">
              {count}
            </span>
          )}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-10 pb-16">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Catálogo</h1>
        <p className="text-vr-silver/60 text-sm mb-6">
          Escolha os produtos e finalize pela sacola.
        </p>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${categoryFilter === 'all' ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite/80'}`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${categoryFilter === c ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite/80'}`}
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
              const inCart = qtyInCart(product.id)
              const outOfStock = Number(product.quantity) <= 0
              return (
                <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-xl flex flex-col">
                  <Link href={`/loja/${product.id}`} className="flex flex-col flex-1">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-10 h-10 text-gray-300" />
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">
                          {product.name}
                        </p>
                        {product.product_categories?.name && (
                          <p className="text-xs text-gray-400">{product.product_categories.name}</p>
                        )}
                        {product.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mt-1">{product.description}</p>
                        )}
                      </div>
                      <p className="text-vr-red font-bold mt-auto">{currency(Number(product.price))}</p>
                    </div>
                  </Link>

                  <div className="px-3 pb-3">
                    {outOfStock ? (
                      <span className="block text-xs font-semibold text-gray-400 text-center py-2">
                        Esgotado
                      </span>
                    ) : inCart > 0 ? (
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-2 py-1">
                        <button
                          onClick={() => updateQty(product.id, inCart - 1)}
                          className="w-7 h-7 flex items-center justify-center text-vr-red"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-semibold text-gray-800">{inCart}</span>
                        <button
                          onClick={() => handleAdd(product)}
                          disabled={inCart >= Number(product.quantity)}
                          className="w-7 h-7 flex items-center justify-center text-vr-red disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAdd(product)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-vr-red hover:bg-vr-red/90 text-white rounded-xl py-2 transition-colors"
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
    </main>
  )
}
