'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowLeft, Loader2, LocateFixed, MapPin, Pencil, Search, X } from 'lucide-react'
import { buscarEnderecos, enderecoDe } from '@/lib/mapa/geocodificacao'
import { obterLocalizacao } from '@/lib/mapa/localizacao'
import { FALLBACK, monitorarTiles, TILE_ATTR, TILE_URL } from '@/lib/mapa/tiles'
import { anexarGestoMapa } from '@/lib/mapa/rotacaoMapa'
import type { EnderecoResultado, Ponto } from '@/lib/mapa/tipos'

export interface LocationPickerResult {
  lat: number
  lng: number
  label: string
  bairro?: string
  rua?: string
  numero?: string
  cidade?: string
}

interface LocationPickerProps {
  initial?: (Ponto & { label?: string; bairro?: string }) | null
  onClose: () => void
  onConfirm: (result: LocationPickerResult) => void
}

function MapaCentro({
  centro,
  zoom = 17,
  onMoveStart,
  onMoveEnd,
  onTileStatus,
}: {
  centro: Ponto
  zoom?: number
  onMoveStart?: () => void
  onMoveEnd?: (c: Ponto) => void
  onTileStatus?: (falhando: boolean) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(0)
  useEffect(() => { rotationRef.current = rotation }, [rotation])

  useEffect(() => {
    if (!divRef.current) return
    const map = L.map(divRef.current, { zoomControl: false, zoomSnap: 0, zoomDelta: 0.5 }).setView([centro.lat, centro.lng], zoom)
    const tileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 20, keepBuffer: 4, updateWhenZooming: false }).addTo(map)
    const pararMonitor = onTileStatus ? monitorarTiles(tileLayer, onTileStatus) : undefined
    if (onMoveStart) map.on('movestart', onMoveStart)
    if (onMoveEnd) map.on('moveend', () => onMoveEnd(map.getCenter()))
    map.dragging.disable(); map.touchZoom.disable(); map.scrollWheelZoom.disable(); map.doubleClickZoom.disable()
    mapRef.current = map
    return () => { pararMonitor?.(); map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !divRef.current) return
    return anexarGestoMapa(divRef.current, {
      map,
      getRotation: () => rotationRef.current,
      onRotate: setRotation,
    })
  }, [])

  return (
    <div
      className="absolute"
      style={{ inset: '-80%', transform: `rotate(${rotation}deg)`, transition: 'transform .15s linear', willChange: 'transform' }}
    >
      <div ref={divRef} className="absolute inset-0" />
    </div>
  )
}

export default function LocationPicker({ initial, onClose, onConfirm }: LocationPickerProps) {
  const [step, setStep] = useState<'busca' | 'ajuste'>(initial ? 'ajuste' : 'busca')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EnderecoResultado[]>([])
  const [searching, setSearching] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [ajusteCentro, setAjusteCentro] = useState<Ponto>(initial ?? FALLBACK)
  const [pos, setPos] = useState<Ponto>(initial ?? FALLBACK)
  const [label, setLabel] = useState(initial?.label ?? 'Localizando…')
  const [bairro, setBairro] = useState<string | undefined>(initial?.bairro)
  const [rua, setRua] = useState<string | undefined>()
  const [numero, setNumero] = useState<string | undefined>()
  const [cidade, setCidade] = useState<string | undefined>()
  // Preenchido manualmente pelo cliente quando o OpenStreetMap não tem o
  // número da casa cadastrado (endereço rural, condomínio novo, etc.) --
  // opcional, mas evita a entrega/coleta chegar sem número nenhum.
  const [numeroManual, setNumeroManual] = useState('')
  const [moving, setMoving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [tilesFailing, setTilesFailing] = useState(false)

  const [labelEditing, setLabelEditing] = useState(false)
  const [labelQuery, setLabelQuery] = useState('')
  const [labelResults, setLabelResults] = useState<EnderecoResultado[]>([])
  const [labelSearching, setLabelSearching] = useState(false)
  const labelSeq = useRef(0)
  const seq = useRef(0)

  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width }
    body.style.overflow = 'hidden'; body.style.position = 'fixed'; body.style.top = `-${scrollY}px`; body.style.width = '100%'
    return () => {
      body.style.overflow = prev.overflow; body.style.position = prev.position
      body.style.top = prev.top; body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [])

  const [viewport, setViewport] = useState(() => ({
    top: window.visualViewport?.offsetTop ?? 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); setSearching(false); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      setSearching(true)
      try { const r = await buscarEnderecos(query, pos); if (id === seq.current) setResults(r) }
      catch { if (id === seq.current) setResults([]) }
      if (id === seq.current) setSearching(false)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (!labelEditing || labelQuery.trim().length < 3) { setLabelResults([]); setLabelSearching(false); return }
    const id = ++labelSeq.current
    const t = setTimeout(async () => {
      setLabelSearching(true)
      try { const r = await buscarEnderecos(labelQuery, pos); if (id === labelSeq.current) setLabelResults(r) }
      catch { if (id === labelSeq.current) setLabelResults([]) }
      if (id === labelSeq.current) setLabelSearching(false)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelQuery, labelEditing])

  useEffect(() => {
    if (step !== 'ajuste') return
    let cancelled = false
    ;(async () => {
      const addr = await enderecoDe(ajusteCentro)
      if (!cancelled) {
        setLabel(addr.label); setBairro(addr.bairro)
        setRua(addr.rua); setNumero(addr.numero); setCidade(addr.cidade)
        setNumeroManual('')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ajusteCentro])

  function abrirAjuste(centro: Ponto, addr?: { label?: string; bairro?: string; rua?: string; numero?: string; cidade?: string }) {
    setAjusteCentro(centro); setPos(centro)
    setLabel(addr?.label ?? 'Localizando…'); setBairro(addr?.bairro)
    setRua(addr?.rua); setNumero(addr?.numero); setCidade(addr?.cidade)
    setNumeroManual('')
    setStep('ajuste')
  }

  function selecionarResultadoLabel(r: EnderecoResultado) {
    setLabelEditing(false); setLabelQuery(''); setLabelResults([])
    setAjusteCentro(r); setPos(r); setLabel(r.titulo); setBairro(r.bairro)
    setRua(r.rua); setNumero(r.numero); setCidade(r.cidade)
    setNumeroManual('')
  }

  async function usarLocalizacaoAtual() {
    setErrorMsg(null); setGpsLoading(true)
    try { const p = await obterLocalizacao(); abrirAjuste(p) }
    catch { setErrorMsg('Não consegui acessar seu GPS. Ajuste o alfinete manualmente no mapa.'); abrirAjuste(pos) }
    finally { setGpsLoading(false) }
  }

  async function recentrarNoGps() {
    setErrorMsg(null); setGpsLoading(true)
    try { const p = await obterLocalizacao(); abrirAjuste(p) }
    catch { setErrorMsg('Não consegui acessar seu GPS.') }
    finally { setGpsLoading(false) }
  }

  const moveSeq = useRef(0)
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleMoveEnd(c: Ponto) {
    setPos(c); setMoving(false); setLabel('…')
    if (moveTimer.current) clearTimeout(moveTimer.current)
    const id = ++moveSeq.current
    moveTimer.current = setTimeout(async () => {
      const addr = await enderecoDe(c)
      if (id !== moveSeq.current) return
      setLabel(addr.label); setBairro(addr.bairro)
      setRua(addr.rua); setNumero(addr.numero); setCidade(addr.cidade)
      setNumeroManual('')
    }, 400)
  }

  async function confirmar() {
    setErrorMsg(null); setConfirming(true)
    try {
      onConfirm({
        lat: pos.lat, lng: pos.lng, label, bairro, rua, cidade,
        numero: numero || numeroManual.trim() || undefined,
      })
    }
    finally { setConfirming(false) }
  }

  return createPortal(
    <div
      className="fixed left-0 z-[9999] flex flex-col"
      style={{ top: viewport.top, height: viewport.height, width: '100%', background: '#0a0a0a' }}
    >
      {step === 'busca' && (
        <>
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
            <Search className="w-4 h-4 text-vr-silver/50 flex-none" />
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none text-white placeholder-vr-silver/40 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite sua rua e número..."
            />
            <button onClick={onClose} className="text-vr-silver/50 hover:text-white flex-none" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={usarLocalizacaoAtual}
              disabled={gpsLoading}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-white/5 text-left hover:bg-white/5 transition-colors"
            >
              {gpsLoading
                ? <Loader2 className="w-4 h-4 animate-spin text-vr-red flex-none" />
                : <LocateFixed className="w-4 h-4 text-vr-red flex-none" />}
              <div>
                <div className="text-sm font-medium text-white">Usar minha localização atual</div>
                <div className="text-xs text-vr-silver/50">Depois dá pra ajustar o alfinete no mapa</div>
              </div>
            </button>

            {errorMsg && <p className="text-red-400 text-xs px-4 pt-3">{errorMsg}</p>}
            {searching && <p className="text-xs text-vr-silver/50 px-4 py-3">Buscando endereços…</p>}
            {!searching && query.trim().length >= 3 && results.length === 0 && (
              <p className="text-xs text-vr-silver/50 px-4 py-3">Nenhum endereço encontrado. Tente incluir o bairro.</p>
            )}
            {!searching && query.trim().length > 0 && query.trim().length < 3 && (
              <p className="text-xs text-vr-silver/50 px-4 py-3">Digite pelo menos 3 letras do endereço…</p>
            )}

            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => abrirAjuste(r, { label: r.titulo, bairro: r.bairro, rua: r.rua, numero: r.numero, cidade: r.cidade })}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 text-left hover:bg-white/5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-vr-silver/50 flex-none" />
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{r.titulo}</div>
                  <div className="text-xs text-vr-silver/50 truncate">{r.subtitulo}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'ajuste' && (
        <>
          <div className="relative isolate overflow-hidden flex-1">
            <MapaCentro
              key={`${ajusteCentro.lat.toFixed(5)},${ajusteCentro.lng.toFixed(5)}`}
              centro={ajusteCentro}
              onMoveStart={() => setMoving(true)}
              onMoveEnd={handleMoveEnd}
              onTileStatus={setTilesFailing}
            />

            {tilesFailing && (
              <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[500] bg-red-950/90 border border-red-500/40 text-red-200 text-xs px-3 py-1.5 rounded-full whitespace-nowrap">
                Mapa não carregou — verifique sua internet
              </div>
            )}

            <button
              onClick={() => setStep('busca')}
              className="absolute top-4 left-4 z-[500] w-10 h-10 flex items-center justify-center rounded-full bg-vr-black/80 border border-white/10 text-white backdrop-blur-sm"
              aria-label="Voltar pra busca"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-[500] w-10 h-10 flex items-center justify-center rounded-full bg-vr-black/80 border border-white/10 text-white backdrop-blur-sm"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={recentrarNoGps}
              disabled={gpsLoading}
              className="absolute bottom-4 right-4 z-[500] w-10 h-10 flex items-center justify-center rounded-full bg-vr-black/80 border border-white/10 text-white backdrop-blur-sm"
              aria-label="Centralizar na minha localização"
            >
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            </button>

            {/* Barra de endereço editável no topo */}
            <div className="absolute top-16 left-4 right-4 z-[500]">
              {labelEditing && (labelResults.length > 0 || labelSearching) && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-vr-black border border-white/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-lg">
                  {labelSearching && <p className="text-xs text-vr-silver/50 px-3 py-2.5">Buscando endereços…</p>}
                  {!labelSearching && labelResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selecionarResultadoLabel(r)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-b-0 text-left hover:bg-white/5 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-vr-silver/50 flex-none" />
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{r.titulo}</div>
                        <div className="text-xs text-vr-silver/50 truncate">{r.subtitulo}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-vr-black border border-white/15 rounded-2xl px-4 py-3 shadow-lg">
                <MapPin className="w-4 h-4 text-vr-red flex-none" />
                <input
                  className="flex-1 min-w-0 bg-transparent outline-none text-white placeholder-vr-silver/50 text-sm truncate"
                  value={labelEditing ? labelQuery : label}
                  onFocus={() => { setLabelEditing(true); setLabelQuery(label) }}
                  onChange={(e) => setLabelQuery(e.target.value)}
                  onBlur={() => setTimeout(() => setLabelEditing(false), 150)}
                  placeholder="Digite a rua e o número…"
                />
                <Pencil className="w-3.5 h-3.5 text-vr-silver/50 flex-none" />
              </div>
            </div>

            {/* Alfinete fixo no centro */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center z-[400]">
              <MapPin
                className={`w-9 h-9 text-vr-red drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] transition-transform ${
                  moving ? '-translate-y-2' : 'translate-y-0'
                }`}
                fill="currentColor"
              />
              <div className={`w-2 h-1 rounded-full bg-black/40 -mt-1 transition-opacity ${moving ? 'opacity-30' : 'opacity-60'}`} />
            </div>
          </div>

          <div className="relative border-t border-white/10 px-4 py-4 space-y-3" style={{ background: '#0a0a0a' }}>
            {/* O OSM às vezes não tem o número da casa cadastrado -- pede
                como campo opcional em vez de deixar a coleta/entrega sem
                número nenhum. */}
            {!numero && !moving && (
              <div>
                <label className="block text-xs text-vr-silver/60 mb-1">Número (opcional, se o mapa não achou)</label>
                <input
                  value={numeroManual}
                  onChange={(e) => setNumeroManual(e.target.value)}
                  placeholder="Ex: 123"
                  inputMode="numeric"
                  className="w-full bg-vr-graphite border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-vr-silver/40 outline-none focus:border-vr-red/60"
                />
              </div>
            )}
            {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
            <button
              onClick={confirmar}
              disabled={confirming || moving}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-vr-red hover:bg-vr-red/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar localização
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  )
}
