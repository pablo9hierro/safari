'use client'

import { useState } from 'react'
import { Smartphone, Tablet, Music, Monitor, ChevronRight, ChevronLeft, PenLine } from 'lucide-react'

// ─── Data ────────────────────────────────────────────────────────────────────

type DeviceKey = 'celular' | 'tablet' | 'ipad' | 'ipod'

const DEVICES: { key: DeviceKey; label: string; icon: React.ReactNode }[] = [
  { key: 'celular', label: 'Celular',  icon: <Smartphone className="w-7 h-7" /> },
  { key: 'tablet',  label: 'Tablet',   icon: <Tablet className="w-7 h-7" /> },
  { key: 'ipad',    label: 'iPad',     icon: <Monitor className="w-7 h-7" /> },
  { key: 'ipod',    label: 'iPod',     icon: <Music className="w-7 h-7" /> },
]

const BRANDS_BY_DEVICE: Record<DeviceKey, { key: string; label: string; os: 'ios' | 'android' }[]> = {
  celular: [
    { key: 'apple',    label: 'Apple',          os: 'ios' },
    { key: 'samsung',  label: 'Samsung',         os: 'android' },
    { key: 'motorola', label: 'Motorola',        os: 'android' },
    { key: 'xiaomi',   label: 'Xiaomi / Redmi',  os: 'android' },
    { key: 'lg',       label: 'LG',              os: 'android' },
    { key: 'outro',    label: 'Outra marca',     os: 'android' },
  ],
  tablet: [
    { key: 'samsung',    label: 'Samsung',     os: 'android' },
    { key: 'lenovo',     label: 'Lenovo',      os: 'android' },
    { key: 'multilaser', label: 'Multilaser',  os: 'android' },
    { key: 'outro',      label: 'Outra marca', os: 'android' },
  ],
  ipad: [{ key: 'apple', label: 'Apple', os: 'ios' }],
  ipod: [{ key: 'apple', label: 'Apple', os: 'ios' }],
}

const MODELS: Record<string, { group: string; items: string[] }[]> = {
  'celular-apple': [
    { group: 'iPhone 16', items: ['iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 16e'] },
    { group: 'iPhone 15', items: ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max'] },
    { group: 'iPhone 14', items: ['iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max'] },
    { group: 'iPhone 13', items: ['iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max'] },
    { group: 'iPhone 12', items: ['iPhone 12', 'iPhone 12 mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max'] },
    { group: 'iPhone SE', items: ['iPhone SE (2ª geração)', 'iPhone SE (3ª geração) 5G'] },
    { group: 'iPhone 11', items: ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max'] },
    { group: 'iPhone XR / XS', items: ['iPhone XR', 'iPhone XS', 'iPhone XS Max'] },
    { group: 'iPhone X',  items: ['iPhone X'] },
    { group: 'iPhone 8',  items: ['iPhone 8', 'iPhone 8 Plus'] },
    { group: 'iPhone 7',  items: ['iPhone 7', 'iPhone 7 Plus'] },
    { group: 'iPhone 6',  items: ['iPhone 6', 'iPhone 6 Plus', 'iPhone 6s', 'iPhone 6s Plus'] },
  ],
  'celular-samsung': [
    { group: 'Linha Galaxy A (2025)', items: ['Galaxy A16', 'Galaxy A16 5G', 'Galaxy A26 5G', 'Galaxy A36 5G', 'Galaxy A56 5G'] },
    { group: 'Linha Galaxy A (novos)', items: ['Galaxy A05', 'Galaxy A05s', 'Galaxy A15', 'Galaxy A15 5G', 'Galaxy A25 5G', 'Galaxy A35 5G', 'Galaxy A55 5G'] },
    { group: 'Linha Galaxy A', items: ['Galaxy A04', 'Galaxy A04s', 'Galaxy A13', 'Galaxy A13 5G', 'Galaxy A14', 'Galaxy A14 5G', 'Galaxy A23', 'Galaxy A24', 'Galaxy A34 5G', 'Galaxy A53 5G', 'Galaxy A54 5G'] },
    { group: 'Linha Galaxy S25', items: ['Galaxy S25', 'Galaxy S25+', 'Galaxy S25 Ultra', 'Galaxy S25 Edge'] },
    { group: 'Linha Galaxy S24', items: ['Galaxy S24', 'Galaxy S24 5G', 'Galaxy S24+', 'Galaxy S24 Ultra 5G'] },
    { group: 'Linha Galaxy S23', items: ['Galaxy S23', 'Galaxy S23 5G', 'Galaxy S23+', 'Galaxy S23 Ultra 5G'] },
    { group: 'Linha Galaxy S22', items: ['Galaxy S22', 'Galaxy S22 5G', 'Galaxy S22+', 'Galaxy S22 Ultra 5G'] },
    { group: 'Linha Galaxy S21', items: ['Galaxy S21', 'Galaxy S21 5G', 'Galaxy S21+', 'Galaxy S21 Ultra 5G'] },
    { group: 'Linha Galaxy M', items: ['Galaxy M14 5G', 'Galaxy M34 5G', 'Galaxy M54 5G'] },
    { group: 'Linha Galaxy Note', items: ['Galaxy Note 10', 'Galaxy Note 10+', 'Galaxy Note 20', 'Galaxy Note 20 Ultra 5G'] },
    { group: 'Linha Galaxy Z (dobráveis)', items: ['Galaxy Z Fold 5 5G', 'Galaxy Z Flip 5 5G', 'Galaxy Z Fold 4 5G', 'Galaxy Z Flip 4 5G', 'Galaxy Z Fold 3 5G', 'Galaxy Z Flip 3 5G'] },
  ],
  'celular-motorola': [
    { group: 'Moto Edge (2025)', items: ['Moto Edge 60 Pro 5G', 'Moto Edge 60 Fusion 5G'] },
    { group: 'Moto Edge (recentes)', items: ['Moto Edge 50 Pro 5G', 'Moto Edge 50 Ultra 5G', 'Moto Edge 40', 'Moto Edge 40 Pro 5G', 'Moto Edge 40 Neo 5G'] },
    { group: 'Moto Edge', items: ['Moto Edge 30', 'Moto Edge 30 Pro 5G', 'Moto Edge 30 Fusion 5G', 'Moto Edge 30 Ultra 5G', 'Moto Edge 20', 'Moto Edge 20 Pro 5G', 'Moto Edge 20 Fusion 5G'] },
    { group: 'Moto Razr', items: ['Moto Razr 50 5G', 'Moto Razr 50 Ultra 5G', 'Moto Razr 40 5G', 'Moto Razr 40 Ultra 5G'] },
    { group: 'Moto G (2025)', items: ['Moto G55 5G', 'Moto G85 5G'] },
    { group: 'Moto G (recentes)', items: ['Moto G04', 'Moto G04s', 'Moto G14', 'Moto G24', 'Moto G24 Power', 'Moto G34 5G', 'Moto G54 5G', 'Moto G62 5G', 'Moto G73 5G', 'Moto G84 5G'] },
    { group: 'Moto G200 / G100', items: ['Moto G100', 'Moto G200 5G'] },
    { group: 'Moto G9 / G8 / G7', items: ['Moto G9', 'Moto G9 Play', 'Moto G9 Plus', 'Moto G9 Power', 'Moto G8', 'Moto G8 Play', 'Moto G8 Power', 'Moto G7', 'Moto G7 Play', 'Moto G7 Plus', 'Moto G7 Power'] },
    { group: 'Moto G6 / G5', items: ['Moto G6', 'Moto G6 Play', 'Moto G6 Plus', 'Moto G5', 'Moto G5s', 'Moto G5 Plus', 'Moto G5s Plus'] },
    { group: 'Moto E', items: ['Moto E13', 'Moto E22', 'Moto E32', 'Moto E40', 'Moto E7 Play', 'Moto E6 Play'] },
  ],
  'celular-xiaomi': [
    { group: 'Xiaomi 15', items: ['Xiaomi 15', 'Xiaomi 15 Pro 5G', 'Xiaomi 15 Ultra 5G'] },
    { group: 'Xiaomi 14', items: ['Xiaomi 14', 'Xiaomi 14 Pro 5G'] },
    { group: 'Xiaomi 13', items: ['Xiaomi 13', 'Xiaomi 13 Pro 5G', 'Xiaomi 13 Lite 5G', 'Xiaomi 13T Pro 5G'] },
    { group: 'Xiaomi 12', items: ['Xiaomi 12', 'Xiaomi 12 Pro 5G', 'Xiaomi 12 Lite 5G', 'Xiaomi 11T Pro 5G'] },
    { group: 'Poco X7 (2025)', items: ['Poco X7 5G', 'Poco X7 Pro 5G'] },
    { group: 'Poco F / X (recentes)', items: ['Poco F6 Pro 5G', 'Poco F5 Pro 5G', 'Poco F4 5G', 'Poco F3 5G', 'Poco X6 Pro 5G', 'Poco X5 Pro 5G', 'Poco X5', 'Poco X4 Pro 5G', 'Poco X4 GT 5G'] },
    { group: 'Poco X3 / M', items: ['Poco X3 Pro', 'Poco X3 NFC', 'Poco X3', 'Poco M6 Pro 5G', 'Poco M5', 'Poco M5s', 'Poco M4 Pro', 'Poco M4 Pro 5G', 'Poco M3', 'Poco M3 Pro 5G'] },
    { group: 'Redmi Note 14', items: ['Redmi Note 14', 'Redmi Note 14 Pro 5G', 'Redmi Note 14 Pro+ 5G'] },
    { group: 'Redmi Note 13', items: ['Redmi Note 13', 'Redmi Note 13 Pro 5G', 'Redmi Note 13 Pro+ 5G'] },
    { group: 'Redmi Note 12', items: ['Redmi Note 12', 'Redmi Note 12S', 'Redmi Note 12 Pro 5G', 'Redmi Note 12 Pro+ 5G'] },
    { group: 'Redmi Note 11 / 10 / 9', items: ['Redmi Note 11', 'Redmi Note 11S', 'Redmi Note 11 Pro 5G', 'Redmi Note 10', 'Redmi Note 10S', 'Redmi Note 10 Pro', 'Redmi Note 9', 'Redmi Note 9S', 'Redmi Note 9 Pro'] },
    { group: 'Redmi (linha básica)', items: ['Redmi 13C', 'Redmi 12', 'Redmi 12C', 'Redmi 10', 'Redmi 10A', 'Redmi 10C', 'Redmi 9', 'Redmi 9A', 'Redmi 9C'] },
  ],
  'celular-lg': [
    { group: 'Linha K', items: ['LG K41s', 'LG K52', 'LG K61', 'LG K62', 'LG K62+'] },
    { group: 'Premium', items: ['LG Velvet 5G', 'LG Q60', 'LG G8 ThinQ'] },
  ],
  'tablet-samsung': [
    { group: 'Galaxy Tab A', items: ['Galaxy Tab A7', 'Galaxy Tab A7 Lite', 'Galaxy Tab A8'] },
    { group: 'Galaxy Tab S9', items: ['Galaxy Tab S9', 'Galaxy Tab S9+ 5G', 'Galaxy Tab S9 FE 5G', 'Galaxy Tab S9 Ultra 5G'] },
    { group: 'Galaxy Tab S8', items: ['Galaxy Tab S8', 'Galaxy Tab S8+ 5G', 'Galaxy Tab S8 Ultra 5G'] },
    { group: 'Galaxy Tab S7 / S6', items: ['Galaxy Tab S7', 'Galaxy Tab S7 FE 5G', 'Galaxy Tab S6', 'Galaxy Tab S6 Lite'] },
  ],
  'tablet-lenovo': [
    { group: 'Tab M', items: ['Tab M8 (4ª geração)', 'Tab M9', 'Tab M10', 'Tab M10 Plus', 'Tab M10 Plus (3ª geração)', 'Tab M11'] },
    { group: 'Tab P', items: ['Tab P11', 'Tab P11 Gen 2 5G', 'Tab P12 5G'] },
  ],
  'tablet-multilaser': [
    { group: 'Multilaser', items: ['Multilaser M8 3G', 'Multilaser M10A', 'Multilaser NB335', 'Multilaser NB391'] },
  ],
  'ipad-apple': [
    { group: 'iPad Pro 13" — 5G disponível', items: [
      'iPad Pro 13" M4 Wi-Fi', 'iPad Pro 13" M4 Wi-Fi + 5G',
      'iPad Pro 12.9" (6ª geração M2) Wi-Fi', 'iPad Pro 12.9" (6ª geração M2) Wi-Fi + 5G',
      'iPad Pro 12.9" (5ª geração M1) Wi-Fi', 'iPad Pro 12.9" (5ª geração M1) Wi-Fi + 5G',
      'iPad Pro 12.9" (4ª geração) Wi-Fi', 'iPad Pro 12.9" (4ª geração) Wi-Fi + 4G',
      'iPad Pro 12.9" (3ª geração) Wi-Fi', 'iPad Pro 12.9" (3ª geração) Wi-Fi + 4G',
    ]},
    { group: 'iPad Pro 11" — 5G disponível', items: [
      'iPad Pro 11" M4 Wi-Fi', 'iPad Pro 11" M4 Wi-Fi + 5G',
      'iPad Pro 11" (4ª geração M2) Wi-Fi', 'iPad Pro 11" (4ª geração M2) Wi-Fi + 5G',
      'iPad Pro 11" (3ª geração M1) Wi-Fi', 'iPad Pro 11" (3ª geração M1) Wi-Fi + 5G',
      'iPad Pro 11" (2ª geração) Wi-Fi', 'iPad Pro 11" (2ª geração) Wi-Fi + 4G',
      'iPad Pro 11" (1ª geração) Wi-Fi', 'iPad Pro 11" (1ª geração) Wi-Fi + 4G',
      'iPad Pro 10.5"',
    ]},
    { group: 'iPad Air — 5G disponível (M1 em diante)', items: [
      'iPad Air 13" M3 Wi-Fi', 'iPad Air 13" M3 Wi-Fi + 5G',
      'iPad Air 11" M3 Wi-Fi', 'iPad Air 11" M3 Wi-Fi + 5G',
      'iPad Air 13" M2 Wi-Fi', 'iPad Air 13" M2 Wi-Fi + 5G',
      'iPad Air 11" M2 Wi-Fi', 'iPad Air 11" M2 Wi-Fi + 5G',
      'iPad Air (5ª geração M1) Wi-Fi', 'iPad Air (5ª geração M1) Wi-Fi + 5G',
      'iPad Air (4ª geração) Wi-Fi', 'iPad Air (4ª geração) Wi-Fi + 4G',
      'iPad Air (3ª geração) Wi-Fi', 'iPad Air (3ª geração) Wi-Fi + 4G',
    ]},
    { group: 'iPad (linha básica) — sem 5G', items: [
      'iPad (10ª geração) Wi-Fi', 'iPad (10ª geração) Wi-Fi + 4G',
      'iPad (9ª geração) Wi-Fi', 'iPad (9ª geração) Wi-Fi + 4G',
      'iPad (8ª geração) Wi-Fi', 'iPad (8ª geração) Wi-Fi + 4G',
      'iPad (7ª geração) Wi-Fi', 'iPad (7ª geração) Wi-Fi + 4G',
    ]},
    { group: 'iPad mini — 5G disponível (6ª geração em diante)', items: [
      'iPad mini (7ª geração M3) Wi-Fi', 'iPad mini (7ª geração M3) Wi-Fi + 5G',
      'iPad mini (6ª geração) Wi-Fi', 'iPad mini (6ª geração) Wi-Fi + 5G',
      'iPad mini (5ª geração) Wi-Fi', 'iPad mini (5ª geração) Wi-Fi + 4G',
      'iPad mini (4ª geração) Wi-Fi', 'iPad mini (4ª geração) Wi-Fi + 4G',
    ]},
  ],
  'ipod-apple': [
    { group: 'iPod touch', items: ['iPod touch (7ª geração)', 'iPod touch (6ª geração)'] },
    { group: 'iPod nano / classic', items: ['iPod nano (7ª geração)', 'iPod classic'] },
  ],
}

function getModelKey(deviceKey: DeviceKey, brandKey: string): string {
  return `${deviceKey}-${brandKey}`
}

function composeModelString(deviceKey: DeviceKey, brandLabel: string, brandOS: 'ios' | 'android', modelLabel: string): string {
  if (deviceKey === 'ipad' || deviceKey === 'ipod') return modelLabel
  if (brandOS === 'ios') return modelLabel
  if (deviceKey === 'tablet') return `Tablet ${brandLabel} ${modelLabel}`
  return `${brandLabel} ${modelLabel}`
}

// ─── Component ───────────────────────────────────────────────────────────────

type SubStep = 'device' | 'brand' | 'model'

export default function DevicePicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (val: string) => void
  error?: string
}) {
  const [subStep, setSubStep] = useState<SubStep>('device')
  const [deviceKey, setDeviceKey] = useState<DeviceKey | null>(null)
  const [brandKey, setBrandKey] = useState<string | null>(null)
  const [brandOS, setBrandOS] = useState<'ios' | 'android'>('android')
  const [brandLabel, setBrandLabel] = useState('')
  const [customModel, setCustomModel] = useState('')

  const deviceLabel = deviceKey ? DEVICES.find((d) => d.key === deviceKey)?.label ?? '' : ''

  const handleDeviceSelect = (d: DeviceKey) => {
    setDeviceKey(d)
    const brands = BRANDS_BY_DEVICE[d]
    if (d === 'ipad' || d === 'ipod') {
      // only Apple — skip brand step
      setBrandKey('apple')
      setBrandOS('ios')
      setBrandLabel('Apple')
      setSubStep('model')
    } else {
      setSubStep('brand')
    }
  }

  const handleBrandSelect = (key: string, label: string, os: 'ios' | 'android') => {
    setBrandKey(key)
    setBrandOS(os)
    setBrandLabel(label)
    setSubStep('model')
  }

  const handleModelSelect = (modelLabel: string) => {
    if (!deviceKey || !brandKey) return
    const composed = composeModelString(deviceKey, brandLabel, brandOS, modelLabel)
    onChange(composed)
  }

  const handleCustomModelConfirm = () => {
    if (!deviceKey || !customModel.trim()) return
    const label = deviceKey === 'tablet' ? `Tablet ${brandLabel} ${customModel.trim()}` : customModel.trim()
    onChange(label)
  }

  const reset = () => {
    setSubStep('device')
    setDeviceKey(null)
    setBrandKey(null)
    setBrandLabel('')
    setCustomModel('')
    onChange('')
  }

  const goBack = () => {
    if (subStep === 'model') {
      if (deviceKey === 'ipad' || deviceKey === 'ipod') {
        setDeviceKey(null)
        setSubStep('device')
      } else {
        setBrandKey(null)
        setBrandLabel('')
        setSubStep('brand')
      }
    } else if (subStep === 'brand') {
      setDeviceKey(null)
      setSubStep('device')
    }
  }

  // ── If value already set ─────────────────────────────────────────────────
  if (value) {
    return (
      <div className="rounded-2xl border border-vr-red/30 bg-vr-red/10 p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-vr-silver/50 mb-0.5">Aparelho selecionado</p>
          <p className="font-semibold text-white text-sm">{value}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 text-xs font-semibold text-vr-red hover:text-vr-red-light transition-colors shrink-0"
        >
          <PenLine className="w-3.5 h-3.5" />
          Alterar
        </button>
      </div>
    )
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────
  const showBack = subStep !== 'device'

  return (
    <div className="space-y-3">
      {/* Header / breadcrumb */}
      <div className="flex items-center gap-2 min-h-[24px]">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 text-xs font-semibold text-vr-silver/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
        )}
        {showBack && <span className="text-white/20 text-xs">|</span>}
        <p className="text-xs text-vr-silver/50 flex items-center gap-1 flex-wrap">
          <span className={subStep === 'device' ? 'text-vr-red font-semibold' : 'text-vr-silver/50'}>Aparelho</span>
          {deviceKey && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className={subStep === 'brand' ? 'text-vr-red font-semibold' : 'text-vr-silver/50'}>{deviceLabel}</span>
            </>
          )}
          {brandKey && brandKey !== 'outro' && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="text-vr-red font-semibold">{brandLabel}</span>
            </>
          )}
        </p>
      </div>

      {/* Step: device type */}
      {subStep === 'device' && (
        <div className="grid grid-cols-2 gap-3">
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => handleDeviceSelect(d.key)}
              className="flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-white/10 bg-vr-black hover:border-vr-red/70 hover:bg-vr-red/5 active:bg-vr-red/10 transition-all text-vr-silver/70 hover:text-white"
            >
              {d.icon}
              <span className="text-sm font-semibold">{d.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Step: brand */}
      {subStep === 'brand' && deviceKey && (
        <div className="grid grid-cols-2 gap-2.5">
          {BRANDS_BY_DEVICE[deviceKey].map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => handleBrandSelect(b.key, b.label, b.os)}
              className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-white/10 bg-vr-black hover:border-vr-red/70 hover:bg-vr-red/5 active:bg-vr-red/10 transition-all text-vr-silver/80 hover:text-white font-semibold text-sm"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Step: model — custom text input for "outro" */}
      {subStep === 'model' && brandKey === 'outro' && (
        <div className="space-y-2">
          <p className="text-xs text-vr-silver/50">Digite o modelo do aparelho:</p>
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Ex: Nokia C32, Motorola One..."
            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-white placeholder-white/25 focus:border-vr-red/60 outline-none transition-all"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCustomModelConfirm}
            disabled={!customModel.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            Confirmar modelo
          </button>
        </div>
      )}

      {/* Step: model — grouped list */}
      {subStep === 'model' && brandKey && brandKey !== 'outro' && deviceKey && (
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-vr-black divide-y divide-white/5">
          {(MODELS[getModelKey(deviceKey, brandKey)] ?? []).map((group) => (
            <div key={group.group}>
              <p className="text-xs font-bold text-vr-silver/40 uppercase tracking-wider px-4 py-2 bg-vr-graphite sticky top-0">
                {group.group}
              </p>
              {group.items.map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => handleModelSelect(model)}
                  className="w-full text-left px-4 py-2.5 text-sm text-vr-silver hover:bg-vr-red/10 hover:text-white transition-colors flex items-center justify-between group"
                >
                  <span>{model}</span>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-vr-red transition-colors" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
