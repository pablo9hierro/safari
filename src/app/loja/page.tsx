import { createClient } from '@/lib/supabase/server'
import LojaClient from './LojaClient'

export default async function LojaPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .eq('active', true)
    .order('name')

  const { data: rates } = await supabase
    .from('neighborhood_shipping_rates')
    .select('*')
    .order('neighborhood')

  return <LojaClient initialProducts={products ?? []} shippingRates={rates ?? []} />
}
