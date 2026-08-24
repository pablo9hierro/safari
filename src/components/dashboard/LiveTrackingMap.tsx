'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Bike, Loader2 } from 'lucide-react'
import { fetchDriverLocation, isFresh, straightLineDistanceKm, type DriverLocation } from '@/lib/driverLocation'

const POLL_MS = 5000

// Mapa normal (colorido), diferente do dark_all usado no LocationPicker --
// pedido explícito: essa tela não precisa ser preto e cinza.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const driverIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#111827;border:3px solid #22c55e;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

/**
 * Mapa "tipo Uber" ao vivo dentro do card de coleta/entrega em andamento:
 * pino do endereço do cliente (fixo) + pino do lojista (se movendo,
 * atualizado por polling em cima de driver_location). Sem localização
 * recente compartilhada, mostra um aviso em vez de fingir uma rota.
 */
export default function LiveTrackingMap({ destLat, destLng }: { destLat: number; destLng: number }) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const [driver, setDriver] = useState<DriverLocation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const loc = await fetchDriverLocation().catch(() => null)
      if (!cancelled) { setDriver(loc); setLoading(false) }
    }
    poll()
    const t = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { zoomControl: false, attributionControl: false })
      .setView([destLat, destLng], 14)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
    L.control.attribution({ prefix: false }).addTo(map)
    destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!driver || !isFresh(driver.updated_at)) {
      if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null }
      map.setView([destLat, destLng], 14)
      return
    }
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker([driver.lat, driver.lng], { icon: driverIcon }).addTo(map)
    } else {
      driverMarkerRef.current.setLatLng([driver.lat, driver.lng])
    }
    const bounds = L.latLngBounds([[destLat, destLng], [driver.lat, driver.lng]])
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 })
  }, [driver, destLat, destLng])

  const distanceKm = driver && isFresh(driver.updated_at)
    ? straightLineDistanceKm({ lat: destLat, lng: destLng }, driver)
    : null

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100" onClick={(e) => e.stopPropagation()}>
      <div className="relative h-40 w-full">
        <div ref={divRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 text-xs text-gray-500">
        <Bike className="w-3.5 h-3.5 text-green-600 shrink-0" />
        {driver && isFresh(driver.updated_at)
          ? distanceKm !== null
            ? `A ~${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} do endereço`
            : 'Localização ao vivo'
          : 'Aguardando o lojista compartilhar a localização'}
      </div>
    </div>
  )
}
