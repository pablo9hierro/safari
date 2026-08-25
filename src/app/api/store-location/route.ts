import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Endereço FIXO da loja (Rota A no mapa de coleta/entrega) -- já configurado
 * pelo lojista em /dashboard/servicodeslocamento (mesma tabela que já
 * alimenta o cálculo de frete). Não depende de o lojista compartilhar GPS
 * ao vivo nenhum -- a loja não anda de lugar.
 */
export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('shipping_settings')
      .select('store_lat, store_lng, store_address')
      .eq('id', 1)
      .maybeSingle()
    if (!data?.store_lat || !data?.store_lng) {
      return NextResponse.json({ lat: null, lng: null, address: null })
    }
    return NextResponse.json({ lat: data.store_lat, lng: data.store_lng, address: data.store_address ?? null })
  } catch {
    return NextResponse.json({ lat: null, lng: null, address: null })
  }
}
