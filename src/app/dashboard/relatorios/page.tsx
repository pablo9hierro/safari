import { createClient } from '@/lib/supabase/server'
import RelatoriosClient, { ServiceOrderRow } from './RelatoriosClient'

export default async function RelatoriosPage() {
  try {
    const supabase = await createClient()

    const { data: serviceOrders, error: e1 } = await supabase
      .from('service_orders')
      .select('id, closed_at, final_value, request_id, service_requests(customer_name, customer_phone, phone_model, payment_methods, shipping_price)')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })

    if (e1) {
      return <pre className="text-red-400 p-8 text-xs">{JSON.stringify({ e1 }, null, 2)}</pre>
    }

    return <RelatoriosClient serviceOrders={(serviceOrders ?? []) as unknown as ServiceOrderRow[]} />
  } catch (err) {
    return <pre className="text-red-400 p-8 text-xs">{String(err)}</pre>
  }
}
