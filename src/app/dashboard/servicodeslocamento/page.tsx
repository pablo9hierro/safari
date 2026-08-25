import { createClient } from '@/lib/supabase/server'
import ServicoDeslocamentoClient from './ServicoDeslocamentoClient'

export default async function ServicoDeslocamentoPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('shipping_settings')
    .select('price_per_km, store_lat, store_lng, max_km, store_address, cobrar_coleta, cobrar_entrega, minutes_per_km')
    .eq('id', 1)
    .single()

  const initial = data ?? {
    price_per_km: 2.0,
    store_lat: -7.1195,
    store_lng: -34.845,
    max_km: null,
    store_address: '',
    cobrar_coleta: true,
    cobrar_entrega: true,
    minutes_per_km: 3,
  }

  return (
    <ServicoDeslocamentoClient
      initial={{
        ...initial,
        store_address: initial.store_address ?? '',
        cobrar_coleta: initial.cobrar_coleta ?? true,
        cobrar_entrega: initial.cobrar_entrega ?? true,
        minutes_per_km: initial.minutes_per_km ?? 3,
      }}
    />
  )
}
