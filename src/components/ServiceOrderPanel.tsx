'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { ServiceOrder, ServiceOrderChecklistItem, ServiceOrderUpdate, ServiceRequest, ServiceStatus, StockItem, UsedPart } from '@/lib/types'
import { SERVICE_ORDER_COMPONENTS } from '@/lib/constants'
import { generateServiceOrderPdf } from '@/lib/generateServiceOrderPdf'
import {
  ClipboardList,
  Loader2,
  CheckSquare,
  Square,
  Plus,
  Paperclip,
  Camera,
  X,
  Wrench,
  PackageCheck,
  FileText,
  ShieldCheck,
  Eye,
  Download,
  RotateCcw,
  AlertTriangle,
  Boxes,
} from 'lucide-react'

const ACTIVE_STATUSES: ServiceStatus[] = [
  'in_progress', 'em_entrega', 'completed', 'em_pagamento', 'delivered', 'finished',
]

export function isServiceOrderStatus(status: ServiceStatus) {
  return ACTIVE_STATUSES.includes(status)
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(url)
}

function buildInitialChecklist(): ServiceOrderChecklistItem[] {
  return SERVICE_ORDER_COMPONENTS.map((component) => ({ component, checked: false, description: '', media_urls: [] }))
}

async function uploadMedia(supabase: SupabaseClient, orderId: string, files: File[], prefix: string): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const fileName = `${orderId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('service-order-media').upload(fileName, file)
    if (!error) {
      const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
      urls.push(pub.publicUrl)
    }
  }
  return urls
}

async function uploadPdf(supabase: SupabaseClient, orderId: string, blob: Blob): Promise<string | null> {
  const fileName = `${orderId}/os-${Date.now()}.pdf`
  const { error } = await supabase.storage.from('service-order-media').upload(fileName, blob, { contentType: 'application/pdf' })
  if (error) return null
  const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
  return pub.publicUrl
}

async function downloadPdf(url: string, fileName: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

function MediaThumb({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-14 h-14 object-cover rounded-lg border border-gray-200'
    : 'w-28 h-28 object-cover rounded-lg border border-gray-200'
  return isVideo(url) ? (
    <video src={url} controls className={cls} />
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Mídia da OS" className={cls} />
    </a>
  )
}

function MediaPickerButtons({ onFiles }: { onFiles: (files: File[]) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-vr-red transition-colors border border-gray-200 rounded-lg px-2 py-1.5"
      >
        <Camera className="w-3.5 h-3.5" />
        Câmera
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-vr-red transition-colors border border-gray-200 rounded-lg px-2 py-1.5"
      >
        <Paperclip className="w-3.5 h-3.5" />
        Anexar
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}

const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  created: { label: 'OS aberta', icon: <ClipboardList className="w-4 h-4" /> },
  checklist_update: { label: 'Checklist atualizado', icon: <Wrench className="w-4 h-4" /> },
  update: { label: 'Atualização', icon: <Wrench className="w-4 h-4" /> },
  completed: { label: 'Reparo concluído', icon: <PackageCheck className="w-4 h-4" /> },
  reopened: { label: 'OS reaberta', icon: <RotateCcw className="w-4 h-4" /> },
}

export default function ServiceOrderPanel({
  request,
  status,
  readOnly = false,
  onQuoteValueChange,
  onOrderStateChange,
}: {
  request: ServiceRequest
  status: ServiceStatus
  readOnly?: boolean
  onQuoteValueChange?: (value: number) => void
  onOrderStateChange?: (state: { closed: boolean; hasUpdate: boolean }) => void
}) {
  const requestId = request.id
  const quoteValue = request.quote_value
  const customerPhone = request.customer_phone
  const [order, setOrder] = useState<ServiceOrder | null>(null)
  const [updates, setUpdates] = useState<ServiceOrderUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState<ServiceOrderChecklistItem[]>([])
  const [checklistFiles, setChecklistFiles] = useState<Record<number, File[]>>({})
  const [checklistValues, setChecklistValues] = useState<Record<number, string>>({})
  const [savingChecklist, setSavingChecklist] = useState(false)

  const [newMessage, setNewMessage] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [updateComponent, setUpdateComponent] = useState('')
  const [addingUpdate, setAddingUpdate] = useState(false)

  const [completedServices, setCompletedServices] = useState('')
  const [savingCompletion, setSavingCompletion] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [confirmingReopen, setConfirmingReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [reopening, setReopening] = useState(false)

  const [quoteValues, setQuoteValues] = useState<Record<number, string>>({})
  const [quoteJustifications, setQuoteJustifications] = useState<Record<number, string>>({})
  const [quoteFiles, setQuoteFiles] = useState<Record<number, File[]>>({})
  const [quoteWarranties, setQuoteWarranties] = useState<Record<number, string>>({})

  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [usedParts, setUsedParts] = useState<UsedPart[]>([])
  const [committedPartIds, setCommittedPartIds] = useState<Set<string>>(new Set())
  const [partSearch, setPartSearch] = useState('')
  const [partSelectedId, setPartSelectedId] = useState<string | null>(null)
  const [partSearchOpen, setPartSearchOpen] = useState(false)
  const [partError, setPartError] = useState<string | null>(null)
  const [pendingNewPart, setPendingNewPart] = useState<{ name: string } | null>(null)
  const [newPartStock, setNewPartStock] = useState('')
  const [newPartPrice, setNewPartPrice] = useState('')
  const [newPartWarranty, setNewPartWarranty] = useState('')
  const [creatingPart, setCreatingPart] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('service_orders')
      .select('*, service_order_updates(*)')
      .eq('request_id', requestId)
      .maybeSingle()

    if (existing) {
      const { service_order_updates, ...rest } = existing as ServiceOrder & { service_order_updates: ServiceOrderUpdate[] }
      setOrder(rest as ServiceOrder)
      setChecklist((rest.checklist as ServiceOrderChecklistItem[])?.length ? rest.checklist : buildInitialChecklist())
      setUpdates([...(service_order_updates ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      setCompletedServices(rest.completed_services ?? '')
      const existingParts = rest.used_parts ?? []
      setUsedParts(existingParts)
      setCommittedPartIds(new Set(existingParts.map((p) => p.stock_item_id).filter((id): id is string => !!id)))
    } else if (!readOnly) {
      const initialChecklist = buildInitialChecklist()
      const { data: created } = await supabase
        .from('service_orders')
        .insert({ request_id: requestId, checklist: initialChecklist })
        .select()
        .single()

      if (created) {
        setOrder(created as ServiceOrder)
        setChecklist(initialChecklist)
        const { data: logEntry } = await supabase
          .from('service_order_updates')
          .insert({ service_order_id: created.id, action_type: 'created', message: 'Ordem de serviço aberta' })
          .select()
          .single()
        if (logEntry) setUpdates([logEntry as ServiceOrderUpdate])
      }
    }
    setLoading(false)
  }, [requestId, readOnly])

  useEffect(() => {
    load()
  }, [load])

  // Estoque só é relevante no fluxo do admin (a página pública /consultar usa readOnly).
  useEffect(() => {
    if (readOnly) return
    const supabase = createClient()
    supabase
      .from('stock_items')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setStockItems(data as StockItem[])
      })
  }, [readOnly])

  useEffect(() => {
    if (!order) return
    const supabase = createClient()
    const ch = supabase
      .channel(`service_order_${order.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'service_order_updates', filter: `service_order_id=eq.${order.id}` },
        ({ new: row }) => {
          setUpdates((prev) => (prev.some((u) => u.id === row.id) ? prev : [...prev, row as ServiceOrderUpdate]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'service_orders', filter: `id=eq.${order.id}` },
        ({ new: row }) => {
          setOrder(row as ServiceOrder)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [order?.id])

  useEffect(() => {
    const hasUpdate = updates.some((u) => u.action_type === 'update')
    onOrderStateChange?.({ closed: !!order?.closed_at, hasUpdate })
  }, [order?.closed_at, updates, onOrderStateChange])

  const toggleChecklistItem = (idx: number, checked: boolean) => {
    setChecklist((prev) => prev.map((item, i) => (i === idx ? { ...item, checked } : item)))
  }

  const updateChecklistDescription = (idx: number, description: string) => {
    setChecklist((prev) => prev.map((item, i) => (i === idx ? { ...item, description } : item)))
  }

  const addChecklistFiles = (idx: number, files: File[]) => {
    if (files.length === 0) return
    setChecklistFiles((prev) => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...files] }))
  }

  const removeChecklistFile = (idx: number, fileIdx: number) => {
    setChecklistFiles((prev) => ({ ...prev, [idx]: (prev[idx] ?? []).filter((_, i) => i !== fileIdx) }))
  }

  // Checklist é preenchido após o status avançar para 'em reparo'.
  const handleSaveChecklist = async () => {
    if (!order) return
    setSavingChecklist(true)
    const supabase = createClient()

    const updatedChecklist = await Promise.all(
      checklist.map(async (item, idx) => {
        const files = checklistFiles[idx] ?? []
        const value = checklistValues[idx]?.trim()
          ? parseFloat(checklistValues[idx])
          : (item.value ?? null)
        if (files.length === 0) return { ...item, value }
        const uploaded = await uploadMedia(supabase, order.id, files, `checklist-${idx}`)
        return { ...item, value, media_urls: [...(item.media_urls ?? []), ...uploaded] }
      })
    )

    const { data: updated } = await supabase
      .from('service_orders')
      .update({ checklist: updatedChecklist, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select()
      .single()
    if (updated) setOrder(updated as ServiceOrder)
    setChecklist(updatedChecklist)
    setChecklistFiles({})
    setChecklistValues({})

    const checkedItems = updatedChecklist.filter((i) => i.checked)
    const summary = checkedItems.length
      ? checkedItems.map((i) => `${i.component}${i.description ? `: ${i.description}` : ''}${i.value != null ? ` (R$ ${Number(i.value).toFixed(2)})` : ''}`).join('; ')
      : 'Nenhum componente marcado'

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, action_type: 'checklist_update', message: `Checklist de avaliação registrado — ${summary}` })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])

    const itemsWithValue = checkedItems.filter((i) => i.value != null)
    if (itemsWithValue.length > 0) {
      const newTotal = itemsWithValue.reduce((sum, i) => sum + Number(i.value), 0)
      const { error: quoteErr } = await supabase
        .from('service_requests')
        .update({ quote_value: newTotal })
        .eq('id', requestId)
      if (!quoteErr) onQuoteValueChange?.(newTotal)
    }

    setSavingChecklist(false)
  }

  const handleAddUpdate = async () => {
    if (!order) return
    if (!newMessage.trim() && newFiles.length === 0) return
    setAddingUpdate(true)
    const supabase = createClient()
    const mediaUrls = await uploadMedia(supabase, order.id, newFiles, 'update')
    const component = updateComponent.trim()
    const text = newMessage.trim()
    const message = component ? (text ? `${component}: ${text}` : component) : (text || null)

    const { data: inserted } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, message, media_urls: mediaUrls, action_type: 'update' })
      .select()
      .single()

    if (inserted) setUpdates((prev) => [...prev, inserted as ServiceOrderUpdate])
    setNewMessage('')
    setNewFiles([])
    setUpdateComponent('')
    setAddingUpdate(false)
  }

  // Itens "selecionados" no formulário de conclusão = marcados na OS 1 (checklist)
  // ou citados como componente em alguma atualização da OS 2 (linha do tempo).
  const getRevisionIndices = () => {
    const form2Components = new Set<string>()
    for (const u of updates) {
      if (u.action_type !== 'update' || !u.message) continue
      for (const c of SERVICE_ORDER_COMPONENTS) {
        if (u.message === c || u.message.startsWith(`${c}: `)) form2Components.add(c)
      }
    }
    return checklist
      .map((_, idx) => idx)
      .filter((idx) => checklist[idx].checked || form2Components.has(checklist[idx].component))
  }

  const partSuggestions = partSearch.trim()
    ? stockItems.filter((i) => i.name.toLowerCase().includes(partSearch.trim().toLowerCase())).slice(0, 6)
    : []

  const selectPartSuggestion = (item: StockItem) => {
    setPartSearch(item.name)
    setPartSelectedId(item.id)
    setPartSearchOpen(false)
  }

  const removeUsedPart = (idx: number) => {
    setUsedParts((prev) => prev.filter((_, i) => i !== idx))
  }

  // Cada clique em "+ item" soma 1 unidade. Se a peça já estiver na lista, só incrementa a
  // quantidade dela em vez de duplicar a linha — pedir a mesma peça de novo é só clicar de novo.
  const addOrIncrementUsedPart = (stockItemId: string, name: string, unit: StockItem['unit'], price: number | null) => {
    setUsedParts((prev) => {
      const idx = prev.findIndex((p) => p.stock_item_id === stockItemId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { stock_item_id: stockItemId, name, quantity: 1, unit, price }]
    })
  }

  // "+ item": usa a peça já cadastrada (selecionada na busca ou nome digitado igual a uma existente)
  // ou abre o popup de cadastro dinâmico quando nenhuma peça em estoque corresponde ao texto digitado.
  const handleAddPartClick = () => {
    setPartError(null)
    const trimmedName = partSearch.trim()
    if (!trimmedName) return

    const matched = stockItems.find((i) => i.id === partSelectedId)
      ?? stockItems.find((i) => i.name.toLowerCase() === trimmedName.toLowerCase())

    if (matched) {
      addOrIncrementUsedPart(matched.id, matched.name, matched.unit, matched.price ?? null)
      setPartSearch('')
      setPartSelectedId(null)
      return
    }

    setPendingNewPart({ name: trimmedName })
    setNewPartStock('')
    setNewPartPrice('')
    setNewPartWarranty('')
  }

  // Cadastra a peça nova em estoque (nome = texto digitado + modelo do aparelho da OS) e já a adiciona à lista.
  const handleConfirmNewPart = async () => {
    if (!pendingNewPart) return
    setPartError(null)
    const stockQty = parseFloat(newPartStock)
    if (!newPartStock || isNaN(stockQty) || stockQty < 0) {
      setPartError('Informe uma quantidade de estoque válida.')
      return
    }
    if (!newPartWarranty.trim()) {
      setPartError('Informe a garantia da peça.')
      return
    }
    const priceNum = newPartPrice.trim() ? parseFloat(newPartPrice) : null

    setCreatingPart(true)
    const supabase = createClient()
    const fullName = `${pendingNewPart.name} ${request.phone_model}`.trim()

    const { data: created, error } = await supabase
      .from('stock_items')
      .insert({ name: fullName, quantity: stockQty, unit: 'unidade', price: priceNum, warranty: newPartWarranty.trim() })
      .select()
      .single()

    if (error || !created) {
      setPartError(error?.code === '23505' ? 'Já existe um item de estoque com este nome.' : 'Não foi possível cadastrar o item.')
      setCreatingPart(false)
      return
    }

    const item = created as StockItem
    setStockItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))
    addOrIncrementUsedPart(item.id, item.name, item.unit, item.price ?? null)
    setPartSearch('')
    setPartSelectedId(null)
    setPendingNewPart(null)
    setCreatingPart(false)
  }

  // Conclusão = revisão de orçamento e garantia (todos os itens da OS1+OS2) + dados finais da OS.
  const handleSaveCompletion = async () => {
    if (!order) return
    setCompletionError(null)

    const revisionIndices = getRevisionIndices()
    for (const idx of revisionIndices) {
      if (!quoteJustifications[idx]?.trim()) {
        setCompletionError(`Preencha a justificativa para "${checklist[idx].component}" na revisão de orçamento e garantia.`)
        return
      }
    }

    setSavingCompletion(true)
    const supabase = createClient()

    const updatedChecklist = [...checklist]
    const allUpdatesSoFar = [...updates]
    let newTotal = 0

    for (const idx of revisionIndices) {
      const item = checklist[idx]
      const value = quoteValues[idx]?.trim() ? parseFloat(quoteValues[idx]) : (item.value ?? 0)
      const rawWarranty = quoteWarranties[idx]?.trim()
      const itemWarranty = rawWarranty ? `${rawWarranty} dias` : null
      newTotal += value
      const mediaUrls = await uploadMedia(supabase, order.id, quoteFiles[idx] ?? [], `quote-${idx}`)
      updatedChecklist[idx] = {
        ...item,
        checked: true,
        value,
        warranty: itemWarranty,
        media_urls: [...(item.media_urls ?? []), ...mediaUrls],
      }

      const { data: logEntry } = await supabase
        .from('service_order_updates')
        .insert({
          service_order_id: order.id,
          action_type: 'update',
          message: `Revisão de orçamento — ${item.component}: R$ ${value.toFixed(2)} — ${quoteJustifications[idx].trim()}`,
          media_urls: mediaUrls,
        })
        .select()
        .single()
      if (logEntry) {
        setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])
        allUpdatesSoFar.push(logEntry as ServiceOrderUpdate)
      }
    }

    const finalValue = revisionIndices.length > 0 ? newTotal : (quoteValue ?? 0)
    const warrantySummary = revisionIndices.length > 0
      ? revisionIndices.map((idx) => `${updatedChecklist[idx].component}: ${updatedChecklist[idx].warranty || 'não informada'}`).join('; ')
      : null

    // Só registra saída de estoque para peças realmente novas desde o último save
    // (evita decrementar de novo as mesmas peças se a OS for reaberta e salva outra vez).
    for (const part of usedParts) {
      if (!part.stock_item_id || committedPartIds.has(part.stock_item_id)) continue
      await supabase.from('stock_movements').insert({ item_id: part.stock_item_id, type: 'saida', quantity: part.quantity, unit: part.unit })
    }
    setCommittedPartIds(new Set(usedParts.map((p) => p.stock_item_id).filter((id): id is string => !!id)))

    const closedAt = new Date().toISOString()
    let pdf_url: string | null = null
    try {
      const pdfBlob = await generateServiceOrderPdf({
        request,
        orderId: order.id,
        checklist: updatedChecklist,
        completedServices: completedServices || null,
        warranty: warrantySummary,
        finalValue,
        closedAt,
        updates: allUpdatesSoFar,
      })
      pdf_url = await uploadPdf(supabase, order.id, pdfBlob)
      if (!pdf_url) setPdfError('Não foi possível salvar o PDF no servidor. Tente gerar novamente abaixo.')
    } catch (err) {
      console.error('Erro ao gerar PDF da OS:', err)
      setPdfError('Não foi possível gerar o PDF. Tente novamente abaixo.')
    }

    const { data: updated } = await supabase
      .from('service_orders')
      .update({
        checklist: updatedChecklist,
        completed_services: completedServices || null,
        warranty: warrantySummary,
        final_value: finalValue,
        used_parts: usedParts,
        pdf_url,
        closed_at: closedAt,
        updated_at: closedAt,
      })
      .eq('id', order.id)
      .select()
      .single()

    if (updated) setOrder(updated as ServiceOrder)
    setChecklist(updatedChecklist)

    if (revisionIndices.length > 0) {
      const { error: quoteErr } = await supabase
        .from('service_requests')
        .update({ quote_value: finalValue })
        .eq('id', requestId)
      if (!quoteErr) onQuoteValueChange?.(finalValue)
    }

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({
        service_order_id: order.id,
        action_type: 'completed',
        message: `Reparo concluído — ${completedServices || 'serviços realizados'}. Valor: R$ ${Number(finalValue || 0).toFixed(2)}. Garantia: ${warrantySummary || 'não informada'}.`,
      })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])

    if (customerPhone) {
      fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, event: 'completed' }),
      }).catch((e) => console.error('Erro ao notificar WhatsApp:', e))
    }

    setSavingCompletion(false)
  }

  // Gera o PDF para OS já concluídas antes desta funcionalidade existir (sem pdf_url).
  const handleGeneratePdf = async () => {
    if (!order || !order.closed_at) return
    setGeneratingPdf(true)
    setPdfError(null)
    try {
      const supabase = createClient()
      const pdfBlob = await generateServiceOrderPdf({
        request,
        orderId: order.id,
        checklist: order.checklist,
        completedServices: order.completed_services,
        warranty: order.warranty,
        finalValue: order.final_value,
        closedAt: order.closed_at,
        updates,
      })
      const pdf_url = await uploadPdf(supabase, order.id, pdfBlob)
      if (pdf_url) {
        const { data: updated } = await supabase
          .from('service_orders')
          .update({ pdf_url })
          .eq('id', order.id)
          .select()
          .single()
        if (updated) setOrder(updated as ServiceOrder)
      } else {
        setPdfError('Não foi possível salvar o PDF no servidor. Verifique o bucket "service-order-media" no Supabase.')
      }
    } catch (err) {
      console.error('Erro ao gerar PDF da OS:', err)
      setPdfError('Não foi possível gerar o PDF.')
    }
    setGeneratingPdf(false)
  }

  // Reabre uma OS já concluída para que o admin possa atualizar checklist, valores e gerar uma nova OS.
  const handleReopen = async () => {
    if (!order || !reopenReason.trim()) return
    setReopening(true)
    const supabase = createClient()

    const { data: updated } = await supabase
      .from('service_orders')
      .update({ closed_at: null, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select()
      .single()

    if (updated) setOrder(updated as ServiceOrder)

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, action_type: 'reopened', message: `Motivo da reabertura: ${reopenReason.trim()}` })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])

    setConfirmingReopen(false)
    setReopenReason('')
    setReopening(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!order) return null

  const checkedItems = checklist.filter((i) => i.checked)
  const checklistSubmitted = updates.some((u) => u.action_type === 'checklist_update')
  const everCompleted = updates.some((u) => u.action_type === 'completed')
  const showChecklist = status === 'in_progress' && !checklistSubmitted
  // Depois que a OS já foi concluída ao menos uma vez, reabrir libera tanto o
  // acompanhamento (OS 2) quanto a conclusão/garantia (OS 3) juntos, em sequência,
  // independente do status atual da solicitação (que pode já ter avançado).
  const showTimeline = checklistSubmitted && !order.closed_at && (status === 'in_progress' || everCompleted)
  const checklistEditable = showChecklist && !readOnly
  const updatesEditable = showTimeline && !readOnly
  const showCompletion = !readOnly && !order.closed_at && checklistSubmitted && (status === 'completed' || everCompleted)
  const showClosedSummary = !!order.closed_at
  const revisionIndices = showCompletion ? getRevisionIndices() : []

  // Fora dessas condições (ex: status "aceito pelo cliente"), nenhuma OS deve aparecer na tela
  if (!showChecklist && !showTimeline && !showCompletion && !showClosedSummary) return null

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" />
        Ordem de serviço
      </h3>

      {/* Checklist — formulário 1: disponível só até o aparelho ser recolhido/entregue */}
      {showChecklist && (
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist de avaliação</p>
        {checklistEditable ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              Marque os componentes com problema, descreva o estado, informe o valor do reparo e anexe fotos/vídeos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {checklist.map((item, idx) => (
                <div key={item.component} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleChecklistItem(idx, !item.checked)}
                    className="flex items-center gap-2 text-sm text-gray-700 py-1 text-left"
                  >
                    {item.checked ? (
                      <CheckSquare className="w-4 h-4 text-vr-red flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    )}
                    {item.component}
                  </button>
                  {item.checked && (
                    <div className="space-y-1.5 mt-1">
                      <textarea
                        value={item.description}
                        onChange={(e) => updateChecklistDescription(idx, e.target.value)}
                        placeholder="Descreva o estado atual deste item..."
                        rows={2}
                        className="input-field text-xs resize-none"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-xs font-medium">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={checklistValues[idx] ?? (item.value != null ? String(item.value) : '')}
                          onChange={(e) => setChecklistValues((prev) => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Valor do reparo (R$)"
                          className="input-field text-xs pl-8"
                        />
                      </div>
                      <MediaPickerButtons onFiles={(files) => addChecklistFiles(idx, files)} />
                      {(item.media_urls?.length || checklistFiles[idx]?.length) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {item.media_urls?.map((url) => (
                            <MediaThumb key={url} url={url} size="sm" />
                          ))}
                          {(checklistFiles[idx] ?? []).map((f, fi) => (
                            <span key={fi} className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                              {f.name}
                              <button type="button" onClick={() => removeChecklistFile(idx, fi)}>
                                <X className="w-3 h-3 text-gray-400" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveChecklist}
              disabled={savingChecklist}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {savingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              Salvar checklist de avaliação
            </button>
          </div>
        ) : checkedItems.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum item registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {checkedItems.map((item) => (
              <li key={item.component} className="text-sm">
                <span className="font-semibold text-gray-800">{item.component}</span>
                {item.description && <span className="text-gray-600"> — {item.description}</span>}
                {item.value != null && <span className="text-gray-600"> — R$ {Number(item.value).toFixed(2)}</span>}
                {item.media_urls?.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {item.media_urls.map((url) => (
                      <MediaThumb key={url} url={url} size="sm" />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {/* Timeline — formulário 2: disponível só durante o reparo */}
      {showTimeline && (
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acompanhamento / linha do tempo</p>
        {updates.length === 0 ? (
          <p className="text-sm text-gray-400">Sem atualizações ainda.</p>
        ) : (
          <ul className="space-y-3">
            {updates.map((u) => {
              const meta = ACTION_LABELS[u.action_type] ?? { label: u.action_type, icon: <Wrench className="w-4 h-4" /> }
              return (
                <li key={u.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
                      <span className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    {u.message && <p className="text-sm text-gray-700 mt-0.5">{u.message}</p>}
                    {u.media_urls?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {u.media_urls.map((url) => (
                          <MediaThumb key={url} url={url} />
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {updatesEditable && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <div>
              <label className="label">Componente (opcional)</label>
              <input
                value={updateComponent}
                onChange={(e) => setUpdateComponent(e.target.value)}
                list={`os-components-${order.id}`}
                placeholder="Buscar componente do aparelho..."
                className="input-field text-sm"
              />
              <datalist id={`os-components-${order.id}`}>
                {SERVICE_ORDER_COMPONENTS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Descreva uma atualização do reparo (ex: peça substituída, ocorrência encontrada...)"
              rows={2}
              className="input-field text-sm resize-none"
            />
            {newFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                    {f.name}
                    <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <MediaPickerButtons onFiles={(files) => setNewFiles((prev) => [...prev, ...files])} />
              <button
                onClick={handleAddUpdate}
                disabled={addingUpdate || (!newMessage.trim() && newFiles.length === 0)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-vr-red text-white rounded-lg px-3 py-2 hover:bg-vr-red-dark transition-colors disabled:opacity-50"
              >
                {addingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Adicionar atualização
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Conclusão */}
      {showCompletion && (
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Concluir ordem de serviço</p>

          {revisionIndices.length > 0 && (
            <div className="space-y-3 pb-3 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revisão de orçamento e garantia</p>
              <p className="text-xs text-gray-400">
                Confirme ou reprecifique o valor de cada item identificado na OS 1 e na OS 2, informe a justificativa e defina a garantia (o anexo de mídia é opcional).
              </p>
              {revisionIndices.map((idx) => {
                const item = checklist[idx]
                return (
                  <div key={item.component} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                    <p className="text-sm font-semibold text-gray-800">{item.component}</p>
                    <div>
                      <label className="label">Valor do orçamento (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quoteValues[idx] ?? (item.value != null ? String(item.value) : '')}
                        onChange={(e) => setQuoteValues((prev) => ({ ...prev, [idx]: e.target.value }))}
                        placeholder="0,00"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Justificativa</label>
                      <textarea
                        value={quoteJustifications[idx] ?? ''}
                        onChange={(e) => setQuoteJustifications((prev) => ({ ...prev, [idx]: e.target.value }))}
                        placeholder="Descreva o que foi feito/identificado neste item..."
                        rows={2}
                        className="input-field text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="label">Garantia (dias)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={quoteWarranties[idx] ?? (item.warranty ? item.warranty.replace(/\D/g, '') : '')}
                          onChange={(e) => setQuoteWarranties((prev) => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Ex: 90"
                          className="input-field pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">dias</span>
                      </div>
                    </div>
                    {(quoteFiles[idx]?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(quoteFiles[idx] ?? []).map((f, fi) => (
                          <span key={fi} className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                            {f.name}
                            <button type="button" onClick={() => setQuoteFiles((prev) => ({ ...prev, [idx]: (prev[idx] ?? []).filter((_, i) => i !== fi) }))}>
                              <X className="w-3 h-3 text-gray-400" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <MediaPickerButtons onFiles={(files) => setQuoteFiles((prev) => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...files] }))} />
                  </div>
                )
              })}
              <p className="text-sm font-bold text-gray-800">
                Novo total: R$ {revisionIndices.reduce((sum, idx) => {
                  const value = quoteValues[idx]?.trim() ? parseFloat(quoteValues[idx]) : (checklist[idx].value ?? 0)
                  return sum + (isNaN(value) ? 0 : value)
                }, 0).toFixed(2)}
              </p>
            </div>
          )}

          <div className="space-y-2 pb-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Itens utilizados no reparo</p>
            <p className="text-xs text-gray-400">
              Busque uma peça do estoque ou digite o nome de uma peça nova para cadastrá-la na hora.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  value={partSearch}
                  onChange={(e) => { setPartSearch(e.target.value); setPartSelectedId(null); setPartSearchOpen(true) }}
                  onFocus={() => setPartSearchOpen(true)}
                  onBlur={() => setTimeout(() => setPartSearchOpen(false), 150)}
                  placeholder="Buscar peça em estoque..."
                  className="input-field text-sm"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name="part-search"
                  data-1p-ignore
                />
                {partSearchOpen && partSuggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                    {partSuggestions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectPartSuggestion(item)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-vr-red transition-colors"
                        >
                          {item.name} <span className="text-xs text-gray-400">({Number(item.quantity)} {item.unit} em estoque)</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddPartClick}
                className="flex items-center gap-1 text-xs font-semibold bg-vr-red text-white rounded-lg px-3 hover:bg-vr-red-dark transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> item
              </button>
            </div>
            {partError && !pendingNewPart && <p className="text-xs text-red-500">{partError}</p>}
            {usedParts.length > 0 && (
              <ul className="space-y-1.5">
                {usedParts.map((part, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-700">
                      {part.name} <span className="text-gray-400">× {part.quantity} {part.unit}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {part.price != null && <span className="text-gray-500 text-xs">R$ {Number(part.price).toFixed(2)}</span>}
                      <button type="button" onClick={() => removeUsedPart(idx)}>
                        <X className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="label">Serviços realizados</label>
            <textarea
              value={completedServices}
              onChange={(e) => setCompletedServices(e.target.value)}
              placeholder="Ex: Troca de tela, Troca de bateria"
              rows={2}
              className="input-field resize-none"
            />
          </div>
          {completionError && <p className="text-xs text-red-500">{completionError}</p>}
          <button
            onClick={handleSaveCompletion}
            disabled={savingCompletion}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {savingCompletion ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
            Concluir e registrar OS
          </button>
        </div>
      )}

      {/* Popup: cadastro dinâmico de peça nova em estoque */}
      {pendingNewPart && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !creatingPart && setPendingNewPart(null)}
        >
          <div
            className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800">Este item ainda não está cadastrado, deseja cadastrar agora?</p>
            <p className="text-xs text-gray-400">
              Será salvo em estoque como &quot;{pendingNewPart.name} {request.phone_model}&quot;.
            </p>
            <div>
              <label className="label">Quantidade em estoque *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPartStock}
                onChange={(e) => setNewPartStock(e.target.value)}
                placeholder="0"
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPartPrice}
                onChange={(e) => setNewPartPrice(e.target.value)}
                placeholder="0,00"
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Garantia *</label>
              <input
                value={newPartWarranty}
                onChange={(e) => setNewPartWarranty(e.target.value)}
                placeholder="Ex: 90 dias"
                className="input-field"
              />
            </div>
            {partError && <p className="text-xs text-red-500">{partError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleConfirmNewPart}
                disabled={creatingPart}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {creatingPart ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                Cadastrar e adicionar
              </button>
              <button
                type="button"
                onClick={() => setPendingNewPart(null)}
                disabled={creatingPart}
                className="text-sm font-semibold text-gray-500 px-3"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {order.closed_at && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Reparo concluído em {new Date(order.closed_at).toLocaleString('pt-BR')}
          </p>
          {order.completed_services && <p className="text-sm text-gray-700"><strong>Serviços:</strong> {order.completed_services}</p>}
          {order.final_value != null && <p className="text-sm text-gray-700"><strong>Valor:</strong> R$ {Number(order.final_value).toFixed(2)}</p>}
          {order.used_parts && order.used_parts.length > 0 && (
            <p className="text-sm text-gray-700">
              <strong>Peças utilizadas:</strong> {order.used_parts.map((p) => `${p.name} (${p.quantity} ${p.unit})`).join(', ')}
            </p>
          )}
          {order.warranty && <p className="text-sm text-gray-700"><strong>Garantia:</strong> {order.warranty}</p>}
          {order.pdf_url ? (
            <div className="flex items-center gap-3 mt-1">
              <a href={order.pdf_url} target="_blank" rel="noreferrer" className="text-sm text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Visualizar OS
              </a>
              <button
                type="button"
                onClick={() => downloadPdf(order.pdf_url!, `OS-${order.id.slice(0, 8)}.pdf`)}
                className="text-sm text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar PDF
              </button>
            </div>
          ) : !readOnly && (
            <div className="mt-1 space-y-1">
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={generatingPdf}
                className="text-sm text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {generatingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Gerar PDF da OS
              </button>
              {pdfError && <p className="text-xs text-red-500">{pdfError}</p>}
            </div>
          )}

          {!readOnly && (
            <div className="pt-2 mt-1 border-t border-green-100">
              {confirmingReopen ? (
                <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Reabrir a OS libera o acompanhamento (OS 2) e a conclusão/garantia para edição. O PDF atual continuará acessível até que um novo seja gerado.
                  </p>
                  <div>
                    <label className="label">Motivo da reabertura *</label>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Descreva por que esta OS está sendo reaberta..."
                      rows={2}
                      className="input-field text-sm resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={reopening || !reopenReason.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg px-3 py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
                    >
                      {reopening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Confirmar reabertura
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmingReopen(false); setReopenReason('') }}
                      disabled={reopening}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReopen(true)}
                  className="text-sm text-gray-500 hover:text-amber-600 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reabrir ordem de serviço
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
