'use client'

import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceRequestSchema, ServiceRequestSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'
import { Autocomplete } from '@/components/ui'
import DevicePicker from '@/components/DevicePicker'
import { JOAO_PESSOA_BAIRROS } from '@/lib/joaoPessoaBairros'
import {
  Smartphone,
  MapPin,
  User,
  Wrench,
  CheckCircle,
  Loader2,
  X,
  AlertCircle,
  Truck,
} from 'lucide-react'

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
  const [shippingRates, setShippingRates] = useState<Record<string, number>>({})
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

  useEffect(() => {
    createClient()
      .from('neighborhood_shipping_rates')
      .select('neighborhood, price')
      .then(({ data }) => {
        if (data) setShippingRates(Object.fromEntries(data.map((r) => [r.neighborhood, r.price])))
      })
  }, [])

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
    if (file.size > 5 * 1024 * 1024) {
      setError('Imagem deve ter no máximo 5MB')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setError(null)
  }

  const nextStep = async () => {
    const fields: Record<number, (keyof ServiceRequestSchema)[]> = {
      1: ['customer_name', 'customer_phone', 'customer_email'],
      2: ['phone_model', 'problem_description'],
      3: ['self_pickup', 'address_neighborhood', 'address_reference'],
    }
    const valid = await trigger(fields[step])
    if (valid) setStep((s) => s + 1)
  }

  const onSubmit = async (data: ServiceRequestSchema) => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      let image_url: string | null = null

      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('service-images')
          .upload(fileName, imageFile)
        if (uploadError) throw uploadError
        const { data: publicUrl } = supabase.storage
          .from('service-images')
          .getPublicUrl(fileName)
        image_url = publicUrl.publicUrl
      }

      const neighborhood = data.address_neighborhood ?? ''
      const oneWayRate = data.self_pickup ? null : (shippingRates[neighborhood] ?? null)
      const shippingPrice = oneWayRate != null ? oneWayRate * 2 : null

      const { data: inserted, error: insertError } = await supabase.from('service_requests').insert([{
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        phone_model: data.phone_model,
        problem_description: data.problem_description,
        self_pickup: !!data.self_pickup,
        address_number: null,
        address_street: null,
        address_reference: data.self_pickup ? null : data.address_reference,
        address_neighborhood: data.self_pickup ? null : neighborhood,
        address_city: data.self_pickup ? null : 'João Pessoa',
        address_state: data.self_pickup ? null : 'PB',
        shipping_price: shippingPrice,
        image_url,
        status: 'pending',
        quote_value: null,
        owner_notes: null,
      }]).select().single()

      if (insertError) throw insertError
      setSubmittedPhone(data.customer_phone)
      setSubmitted(true)

      if (inserted) {
        fetch('/api/whatsapp/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: inserted.id, event: 'created' }),
        }).catch((e) => console.error('Erro ao notificar WhatsApp:', e))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar solicitação. Tente novamente.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const selfPickup = watch('self_pickup')
  const selectedNeighborhood = watch('address_neighborhood') ?? ''
  const neighborhoodRate = shippingRates[selectedNeighborhood] ?? null
  const roundTripPrice = neighborhoodRate != null ? neighborhoodRate * 2 : null

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
          onClick={() => { setSubmitted(false); setStep(1); setImageFile(null); setImagePreview(null); setSubmittedPhone('') }}
          className="text-sm text-vr-silver/40 hover:text-vr-silver/70 transition-colors"
        >
          Fazer nova solicitação
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${step >= s ? 'bg-vr-red text-white' : 'bg-white/10 text-white/40'}`}
            >
              {step > s ? '✓' : s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s ? 'bg-vr-red' : 'bg-white/10'}`} />
            )}
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
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-5 h-5 text-vr-red" />
            <h3 className="font-semibold text-white">Sobre o aparelho</h3>
          </div>
          <div>
            <label className={LABEL}>Aparelho</label>
            <DevicePicker
              value={watch('phone_model') ?? ''}
              onChange={(val) => setValue('phone_model', val, { shouldValidate: true })}
              error={errors.phone_model?.message}
            />
          </div>
          <div>
            <label className={LABEL}>Descreva o problema</label>
            <textarea
              {...register('problem_description')}
              placeholder="Ex: Tela rachada, não liga, bateria viciada, câmera travando..."
              rows={4}
              className={`${INPUT} resize-none`}
            />
            {errors.problem_description && <p className={ERR}>{errors.problem_description.message}</p>}
          </div>
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
                  <span className="text-xs text-white/30">Usar câmera</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 rounded-xl p-4 hover:border-vr-red/40 hover:bg-vr-red/5 transition-all bg-vr-black"
                >
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs font-medium text-white/70">Galeria</span>
                  <span className="text-xs text-white/30">Escolher foto</span>
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
            <input
              type="checkbox"
              {...register('self_pickup')}
              className="w-4 h-4 mt-0.5 accent-vr-red"
            />
            <span className="text-sm text-vr-silver/80">
              Vou levar/buscar o aparelho eu mesmo (não preciso de coleta/entrega no endereço)
            </span>
          </label>

          {!selfPickup && (
            <>
              <div>
                <label className={LABEL}>Bairro</label>
                <Autocomplete
                  dark
                  value={selectedNeighborhood}
                  onChange={(v) => setValue('address_neighborhood', v, { shouldValidate: true })}
                  onBlur={() => trigger('address_neighborhood')}
                  options={JOAO_PESSOA_BAIRROS}
                  placeholder="Digite para buscar o bairro em João Pessoa..."
                />
                {errors.address_neighborhood && <p className={ERR}>{errors.address_neighborhood.message}</p>}
                {selectedNeighborhood && roundTripPrice != null && (
                  <p className="text-xs text-vr-silver/50 mt-1.5 flex items-center gap-1">
                    <Truck className="w-3 h-3 text-vr-red" />
                    Frete (ida e volta): <span className="text-white font-medium ml-0.5">R$ {roundTripPrice.toFixed(2)}</span>
                  </p>
                )}
                {selectedNeighborhood && roundTripPrice == null && Object.keys(shippingRates).length > 0 && (
                  <p className="text-xs text-vr-silver/40 mt-1.5">Frete a combinar para este bairro</p>
                )}
              </div>
              <div>
                <label className={LABEL}>Ponto de referência</label>
                <input
                  {...register('address_reference')}
                  placeholder="Ex: Próximo ao mercado, portão azul..."
                  className={INPUT}
                />
                {errors.address_reference && <p className={ERR}>{errors.address_reference.message}</p>}
              </div>
            </>
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
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Wrench className="w-4 h-4" />
                Solicitar orçamento
              </>
            )}
          </button>
        )}
      </div>
    </form>
  )
}
