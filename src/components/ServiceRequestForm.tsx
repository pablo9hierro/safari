'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceRequestSchema, ServiceRequestSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'
import { Autocomplete } from '@/components/ui'
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
} from 'lucide-react'

export default function ServiceRequestForm() {
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submittedPhone, setSubmittedPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
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
      3: ['address_neighborhood', 'address_street', 'address_number', 'address_reference'],
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

      const { error: insertError } = await supabase.from('service_requests').insert([{
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        phone_model: data.phone_model,
        problem_description: data.problem_description,
        address_number: data.address_number,
        address_reference: data.address_reference,
        address_street: data.address_street,
        address_neighborhood: data.address_neighborhood,
        address_city: 'João Pessoa',
        address_state: 'PB',
        image_url,
        status: 'pending',
        quote_value: null,
        owner_notes: null,
      }])

      if (insertError) throw insertError
      setSubmittedPhone(data.customer_phone)
      setSubmitted(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar solicitação. Tente novamente.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    const phoneDigits = submittedPhone.replace(/\D/g, '')
    return (
      <div className="flex flex-col items-center justify-center text-center px-4 py-10 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Solicitação enviada!</h2>
        <p className="text-gray-500 max-w-sm text-sm">
          Recebemos seu pedido. Em breve entraremos em contato pelo WhatsApp com o orçamento.
        </p>
        <a
          href={`/consultar?phone=${phoneDigits}`}
          className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-vr-red font-semibold py-3 px-6 rounded-xl hover:bg-red-100 transition-all text-sm"
        >
          📋 Acompanhar minha solicitação
        </a>
        <button
          onClick={() => { setSubmitted(false); setStep(1); setImageFile(null); setImagePreview(null); setSubmittedPhone('') }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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
                ${step >= s ? 'bg-vr-red text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              {step > s ? '✓' : s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-1 rounded-full transition-all ${step > s ? 'bg-vr-red' : 'bg-gray-100'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 – Dados pessoais */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-5 h-5 text-vr-red" />
            <h3 className="font-semibold text-gray-800">Seus dados</h3>
          </div>
          <div>
            <label className="label">Nome completo</label>
            <input
              {...register('customer_name')}
              placeholder="João da Silva"
              className="input-field"
            />
            {errors.customer_name && <p className="error-msg">{errors.customer_name.message}</p>}
          </div>
          <div>
            <label className="label">WhatsApp / Telefone</label>
            <input
              {...register('customer_phone')}
              placeholder="(11) 99999-9999"
              inputMode="tel"
              className="input-field"
              onChange={(e) => setValue('customer_phone', formatPhone(e.target.value))}
            />
            {errors.customer_phone && <p className="error-msg">{errors.customer_phone.message}</p>}
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              {...register('customer_email')}
              placeholder="joao@email.com"
              inputMode="email"
              className="input-field"
            />
            {errors.customer_email && <p className="error-msg">{errors.customer_email.message}</p>}
          </div>
        </div>
      )}

      {/* Step 2 – Celular */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-5 h-5 text-vr-red" />
            <h3 className="font-semibold text-gray-800">Sobre o celular</h3>
          </div>
          <div>
            <label className="label">Modelo do celular</label>
            <input
              {...register('phone_model')}
              placeholder="Ex: Samsung Galaxy A54, iPhone 13..."
              className="input-field"
            />
            {errors.phone_model && <p className="error-msg">{errors.phone_model.message}</p>}
          </div>
          <div>
            <label className="label">Descreva o problema</label>
            <textarea
              {...register('problem_description')}
              placeholder="Ex: Tela rachada, não liga, bateria viciada, câmera travando..."
              rows={4}
              className="input-field resize-none"
            />
            {errors.problem_description && <p className="error-msg">{errors.problem_description.message}</p>}
          </div>
          <div>
            <label className="label">
              Foto do celular <span className="font-normal text-gray-400">(opcional)</span>
            </label>

            {imagePreview ? (
              <div className="relative w-fit mx-auto">
                <img src={imagePreview} alt="Preview" className="w-36 h-36 object-cover rounded-2xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-vr-red/50 hover:bg-red-50 transition-all bg-gray-50"
                >
                  <span className="text-2xl">📷</span>
                  <span className="text-xs font-medium text-gray-600">Tirar foto</span>
                  <span className="text-xs text-gray-400">Usar câmera</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-vr-red/50 hover:bg-red-50 transition-all bg-gray-50"
                >
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs font-medium text-gray-600">Galeria</span>
                  <span className="text-xs text-gray-400">Escolher foto</span>
                </button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>
        </div>
      )}

      {/* Step 3 – Endereço */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-vr-red" />
            <h3 className="font-semibold text-gray-800">Endereço de coleta e entrega</h3>
          </div>
          <div>
            <label className="label">Bairro</label>
            <Autocomplete
              value={watch('address_neighborhood') ?? ''}
              onChange={(v) => setValue('address_neighborhood', v, { shouldValidate: true })}
              onBlur={() => trigger('address_neighborhood')}
              options={JOAO_PESSOA_BAIRROS}
              placeholder="Digite para buscar o bairro em João Pessoa..."
            />
            {errors.address_neighborhood && <p className="error-msg">{errors.address_neighborhood.message}</p>}
          </div>
          <div>
            <label className="label">Nome da rua</label>
            <input
              {...register('address_street')}
              placeholder="Ex: Rua das Flores"
              className="input-field"
            />
            {errors.address_street && <p className="error-msg">{errors.address_street.message}</p>}
          </div>
          <div>
            <label className="label">Número</label>
            <input
              {...register('address_number')}
              placeholder="123"
              inputMode="numeric"
              className="input-field"
            />
            {errors.address_number && <p className="error-msg">{errors.address_number.message}</p>}
          </div>
          <div>
            <label className="label">Ponto de referência</label>
            <input
              {...register('address_reference')}
              placeholder="Ex: Próximo ao mercado, portão azul..."
              className="input-field"
            />
            {errors.address_reference && <p className="error-msg">{errors.address_reference.message}</p>}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
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
            className="flex-1 py-3 px-6 rounded-xl border border-gray-200 font-semibold text-gray-600 hover:bg-gray-50 transition-all"
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
