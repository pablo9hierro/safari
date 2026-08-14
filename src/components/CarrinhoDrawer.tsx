'use client'

import { useState } from 'react'
import {
  X, ShoppingBag, Trash2, Wrench, Package, ChevronRight,
  ChevronLeft, Minus, Plus, MapPin, Loader2, CheckCircle2, Home,
} from 'lucide-react'
import Link from 'next/link'
import { useCart } from '@/lib/carrinho/context'
import dynamic from 'next/dynamic'
import type { LocationPickerResult } from './LocationPicker'
import { estimateDelivery, createAssistantOrder } from '@/lib/resolutoo/checkout'
import AgendamentoPicker from './AgendamentoPicker'

const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false })

function fmt(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

type Step = 'items' | 'checkout' | 'success'

export default function CarrinhoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, remove, updateQty, clear, total, count } = useCart()
  const [step, setStep] = useState<Step>('items')

  const [customerName, setCustomerName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [pickupAtStore, setPickupAtStore] = useState(false)
  const [address, setAddress] = useState<LocationPickerResult | null>(null)
  const [shippingPrice, setShippingPrice] = useState<number | null>(null)
  const [shippingErr, setShippingErr] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  // Serviço sempre exige agendamento — sem horário escolhido, o checkout não fecha.
  const [agendamento, setAgendamento] = useState<{ date: string; time: string } | null>(null)

  const productItems = items.filter((i) => i.type === 'product')
  const serviceItems = items.filter((i) => i.type === 'service')
  const hasProducts = productItems.length > 0
  const hasServices = serviceItems.length > 0

  const productSubtotal = productItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const shipping = pickupAtStore ? 0 : (shippingPrice ?? 0)
  const productTotal = productSubtotal + shipping

  const handleAddressConfirm = async (result: LocationPickerResult) => {
    setAddress(result)
    setShippingErr(null)
    setShippingPrice(null)
    try {
      const est = await estimateDelivery(result.lat, result.lng)
      if (!est.within_range) {
        setShippingErr('Endereço fora do raio de entrega da loja.')
        return
      }
      setShippingPrice(est.price)
    } catch (e) {
      setShippingErr(e instanceof Error ? e.message : 'Não foi possível calcular o frete.')
    }
  }

  const handleFinalize = async () => {
    setFormErr(null)
    if (!customerName.trim()) { setFormErr('Informe seu nome.'); return }
    if (whatsapp.replace(/\D/g, '').length < 10) { setFormErr('WhatsApp inválido.'); return }
    if (!pickupAtStore && !address) { setFormErr('Selecione o endereço de entrega no mapa.'); return }
    if (!pickupAtStore && shippingErr) { setFormErr(shippingErr); return }
    if (hasServices && !agendamento?.time) {
      setFormErr('Escolha o horário do atendimento do serviço.')
      return
    }

    setSubmitting(true)

    let order
    try {
      order = await createAssistantOrder({
        customer_name: customerName.trim(),
        customer_whatsapp: whatsapp.trim(),
        items: [
          ...productItems.map((i) => ({ product_id: i.id, quantity: i.quantity })),
          ...serviceItems.map((i) => ({ service_id: i.id, quantity: i.quantity })),
        ],
        shipping_price: shipping || undefined,
      })
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Erro ao criar pedido. Tente novamente.')
      setSubmitting(false)
      return
    }

    // Serviço só existe com horário reservado. Se a reserva falhar (alguém
    // pegou o horário nesse meio tempo), avisa em vez de deixar o cliente
    // achando que ficou marcado.
    if (hasServices && agendamento?.time) {
      try {
        const res = await fetch('/api/agenda/public/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: agendamento.date,
            horario: agendamento.time,
            customer_name: customerName.trim(),
            customer_whatsapp: whatsapp.trim(),
            service_id: serviceItems[0]?.id,
            service_label: serviceItems[0]?.name,
            order_id: order.id,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setFormErr(j.error ?? 'Esse horário acabou de ser ocupado. Escolha outro.')
          setSubmitting(false)
          return
        }
      } catch {
        setFormErr('Não foi possível reservar o horário. Tente novamente.')
        setSubmitting(false)
        return
      }
    }

    clear()

    fetch('/api/whatsapp/notify-store-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        total: order.total,
        customerName: customerName.trim(),
        customerWhatsapp: whatsapp.trim(),
        pickupAtStore,
        addressLabel: pickupAtStore ? null : address?.label,
      }),
    }).catch(() => {})

    setSubmitting(false)
    setStep('success')
  }

  const resetAndClose = () => {
    setStep('items')
    setCustomerName('')
    setWhatsapp('')
    setPickupAtStore(false)
    setAddress(null)
    setShippingPrice(null)
    setShippingErr(null)
    setFormErr(null)
    onClose()
  }

  const INPUT = 'w-full px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-white placeholder-white/25 focus:border-vr-red/60 outline-none transition-all text-sm'

  return (
    <>
      {mapOpen && (
        <LocationPicker
          onClose={() => setMapOpen(false)}
          onConfirm={async (r) => {
            setMapOpen(false)
            await handleAddressConfirm(r)
          }}
        />
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-vr-graphite border-l border-white/10 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          {step === 'checkout' ? (
            <button onClick={() => setStep('items')} className="text-vr-silver/50 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <h2 className="font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-vr-red" />
              Sacola{count > 0 ? ` (${count})` : ''}
            </h2>
          )}
          {step === 'checkout' && (
            <span className="font-bold text-white text-sm">Finalizar pedido</span>
          )}
          <button onClick={onClose} className="text-vr-silver/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SUCCESS */}
        {step === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <h3 className="font-bold text-white text-lg">Pedido enviado!</h3>
            <p className="text-sm text-vr-silver/60">
              Recebemos seu pedido. Em breve entraremos em contato pelo WhatsApp.
            </p>
            <button
              onClick={resetAndClose}
              className="mt-2 bg-vr-red text-white font-semibold py-3 px-6 rounded-xl hover:bg-vr-red/90 transition-colors text-sm"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ITEMS */}
        {step === 'items' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {items.length === 0 ? (
                <p className="text-center text-sm text-vr-silver/40 py-12">Sacola vazia.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-vr-black border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3"
                  >
                    {item.type === 'service' ? (
                      <Wrench className="w-4 h-4 text-vr-red shrink-0" />
                    ) : (
                      <Package className="w-4 h-4 text-vr-red shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.name}</p>
                      <p className="text-xs text-vr-silver/50 truncate">{item.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.type === 'product' && (
                        <>
                          <button
                            onClick={() => updateQty(item.id, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center text-vr-silver/50 hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs w-5 text-center text-white">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.id, item.quantity + 1)}
                            disabled={item.maxQty !== undefined && item.quantity >= item.maxQty}
                            className="w-6 h-6 flex items-center justify-center text-vr-silver/50 hover:text-white disabled:opacity-30"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <span className="text-sm font-bold text-vr-silver ml-1">
                        {fmt(item.price * item.quantity)}
                      </span>
                      <button
                        onClick={() => remove(item.id)}
                        className="text-vr-silver/30 hover:text-red-400 transition-colors ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t border-white/10 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-vr-silver/60">Total estimado</span>
                  <span className="text-lg font-black text-white">{fmt(total)}</span>
                </div>
                {hasProducts && (
                  <button
                    onClick={() => setStep('checkout')}
                    className="w-full flex items-center justify-center gap-2 bg-vr-red text-white font-semibold py-3 rounded-xl hover:bg-vr-red/90 transition-colors text-sm"
                  >
                    Finalizar compra
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {hasServices && (
                  <Link
                    href="/#orcamento"
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 bg-vr-black border border-white/10 text-white font-semibold py-3 rounded-xl hover:border-vr-red/40 transition-colors text-sm"
                  >
                    <Wrench className="w-4 h-4 text-vr-red" />
                    Solicitar serviços
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
                <button
                  onClick={clear}
                  className="w-full text-xs text-vr-silver/40 hover:text-vr-silver transition-colors py-1"
                >
                  Limpar sacola
                </button>
              </div>
            )}
          </>
        )}

        {/* CHECKOUT */}
        {step === 'checkout' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Resumo */}
            <div className="bg-vr-black rounded-xl p-3 space-y-1">
              {productItems.map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span className="text-vr-silver/70 truncate mr-2">
                    {i.name} × {i.quantity}
                  </span>
                  <span className="text-white font-medium shrink-0">{fmt(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-vr-silver/70 mb-1.5">Seu nome *</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome completo"
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-vr-silver/70 mb-1.5">WhatsApp *</label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(fmtPhone(e.target.value))}
                type="tel"
                inputMode="numeric"
                placeholder="(83) 99999-9999"
                maxLength={15}
                className={INPUT}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-vr-silver/70 cursor-pointer">
              <input
                type="checkbox"
                checked={pickupAtStore}
                onChange={(e) => {
                  setPickupAtStore(e.target.checked)
                  if (e.target.checked) { setAddress(null); setShippingPrice(null); setShippingErr(null) }
                }}
                className="w-4 h-4 accent-vr-red"
              />
              <Home className="w-3.5 h-3.5 text-vr-red" />
              Retirar no local
            </label>

            {!pickupAtStore && (
              <div>
                <label className="block text-xs font-semibold text-vr-silver/70 mb-1.5">
                  Endereço de entrega *
                </label>
                <button
                  onClick={() => setMapOpen(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-sm hover:border-vr-red/40 transition-colors text-left"
                >
                  <MapPin className="w-4 h-4 text-vr-red shrink-0" />
                  <span className={address ? 'text-white' : 'text-white/30'}>
                    {address?.label ?? 'Selecionar no mapa…'}
                  </span>
                </button>
                {shippingErr && <p className="text-xs text-red-400 mt-1">{shippingErr}</p>}
                {!shippingErr && address && shippingPrice !== null && (
                  <p className="text-xs text-vr-silver/50 mt-1">Frete: {fmt(shippingPrice)}</p>
                )}
              </div>
            )}

            {hasServices && (
              <div className="border-t border-white/10 pt-3 space-y-3">
                <AgendamentoPicker
                  serviceId={serviceItems[0]?.id}
                  value={agendamento}
                  onChange={setAgendamento}
                />
                <p className="rounded-xl border border-white/10 bg-white/2 px-3 py-2.5 text-xs text-vr-silver/70">
                  <strong className="text-vr-silver">Serviço é pago só no final.</strong> Agora você
                  está enviando a solicitação — o pagamento do serviço acontece depois que a
                  manutenção for concluída e o aparelho entregue.
                </p>
              </div>
            )}

            <div className="border-t border-white/10 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-vr-silver/50">
                <span>Subtotal</span>
                <span>{fmt(productSubtotal)}</span>
              </div>
              <div className="flex justify-between text-vr-silver/50">
                <span>Frete</span>
                <span>{pickupAtStore ? 'Retirada' : shippingPrice !== null ? fmt(shippingPrice) : '—'}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-base pt-1">
                <span>Total</span>
                <span>{fmt(productTotal)}</span>
              </div>
            </div>

            {formErr && <p className="text-xs text-red-400">{formErr}</p>}

            <button
              onClick={handleFinalize}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-vr-red text-white font-semibold py-3.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Enviando…' : 'Finalizar pedido'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
