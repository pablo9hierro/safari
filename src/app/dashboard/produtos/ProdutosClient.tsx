'use client'

import { useState } from 'react'
import { Package, Wrench, Boxes } from 'lucide-react'
import ProdutosTab from './ProdutosTab'
import ServicosTab from './ServicosTab'
import EstoqueTab from './EstoqueTab'
import type { Product, ProductCategory, StockItem, StockMovement } from '@/lib/types'

interface CatalogCategory { id: string; name: string; slug: string; sort_order: number }
interface CatalogItemPart { id: string; quantity: number; stock_item_id: string; stock_items: { name: string; unit: string } | null }
interface CatalogItemExtraCost { id: string; name: string; value: number }
interface CatalogItem {
  id: string; category_id: string; model_name: string; repair_type: string
  price: number; cost_price: number; duration_minutes: number
  description: string | null; sort_order: number; active: boolean
  service_catalog_item_parts?: CatalogItemPart[]
  service_catalog_item_extra_costs?: CatalogItemExtraCost[]
}

type Tab = 'produtos' | 'servicos' | 'estoque'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'produtos', label: 'Produtos', icon: Package },
  { key: 'servicos', label: 'Serviços', icon: Wrench },
  { key: 'estoque', label: 'Estoque', icon: Boxes },
]

interface Props {
  initialProducts: Product[]
  initialCategories: ProductCategory[]
  initialStockItems: StockItem[]
  initialStockMovements: StockMovement[]
  initialCatalogCategories: CatalogCategory[]
  initialCatalogItems: CatalogItem[]
}

export default function ProdutosClient(props: Props) {
  const [tab, setTab] = useState<Tab>('produtos')
  // Elevado até aqui (em vez de local em EstoqueTab) pra ServicosTab também
  // enxergar item de estoque cadastrado na mesma sessão, sem precisar
  // recarregar a página — as duas abas compartilham a mesma lista viva.
  const [stockItems, setStockItems] = useState<StockItem[]>(props.initialStockItems)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex gap-1 bg-vr-graphite border border-white/5 p-1 rounded-2xl">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${tab === key ? 'bg-vr-red text-white shadow' : 'text-vr-silver/60 hover:text-white'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'produtos' && (
        <ProdutosTab
          initialProducts={props.initialProducts}
          initialCategories={props.initialCategories}
        />
      )}
      {tab === 'servicos' && (
        <ServicosTab
          initialCategories={props.initialCatalogCategories}
          initialItems={props.initialCatalogItems}
          stockItems={stockItems}
        />
      )}
      {tab === 'estoque' && (
        <EstoqueTab
          items={stockItems}
          setItems={setStockItems}
          initialMovements={props.initialStockMovements}
        />
      )}
    </div>
  )
}
