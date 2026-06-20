import jsPDF from 'jspdf'
import { ServiceOrderChecklistItem, ServiceRequest } from './types'
import { SITE_URL } from './constants'

type RGB = readonly [number, number, number]

const VR_RED: RGB = [224, 33, 26]
const VR_RED_LIGHT: RGB = [255, 122, 112]
const VR_BLACK: RGB = [10, 10, 11]
const DARK: RGB = [30, 30, 32]
const GRAY: RGB = [139, 139, 148]
const GRAY_LIGHT: RGB = [188, 188, 195]
const LIGHT_BG: RGB = [245, 245, 247]
const BORDER: RGB = [228, 228, 231]
const WHITE: RGB = [255, 255, 255]
const GREEN: RGB = [22, 153, 84]

export function generateServiceOrderPdf({
  request,
  orderId,
  checklist,
  completedServices,
  warranty,
  finalValue,
  closedAt,
}: {
  request: ServiceRequest
  orderId: string
  checklist: ServiceOrderChecklistItem[]
  completedServices: string | null
  warranty: string | null
  finalValue: number | null
  closedAt: string
}): Blob {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 16
  const marginBottom = 22
  const contentWidth = pageWidth - marginX * 2
  const osNumber = orderId.slice(0, 8).toUpperCase()
  const HEADER_HEIGHT = 36
  let y = 0

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

  // ---------- ícones vetoriais (sem emoji) ----------
  const checkCircle = (cx: number, cy: number, r: number, bg: RGB, fg: RGB) => {
    setFill(bg)
    doc.circle(cx, cy, r, 'F')
    setDraw(fg)
    doc.setLineWidth(0.6)
    doc.line(cx - r * 0.45, cy, cx - r * 0.05, cy + r * 0.4)
    doc.line(cx - r * 0.05, cy + r * 0.4, cx + r * 0.5, cy - r * 0.35)
  }

  const checkSquare = (x: number, top: number, size: number, bg: RGB, fg: RGB) => {
    setFill(bg)
    doc.roundedRect(x, top, size, size, size * 0.25, size * 0.25, 'F')
    setDraw(fg)
    doc.setLineWidth(0.5)
    doc.line(x + size * 0.22, top + size * 0.52, x + size * 0.42, top + size * 0.74)
    doc.line(x + size * 0.42, top + size * 0.74, x + size * 0.8, top + size * 0.26)
  }

  const shieldIcon = (x: number, top: number, w: number, h: number, color: RGB) => {
    setFill(color)
    doc.roundedRect(x, top, w, h * 0.6, w * 0.18, w * 0.18, 'F')
    doc.triangle(x, top + h * 0.5, x + w, top + h * 0.5, x + w / 2, top + h, 'F')
  }

  // ---------- layout helpers ----------
  const startNewPage = () => {
    doc.addPage()
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
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) startNewPage()
  }

  const sectionTitle = (title: string) => {
    ensureSpace(11)
    setFill(VR_RED)
    doc.roundedRect(marginX, y - 3, 3, 3, 0.7, 0.7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    setText(DARK)
    doc.text(title.toUpperCase(), marginX + 5.5, y)
    y += 2
    setDraw(BORDER)
    doc.setLineWidth(0.3)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 6
  }

  const field = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value || '-', contentWidth)
    ensureSpace(lines.length * 5.2 + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(GRAY)
    doc.text(label.toUpperCase(), marginX, y)
    y += 4.8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setText(DARK)
    doc.text(lines, marginX, y)
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

  y = HEADER_HEIGHT + 12

  // =====================================================
  // Cliente / Aparelho
  // =====================================================
  sectionTitle('Cliente')
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

  y += 2
  sectionTitle('Aparelho')
  field('Modelo', request.phone_model)
  field('Problema relatado', request.problem_description)

  y += 2

  // =====================================================
  // Itens avaliados / reparados (tabela)
  // =====================================================
  const items = checklist.filter((i) => i.checked)
  if (items.length > 0) {
    sectionTitle('Itens avaliados / reparados')

    const iconW = 9
    const compW = 40
    const valorW = 26
    const garantiaW = 28
    const descW = contentWidth - iconW - compW - valorW - garantiaW
    const tableHeaderHeight = 8
    const lineH = 4.1

    const drawTableHeader = () => {
      setFill(DARK)
      doc.rect(marginX, y, contentWidth, tableHeaderHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.6)
      setText(WHITE)
      doc.text('COMPONENTE', marginX + iconW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('DESCRIÇÃO', marginX + iconW + compW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('GARANTIA', marginX + iconW + compW + descW + 2, y + tableHeaderHeight / 2 + 1.1)
      doc.text('VALOR', marginX + contentWidth - 2, y + tableHeaderHeight / 2 + 1.1, { align: 'right' })
      y += tableHeaderHeight
    }

    drawTableHeader()

    items.forEach((item, idx) => {
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
        doc.rect(marginX, y, contentWidth, rowHeight, 'F')
      }

      checkSquare(marginX + 1.8, y + rowHeight / 2 - 2.5, 5, VR_RED, WHITE)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(DARK)
      doc.text(item.component, marginX + iconW + 2, y + 5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      setText(GRAY)
      doc.text(descLines, marginX + iconW + compW + 2, y + 5)
      doc.text(warrantyLines, marginX + iconW + compW + descW + 2, y + 5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setText(VR_RED)
      doc.text(
        item.value != null ? `R$ ${Number(item.value).toFixed(2)}` : '—',
        marginX + contentWidth - 2,
        y + 5,
        { align: 'right' }
      )

      y += rowHeight
      setDraw(BORDER)
      doc.setLineWidth(0.25)
      doc.line(marginX, y, marginX + contentWidth, y)
    })

    y += 6
  }

  // =====================================================
  // Serviços realizados
  // =====================================================
  if (completedServices) {
    sectionTitle('Serviços realizados')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    setText(DARK)
    const lines = doc.splitTextToSize(completedServices, contentWidth)
    ensureSpace(lines.length * 5.4 + 4)
    doc.text(lines, marginX, y)
    y += lines.length * 5.4 + 6
  }

  // =====================================================
  // Total + garantia geral
  // =====================================================
  const hasWarranty = !!warranty
  const boxHeight = hasWarranty ? 28 : 20
  ensureSpace(boxHeight + 4)

  setFill(VR_BLACK)
  doc.roundedRect(marginX, y, contentWidth, boxHeight, 3, 3, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setText(GRAY_LIGHT)
  doc.text('VALOR TOTAL DO SERVIÇO', marginX + 8, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  setText(VR_RED_LIGHT)
  doc.text(`R$ ${Number(finalValue ?? 0).toFixed(2)}`, marginX + contentWidth - 8, y + 12, { align: 'right' })

  if (hasWarranty) {
    shieldIcon(marginX + 8, y + 15.5, 5, 5.5, WHITE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.3)
    setText(GRAY_LIGHT)
    const lines = doc.splitTextToSize(`Garantia: ${warranty}`, contentWidth - 22)
    doc.text(lines, marginX + 16, y + 20)
  }

  y += boxHeight + 10

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.8)
  setText(GRAY)
  doc.text(`Concluído em ${new Date(closedAt).toLocaleString('pt-BR')}`, marginX, y)

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
