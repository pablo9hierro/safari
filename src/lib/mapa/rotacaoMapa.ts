import type L from 'leaflet'

export interface GestoMapaOpcoes {
  map: L.Map
  getRotation: () => number
  onRotate: (anguloGraus: number) => void
  enabled?: () => boolean
  onInteract?: () => void
}

interface PontoTela { x: number; y: number }

function centroide(a: PontoTela, b: PontoTela): PontoTela { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
function distancia(a: PontoTela, b: PontoTela): number { return Math.hypot(a.x - b.x, a.y - b.y) }
function anguloEntre(a: PontoTela, b: PontoTela): number { return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
function deTouch(t: Touch): PontoTela { return { x: t.clientX, y: t.clientY } }

function rotacionarVetor(dx: number, dy: number, anguloGraus: number): [number, number] {
  const rad = (-anguloGraus * Math.PI) / 180
  return [dx * Math.cos(rad) - dy * Math.sin(rad), dx * Math.sin(rad) + dy * Math.cos(rad)]
}

export function anexarGestoMapa(el: HTMLElement, opcoes: GestoMapaOpcoes): () => void {
  const { map, getRotation, onRotate } = opcoes
  const enabled = opcoes.enabled ?? (() => true)
  const onInteract = opcoes.onInteract ?? (() => {})

  let ultimoMeioAplicado: PontoTela | null = null
  let ultimaDistanciaAplicada: number | null = null
  let ultimoAnguloAplicado: number | null = null
  let touchAtual: { pontos: PontoTela[] } | null = null
  let rafPendente = false

  function pan(dxTela: number, dyTela: number) {
    const [dx, dy] = rotacionarVetor(dxTela, dyTela, getRotation())
    map.panBy([-dx, -dy], { animate: false })
  }

  function agendarFlush() {
    if (rafPendente) return
    rafPendente = true
    requestAnimationFrame(() => { rafPendente = false; flush() })
  }

  function flush() {
    if (!touchAtual) return
    const { pontos } = touchAtual
    if (pontos.length === 1) {
      const p = pontos[0]
      if (ultimoMeioAplicado) pan(p.x - ultimoMeioAplicado.x, p.y - ultimoMeioAplicado.y)
      ultimoMeioAplicado = p; ultimaDistanciaAplicada = null; ultimoAnguloAplicado = null
      return
    }
    if (pontos.length === 2) {
      const [p0, p1] = pontos
      const meio = centroide(p0, p1); const dist = distancia(p0, p1); const ang = anguloEntre(p0, p1)
      if (ultimoMeioAplicado) pan(meio.x - ultimoMeioAplicado.x, meio.y - ultimoMeioAplicado.y)
      if (ultimaDistanciaAplicada != null && ultimaDistanciaAplicada > 0) {
        const fator = dist / ultimaDistanciaAplicada
        if (Number.isFinite(fator) && fator > 0) map.setZoom(map.getZoom() + Math.log2(fator), { animate: false })
      }
      if (ultimoAnguloAplicado != null) {
        let delta = ang - ultimoAnguloAplicado
        if (delta > 180) delta -= 360; if (delta < -180) delta += 360
        onRotate(normalizarAngulo(getRotation() + delta))
      }
      ultimoMeioAplicado = meio; ultimaDistanciaAplicada = dist; ultimoAnguloAplicado = ang
    }
  }

  function onTouchStart(e: TouchEvent) {
    if (!enabled()) return
    if (e.touches.length === 1) {
      ultimoMeioAplicado = deTouch(e.touches[0]); ultimaDistanciaAplicada = null; ultimoAnguloAplicado = null
    } else if (e.touches.length === 2) {
      const p0 = deTouch(e.touches[0]); const p1 = deTouch(e.touches[1])
      ultimoMeioAplicado = centroide(p0, p1); ultimaDistanciaAplicada = distancia(p0, p1); ultimoAnguloAplicado = anguloEntre(p0, p1)
    } else { ultimoMeioAplicado = null; ultimaDistanciaAplicada = null; ultimoAnguloAplicado = null }
    touchAtual = null
  }

  function onTouchMove(e: TouchEvent) {
    if (!enabled()) return
    if (e.touches.length !== 1 && e.touches.length !== 2) return
    e.preventDefault(); onInteract()
    touchAtual = { pontos: Array.from(e.touches).slice(0, 2).map(deTouch) }
    agendarFlush()
  }

  function onTouchEnd(e: TouchEvent) {
    touchAtual = null
    if (e.touches.length === 0) { ultimoMeioAplicado = null; ultimaDistanciaAplicada = null; ultimoAnguloAplicado = null }
    else if (e.touches.length === 1) { ultimoMeioAplicado = deTouch(e.touches[0]); ultimaDistanciaAplicada = null; ultimoAnguloAplicado = null }
  }

  let arrastandoComMouse = false; let ultimoMouse: PontoTela | null = null
  function onMouseDown(e: MouseEvent) { if (!enabled() || e.button !== 0) return; arrastandoComMouse = true; ultimoMouse = { x: e.clientX, y: e.clientY } }
  function onMouseMove(e: MouseEvent) {
    if (!enabled() || !arrastandoComMouse || !ultimoMouse) return
    const p = { x: e.clientX, y: e.clientY }; pan(p.x - ultimoMouse.x, p.y - ultimoMouse.y); ultimoMouse = p; onInteract()
  }
  function onMouseUp() { arrastandoComMouse = false; ultimoMouse = null }

  let deltaWheelPendente = 0
  function onWheel(e: WheelEvent) {
    if (!enabled()) return; e.preventDefault(); onInteract()
    deltaWheelPendente += -Math.sign(e.deltaY) * 0.5
    if (rafPendente) return
    rafPendente = true
    requestAnimationFrame(() => {
      rafPendente = false
      if (deltaWheelPendente !== 0) { map.setZoom(map.getZoom() + deltaWheelPendente, { animate: false }); deltaWheelPendente = 0 }
      flush()
    })
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: true })
  el.addEventListener('touchcancel', onTouchEnd, { passive: true })
  el.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchEnd)
    el.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    el.removeEventListener('wheel', onWheel)
  }
}

export function normalizarAngulo(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
