import type L from 'leaflet'

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
export const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

// João Pessoa, PB — centro de referência quando GPS não disponível
export const FALLBACK = { lat: -7.1195, lng: -34.845 }

export function monitorarTiles(layer: L.TileLayer, onMudarStatus: (falhando: boolean) => void): () => void {
  let falhasSeguidas = 0
  const onErro = () => {
    falhasSeguidas++
    if (falhasSeguidas >= 3) onMudarStatus(true)
  }
  const onCarregou = () => {
    falhasSeguidas = 0
    onMudarStatus(false)
  }
  layer.on('tileerror', onErro)
  layer.on('tileload', onCarregou)
  return () => {
    layer.off('tileerror', onErro)
    layer.off('tileload', onCarregou)
  }
}
