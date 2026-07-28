import { createClient } from '@/lib/supabase/server'
import CatalogoDashboardClient from './CatalogoDashboardClient'

export default async function CatalogoDashboardPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('service_catalog_categories').select('*').order('sort_order'),
    supabase.from('service_catalog_items').select('*').order('sort_order'),
  ])

  return (
    <CatalogoDashboardClient
      initialCategories={categories ?? []}
      initialItems={items ?? []}
    />
  )
}
