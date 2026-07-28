'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export interface CartItem {
  id: string
  type: 'service' | 'product'
  name: string
  subtitle: string
  price: number
}

interface CartCtx {
  items: CartItem[]
  add: (item: CartItem) => void
  remove: (id: string) => void
  clear: () => void
  total: number
}

const Ctx = createContext<CartCtx | null>(null)
const KEY = 'vrt_cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch {}
  }, [])

  const save = (next: CartItem[]) => {
    setItems(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  }

  const add = (item: CartItem) => {
    save([...items.filter((i) => i.id !== item.id), item])
  }

  const remove = (id: string) => save(items.filter((i) => i.id !== id))

  const clear = () => save([])

  const total = items.reduce((sum, i) => sum + i.price, 0)

  return <Ctx.Provider value={{ items, add, remove, clear, total }}>{children}</Ctx.Provider>
}

export function useCart() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}
