'use client'

import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/lib/carrinho/context'
import CarrinhoDrawer from './CarrinhoDrawer'

export default function CarrinhoFlutuante() {
  const [open, setOpen] = useState(false)
  const { count } = useCart()

  return (
    <>
      <button
        id="cart-icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-vr-red rounded-full shadow-lg shadow-vr-red/30 flex items-center justify-center hover:bg-vr-red/90 transition-colors"
        aria-label="Abrir sacola"
      >
        <ShoppingBag className="w-6 h-6 text-white" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-vr-red text-xs font-black rounded-full flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <CarrinhoDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
