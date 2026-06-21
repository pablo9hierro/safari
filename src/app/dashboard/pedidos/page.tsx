import { createClient } from '@/lib/supabase/server'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('store_orders')
    .select('*, store_order_items(*)')
    .order('created_at', { ascending: false })

  return <PedidosClient initialOrders={orders ?? []} />
}
