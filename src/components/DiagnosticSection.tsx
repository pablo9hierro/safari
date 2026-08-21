'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ServiceCatalogCategory, ServiceCatalogItem, ServiceDiagnostic, ServiceRequest } from '@/lib/types'
import { jsPDF } from 'jspdf'
import { apiPath } from '@/lib/storeProxyLink'
import { decideQuoteOutcome } from '@/lib/serviceLifecycle/quoteDecision'
import { computeRepairBusyUntil } from '@/lib/serviceLifecycle/busyUntil'
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  FileText,
} from 'lucide-react'

interface SelectedService {
  id: string
  repair_type: string
  price: number
}

interface DiagnosticSectionProps {
  request: ServiceRequest
  onSaved: (newStatus: 'diagnostico_enviado' | 'in_progress') => void
}

export default function DiagnosticSection({ request, onSaved }: DiagnosticSectionProps) {
  const [brands, setBrands] = useState<ServiceCatalogCategory[]>([])
  const [catalogItems, setCatalogItems] = useState<ServiceCatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [existing, setExisting] = useState<ServiceDiagnostic | null>(null)

  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedModelPill, setSelectedModelPill] = useState<string | null>(null)
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [notes, setNotes] = useState('')
  const [customTotal, setCustomTotal] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    setLoadingCatalog(true)
    Promise.all([
      supabase.from('service_catalog_categories').select('*').order('sort_order'),
      supabase.from('service_catalog_items').select('*').eq('active', true).order('sort_order'),
      supabase.from('service_diagnostics').select('*').eq('service_request_id', request.id).maybeSingle(),
    ]).then(([{ data: cats }, { data: items }, { data: diag }]) => {
      setBrands((cats as ServiceCatalogCategory[]) ?? [])
      setCatalogItems((items as ServiceCatalogItem[]) ?? [])
      if (diag) {
        const d = diag as ServiceDiagnostic
        setExisting(d)
        setSelectedServices(d.services_selected ?? [])
        setNotes(d.notes ?? '')
        if (d.pdf_url) setPdfUrl(d.pdf_url)
        if (d.quote_confirmed) setCustomTotal(String(d.quote_confirmed))
      }
    }).finally(() => setLoadingCatalog(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id])

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

  const serviceCards = useMemo(() => {
    if (!selectedBrandId || !selectedModelPill) return []
    return catalogItems.filter(
      (i) => i.category_id === selectedBrandId && i.model_name === selectedModelPill
    )
  }, [catalogItems, selectedBrandId, selectedModelPill])

  const autoTotal = selectedServices.reduce((s, i) => s + i.price, 0)
  const finalTotal = customTotal ? parseFloat(customTotal) || 0 : autoTotal

  const toggleService = (item: ServiceCatalogItem) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === item.id)
      if (exists) return prev.filter((s) => s.id !== item.id)
      return [...prev, { id: item.id, repair_type: item.repair_type, price: Number(item.price) }]
    })
  }

  const generatePdfBlob = useCallback((): Blob => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const w = doc.internal.pageSize.getWidth()
    const margin = 14
    let y = 20

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('VRTech — Diagnóstico de Reparo', margin, y)
    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, margin, y)
    y += 10

    doc.setDrawColor(200)
    doc.line(margin, y, w - margin, y)
    y += 8

    doc.setTextColor(0)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Cliente', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.text(`Nome: ${request.customer_name}`, margin, y); y += 5
    doc.text(`Telefone: ${request.customer_phone}`, margin, y); y += 5
    doc.text(`E-mail: ${request.customer_email}`, margin, y); y += 10

    doc.setFont('helvetica', 'bold')
    doc.text('Aparelho', margin, y); y += 6
    doc.setFont('helvetica', 'normal')
    doc.text(`Modelo: ${request.phone_model ?? 'Não informado'}`, margin, y); y += 5
    if (request.problem_description) {
      const lines = doc.splitTextToSize(`Problema: ${request.problem_description}`, w - margin * 2) as string[]
      doc.text(lines, margin, y)
      y += lines.length * 5 + 5
    }

    if (selectedServices.length > 0) {
      doc.line(margin, y, w - margin, y); y += 8
      doc.setFont('helvetica', 'bold')
      doc.text('Serviços Identificados', margin, y); y += 6
      doc.setFont('helvetica', 'normal')

      selectedServices.forEach((s) => {
        doc.text(`• ${s.repair_type}`, margin, y)
        doc.text(`R$ ${s.price.toFixed(2)}`, w - margin - 30, y)
        y += 6
      })

      y += 4
      doc.setFont('helvetica', 'bold')
      doc.text('Total do Orçamento:', margin, y)
      doc.text(`R$ ${finalTotal.toFixed(2)}`, w - margin - 30, y)
      if (customTotal && parseFloat(customTotal) !== autoTotal) {
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(120)
        doc.text(`*valor ajustado pelo técnico (auto: R$ ${autoTotal.toFixed(2)})`, margin, y)
        doc.setTextColor(0)
        doc.setFontSize(11)
      }
      y += 10
    }

    if (notes) {
      doc.line(margin, y, w - margin, y); y += 8
      doc.setFont('helvetica', 'bold')
      doc.text('Observações do Técnico', margin, y); y += 6
      doc.setFont('helvetica', 'normal')
      const noteLines = doc.splitTextToSize(notes, w - margin * 2) as string[]
      doc.text(noteLines, margin, y)
    }

    return doc.output('blob')
  }, [request, selectedServices, notes, finalTotal, customTotal, autoTotal])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // 1. Generate PDF and upload
      setSavingPdf(true)
      const blob = generatePdfBlob()
      const fileName = `diagnostics/${request.id}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('service-images').upload(fileName, blob, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('service-images').getPublicUrl(fileName)
      const url = pub.publicUrl
      setPdfUrl(url)
      setSavingPdf(false)

      // 2. Upsert service_diagnostics
      const diagPayload = {
        service_request_id: request.id,
        services_selected: selectedServices,
        notes: notes || null,
        pdf_url: url,
        quote_confirmed: finalTotal,
      }
      if (existing) {
        await supabase.from('service_diagnostics').update(diagPayload).eq('id', existing.id)
      } else {
        await supabase.from('service_diagnostics').insert([diagPayload])
      }

      // 3. Orçamento real (finalTotal) <= orçamento estimado (falado de boca
      //    na coleta) -> avança sozinho pro reparo, sem perguntar pro
      //    cliente. Maior -> fica em diagnostico_enviado, espera aprovação.
      const outcome = decideQuoteOutcome(request.estimated_quote_value, finalTotal)
      const nextStatus: 'in_progress' | 'diagnostico_enviado' = outcome === 'auto_advance' ? 'in_progress' : 'diagnostico_enviado'
      const updates: Record<string, unknown> = { status: nextStatus, quote_value: finalTotal }
      if (nextStatus === 'in_progress') {
        updates.busy_until = await computeRepairBusyUntil(selectedServices.map((s) => s.id), supabase)
      }
      const { error: reqErr } = await supabase
        .from('service_requests')
        .update(updates)
        .eq('id', request.id)
      if (reqErr) throw reqErr

      // 4. Notify via WhatsApp (fire-and-forget) -- o texto certo (pergunta
      //    de aprovação vs confirmação com tempo estimado) já vem do
      //    template correspondente a cada evento.
      fetch(apiPath('/api/whatsapp/notify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, event: nextStatus }),
      }).catch(() => {})

      setSaved(true)
      onSaved(nextStatus)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar diagnóstico')
      setSavingPdf(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank')
      return
    }
    const blob = generatePdfBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagnostico-${request.customer_name.replace(/\s+/g, '-')}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const whatsappUrl = () => {
    const phone = `55${request.customer_phone.replace(/\D/g, '')}`
    const servicesList = selectedServices.map((s) => `• ${s.repair_type}: R$ ${s.price.toFixed(2)}`).join('\n')
    const msg = [
      `Olá *${request.customer_name}*! 👋`,
      '',
      `Diagnóstico do${request.phone_model ? ` *${request.phone_model}*` : ' seu aparelho'} concluído.`,
      selectedServices.length > 0 ? `\n*Serviços identificados:*\n${servicesList}\n\n*Total: R$ ${finalTotal.toFixed(2)}*` : '',
      notes ? `\n*Obs:* ${notes}` : '',
      pdfUrl ? `\n📄 PDF do diagnóstico: ${pdfUrl}` : '',
      '\nDeseja confirmar o orçamento para iniciar o reparo?',
    ].filter(Boolean).join('\n')
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  if (loadingCatalog) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando catálogo...
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Diagnóstico do Aparelho</h3>

      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Diagnóstico salvo e enviado ao cliente!
        </div>
      )}

      {/* Brand pills */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Marca</p>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setSelectedBrandId(b.id); setSelectedModelPill(null) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                ${selectedBrandId === b.id
                  ? 'bg-vr-red text-white border-vr-red'
                  : 'bg-slate-100 border-slate-200 text-gray-600 hover:border-vr-red/40'
                }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Model pills */}
      {selectedBrandId && modelList.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Modelo</p>
          <div className="flex flex-wrap gap-2">
            {modelList.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedModelPill(m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                  ${selectedModelPill === m
                    ? 'bg-vr-red text-white border-vr-red'
                    : 'bg-slate-100 border-slate-200 text-gray-600 hover:border-vr-red/40'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Service cards */}
      {serviceCards.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">
            Serviços
            {selectedServices.length > 0 && (
              <span className="text-vr-red ml-1">· {selectedServices.length} selecionado{selectedServices.length !== 1 ? 's' : ''}</span>
            )}
          </p>
          <div className="overflow-x-auto flex gap-2 pb-1 -mx-1 px-1">
            {serviceCards.map((s) => {
              const sel = selectedServices.some((x) => x.id === s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s)}
                  className={`shrink-0 w-40 rounded-xl p-3 text-left border-2 transition-all
                    ${sel
                      ? 'border-vr-red bg-red-50'
                      : 'border-slate-200 bg-white hover:border-vr-red/40'
                    }`}
                >
                  <div className="text-xs font-semibold text-gray-900 leading-tight">{s.repair_type}</div>
                  {s.description && <div className="text-[10px] text-gray-400 mt-1 leading-snug line-clamp-2">{s.description}</div>}
                  <div className="text-vr-red font-bold text-xs mt-2">R$ {Number(s.price).toFixed(2)}</div>
                  {sel && <div className="text-[10px] text-vr-red mt-0.5 font-semibold">✓</div>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected services summary */}
      {selectedServices.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
          {selectedServices.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="text-gray-700">{s.repair_type}</span>
              <span className="font-semibold text-gray-900">R$ {s.price.toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-sm">
            <span>Total auto</span>
            <span className="text-vr-red">R$ {autoTotal.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Adjusted total */}
      <div>
        <label className="label">Valor ajustado do orçamento (R$) <span className="font-normal text-gray-400">— opcional</span></label>
        <div className="relative">
          <span className="absolute left-4 top-3.5 text-gray-400 font-medium">R$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={customTotal}
            onChange={(e) => setCustomTotal(e.target.value)}
            placeholder={autoTotal > 0 ? autoTotal.toFixed(2) : '0,00'}
            className="input-field pl-10"
          />
        </div>
        {customTotal && <p className="text-xs text-amber-600 mt-1">Orçamento ajustado: R$ {finalTotal.toFixed(2)}</p>}
      </div>

      {/* Notes */}
      <div>
        <label className="label">Observações técnicas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Tela com manchas internas, conector oxidado, bateria inchada..."
          rows={3}
          className="input-field resize-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || saved}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />{savingPdf ? 'Gerando PDF...' : 'Salvando...'}</>
            : saved
              ? '✓ Diagnóstico salvo!'
              : '📄 Salvar diagnóstico e enviar ao cliente'
          }
        </button>

        {(pdfUrl || selectedServices.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl py-2 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {pdfUrl ? 'Ver PDF' : 'Baixar PDF'}
            </button>
            <a
              href={whatsappUrl()}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-green-600 border border-green-200 rounded-xl py-2 hover:bg-green-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
