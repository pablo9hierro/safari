import { createClient } from '@/lib/supabase/server'
import ProdutosClient from './ProdutosClient'

export default async function ProdutosPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .order('name')

  const { data: categories } = await supabase
    .from('product_categories')
    .select('*')
    .order('name')

  return <ProdutosClient initialProducts={products ?? []} initialCategories={categories ?? []} />
}
