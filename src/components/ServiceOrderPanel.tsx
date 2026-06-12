'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ServiceOrder, ServiceOrderChecklistItem, ServiceOrderUpdate, ServiceStatus } from '@/lib/types'
import { SERVICE_ORDER_COMPONENTS, SITE_URL } from '@/lib/constants'
import {
  ClipboardList,
  Loader2,
  CheckSquare,
  Square,
  Plus,
  Paperclip,
  X,
  Wrench,
  PackageCheck,
  FileText,
  ShieldCheck,
} from 'lucide-react'

const ACTIVE_STATUSES: ServiceStatus[] = [
  'accepted', 'retirada_local', 'em_busca', 'in_progress', 'em_entrega', 'completed',
]

export function isServiceOrderStatus(status: ServiceStatus) {
  return ACTIVE_STATUSES.includes(status)
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(url)
}

function buildInitialChecklist(): ServiceOrderChecklistItem[] {
  return SERVICE_ORDER_COMPONENTS.map((component) => ({ component, checked: false, description: '' }))
}

const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  created: { label: 'OS aberta', icon: <ClipboardList className="w-4 h-4" /> },
  checklist_update: { label: 'Checklist atualizado', icon: <Wrench className="w-4 h-4" /> },
  update: { label: 'Atualização', icon: <Wrench className="w-4 h-4" /> },
  completed: { label: 'Reparo concluído', icon: <PackageCheck className="w-4 h-4" /> },
}

export default function ServiceOrderPanel({
  requestId,
  status,
  quoteValue,
  customerPhone,
  phoneModel,
  readOnly = false,
}: {
  requestId: string
  status: ServiceStatus
  quoteValue?: number | null
  customerPhone?: string
  phoneModel?: string
  readOnly?: boolean
}) {
  const [order, setOrder] = useState<ServiceOrder | null>(null)
  const [updates, setUpdates] = useState<ServiceOrderUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState<ServiceOrderChecklistItem[]>([])
  const [savingChecklist, setSavingChecklist] = useState(false)

  const [newMessage, setNewMessage] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [addingUpdate, setAddingUpdate] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [completedServices, setCompletedServices] = useState('')
  const [warranty, setWarranty] = useState('')
  const [finalValue, setFinalValue] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [savingCompletion, setSavingCompletion] = useState(false)

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
      setWarranty(rest.warranty ?? '')
      setFinalValue(rest.final_value != null ? String(rest.final_value) : (quoteValue != null ? String(quoteValue) : ''))
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
        setFinalValue(quoteValue != null ? String(quoteValue) : '')
        const { data: logEntry } = await supabase
          .from('service_order_updates')
          .insert({ service_order_id: created.id, action_type: 'created', message: 'Ordem de serviço aberta' })
          .select()
          .single()
        if (logEntry) setUpdates([logEntry as ServiceOrderUpdate])
      }
    }
    setLoading(false)
  }, [requestId, readOnly, quoteValue])

  useEffect(() => {
    load()
  }, [load])

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

  const toggleChecklistItem = (idx: number, checked: boolean) => {
    setChecklist((prev) => prev.map((item, i) => (i === idx ? { ...item, checked } : item)))
  }

  const updateChecklistDescription = (idx: number, description: string) => {
    setChecklist((prev) => prev.map((item, i) => (i === idx ? { ...item, description } : item)))
  }

  const handleSaveChecklist = async () => {
    if (!order) return
    setSavingChecklist(true)
    const supabase = createClient()
    const { data: updated } = await supabase
      .from('service_orders')
      .update({ checklist, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select()
      .single()
    if (updated) setOrder(updated as ServiceOrder)

    const checkedItems = checklist.filter((i) => i.checked)
    const summary = checkedItems.length
      ? checkedItems.map((i) => `${i.component}${i.description ? `: ${i.description}` : ''}`).join('; ')
      : 'Nenhum componente marcado'

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, action_type: 'checklist_update', message: `Checklist atualizado — ${summary}` })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])
    setSavingChecklist(false)
  }

  const handleAddUpdate = async () => {
    if (!order) return
    if (!newMessage.trim() && newFiles.length === 0) return
    setAddingUpdate(true)
    const supabase = createClient()
    const mediaUrls: string[] = []

    for (const file of newFiles) {
      const ext = file.name.split('.').pop()
      const fileName = `${order.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('service-order-media').upload(fileName, file)
      if (!upErr) {
        const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
        mediaUrls.push(pub.publicUrl)
      }
    }

    const { data: inserted } = await supabase
      .from('service_order_updates')
      .insert({ service_order_id: order.id, message: newMessage.trim() || null, media_urls: mediaUrls, action_type: 'update' })
      .select()
      .single()

    if (inserted) setUpdates((prev) => [...prev, inserted as ServiceOrderUpdate])
    setNewMessage('')
    setNewFiles([])
    setAddingUpdate(false)
  }

  const handleSaveCompletion = async () => {
    if (!order) return
    setSavingCompletion(true)
    const supabase = createClient()
    let pdf_url = order.pdf_url

    if (pdfFile) {
      const fileName = `${order.id}/os-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('service-order-media').upload(fileName, pdfFile)
      if (!upErr) {
        const { data: pub } = supabase.storage.from('service-order-media').getPublicUrl(fileName)
        pdf_url = pub.publicUrl
      }
    }

    const { data: updated } = await supabase
      .from('service_orders')
      .update({
        completed_services: completedServices || null,
        warranty: warranty || null,
        final_value: finalValue ? parseFloat(finalValue) : null,
        pdf_url,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single()

    if (updated) setOrder(updated as ServiceOrder)

    const { data: logEntry } = await supabase
      .from('service_order_updates')
      .insert({
        service_order_id: order.id,
        action_type: 'completed',
        message: `Reparo concluído — ${completedServices || 'serviços realizados'}. Valor: R$ ${Number(finalValue || 0).toFixed(2)}. Garantia: ${warranty || 'não informada'}.`,
      })
      .select()
      .single()
    if (logEntry) setUpdates((prev) => [...prev, logEntry as ServiceOrderUpdate])

    if (customerPhone) {
      const phoneDigits = customerPhone.replace(/\D/g, '')
      const services = completedServices
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `*${s}*`)
        .join(', ')
      const waMsg = [
        `Seu aparelho${phoneModel ? ` *${phoneModel}*` : ''} foi reparado com sucesso! 🎉`,
        services ? `Serviços realizados: ${services}` : null,
        `Orçamento no valor de: R$ ${Number(finalValue || 0).toFixed(2)}`,
        `Garantia do serviço: ${warranty || 'não informada'}`,
        `Ordem de serviço: ${pdf_url || `${SITE_URL}/consultar?phone=${phoneDigits}`}`,
      ].filter(Boolean).join('\n')
      window.open(`https://wa.me/55${phoneDigits}?text=${encodeURIComponent(waMsg)}`, '_blank')
    }

    setSavingCompletion(false)
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

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" />
        Ordem de serviço
      </h3>

      {/* Checklist */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist de avaliação</p>
        {readOnly ? (
          checkedItems.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum item registrado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {checkedItems.map((item) => (
                <li key={item.component} className="text-sm">
                  <span className="font-semibold text-gray-800">{item.component}</span>
                  {item.description && <span className="text-gray-600"> — {item.description}</span>}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-2">
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
                    <textarea
                      value={item.description}
                      onChange={(e) => updateChecklistDescription(idx, e.target.value)}
                      placeholder="Descreva o estado atual deste item..."
                      rows={2}
                      className="input-field text-xs resize-none mt-1"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveChecklist}
              disabled={savingChecklist}
              className="text-xs font-semibold text-vr-red hover:text-vr-red-dark transition-colors flex items-center gap-1"
            >
              {savingChecklist ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
              Salvar checklist
            </button>
          </div>
        )}
      </div>

      {/* Timeline */}
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
                          isVideo(url) ? (
                            <video key={url} src={url} controls className="w-28 h-28 object-cover rounded-lg border border-gray-200" />
                          ) : (
                            <a key={url} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt="Mídia da OS" className="w-28 h-28 object-cover rounded-lg border border-gray-200" />
                            </a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!readOnly && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-vr-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Anexar mídia
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => setNewFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              />
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

      {/* Conclusão */}
      {status === 'completed' && !readOnly && !order.closed_at && (
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Concluir ordem de serviço</p>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Valor final (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={finalValue}
                onChange={(e) => setFinalValue(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Garantia</label>
              <input
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                placeholder="Ex: 90 dias"
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="label">Arquivo da OS (PDF) <span className="font-normal text-gray-400">(opcional)</span></label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
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

      {order.closed_at && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Reparo concluído em {new Date(order.closed_at).toLocaleString('pt-BR')}
          </p>
          {order.completed_services && <p className="text-sm text-gray-700"><strong>Serviços:</strong> {order.completed_services}</p>}
          {order.final_value != null && <p className="text-sm text-gray-700"><strong>Valor:</strong> R$ {Number(order.final_value).toFixed(2)}</p>}
          {order.warranty && <p className="text-sm text-gray-700"><strong>Garantia:</strong> {order.warranty}</p>}
          {order.pdf_url && (
            <a href={order.pdf_url} target="_blank" rel="noreferrer" className="text-sm text-vr-red hover:text-vr-red-dark font-semibold flex items-center gap-1 mt-1">
              <FileText className="w-3.5 h-3.5" />
              Ver ordem de serviço (PDF)
            </a>
          )}
        </div>
      )}
    </section>
  )
}
