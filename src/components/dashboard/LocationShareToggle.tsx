'use client'

import { useEffect, useRef, useState } from 'react'
import { Navigation, Loader2 } from 'lucide-react'
import { upsertDriverLocation } from '@/lib/driverLocation'

const MIN_UPDATE_INTERVAL_MS = 5000

/**
 * Botão do lojista pra ligar/desligar o compartilhamento da própria
 * localização enquanto está em rota de coleta/entrega -- é essa posição
 * que os cards de "Solicitação" com mapa ao vivo (LiveTrackingMap) mostram
 * se movendo, tipo Uber. Sem GPS do navegador, sem mapa ao vivo -- não tem
 * como fingir.
 */
export default function LocationShareToggle() {
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastSentAt = useRef(0)

  const stop = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setSharing(false)
  }

  const start = () => {
    setError(null)
    if (!navigator.geolocation) {
      setError('Este navegador não suporta localização.')
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastSentAt.current < MIN_UPDATE_INTERVAL_MS) return
        lastSentAt.current = now
        upsertDriverLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {})
      },
      () => setError('Não foi possível acessar sua localização.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    setSharing(true)
  }

  useEffect(() => () => stop(), [])

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => (sharing ? stop() : start())}
        className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl transition-colors
          ${sharing ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-vr-graphite border border-white/10 text-vr-silver hover:text-white'}`}
      >
        {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
        {sharing ? 'Compartilhando localização' : 'Compartilhar localização'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
