import { createClient } from '@/lib/supabase/server'
import FinanceiroClient, { ServiceOrderRow, StoreOrderRow } from './FinanceiroClient'

export default async function FinanceiroPage() {
  try {
    const supabase = await createClient()

    const { data: serviceOrders, error: e1 } = await supabase
      .from('service_orders')
      .select('id, closed_at, final_value, request_id, service_requests(customer_name, customer_phone, phone_model, payment_methods, shipping_price)')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })

    const { data: storeOrders, error: e2 } = await supabase
      .from('store_orders')
      .select('id, customer_name, created_at, shipping_price, store_order_items(*)')
      .order('created_at', { ascending: false })

    if (e1 || e2) {
      return <pre className="text-red-400 p-8 text-xs">{JSON.stringify({ e1, e2 }, null, 2)}</pre>
    }

    return (
      <FinanceiroClient
        serviceOrders={(serviceOrders ?? []) as unknown as ServiceOrderRow[]}
        storeOrders={(storeOrders ?? []) as unknown as StoreOrderRow[]}
      />
    )
  } catch (err) {
    return <pre className="text-red-400 p-8 text-xs">{String(err)}</pre>
  }
}
