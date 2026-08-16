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
  ])

  return (
    <ProdutosClient
      initialProducts={products ?? []}
      initialCategories={categories ?? []}
      initialStockItems={stockItems ?? []}
      initialStockMovements={stockMovements ?? []}
      initialCatalogCategories={catalogCategories ?? []}
      initialCatalogItems={catalogItems ?? []}
    />
  )
}
