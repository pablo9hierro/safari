'use client'

import { useCart } from '@/lib/carrinho/context'
import { X, ShoppingCart, Trash2, Wrench, Package, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function CarrinhoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, remove, clear, total } = useCart()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-vr-graphite border-l border-white/10 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-vr-red" />
            Carrinho ({items.length})
          </h2>
          <button onClick={onClose} className="text-vr-silver/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <p className="text-center text-sm text-vr-silver/40 py-12">Nenhum item adicionado.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="bg-vr-black border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3">
                {item.type === 'service' ? (
                  <Wrench className="w-4 h-4 text-vr-red flex-shrink-0" />
                ) : (
                  <Package className="w-4 h-4 text-vr-red flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.name}</p>
                  <p className="text-xs text-vr-silver/50 truncate">{item.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-vr-silver">R$ {item.price.toFixed(2)}</span>
                  <button
                    onClick={() => remove(item.id)}
                    className="text-vr-silver/30 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-vr-silver/60">Total estimado</span>
              <span className="text-lg font-black text-white">R$ {total.toFixed(2)}</span>
            </div>
            <Link
              href="/#orcamento"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 bg-vr-red text-white font-semibold py-3 rounded-xl hover:bg-vr-red/90 transition-colors text-sm"
            >
              Solicitar serviço
              <ChevronRight className="w-4 h-4" />
            </Link>
            <button
              onClick={clear}
              className="w-full text-xs text-vr-silver/40 hover:text-vr-silver transition-colors py-1"
            >
              Limpar carrinho
            </button>
          </div>
        )}
      </div>
    </>
  )
}
