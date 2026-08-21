'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Loja com `apenas_retirada` ativo (preferência da plataforma, /meu-plano):
 * substitui o seletor de endereço/mapa por essa mensagem fixa + link do
 * Google Maps até a loja, tanto no checkout de serviço quanto de produto.
 */
export default function PickupOnlyNotice({ variant = 'produto' }: { variant?: 'produto' | 'servico' }) {
  const [mapsUrl, setMapsUrl] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('shipping_settings')
      .select('store_lat, store_lng, store_address')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setAddress(data.store_address ?? null)
        if (data.store_lat && data.store_lng) {
          setMapsUrl(`https://www.google.com/maps/search/?api=1&query=${data.store_lat},${data.store_lng}`)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex items-start gap-3 bg-vr-black border border-white/10 rounded-xl p-4">
      <MapPin className="w-4 h-4 text-vr-red flex-none mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium">
          Loja não faz entrega — é necessário retirar {variant === 'servico' ? 'o aparelho' : 'o produto'} no local
        </p>
        {variant === 'servico' && (
          <p className="text-xs text-vr-silver/60 mt-1">
            Em caso de serviço: leve o aparelho na loja e retire depois de pronto.
          </p>
        )}
        {address && <p className="text-xs text-vr-silver/60 mt-1">{address}</p>}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-vr-red hover:text-vr-red-light mt-2 font-semibold"
          >
            Ver no Google Maps →
          </a>
        )}
      </div>
    </div>
  )
}
