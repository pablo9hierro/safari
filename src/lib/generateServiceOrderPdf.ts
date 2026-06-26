import jsPDF from 'jspdf'
import { ServiceOrderChecklistItem, ServiceOrderUpdate, ServiceRequest, UsedPart } from './types'
import { SITE_URL, STORE_ADDRESS } from './constants'

function formatPartWarranty(part: UsedPart): string {
  if (part.warranty_days == null) return '—'
  if (!part.added_at) return `${part.warranty_days} dias`
  const expiry = new Date(part.added_at)
  expiry.setDate(expiry.getDate() + part.warranty_days)
  const expired = new Date() > expiry
  return expired
    ? `Expirada em ${expiry.toLocaleDateString('pt-BR')}`
    : `${part.warranty_days} dias (até ${expiry.toLocaleDateString('pt-BR')})`
}

type RGB = readonly [number, number, number]

const VR_RED: RGB = [224, 33, 26]
const VR_BLACK: RGB = [10, 10, 11]
const DARK: RGB = [30, 30, 32]
const GRAY: RGB = [139, 139, 148]
const GRAY_LIGHT: RGB = [188, 188, 195]
const LIGHT_BG: RGB = [245, 245, 247]
const BORDER: RGB = [228, 228, 231]
const WHITE: RGB = [255, 255, 255]
const GREEN: RGB = [22, 153, 84]

const ACTION_LABELS: Record<string, string> = {
  update: 'Atualização do reparo',
  reopened: 'OS reaberta',
}

const MIME_TO_FORMAT: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
}

function isImageUrl(url: string) {
  return !/\.(mp4|mov|webm|m4v)$/i.test(url)
}

async function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number; format: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const format = MIME_TO_FORMAT[blob.type]
    if (!format) return null

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })

    return { dataUrl, format, ...dims }
  } catch {
    return null
  }
}

export async function generateServiceOrderPdf({
  request,
  orderId,
  checklist,
  usedParts,
  completedServices,
  warranty,
  finalValue,
  closedAt,
  updates,
}: {
  request: ServiceRequest
  orderId: string
  checklist: ServiceOrderChecklistItem[]
  usedParts: UsedPart[]
  completedServices: string | null
  warranty: string | null
  finalValue: number | null
  closedAt: string
  updates: ServiceOrderUpdate[]
}): Promise<Blob> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 16
  const marginBottom = 22
  const contentWidth = pageWidth - marginX * 2
  const osNumber = orderId.slice(0, 8).toUpperCase()
  const HEADER_HEIGHT = 36
  const BANNER_H = 9
  const CONTAINER_GAP = 9
  let y = 0
  let currentPage = 1
  let containerBounds: { page: number; top: number; bottom: number }[] | null = null

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

  // ---------- ícones vetoriais (sem emoji) ----------
  const checkSquare = (x: number, top: number, size: number, bg: RGB, fg: RGB) => {
    setFill(bg)
    doc.roundedRect(x, top, size, size, size * 0.25, size * 0.25, 'F')
    setDraw(fg)
    doc.setLineWidth(0.5)
    doc.line(x + size * 0.22, top + size * 0.52, x + size * 0.42, top + size * 0.74)
    doc.line(x + size * 0.42, top + size * 0.74, x + size * 0.8, top + size * 0.26)
  }

  const clockIcon = (x: number, top: number, size: number, color: RGB) => {
    const cx = x + size / 2
    const cy = top + size / 2
    const r = size / 2
    setDraw(color)
    doc.setLineWidth(0.45)
    doc.circle(cx, cy, r, 'S')
    doc.line(cx, cy, cx, cy - r * 0.55)
    doc.line(cx, cy, cx + r * 0.4, cy)
  }

  // ---------- layout helpers ----------
  const startNewPage = () => {
    if (containerBounds) {
      containerBounds[containerBounds.length - 1].bottom = pageHeight - marginBottom + 3
    }
    doc.addPage()
    currentPage += 1
    setFill(VR_RED)
    doc.rect(0, 0, pageWidth, 1.6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setText(DARK)
    doc.text('VR TECH', marginX, 11)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setText(GRAY)
    doc.text(`Ordem de Serviço Nº ${osNumber}`, pageWidth - marginX, 11, { align: 'right' })
    setDraw(BORDER)
    doc.setLineWidth(0.3)
    doc.line(marginX, 14.5, pageWidth - marginX, 14.5)
    y = 22
    if (containerBounds) {
      containerBounds.push({ page: currentPage, top: y, bottom: y })
    }
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) startNewPage()
  }

  // Caixa visual que agrupa um bloco de conteúdo (cliente, aparelho, loja, OS...).
  // O contorno é desenhado no final, em todas as páginas que o bloco ocupou,
  // sempre com folga fixa (CONTAINER_GAP) antes do próximo container começar.
  const beginContainer = (title: string) => {
    ensureSpace(BANNER_H + 14)
    const top = y
    containerBounds = [{ page: currentPage, top, bottom: top }]
    setFill(VR_BLACK)
    doc.rect(marginX, y, contentWidth, BANNER_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    setText(WHITE)
    doc.text(title.toUpperCase(), marginX + 4, y + BANNER_H / 2 + 1.2)
    y += BANNER_H + 6
  }

  const endContainer = () => {
    if (!containerBounds) return
    const bottom = y + 5
    containerBounds[containerBounds.length - 1].bottom = bottom
    for (const b of containerBounds) {
      doc.setPage(b.page)
      setDraw(VR_RED)
      doc.setLineWidth(0.6)
      doc.roundedRect(marginX - 2, b.top, contentWidth + 4, b.bottom - b.top, 2, 2, 'S')
    }
    doc.setPage(currentPage)
    containerBounds = null
    y = bottom + CONTAINER_GAP
  }

  // Título grande e destacado para as subseções dentro da caixa da OS
  const bigHeading = (title: string) => {
    y += 3
    ensureSpace(16)
    setFill(VR_RED)
    doc.roundedRect(marginX + 2, y - 4, 4, 4, 1, 1, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    setText(DARK)
    doc.text(title.toUpperCase(), marginX + 9, y)
    y += 3
    setDraw(VR_RED)
    doc.setLineWidth(0.4)
    doc.line(marginX + 2, y, pageWidth - marginX - 2, y)
    y += 6.5
  }

  const field = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value || '-', contentWidth - 6)
    ensureSpace(lines.length * 5.2 + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(GRAY)
    doc.text(label.toUpperCase(), marginX + 3, y)
    y += 4.8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setText(DARK)
    doc.text(lines, marginX + 3, y)
    y += lines.length * 5.2 + 3.5
  }

  // =====================================================
  // Cabeçalho
  // =====================================================
  setFill(VR_BLACK)
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F')
  setFill(VR_RED)
  doc.rect(0, HEADER_HEIGHT, pageWidth, 1.4, 'F')

  // Marca
  setFill(VR_RED)
  doc.roundedRect(marginX, 10, 12, 12, 2.6, 2.6, 'F')
  setDraw(WHITE)
  doc.setLineWidth(1.1)
  doc.line(marginX + 3, 13, marginX + 6.2, 19)
  doc.line(marginX + 6.2, 19, marginX + 9.5, 10.8)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setText(WHITE)
  doc.text('VR TECH', marginX + 16, 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setText(GRAY_LIGHT)
  doc.text('Assistência Técnica Especializada', marginX + 16, 22)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setText(WHITE)
  doc.text('ORDEM DE SERVIÇO', pageWidth - marginX, 15, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setText(GRAY_LIGHT)
  doc.text(`Nº ${osNumber}  ·  ${new Date(closedAt).toLocaleDateString('pt-BR')}`, pageWidth - marginX, 20, { align: 'right' })

  const pillW = 36
  const pillH = 8
  const pillX = pageWidth - marginX - pillW
  const pillY = 25
  setFill(GREEN)
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, 'F')
  setDraw(WHITE)
  doc.setLineWidth(0.55)
  doc.line(pillX + 6, pillY + pillH / 2, pillX + 7.4, pillY + pillH / 2 + 1.6)
  doc.line(pillX + 7.4, pillY + pillH / 2 + 1.6, pillX + 10, pillY + pillH / 2 - 1.8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.3)
  setText(WHITE)
  doc.text('CONCLUÍDA', pillX + pillW / 2 + 4, pillY + pillH / 2 + 1.3, { align: 'center' })

  y = HEADER_HEIGHT + 14

  // =====================================================
  // Container: dados do cliente
  // =====================================================
  beginContainer('Dados do cliente')
  field('Nome', request.customer_name)
  field('Telefone', request.customer_phone)
  field('E-mail', request.customer_email)
  const address = [
    request.address_street,
    request.address_number,
    request.address_neighborhood,
    request.address_city,
    request.address_state,
  ].filter(Boolean).join(', ') || (request.address_cep ? `CEP ${request.address_cep}` : '-')
  field('Endereço', address)
  endContainer()

  // =====================================================
  // Container: dados da solicitação e do aparelho
  // =====================================================
  beginContainer('Dados da solicitação e do aparelho')
  field('Data da solicitação', new Date(request.created_at).toLocaleString('pt-BR'))
  field('Modelo do aparelho', request.phone_model)
  field('Problema relatado', request.problem_description)
  endContainer()

  // =====================================================
  // Container: dados da loja
  // =====================================================
  beginContainer('Dados da loja')
  field('Loja', 'VR Tech — Assistência Técnica Especializada')
  field('Endereço', `${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood} — ${STORE_ADDRESS.city}`)
  field('Site', SITE_URL)
  endContainer()

  // ---------- tabela do checklist (OS 1) ----------
  const checklistTable = (checkedItems: ServiceOrderChecklistItem[]) => {
    if (checkedItems.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      setText(GRAY)
      ensureSpace(6)
      doc.text('Nenhum item registrado.', marginX + 3, y)
      y += 6
      return
    }

    const iconW = 9
    const compW = 38
    const valorW = 26
    const garantiaW = 26
    const descW = contentWidth - 6 - iconW - compW - valorW - garantiaW
    const tableHeaderHeight = 8
    const lineH = 4.1
    const tx = marginX + 3
    const tw = contentWidth - 6

    const drawTableHeader = () => {
      setFill(DARK)
      doc.rect(tx, y, tw, tableHeaderHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.6)
      setText(WHITE)
      doc.text('COMPONENTE', tx + iconW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('DESCRIÇÃO', tx + iconW + compW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('GARANTIA', tx + iconW + compW + descW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('VALOR', tx + tw - 2, y + tableHeaderHeight / 2 + 1.1, { align: 'right' })
      y += tableHeaderHeight
    }

    drawTableHeader()

    checkedItems.forEach((item, idx) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      const descLines = doc.splitTextToSize(item.description || '—', descW - 3)
      const warrantyLines = doc.splitTextToSize(item.warranty || '—', garantiaW - 3)
      const rowHeight = Math.max(descLines.length, warrantyLines.length, 1) * lineH + 5

      if (y + rowHeight > pageHeight - marginBottom) {
        startNewPage()
        drawTableHeader()
      }

      if (idx % 2 === 1) {
        setFill(LIGHT_BG)
        doc.rect(tx, y, tw, rowHeight, 'F')
      }

      checkSquare(tx + 1.8, y + rowHeight / 2 - 2.5, 5, VR_RED, WHITE)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(DARK)
      doc.text(item.component, tx + iconW + 2, y + 5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      setText(GRAY)
      doc.text(descLines, tx + iconW + compW + 2, y + 5)
      doc.text(warrantyLines, tx + iconW + compW + descW + 2, y + 5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(VR_RED)
      doc.text(
        item.value != null ? `R$ ${Number(item.value).toFixed(2)}` : '—',
        tx + tw - 2,
        y + 5,
        { align: 'right' }
      )

      y += rowHeight
      setDraw(BORDER)
      doc.setLineWidth(0.25)
      doc.line(tx, y, tx + tw, y)
    })

    y += 4
  }

  // ---------- tabela de garantia (peça usada / garantia / valor) ----------
  const garantiaTable = (parts: UsedPart[]) => {
    if (parts.length === 0) return

    const iconW = 9
    const compW = 70
    const valorW = 30
    const garantiaW = contentWidth - 6 - iconW - compW - valorW
    const tableHeaderHeight = 8
    const lineH = 4.1
    const tx = marginX + 3
    const tw = contentWidth - 6

    const drawHeader = () => {
      setFill(DARK)
      doc.rect(tx, y, tw, tableHeaderHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.6)
      setText(WHITE)
      doc.text('PEÇA / COMPONENTE', tx + iconW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('GARANTIA', tx + iconW + compW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('VALOR', tx + tw - 2, y + tableHeaderHeight / 2 + 1.1, { align: 'right' })
      y += tableHeaderHeight
    }

    drawHeader()

    parts.forEach((part, idx) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      const warrantyText = formatPartWarranty(part)
      const warrantyLines = doc.splitTextToSize(warrantyText, garantiaW - 3)
      const rowHeight = Math.max(warrantyLines.length, 1) * lineH + 5

      if (y + rowHeight > pageHeight - marginBottom) {
        startNewPage()
        drawHeader()
      }

      if (idx % 2 === 1) {
        setFill(LIGHT_BG)
        doc.rect(tx, y, tw, rowHeight, 'F')
      }

      checkSquare(tx + 1.8, y + rowHeight / 2 - 2.5, 5, VR_RED, WHITE)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(DARK)
      doc.text(part.name, tx + iconW + 2, y + 5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      setText(GRAY)
      doc.text(warrantyLines, tx + iconW + compW + 2, y + 5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(VR_RED)
      doc.text(
        part.price != null ? `R$ ${Number(part.price).toFixed(2)}` : '—',
        tx + tw - 2,
        y + 5,
        { align: 'right' }
      )

      y += rowHeight
      setDraw(BORDER)
      doc.setLineWidth(0.25)
      doc.line(tx, y, tx + tw, y)
    })

    y += 4
  }

  // ---------- timeline (atualizações / reabertura) ----------
  const THUMB_MAX = 26
  const THUMB_GAP = 3
  const MAX_THUMBS = 4

  const renderTimelineEntries = async (entries: ServiceOrderUpdate[]) => {
    if (entries.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      setText(GRAY)
      ensureSpace(6)
      doc.text('Nenhuma atualização registrada.', marginX + 3, y)
      y += 6
      return
    }

    for (const entry of entries) {
      const label = ACTION_LABELS[entry.action_type] ?? entry.action_type
      const messageLines = entry.message ? doc.splitTextToSize(entry.message, contentWidth - 10) : []

      ensureSpace(10 + messageLines.length * 4.6)

      clockIcon(marginX + 3, y - 3, 3.6, VR_RED)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setText(DARK)
      doc.text(label, marginX + 9, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      setText(GRAY)
      doc.text(new Date(entry.created_at).toLocaleString('pt-BR'), pageWidth - marginX - 3, y, { align: 'right' })
      y += 5

      if (messageLines.length > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        setText(DARK)
        ensureSpace(messageLines.length * 4.6)
        doc.text(messageLines, marginX + 9, y)
        y += messageLines.length * 4.6 + 1
      }

      const imageUrls = (entry.media_urls ?? []).filter(isImageUrl).slice(0, MAX_THUMBS)
      if (imageUrls.length > 0) {
        const images = (await Promise.all(imageUrls.map((url) => loadImage(url)))).filter(Boolean) as Array<{
          dataUrl: string
          width: number
          height: number
          format: string
        }>

        if (images.length > 0) {
          ensureSpace(THUMB_MAX + 3)
          let cursorX = marginX + 9
          for (const img of images) {
            const scale = Math.min(THUMB_MAX / img.width, THUMB_MAX / img.height, 1)
            const w = img.width * scale
            const h = img.height * scale
            doc.addImage(img.dataUrl, img.format, cursorX, y, w, h)
            setDraw(BORDER)
            doc.setLineWidth(0.25)
            doc.rect(cursorX, y, w, h, 'S')
            cursorX += THUMB_MAX + THUMB_GAP
          }
          y += THUMB_MAX + 3
        }
      }

      setDraw(BORDER)
      doc.setLineWidth(0.2)
      doc.line(marginX + 3, y, pageWidth - marginX - 3, y)
      y += 5
    }
  }

  // ---------- conclusão (estruturada com os dados atuais, ou em texto puro
  // para ciclos antigos já superados por uma reabertura posterior) ----------
  const renderConclusionStructured = () => {
    if (completedServices) field('Serviços realizados', completedServices)
    garantiaTable(usedParts)
    field('Valor total do serviço', `R$ ${Number(finalValue ?? 0).toFixed(2)}`)
    if (warranty) field('Garantia geral', warranty)
    field('Concluído em', new Date(closedAt).toLocaleString('pt-BR'))
  }

  const renderConclusionFromLog = (entry: ServiceOrderUpdate) => {
    const lines = doc.splitTextToSize(entry.message || '-', contentWidth - 6)
    ensureSpace(lines.length * 5.2 + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    setText(DARK)
    doc.text(lines, marginX + 3, y)
    y += lines.length * 5.2 + 4
    field('Concluído em', new Date(entry.created_at).toLocaleString('pt-BR'))
  }

  // ---------- separa a timeline em ciclos: cada reabertura inicia um novo ciclo ----------
  type Cycle = { reparoUpdates: ServiceOrderUpdate[]; completed: ServiceOrderUpdate | null; reopenedBy: ServiceOrderUpdate | null }
  const sortedUpdates = [...updates].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const cycles: Cycle[] = [{ reparoUpdates: [], completed: null, reopenedBy: null }]
  for (const entry of sortedUpdates) {
    if (entry.action_type === 'reopened') {
      cycles.push({ reparoUpdates: [], completed: null, reopenedBy: entry })
      continue
    }
    const current = cycles[cycles.length - 1]
    if (entry.action_type === 'update') current.reparoUpdates.push(entry)
    else if (entry.action_type === 'completed') current.completed = entry
  }
  const totalReopenings = cycles.length - 1

  // =====================================================
  // Container: Ordem de Serviço
  // Ordem interna fixa: Checklist inicial > Atualizações no reparo > Reparo concluído
  // (a conclusão só vem depois das atualizações — nunca antes)
  // =====================================================
  beginContainer('Ordem de serviço')

  bigHeading('Checklist inicial')
  checklistTable(checklist.filter((i) => i.checked))

  bigHeading('Atualizações no reparo')
  await renderTimelineEntries(cycles[0].reparoUpdates)

  bigHeading('Reparo concluído')
  if (totalReopenings === 0) {
    renderConclusionStructured()
  } else if (cycles[0].completed) {
    renderConclusionFromLog(cycles[0].completed)
  }

  endContainer()

  // =====================================================
  // Containers: Reabertura de OS — um por reabertura, sempre depois da
  // conclusão anterior. Cada um termina com sua própria conclusão/garantia.
  // =====================================================
  for (let i = 1; i < cycles.length; i++) {
    const cycle = cycles[i]
    const isLastCycle = i === cycles.length - 1
    const title = totalReopenings > 1 ? `Reabertura de OS (${i} de ${totalReopenings})` : 'Reabertura de OS'

    beginContainer(title)

    if (cycle.reopenedBy?.message) {
      field('Justificativa da reabertura', cycle.reopenedBy.message)
    }

    await renderTimelineEntries(cycle.reparoUpdates)

    bigHeading('Reparo concluído')
    if (isLastCycle) {
      renderConclusionStructured()
    } else if (cycle.completed) {
      renderConclusionFromLog(cycle.completed)
    }

    endContainer()
  }

  // =====================================================
  // Rodapé (todas as páginas)
  // =====================================================
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    setDraw(BORDER)
    doc.setLineWidth(0.3)
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14)
    setFill(VR_RED)
    doc.circle(marginX + 1, pageHeight - 10, 0.8, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setText(GRAY)
    doc.text(SITE_URL, marginX + 4, pageHeight - 9)
    doc.text(`Página ${p} de ${pageCount}`, pageWidth - marginX, pageHeight - 9, { align: 'right' })
  }

  return doc.output('blob')
}
