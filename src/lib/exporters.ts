import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDisplayDate } from './dates'
import { getDateFormat } from './format'

export type CsvCell = string | number | null | undefined

function escapeCsv(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCsv).join(',')]
  for (const r of rows) lines.push(r.map(escapeCsv).join(','))
  // BOM so Excel opens UTF-8 correctly
  return '\uFEFF' + lines.join('\r\n')
}

export function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function exportCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  downloadBlob(filename, toCsv(headers, rows), 'text/csv;charset=utf-8')
}

export interface PdfTable {
  head: string[]
  body: (string | number)[][]
  foot?: (string | number)[][]
}

export function exportPdf(opts: {
  title: string
  subtitle?: string
  table: PdfTable
  filename?: string
  orientation?: 'portrait' | 'landscape'
}) {
  const doc = new jsPDF({ orientation: opts.orientation ?? 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('times', 'normal')
  doc.setFontSize(18)
  doc.setTextColor(73, 59, 66)
  doc.text(opts.title, 40, 46)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(141, 125, 133)
  const stamp = `${formatDisplayDate(new Date().toISOString().slice(0, 10), getDateFormat())}`
  doc.text(opts.subtitle ? `${opts.subtitle}  ·  ${stamp}` : stamp, 40, 62)

  doc.setDrawColor(240, 221, 228)
  doc.line(40, 72, pageWidth - 40, 72)

  autoTable(doc, {
    startY: 86,
    head: [opts.table.head],
    body: opts.table.body,
    foot: opts.table.foot,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: [73, 59, 66] },
    headStyles: { fillColor: [232, 163, 186], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [252, 233, 239], textColor: [73, 59, 66], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 244, 247] },
    margin: { left: 40, right: 40 },
  })

  const name = opts.filename ?? `${opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
  doc.save(name)
}

export function printHtml() {
  window.print()
}
