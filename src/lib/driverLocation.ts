import { createClient } from '@/lib/supabase/client'

export type DriverLocation = { lat: number; lng: number; updated_at: string }

/** Loja de um técnico só -- uma linha fixa (id='default') já basta pra
 * saber onde ele está agora, sem amarrar em qual atendimento. */
export async function fetchDriverLocation(): Promise<DriverLocation | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('driver_location')
    .select('lat, lng, updated_at')
    .eq('id', 'default')
    .maybeSingle()
  return (data as DriverLocation | null) ?? null
}

export async function upsertDriverLocation(lat: number, lng: number): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('driver_location')
    .upsert({ id: 'default', lat, lng, updated_at: new Date().toISOString() })
}

/** Posição considerada "viva" só se atualizada nos últimos N minutos --
 * evita mostrar um pino parado de horas atrás como se fosse ao vivo. */
export function isFresh(updatedAt: string, maxAgeMinutes = 10): boolean {
  return Date.now() - new Date(updatedAt).getTime() < maxAgeMinutes * 60_000
}

/** Distância em linha reta (haversine), em km -- só uma estimativa
 * grosseira de "quão longe", não é rota real de ruas. */
export function straightLineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
