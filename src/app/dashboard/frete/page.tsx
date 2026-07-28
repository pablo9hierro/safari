import { createClient } from '@/lib/supabase/server'
import FreteClient from './FreteClient'

export default async function FretePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('shipping_settings')
    .select('price_per_km, store_lat, store_lng, max_km')
    .eq('id', 1)
    .single()

  const initial = data ?? { price_per_km: 2.0, store_lat: -7.1195, store_lng: -34.845, max_km: null }

  return <FreteClient initial={initial} />
}
