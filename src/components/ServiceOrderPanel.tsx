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

// Data em que a garantia de um componente reparado expira (null = sem garantia informada/iniciada ainda).
function computeWarrantyExpiry(addedAt: string | null | undefined, warrantyDays: number | null | undefined): Date | null {
  if (!warrantyDays || !addedAt) return null
  const expiry = new Date(addedAt)
  expiry.setDate(expiry.getDate() + warrantyDays)
  return expiry
}

function isWarrantyActive(addedAt: string | null | undefined, warrantyDays: number | null | undefined): boolean {
  const expiry = computeWarrantyExpiry(addedAt, warrantyDays)
  return !!expiry && new Date() <= expiry
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
  const [savingChecklist, setSavingChecklist] = useState(false)

  const [updatingComponent, setUpdatingComponent] = useState<string | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [updateFiles, setUpdateFiles] = useState<File[]>([])
  const [addingUpdate, setAddingUpdate] = useState(false)

  const [completedServices, setCompletedServices] = useState('')
  const [savingCompletion, setSavingCompletion] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [confirmingReopen, setConfirmingReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [reopening, setReopening] = useState(false)

  const [conclusionValueDrafts, setConclusionValueDrafts] = useState<Record<number, string>>({})
  const [conclusionNoteDrafts, setConclusionNoteDrafts] = useState<Record<number, string>>({})

  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [pendingStockItem, setPendingStockItem] = useState<{ idx: number; name: string } | null>(null)
  const [newPartStock, setNewPartStock] = useState('')
  const [newPartPrice, setNewPartPrice] = useState('')
  const [newPartWarranty, setNewPartWarranty] = useState('')
  const [creatingPart, setCreatingPart] = useState(false)
  const [partError, setPartError] = useState<string | null>(null)
  const [similarSearch, setSimilarSearch] = useState('')
  const [similarSearchOpen, setSimilarSearchOpen] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)

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

  // Marcar um componente já dispara a resolução com o estoque: busca o item cadastrado
  // ("{componente} {modelo do aparelho}") e, se não existir, abre o popup de cadastro dinâmico.
  const resolveStockForComponent = (idx: number, component: string) => {
    const fullName = `${component} ${request.phone_model}`.trim()
    const matched = stockItems.find((s) => s.name.toLowerCase() === fullName.toLowerCase())
    if (matched) {
      setChecklist((prev) => prev.map((it, i) => (i === idx ? {
        ...it,
        stock_item_id: matched.id,
        value: it.value ?? matched.price ?? null,
        warranty_days: matched.warranty_days ?? null,
      } : it)))
      return
    }
    setPendingStockItem({ idx, name: fullName })
    setNewPartStock('')
    setNewPartPrice('')
    setNewPartWarranty('')
    setPartError(null)
    setSimilarSearch('')
  }

  const toggleChecklistItem = (idx: number, checked: boolean) => {
    setChecklist((prev) => prev.map((item, i) => (i === idx ? { ...item, checked } : item)))
    if (!checked) return
    const item = checklist[idx]
    if (item.stock_item_id) return
    resolveStockForComponent(idx, item.component)
  }

  // Cadastra a peça nova em estoque (nome = componente + modelo do aparelho da OS) e já a vincula ao item da checklist.
  const handleConfirmNewStockItem = async () => {
    if (!pendingStockItem) return
    setPartError(null)
    const stockQty = parseFloat(newPartStock)
    if (!newPartStock || isNaN(stockQty) || stockQty < 0) {
      setPartError('Informe uma quantidade de estoque válida.')
      return
    }
    const priceNum = parseFloat(newPartPrice)
    if (!newPartPrice || isNaN(priceNum) || priceNum < 0) {
      setPartError('Informe o valor do reparo.')
      return
    }
    if (!newPartWarranty.trim()) {
      setPartError('Informe a garantia da peça.')
      return
    }
    const warrantyDays = parseInt(newPartWarranty, 10)
    if (isNaN(warrantyDays) || warrantyDays < 0) {
      setPartError('Informe a garantia em dias (número).')
      return
    }

    setCreatingPart(true)
    const supabase = createClient()

    const { data: created, error } = await supabase
      .from('stock_items')
      .insert({ name: pendingStockItem.name, quantity: stockQty, unit: 'unidade', price: priceNum, warranty_days: warrantyDays })
      .select()
      .single()

    if (error || !created) {
      setPartError(error?.code === '23505' ? 'Já existe um item de estoque com este nome.' : 'Não foi possível cadastrar o item.')
      setCreatingPart(false)
      return
    }

    const item = created as StockItem
    setStockItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))
    setChecklist((prev) => prev.map((it, i) => (i === pendingStockItem.idx ? {
      ...it,
      stock_item_id: item.id,
      value: it.value ?? item.price ?? null,
      warranty_days: item.warranty_days ?? null,
    } : it)))
    setPendingStockItem(null)
    setCreatingPart(false)
  }

  // Usa uma peça já cadastrada em outro modelo/aparelho pra este reparo (sem criar item novo) —
  // pro caso de não ter a peça exata mas existir uma similar que encaixa pra fazer o reparo.
  const selectSimilarComponent = (stockItem: StockItem) => {
    if (!pendingStockItem) return
    setChecklist((prev) => prev.map((it, i) => (i === pendingStockItem.idx ? {
      ...it,
      stock_item_id: stockItem.id,
      value: it.value ?? stockItem.price ?? null,
      warranty_days: stockItem.warranty_days ?? null,
    } : it)))
    setPendingStockItem(null)
    setSimilarSearch('')
    setSimilarSearchOpen(false)
  }

  const similarSuggestions = similarSearch.trim()
    ? stockItems.filter((i) => i.name.toLowerCase().includes(similarSearch.trim().toLowerCase())).slice(0, 6)
    : []

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

  // Checklist (OS1) fica editável durante todo o "em reparo" — pode ser salva quantas vezes for preciso.
  // Nunca pode ser salva com um componente marcado sem peça de estoque vinculada.
  const handleSaveChecklist = async () => {
    if (!order) return
    setChecklistError(null)
    const unresolved = checklist.filter((i) => i.checked && !i.stock_item_id)
    if (unresolved.length > 0) {
      setChecklistError(`Vincule uma peça de estoque para: ${unresolved.map((i) => i.component).join(', ')}.`)
      return
    }

    setSavingChecklist(true)
    const supabase = createClient()

    const updatedChecklist = await Promise.all(
      checklist.map(async (item, idx) => {
        const files = checklistFiles[idx] ?? []
        if (files.length === 0) return item
        const uploaded = await uploadMedia(supabase, order.id, files, `checklist-${idx}`)
        return { ...item, media_urls: [...(item.media_urls ?? []), ...uploaded] }
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

    const checkedItemsNow = updatedChecklist.filter((i) => i.checked)
    const summary = checkedItemsNow.length
      ? checkedItemsNow.map((i) => `${i.component}${i.description ? `: ${i.description}` : ''}${i.value != null ? ` (R$ ${Number(i.value).toFixed(2)})` : ''}`).join('; ')
      : 'Nenhum componente marcado'

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, action_type: 'checklist_update', message: `Checklist de avaliação atualizado — ${summary}` })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])

    const itemsWithValue = checkedItemsNow.filter((i) => i.value != null)
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

  // OS2: atualização vinculada a um componente específico já selecionado na checklist.
  const handleAddUpdate = async (component: string) => {
    if (!order) return
    if (!updateText.trim() && updateFiles.length === 0) return
    setAddingUpdate(true)
    const supabase = createClient()
    const mediaUrls = await uploadMedia(supabase, order.id, updateFiles, 'update')

    const { data: inserted } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, message: updateText.trim() || null, media_urls: mediaUrls, action_type: 'update', component })
      .select()
      .single()

    if (inserted) setUpdates((prev) => [...prev, inserted as ServiceOrderUpdate])
    setUpdateText('')
    setUpdateFiles([])
    setUpdatingComponent(null)
    setAddingUpdate(false)
  }

  // Conclusão = os próprios itens marcados na checklist (OS1), com valor/observação editáveis e
  // garantia vinda do cadastro da peça. Numa reabertura, itens já comprometidos (added_at setado
  // numa conclusão anterior) ficam travados — só itens novos (recém-marcados) entram na conta.
  const handleSaveCompletion = async () => {
    if (!order) return
    setCompletionError(null)
    setSavingCompletion(true)
    const supabase = createClient()
    const closedAt = new Date().toISOString()

    const updatedChecklist = checklist.map((item) => {
      if (!item.checked || item.added_at) return item
      return { ...item, added_at: closedAt }
    })

    const checkedItemsNow = updatedChecklist.filter((i) => i.checked)
    const newItems = checkedItemsNow.filter((i) => i.added_at === closedAt)
    const newTotal = newItems.reduce((sum, i) => sum + (i.value ?? 0), 0)

    const isFirstConclusion = !everCompleted
    const previousFinalValue = order.final_value ?? 0
    const finalValue = isFirstConclusion
      ? (checkedItemsNow.length > 0 ? newTotal : (quoteValue ?? 0))
      : previousFinalValue + newTotal

    const warrantySummary = checkedItemsNow.length > 0
      ? checkedItemsNow.map((i) => `${i.component}: ${i.warranty_days != null ? `${i.warranty_days} dias` : 'não informada'}`).join('; ')
      : null

    // Só registra saída de estoque para itens realmente novos desde a última conclusão
    // (evita decrementar de novo os mesmos componentes se a OS for reaberta e salva outra vez).
    for (const item of newItems) {
      if (!item.stock_item_id) continue
      await supabase.from('stock_movements').insert({ item_id: item.stock_item_id, type: 'saida', quantity: 1, unit: 'unidade' })
    }

    let pdf_url: string | null = null
    try {
      const usedPartsForPdf: UsedPart[] = checkedItemsNow.map((i) => ({
        stock_item_id: i.stock_item_id ?? null,
        name: i.component,
        quantity: 1,
        unit: 'unidade',
        price: i.value ?? null,
        note: i.note ?? null,
        warranty_days: i.warranty_days ?? null,
        added_at: i.added_at ?? closedAt,
      }))
      const pdfBlob = await generateServiceOrderPdf({
        request,
        orderId: order.id,
        checklist: updatedChecklist,
        usedParts: usedPartsForPdf,
        completedServices: completedServices || null,
        warranty: warrantySummary,
        finalValue,
        closedAt,
        updates,
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
        pdf_url,
        closed_at: closedAt,
        updated_at: closedAt,
      })
      .eq('id', order.id)
      .select()
      .single()

    if (updated) setOrder(updated as ServiceOrder)
    setChecklist(updatedChecklist)

    const { error: quoteErr } = await supabase
      .from('service_requests')
      .update({ quote_value: finalValue })
      .eq('id', requestId)
    if (!quoteErr) onQuoteValueChange?.(finalValue)

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

  const updateConclusionValue = (idx: number, raw: string) => {
    setConclusionValueDrafts((prev) => ({ ...prev, [idx]: raw }))
    const parsed = raw.trim() ? parseFloat(raw) : null
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, value: parsed != null && !isNaN(parsed) ? parsed : null } : it)))
  }

  const updateConclusionNote = (idx: number, raw: string) => {
    setConclusionNoteDrafts((prev) => ({ ...prev, [idx]: raw }))
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, note: raw } : it)))
  }

  // Gera o PDF para OS já concluídas antes desta funcionalidade existir (sem pdf_url).
  const handleGeneratePdf = async () => {
    if (!order || !order.closed_at) return
    setGeneratingPdf(true)
    setPdfError(null)
    try {
      const supabase = createClient()
      const usedPartsForPdf: UsedPart[] = (order.checklist ?? []).filter((i) => i.checked).map((i) => ({
        stock_item_id: i.stock_item_id ?? null,
        name: i.component,
        quantity: 1,
        unit: 'unidade',
        price: i.value ?? null,
        note: i.note ?? null,
        warranty_days: i.warranty_days ?? null,
        added_at: i.added_at ?? order.closed_at ?? new Date().toISOString(),
      }))
      const pdfBlob = await generateServiceOrderPdf({
        request,
        orderId: order.id,
        checklist: order.checklist,
        usedParts: usedPartsForPdf,
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
  const resolvedItems = checklist.filter((i) => i.checked && i.stock_item_id)
  const everCompleted = updates.some((u) => u.action_type === 'completed')
  // OS1 e OS2 ficam disponíveis juntas (e editáveis) durante todo o "em reparo" — inclusive
  // depois de reabrir uma OS já concluída antes.
  const osOpenForRepair = !order.closed_at && (status === 'in_progress' || everCompleted)
  const showChecklist = osOpenForRepair
  const showTimeline = osOpenForRepair
  const checklistEditable = showChecklist && !readOnly
  const updatesEditable = showTimeline && !readOnly
  const showCompletion = !readOnly && !order.closed_at && (status === 'completed' || everCompleted)
  const showClosedSummary = !!order.closed_at
  // Reabrir só é permitido se ainda houver garantia ativa em algum componente já comprometido
  // (ou se nenhum componente foi comprometido ainda, caso em que não há garantia pra checar).
  const committedItems = (order.checklist ?? []).filter((i) => i.checked && i.added_at)
  const canReopen = committedItems.length === 0 || committedItems.some((i) => isWarrantyActive(i.added_at, i.warranty_days))

  // Fora dessas condições (ex: status "aceito pelo cliente"), nenhuma OS deve aparecer na tela
  if (!showChecklist && !showTimeline && !showCompletion && !showClosedSummary) return null

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" />
        Ordem de serviço
      </h3>

      {/* Checklist — formulário 1: editável durante todo o "em reparo" */}
      {showChecklist && (
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist de avaliação</p>
        {checklistEditable ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              Marque os componentes com problema, descreva o estado e anexe fotos/vídeos. Ao marcar, o componente já é vinculado a uma peça do estoque — o valor do reparo vem de lá.
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
                      {item.stock_item_id ? (
                        <p className="text-xs text-green-600">
                          Peça vinculada{item.value != null ? ` · R$ ${Number(item.value).toFixed(2)}` : ''}{item.warranty_days != null ? ` · garantia ${item.warranty_days} dias` : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">Peça ainda não vinculada ao estoque.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {checklistError && <p className="text-xs text-red-500">{checklistError}</p>}
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

      {/* Timeline — formulário 2: um container por componente já selecionado na checklist */}
      {showTimeline && (
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acompanhamento / linha do tempo</p>
        {resolvedItems.length === 0 ? (
          <p className="text-sm text-gray-400">Marque e vincule a uma peça de estoque ao menos um componente na checklist (OS 1) para registrar atualizações.</p>
        ) : (
          <div className="space-y-3">
            {resolvedItems.map((item) => {
              const componentUpdates = updates.filter((u) => u.action_type === 'update' && u.component === item.component)
              const isUpdatingThis = updatingComponent === item.component
              return (
                <div key={item.component} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-800">{item.component}</p>
                  {componentUpdates.length === 0 ? (
                    <p className="text-xs text-gray-400">Sem atualizações ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {componentUpdates.map((u) => (
                        <li key={u.id} className="text-sm border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                          <span className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString('pt-BR')}</span>
                          {u.message && <p className="text-gray-700 mt-0.5">{u.message}</p>}
                          {u.media_urls?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {u.media_urls.map((url) => (
                                <MediaThumb key={url} url={url} size="sm" />
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {updatesEditable && (
                    isUpdatingThis ? (
                      <div className="space-y-1.5 pt-2 border-t border-gray-100">
                        <textarea
                          value={updateText}
                          onChange={(e) => setUpdateText(e.target.value)}
                          placeholder="Descreva uma ocorrência/atualização deste componente..."
                          rows={2}
                          className="input-field text-sm resize-none"
                        />
                        {updateFiles.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {updateFiles.map((f, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                                {f.name}
                                <button type="button" onClick={() => setUpdateFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                                  <X className="w-3 h-3 text-gray-400" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <MediaPickerButtons onFiles={(files) => setUpdateFiles((prev) => [...prev, ...files])} />
                          <button
                            onClick={() => handleAddUpdate(item.component)}
                            disabled={addingUpdate || (!updateText.trim() && updateFiles.length === 0)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-vr-red text-white rounded-lg px-3 py-2 hover:bg-vr-red-dark transition-colors disabled:opacity-50"
                          >
                            {addingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Adicionar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setUpdatingComponent(null); setUpdateText(''); setUpdateFiles([]) }}
                            disabled={addingUpdate}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setUpdatingComponent(item.component); setUpdateText(''); setUpdateFiles([]) }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-vr-red hover:text-vr-red-dark transition-colors pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Atualização
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* Conclusão — trabalha apenas sobre os componentes já marcados na checklist (OS1) */}
      {showCompletion && (
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Concluir ordem de serviço</p>

          {checkedItems.length > 0 && (
            <div className="space-y-3 pb-3 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Itens reparados</p>
              <p className="text-xs text-gray-400">
                Confirme o valor de cada componente selecionado na checklist — a garantia vem do cadastro da peça.
              </p>
              {checklist.map((item, idx) => {
                if (!item.checked) return null
                const locked = !!item.added_at
                const expiry = computeWarrantyExpiry(item.added_at, item.warranty_days)
                const expired = locked && !!expiry && new Date() > expiry
                return (
                  <div key={item.component} className={`rounded-xl border p-3 space-y-2 ${locked ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
                    <p className="text-sm font-semibold text-gray-800">{item.component}</p>
                    <div>
                      <label className="label">Valor do reparo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={locked}
                        value={conclusionValueDrafts[idx] ?? (item.value != null ? String(item.value) : '')}
                        onChange={(e) => updateConclusionValue(idx, e.target.value)}
                        placeholder="0,00"
                        className="input-field disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="label">Observação (opcional)</label>
                      <input
                        disabled={locked}
                        value={conclusionNoteDrafts[idx] ?? (item.note ?? '')}
                        onChange={(e) => updateConclusionNote(idx, e.target.value)}
                        placeholder="Detalhe algo sobre este item, se necessário..."
                        className="input-field text-sm disabled:opacity-60"
                      />
                    </div>
                    <p className={`text-xs ${expired ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                      {item.warranty_days == null
                        ? 'Garantia não informada'
                        : locked
                          ? expired
                            ? `Garantia expirada em ${expiry!.toLocaleDateString('pt-BR')}`
                            : `Garantia: ${item.warranty_days} dias (até ${expiry!.toLocaleDateString('pt-BR')})`
                          : `Garantia: ${item.warranty_days} dias (a partir da conclusão)`}
                    </p>
                  </div>
                )
              })}
              <p className="text-sm font-bold text-gray-800">
                Valor total do serviço: R$ {checklist
                  .filter((i) => i.checked && !i.added_at)
                  .reduce((sum, i) => sum + (i.value ?? 0), 0)
                  .toFixed(2)}
              </p>
            </div>
          )}

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

      {/* Popup: cadastro dinâmico de peça nova em estoque, disparado ao marcar um componente na checklist */}
      {pendingStockItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !creatingPart && setPendingStockItem(null)}
        >
          <div
            className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800">Este item ainda não está cadastrado, deseja cadastrar agora?</p>
            <p className="text-xs text-gray-400">
              Será salvo em estoque como &quot;{pendingStockItem.name}&quot;.
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
              <label className="label">Valor do reparo (R$) *</label>
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
              <label className="label">Garantia (dias) *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={newPartWarranty}
                onChange={(e) => setNewPartWarranty(e.target.value)}
                placeholder="Ex: 90"
                className="input-field"
              />
            </div>
            {partError && <p className="text-xs text-red-500">{partError}</p>}
            <button
              onClick={handleConfirmNewStockItem}
              disabled={creatingPart}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {creatingPart ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
              Cadastrar e vincular
            </button>

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-sm font-semibold text-gray-800">Deseja usar o mesmo componente de outro modelo para este reparo?</p>
              <p className="text-xs text-gray-400">
                Se não tiver a peça exata, busque uma já cadastrada em outro aparelho que sirva pra este reparo.
              </p>
              <div className="relative">
                <input
                  value={similarSearch}
                  onChange={(e) => { setSimilarSearch(e.target.value); setSimilarSearchOpen(true) }}
                  onFocus={() => setSimilarSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSimilarSearchOpen(false), 150)}
                  placeholder="Buscar peça já cadastrada..."
                  className="input-field text-sm"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name="similar-search"
                  data-1p-ignore
                />
                {similarSearchOpen && similarSuggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                    {similarSuggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSimilarComponent(s)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-vr-red transition-colors"
                        >
                          {s.name}
                          <span className="text-xs text-gray-400">
                            {' '}(R$ {Number(s.price ?? 0).toFixed(2)}{s.warranty_days != null ? ` · ${s.warranty_days} dias` : ''})
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPendingStockItem(null)}
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
          {(order.checklist ?? []).filter((i) => i.checked).length > 0 && (
            <p className="text-sm text-gray-700">
              <strong>Componentes reparados:</strong> {(order.checklist ?? []).filter((i) => i.checked).map((i) => i.component).join(', ')}
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

          {!readOnly && !canReopen && (
            <div className="pt-2 mt-1 border-t border-green-100">
              <p className="text-xs text-red-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Todas as garantias dos componentes reparados já expiraram — não é possível reabrir esta OS.
              </p>
            </div>
          )}

          {!readOnly && canReopen && (
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
