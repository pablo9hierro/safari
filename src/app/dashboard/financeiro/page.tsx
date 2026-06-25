import { createClient } from '@/lib/supabase/server'
import FinanceiroClient, { ServiceOrderRow, StoreOrderRow } from './FinanceiroClient'

export default async function FinanceiroPage() {
  const supabase = await createClient()

  const { data: serviceOrders } = await supabase
    .from('service_orders')
    .select('id, closed_at, final_value, request_id, service_requests(customer_name, phone_model)')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })

  const { data: storeOrders } = await supabase
    .from('store_orders')
    .select('id, customer_name, created_at, store_order_items(*)')
    .order('created_at', { ascending: false })

  return (
    <FinanceiroClient
      serviceOrders={(serviceOrders ?? []) as unknown as ServiceOrderRow[]}
      storeOrders={(storeOrders ?? []) as unknown as StoreOrderRow[]}
    />
  )
}
