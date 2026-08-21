'use client'

import { useState } from 'react'
import { Package, Wrench, Boxes, Smartphone } from 'lucide-react'
import ProdutosTab from './ProdutosTab'
import ServicosTab from './ServicosTab'
import EstoqueTab from './EstoqueTab'
import AparelhoMarcaModeloTab from './AparelhoMarcaModeloTab'
import type { Product, ProductCategory, StockItem, StockMovement } from '@/lib/types'

interface CatalogCategory { id: string; name: string; slug: string; sort_order: number; device_type_id: string | null }
interface CatalogItemPart { id: string; quantity: number; stock_item_id: string; stock_items: { name: string; unit: string } | null }
interface CatalogItemExtraCost { id: string; name: string; value: number }
interface CatalogItem {
  id: string; category_id: string; model_name: string | null; repair_type: string
  price: number; cost_price: number; duration_minutes: number
  description: string | null; sort_order: number; active: boolean
  service_catalog_item_parts?: CatalogItemPart[]
  service_catalog_item_extra_costs?: CatalogItemExtraCost[]
}
interface DeviceType { id: string; name: string; slug: string; icon_key: string; sort_order: number }
interface CatalogModel { id: string; brand_id: string; name: string; sort_order: number }
interface ItemDeviceLink { service_catalog_item_id: string; device_type_id: string }
interface ItemBrandLink { service_catalog_item_id: string; brand_id: string }
interface ItemModelLink { service_catalog_item_id: string; model_id: string }

type Tab = 'produtos' | 'servicos' | 'estoque' | 'aparelho_marca_modelo'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'produtos', label: 'Produtos', icon: Package },
  { key: 'servicos', label: 'Serviços', icon: Wrench },
  { key: 'estoque', label: 'Estoque', icon: Boxes },
  { key: 'aparelho_marca_modelo', label: 'Aparelho/Marca/Modelo', icon: Smartphone },
]

interface Props {
  initialProducts: Product[]
  initialCategories: ProductCategory[]
  initialStockItems: StockItem[]
  initialStockMovements: StockMovement[]
  initialCatalogCategories: CatalogCategory[]
  initialCatalogItems: CatalogItem[]
  initialDeviceTypes: DeviceType[]
  initialCatalogModels: CatalogModel[]
  initialItemDevices: ItemDeviceLink[]
  initialItemBrands: ItemBrandLink[]
  initialItemModels: ItemModelLink[]
}

export default function ProdutosClient(props: Props) {
  const [tab, setTab] = useState<Tab>('produtos')
  // Elevado até aqui (em vez de local em EstoqueTab) pra ServicosTab também
  // enxergar item de estoque cadastrado na mesma sessão, sem precisar
  // recarregar a página — as duas abas compartilham a mesma lista viva.
  const [stockItems, setStockItems] = useState<StockItem[]>(props.initialStockItems)

  // Aparelhos/marcas/modelos são compartilhados entre a aba de Serviços
  // (cadastro dinâmico via busca) e a aba dedicada Aparelho/Marca/Modelo
  // (cadastro individual) -- elevados aqui pra uma aba refletir criação
  // feita pela outra sem precisar recarregar a página.
  const [categories, setCategories] = useState<CatalogCategory[]>(props.initialCatalogCategories)
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>(props.initialDeviceTypes)
  const [models, setModels] = useState<CatalogModel[]>(props.initialCatalogModels)

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
          categories={categories}
          setCategories={setCategories}
          deviceTypes={deviceTypes}
          setDeviceTypes={setDeviceTypes}
          models={models}
          setModels={setModels}
          initialItems={props.initialCatalogItems}
          initialItemDevices={props.initialItemDevices}
          initialItemBrands={props.initialItemBrands}
          initialItemModels={props.initialItemModels}
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
      {tab === 'aparelho_marca_modelo' && (
        <AparelhoMarcaModeloTab
          categories={categories}
          setCategories={setCategories}
          deviceTypes={deviceTypes}
          setDeviceTypes={setDeviceTypes}
          models={models}
          setModels={setModels}
        />
      )}
    </div>
  )
}
