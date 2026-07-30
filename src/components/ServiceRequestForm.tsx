'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceRequestSchema, ServiceRequestSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'
import { ServiceCatalogCategory, ServiceCatalogItem } from '@/lib/types'
import dynamic from 'next/dynamic'
import type { LocationPickerResult } from '@/components/LocationPicker'
import {
  Smartphone,
  MapPin,
  User,
  Wrench,
  CheckCircle,
  Loader2,
  X,
  AlertCircle,
  MessageCircle,
  Truck,
  HelpCircle,
} from 'lucide-react'

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false })

const INPUT = 'w-full px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-white placeholder-white/25 focus:border-vr-red/60 focus:ring-1 focus:ring-vr-red/10 outline-none transition-all duration-200'
const LABEL = 'block text-sm font-semibold text-vr-silver/80 mb-1.5'
const ERR = 'text-red-400 text-xs mt-1'

export default function ServiceRequestForm() {
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submittedPhone, setSubmittedPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [location, setLocation] = useState<LocationPickerResult | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null)

  // Catalog state
  const [brands, setBrands] = useState<ServiceCatalogCategory[]>([])
  const [catalogItems, setCatalogItems] = useState<ServiceCatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedModelPill, setSelectedModelPill] = useState<string | null>(null)
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [diagnosisMode, setDiagnosisMode] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServiceRequestSchema>({
    resolver: zodResolver(serviceRequestSchema),
    mode: 'onBlur',
  })

  const selfPickup = watch('self_pickup')

  // Fetch catalog when entering step 2 for the first time
  useEffect(() => {
    if (step !== 2 || brands.length > 0) return
    setLoadingCatalog(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('service_catalog_categories').select('*').order('sort_order'),
      supabase.from('service_catalog_items').select('*').eq('active', true).order('sort_order'),
    ]).then(([{ data: cats }, { data: items }]) => {
      setBrands((cats as ServiceCatalogCategory[]) ?? [])
      setCatalogItems((items as ServiceCatalogItem[]) ?? [])
    }).finally(() => setLoadingCatalog(false))
  }, [step, brands.length])

  // Distinct model names for selected brand
  const modelList = useMemo(() => {
    if (!selectedBrandId) return []
    const seen = new Set<string>()
    return catalogItems
      .filter((i) => i.category_id === selectedBrandId)
      .reduce<string[]>((acc, i) => {
        if (!seen.has(i.model_name)) { seen.add(i.model_name); acc.push(i.model_name) }
        return acc
      }, [])
      .sort()
  }, [catalogItems, selectedBrandId])

  // Service cards for selected brand + model
  const serviceCards = useMemo(() => {
    if (!selectedBrandId || !selectedModelPill) return []
    return catalogItems.filter(
      (i) => i.category_id === selectedBrandId && i.model_name === selectedModelPill
    )
  }, [catalogItems, selectedBrandId, selectedModelPill])

  // Running total of selected services
  const estimatedTotal = useMemo(
    () => selectedServiceIds.reduce((sum, id) => {
      const item = catalogItems.find((i) => i.id === id)
      return sum + Number(item?.price ?? 0)
    }, 0),
    [selectedServiceIds, catalogItems]
  )

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Imagem deve ter no máximo 5MB'); return }
    setImageFile(file); setImagePreview(URL.createObjectURL(file)); setError(null)
  }

  const handleLocationConfirm = useCallback((result: LocationPickerResult) => {
    setLocation(result)
    setValue('address_lat', result.lat)
    setValue('address_lng', result.lng)
    setValue('address_label', result.label)
    setValue('address_bairro', result.bairro)
    setShowMap(false)
  }, [setValue])

  // Always request fresh geolocation then open map
  const handleOpenMap = useCallback(() => {
    setGettingLocation(true)
    if (!navigator.geolocation) {
      setGettingLocation(false)
      setShowMap(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGettingLocation(false)
        setShowMap(true)
      },
      () => {
        setGettingLocation(false)
        setShowMap(true)
      },
      { timeout: 8000, maximumAge: 0 }
    )
  }, [])

  // Compose initial for LocationPicker: GPS position takes priority
  const mapInitial: LocationPickerResult | null = gpsPosition
    ? { lat: gpsPosition.lat, lng: gpsPosition.lng, label: '', bairro: undefined }
    : location

  const nextStep = async () => {
    const fieldsToValidate: (keyof ServiceRequestSchema)[] =
      step === 1 ? ['customer_name', 'customer_phone', 'customer_email']
      : step === 2 ? (diagnosisMode ? ['problem_description'] : ['phone_model', 'problem_description'])
      : []
    const valid = await trigger(fieldsToValidate)
    if (valid) setStep((s) => s + 1)
  }

  const onSubmit = async (data: ServiceRequestSchema) => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      let image_url: string | null = null

      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('service-images').upload(fileName, imageFile)
        if (uploadError) throw uploadError
        const { data: publicUrl } = supabase.storage.from('service-images').getPublicUrl(fileName)
        image_url = publicUrl.publicUrl
      }

      let shippingPrice: number | null = null
      if (!data.self_pickup && data.address_lat && data.address_lng) {
        const { data: est } = await supabase.rpc('estimate_shipping', {
          p_lat: data.address_lat,
          p_lng: data.address_lng,
        })
        if (est && typeof est === 'object' && 'price' in est) {
          shippingPrice = Number((est as { price: number }).price) * 2
        }
      }

      const res = await fetch('/api/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name:        data.customer_name,
          customer_phone:       data.customer_phone,
          customer_email:       data.customer_email,
          phone_model:          data.phone_model ?? null,
          problem_description:  data.problem_description,
          diagnosis_requested:  !!data.diagnosis_requested,
          selected_service_ids: selectedServiceIds,
          estimated_quote:      selectedServiceIds.length > 0 ? estimatedTotal : null,
          self_pickup:          !!data.self_pickup,
          address_lat:          data.self_pickup ? null : (data.address_lat ?? null),
          address_lng:          data.self_pickup ? null : (data.address_lng ?? null),
          address_label:        data.self_pickup ? null : (data.address_label ?? null),
          address_neighborhood: data.self_pickup ? null : (data.address_bairro ?? null),
          address_city:         data.self_pickup ? null : 'João Pessoa',
          address_state:        data.self_pickup ? null : 'PB',
          shipping_price:       shippingPrice,
          image_url,
          status:               'pending',
          quote_value:          null,
          owner_notes:          null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)

      setSubmittedPhone(data.customer_phone)
      setSubmitted(true)

      if (json.data?.id) {
        fetch('/api/whatsapp/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: json.data.id, event: 'created' }),
        }).catch(() => {})
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    const phoneDigits = submittedPhone.replace(/\D/g, '')
    return (
      <div className="flex flex-col items-center justify-center text-center px-4 py-10 gap-4">
        <div className="w-20 h-20 rounded-full bg-vr-red/15 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-vr-red" />
        </div>
        <h2 className="text-2xl font-bold text-white">Solicitação enviada!</h2>
        <p className="text-vr-silver/60 max-w-sm text-sm">
          Recebemos seu pedido. Em breve entraremos em contato pelo WhatsApp com o orçamento.
        </p>
        <a
          href={`/consultar?phone=${phoneDigits}`}
          className="w-full flex items-center justify-center gap-2 bg-vr-red/15 border border-vr-red/30 text-vr-red font-semibold py-3 px-6 rounded-xl hover:bg-vr-red/25 transition-all text-sm"
        >
          Acompanhar minha solicitação
        </a>
        <button
          onClick={() => {
            setSubmitted(false); setStep(1); setImageFile(null); setImagePreview(null)
            setLocation(null); setSubmittedPhone(''); setSelectedServiceIds([])
            setSelectedBrandId(null); setSelectedModelPill(null); setDiagnosisMode(false)
          }}
          className="text-sm text-vr-silver/40 hover:text-vr-silver/70 transition-colors"
        >
          Fazer nova solicitação
        </button>
      </div>
    )
  }

  return (
    <>
      {showMap && (
        <LocationPicker
          initial={mapInitial}
          onClose={() => setShowMap(false)}
          onConfirm={handleLocationConfirm}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${step >= s ? 'bg-vr-red text-white' : 'bg-white/10 text-white/40'}`}>
                {step > s ? '✓' : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s ? 'bg-vr-red' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 – Dados pessoais */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-5 h-5 text-vr-red" />
              <h3 className="font-semibold text-white">Seus dados</h3>
            </div>
            <div>
              <label className={LABEL}>Nome completo</label>
              <input {...register('customer_name')} placeholder="João da Silva" className={INPUT} />
              {errors.customer_name && <p className={ERR}>{errors.customer_name.message}</p>}
            </div>
            <div>
              <label className={LABEL}>WhatsApp / Telefone</label>
              <input
                {...register('customer_phone')}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                className={INPUT}
                onChange={(e) => setValue('customer_phone', formatPhone(e.target.value))}
              />
              {errors.customer_phone && <p className={ERR}>{errors.customer_phone.message}</p>}
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input {...register('customer_email')} placeholder="joao@email.com" inputMode="email" className={INPUT} />
              {errors.customer_email && <p className={ERR}>{errors.customer_email.message}</p>}
            </div>
          </div>
        )}

        {/* Step 2 – Aparelho */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-5 h-5 text-vr-red" />
              <h3 className="font-semibold text-white">Sobre o aparelho</h3>
            </div>

            {/* Checkbox: Não sei o modelo */}
            <label className="flex items-start gap-3 bg-vr-black border border-white/10 rounded-xl p-3.5 cursor-pointer hover:border-vr-red/30 transition-colors">
              <input
                type="checkbox"
                checked={diagnosisMode}
                onChange={(e) => {
                  const checked = e.target.checked
                  setDiagnosisMode(checked)
                  setValue('diagnosis_requested', checked)
                  if (checked) {
                    setSelectedBrandId(null)
                    setSelectedModelPill(null)
                    setSelectedServiceIds([])
                    setValue('phone_model', undefined)
                  }
                }}
                className="w-4 h-4 mt-0.5 accent-vr-red flex-none"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-vr-red flex-none" />
                  <span className="text-sm font-semibold text-white">Não sei o modelo do meu aparelho</span>
                </div>
                <p className="text-xs text-vr-silver/50 mt-0.5">Orçamento após diagnóstico físico do aparelho</p>
              </div>
            </label>

            {/* Brand + model + service selector (hidden in diagnosis mode) */}
            {!diagnosisMode && (
              <>
                {loadingCatalog ? (
                  <div className="flex items-center gap-2 text-vr-silver/50 text-sm py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-vr-red" />
                    Carregando catálogo...
                  </div>
                ) : (
                  <>
                    {/* Brand pills */}
                    {brands.length > 0 && (
                      <div>
                        <label className={LABEL}>Marca</label>
                        <div className="flex flex-wrap gap-2">
                          {brands.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setSelectedBrandId(b.id)
                                setSelectedModelPill(null)
                                setSelectedServiceIds([])
                                setValue('phone_model', undefined)
                              }}
                              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all
                                ${selectedBrandId === b.id
                                  ? 'bg-vr-red text-white border-vr-red'
                                  : 'bg-vr-black border-white/10 text-vr-silver/70 hover:border-vr-red/40 hover:text-white'
                                }`}
                            >
                              {b.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Model pills */}
                    {selectedBrandId && modelList.length > 0 && (
                      <div>
                        <label className={LABEL}>Modelo</label>
                        <div className="flex flex-wrap gap-2">
                          {modelList.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setSelectedModelPill(m)
                                setValue('phone_model', m)
                                setSelectedServiceIds([])
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                                ${selectedModelPill === m
                                  ? 'bg-vr-red text-white border-vr-red'
                                  : 'bg-vr-black border-white/10 text-vr-silver/60 hover:border-vr-red/40 hover:text-white'
                                }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Service cards – horizontal scroll, multi-select */}
                    {serviceCards.length > 0 && (
                      <div>
                        <label className={LABEL}>
                          Serviços disponíveis
                          {selectedServiceIds.length > 0 && (
                            <span className="text-vr-red ml-2 font-normal">
                              · {selectedServiceIds.length} selecionado{selectedServiceIds.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </label>
                        <div className="overflow-x-auto flex gap-3 pb-2 -mx-1 px-1">
                          {serviceCards.map((s) => {
                            const sel = selectedServiceIds.includes(s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleService(s.id)}
                                className={`flex-none w-44 rounded-xl p-3.5 text-left border-2 transition-all
                                  ${sel
                                    ? 'border-vr-red bg-vr-red/10'
                                    : 'border-white/10 bg-vr-black hover:border-vr-red/30 hover:bg-vr-red/5'
                                  }`}
                              >
                                <div className="text-sm font-semibold text-white leading-tight">{s.repair_type}</div>
                                {s.description && (
                                  <div className="text-xs text-vr-silver/50 mt-1 leading-snug line-clamp-2">{s.description}</div>
                                )}
                                <div className="text-vr-red font-bold text-sm mt-2">
                                  R$ {Number(s.price).toFixed(2).replace('.', ',')}
                                </div>
                                {sel && <div className="text-xs text-vr-red mt-1 font-semibold">✓ Selecionado</div>}
                              </button>
                            )
                          })}
                        </div>

                        {selectedServiceIds.length > 0 && (
                          <div className="mt-2 p-3 bg-vr-red/10 rounded-xl border border-vr-red/20 flex justify-between items-center">
                            <div>
                              <div className="text-xs text-vr-silver/60">Total estimado</div>
                              <div className="text-vr-red font-bold">
                                R$ {estimatedTotal.toFixed(2).replace('.', ',')}
                              </div>
                            </div>
                            <p className="text-[10px] text-vr-silver/40 text-right max-w-[140px] leading-tight">
                              *pode variar após diagnóstico
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual phone model input */}
                    <div>
                      <label className={LABEL}>
                        {selectedModelPill ? 'Modelo selecionado' : 'Modelo do celular'}
                      </label>
                      <input
                        {...register('phone_model')}
                        placeholder="Ex: iPhone 14 Pro, Samsung Galaxy A55..."
                        className={INPUT}
                        onChange={(e) => {
                          setValue('phone_model', e.target.value)
                          // Clear pill if user types manually
                          if (e.target.value !== selectedModelPill) setSelectedModelPill(null)
                        }}
                      />
                      {errors.phone_model && <p className={ERR}>{errors.phone_model.message}</p>}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Problem description – always shown */}
            <div>
              <label className={LABEL}>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-vr-red" />
                  {diagnosisMode ? 'Descreva o problema' : 'Descreva o problema'}
                </span>
              </label>
              <textarea
                {...register('problem_description')}
                placeholder="Ex: Tela rachada, não liga, bateria viciada, conector de carga com defeito..."
                rows={4}
                className={`${INPUT} resize-none`}
              />
              {errors.problem_description && <p className={ERR}>{errors.problem_description.message}</p>}
            </div>

            {/* Photo upload */}
            <div>
              <label className={LABEL}>
                Foto do celular <span className="font-normal text-white/30">(opcional)</span>
              </label>
              {imagePreview ? (
                <div className="relative w-fit mx-auto">
                  <img src={imagePreview} alt="Preview" className="w-36 h-36 object-cover rounded-2xl border border-white/10" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null) }}
                    className="absolute -top-2 -right-2 bg-vr-red text-white rounded-full w-6 h-6 flex items-center justify-center shadow"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 rounded-xl p-4 hover:border-vr-red/40 hover:bg-vr-red/5 transition-all bg-vr-black"
                  >
                    <span className="text-2xl">📷</span>
                    <span className="text-xs font-medium text-white/70">Tirar foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 rounded-xl p-4 hover:border-vr-red/40 hover:bg-vr-red/5 transition-all bg-vr-black"
                  >
                    <span className="text-2xl">🖼️</span>
                    <span className="text-xs font-medium text-white/70">Galeria</span>
                  </button>
                </div>
              )}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          </div>
        )}

        {/* Step 3 – Endereço */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5 text-vr-red" />
              <h3 className="font-semibold text-white">Coleta e entrega</h3>
            </div>

            <label className="flex items-start gap-2.5 bg-vr-black border border-white/10 rounded-xl p-3 cursor-pointer">
              <input type="checkbox" {...register('self_pickup')} className="w-4 h-4 mt-0.5 accent-vr-red" />
              <span className="text-sm text-vr-silver/80">
                Vou levar/buscar o aparelho eu mesmo (não preciso de coleta/entrega)
              </span>
            </label>

            {!selfPickup && (
              <div className="flex flex-col gap-3">
                {location ? (
                  <div className="flex items-start gap-3 bg-vr-graphite border border-white/10 rounded-xl p-3.5">
                    <MapPin className="w-4 h-4 text-vr-red flex-none mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{location.label}</p>
                      {location.bairro && <p className="text-xs text-vr-silver/60">{location.bairro}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenMap}
                      disabled={gettingLocation}
                      className="text-xs text-vr-red/70 hover:text-vr-red transition-colors flex-none flex items-center gap-1 disabled:opacity-50"
                    >
                      {gettingLocation && <Loader2 className="w-3 h-3 animate-spin" />}
                      Alterar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenMap}
                    disabled={gettingLocation}
                    className="flex items-center gap-3 border-2 border-dashed border-white/15 rounded-xl p-4 hover:border-vr-red/40 hover:bg-vr-red/5 transition-all text-left disabled:opacity-60"
                  >
                    <div className="w-10 h-10 rounded-full bg-vr-red/10 flex items-center justify-center flex-none">
                      {gettingLocation
                        ? <Loader2 className="w-5 h-5 text-vr-red animate-spin" />
                        : <MapPin className="w-5 h-5 text-vr-red" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        {gettingLocation ? 'Obtendo sua localização...' : 'Selecionar endereço no mapa'}
                      </div>
                      <div className="text-xs text-vr-silver/50">
                        {gettingLocation ? 'Aguarde um momento' : 'Toque para abrir o mapa interativo'}
                      </div>
                    </div>
                  </button>
                )}
                {errors.address_lat && <p className={ERR}>{errors.address_lat.message}</p>}

                {location && (
                  <p className="text-xs text-vr-silver/50 flex items-center gap-1">
                    <Truck className="w-3 h-3 text-vr-red" />
                    O valor do frete será calculado automaticamente pelo administrador com base na distância.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-3 px-6 rounded-xl border border-white/15 font-semibold text-white/70 hover:bg-vr-black transition-all"
            >
              Voltar
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={nextStep} className="btn-primary flex-1">
              Próximo
            </button>
          ) : (
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
              ) : (
                <><Wrench className="w-4 h-4" />Solicitar orçamento</>
              )}
            </button>
          )}
        </div>
      </form>
    </>
  )
}
