'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export interface CartItem {
  id: string
  type: 'service' | 'product'
  name: string
  subtitle: string
  price: number
  quantity: number
  maxQty?: number
  imageUrl?: string
}

interface CartCtx {
  items: CartItem[]
  add: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  remove: (id: string) => void
  updateQty: (id: string, qty: number) => void
  clear: () => void
  total: number
  count: number
}

const Ctx = createContext<CartCtx | null>(null)
const KEY = 'vrt_sacola'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch { /* ignore */ }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* ignore */ }
  }, [items, ready])

  const add = (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id)
      if (existing) {
        if (item.type === 'product') {
          const cap = item.maxQty ?? existing.maxQty ?? 999
          return prev.map((i) =>
            i.id === item.id
              ? { ...i, quantity: Math.min(i.quantity + (item.quantity ?? 1), cap) }
              : i
          )
        }
        return prev
      }
      return [...prev, { ...item, quantity: item.quantity ?? 1 }]
    })
  }

  const remove = (id: string) => setItems((p) => p.filter((i) => i.id !== id))

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { remove(id); return }
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const cap = i.maxQty ?? 999
        return { ...i, quantity: Math.min(qty, cap) }
      })
    )
  }

  const clear = () => setItems([])

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const count = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <Ctx.Provider value={{ items, add, remove, updateQty, clear, total, count }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCart() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}
