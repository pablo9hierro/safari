import jsPDF from 'jspdf'
import { ServiceOrderChecklistItem, ServiceRequest } from './types'
import { SITE_URL } from './constants'

const VR_RED = [224, 33, 26] as const
const GRAY = [120, 120, 120] as const
const DARK = [30, 30, 32] as const

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
  const marginX = 15
  const marginBottom = 20
  let y = 20

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage()
      y = 20
    }
  }

  const sectionTitle = (title: string) => {
    ensureSpace(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...VR_RED)
    doc.text(title.toUpperCase(), marginX, y)
    y += 6
  }

  const field = (label: string, value: string) => {
    const labelText = `${label}: `
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    const labelWidth = doc.getTextWidth(labelText)
    const lines = doc.splitTextToSize(value || '-', pageWidth - marginX * 2 - labelWidth)
    ensureSpace(5.5 * lines.length)
    doc.text(labelText, marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.text(lines, marginX + labelWidth, y)
    y += 5.5 * lines.length + 1.5
  }

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...VR_RED)
  doc.text('VR TECH', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('Assistência Técnica Especializada', marginX, y + 5)

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Ordem de Serviço', pageWidth - marginX, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(`Nº ${orderId.slice(0, 8).toUpperCase()}`, pageWidth - marginX, y + 5, { align: 'right' })
  doc.text(`Concluído em ${new Date(closedAt).toLocaleString('pt-BR')}`, pageWidth - marginX, y + 10, { align: 'right' })

  y += 18
  doc.setDrawColor(224, 224, 224)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 10

  // Cliente
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

  y += 4

  // Aparelho
  sectionTitle('Aparelho')
  field('Modelo', request.phone_model)
  field('Problema relatado', request.problem_description)

  y += 4

  // Itens avaliados/reparados
  const items = checklist.filter((i) => i.checked)
  if (items.length > 0) {
    sectionTitle('Itens avaliados / reparados')
    for (const item of items) {
      ensureSpace(14)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
      doc.text(item.component, marginX, y)
      if (item.value != null) {
        doc.text(`R$ ${Number(item.value).toFixed(2)}`, pageWidth - marginX, y, { align: 'right' })
      }
      y += 5

      if (item.description) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...GRAY)
        const lines = doc.splitTextToSize(item.description, pageWidth - marginX * 2)
        ensureSpace(4.5 * lines.length)
        doc.text(lines, marginX, y)
        y += 4.5 * lines.length
      }

      if (item.warranty) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(...GRAY)
        ensureSpace(4.5)
        doc.text(`Garantia: ${item.warranty}`, marginX, y)
        y += 4.5
      }

      y += 2
    }
    y += 2
  }

  // Serviços realizados
  if (completedServices) {
    sectionTitle('Serviços realizados')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(completedServices, pageWidth - marginX * 2)
    ensureSpace(5.5 * lines.length)
    doc.text(lines, marginX, y)
    y += 5.5 * lines.length + 4
  }

  // Totais
  ensureSpace(20)
  doc.setDrawColor(224, 224, 224)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...DARK)
  doc.text('Valor total:', marginX, y)
  doc.setTextColor(...VR_RED)
  doc.text(`R$ ${Number(finalValue ?? 0).toFixed(2)}`, pageWidth - marginX, y, { align: 'right' })
  y += 8

  field('Garantia', warranty || 'Não informada')

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(SITE_URL, marginX, pageHeight - 10)
    doc.text(`Página ${p} de ${pageCount}`, pageWidth - marginX, pageHeight - 10, { align: 'right' })
  }

  return doc.output('blob')
}
