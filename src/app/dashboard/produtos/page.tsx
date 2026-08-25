import { createClient } from '@/lib/supabase/server'
import ProdutosClient from './ProdutosClient'

export default async function ProdutosPage() {
  const supabase = await createClient()

  const [
    { data: products },
    { data: categories },
    { data: stockItems },
    { data: stockMovements },
    { data: catalogCategories },
    { data: catalogItems },
    { data: deviceTypes },
    { data: catalogModels },
    { data: itemDevices },
    { data: itemBrands },
    { data: itemModels },
    { data: productDevices },
    { data: productBrands },
    { data: productModels },
  ] = await Promise.all([
    supabase.from('products').select('*, product_categories(name)').order('name'),
    supabase.from('product_categories').select('*').order('name'),
    supabase.from('stock_items').select('*').order('name'),
    supabase.from('stock_movements').select('*, stock_items(name, unit)').order('moved_at', { ascending: false }).limit(50),
    supabase.from('service_catalog_categories').select('*').order('sort_order'),
    supabase
      .from('service_catalog_items')
      .select('*, service_catalog_item_parts(id, quantity, stock_item_id, stock_items(name, unit)), service_catalog_item_extra_costs(id, name, value)')
      .order('sort_order'),
    supabase.from('device_types').select('*').order('sort_order'),
    supabase.from('catalog_models').select('*').order('sort_order'),
    supabase.from('service_item_devices').select('*'),
    supabase.from('service_item_brands').select('*'),
    supabase.from('service_item_models').select('*'),
    supabase.from('product_devices').select('*'),
    supabase.from('product_brands').select('*'),
    supabase.from('product_models').select('*'),
  ])

  return (
    <ProdutosClient
      initialProducts={products ?? []}
      initialCategories={categories ?? []}
      initialStockItems={stockItems ?? []}
      initialStockMovements={stockMovements ?? []}
      initialCatalogCategories={catalogCategories ?? []}
      initialCatalogItems={catalogItems ?? []}
      initialDeviceTypes={deviceTypes ?? []}
      initialCatalogModels={catalogModels ?? []}
      initialItemDevices={itemDevices ?? []}
      initialItemBrands={itemBrands ?? []}
      initialItemModels={itemModels ?? []}
      initialProductDevices={productDevices ?? []}
      initialProductBrands={productBrands ?? []}
      initialProductModels={productModels ?? []}
    />
  )
}
