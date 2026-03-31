import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ReportExportPayload, ExportSectionKey } from './reporteExport'

const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const MARGIN_X = 36
const MARGIN_TOP = 36
const MARGIN_BOTTOM = 32
const HEADER_HEIGHT = 54
const ROW_HEIGHT = 18
const TITLE_COLOR = rgb(0.1, 0.16, 0.26)
const BRAND_COLOR = rgb(0.1, 0.5, 0.83)
const SUBTLE_COLOR = rgb(0.44, 0.5, 0.56)
const BORDER_COLOR = rgb(0.83, 0.87, 0.91)

const SECTION_TITLES: Record<ExportSectionKey, string> = {
  clientes: 'Consolidado por cliente',
  asistencias: 'Reporte de asistencias',
  ventas: 'Reporte de ventas',
  campanas: 'Reporte de campanas',
  ranking_ventas: 'Ranking comercial',
  ranking_cuotas: 'Ranking de cuotas',
  gastos: 'Reporte de gastos',
  love: 'Reporte LOVE ISDIN',
  nomina: 'Reporte de nomina',
  calendario_operativo: 'Calendario operativo mensual',
  bitacora: 'Bitacora de auditoria',
}

function formatCellValue(value: string | number | null) {
  if (value == null) {
    return '—'
  }

  return String(value).replace(/\s+/g, ' ').trim() || '—'
}

function truncateText(font: PDFFont, text: string, fontSize: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
    return text
  }

  let candidate = text
  while (candidate.length > 1 && font.widthOfTextAtSize(`${candidate}...`, fontSize) > maxWidth) {
    candidate = candidate.slice(0, -1)
  }

  return `${candidate}...`
}

function buildColumnWidths(columnCount: number) {
  const availableWidth = PAGE_WIDTH - MARGIN_X * 2
  const width = availableWidth / Math.max(1, columnCount)
  return Array.from({ length: columnCount }, () => width)
}

function drawHeader(page: PDFPage, title: string, periodo: string, regularFont: PDFFont, boldFont: PDFFont) {
  const top = PAGE_HEIGHT - MARGIN_TOP

  page.drawRectangle({
    x: MARGIN_X,
    y: top - HEADER_HEIGHT,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: HEADER_HEIGHT,
    color: rgb(0.96, 0.98, 1),
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  })

  page.drawRectangle({
    x: MARGIN_X + 12,
    y: top - 38,
    width: 10,
    height: 26,
    color: BRAND_COLOR,
  })
  page.drawRectangle({
    x: MARGIN_X + 26,
    y: top - 32,
    width: 10,
    height: 20,
    color: rgb(0.22, 0.74, 0.96),
  })
  page.drawText('be te ele', {
    x: MARGIN_X + 46,
    y: top - 24,
    size: 18,
    font: boldFont,
    color: TITLE_COLOR,
  })
  page.drawText(title, {
    x: MARGIN_X + 160,
    y: top - 22,
    size: 16,
    font: boldFont,
    color: TITLE_COLOR,
  })
  page.drawText(`Periodo: ${periodo}`, {
    x: MARGIN_X + 160,
    y: top - 40,
    size: 10,
    font: regularFont,
    color: SUBTLE_COLOR,
  })
  page.drawText(
    `Generado ${new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())}`,
    {
      x: PAGE_WIDTH - MARGIN_X - 165,
      y: top - 40,
      size: 10,
      font: regularFont,
      color: SUBTLE_COLOR,
    }
  )
}

function drawTableHeader(
  page: PDFPage,
  headers: string[],
  widths: number[],
  y: number,
  boldFont: PDFFont
) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - ROW_HEIGHT + 3,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: ROW_HEIGHT,
    color: rgb(0.94, 0.96, 0.98),
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  })

  let cursorX = MARGIN_X
  headers.forEach((header, index) => {
    const width = widths[index] ?? widths[0] ?? 0
    const label = truncateText(boldFont, header.replace(/_/g, ' ').toUpperCase(), 8, width - 8)
    page.drawText(label, {
      x: cursorX + 4,
      y: y - 10,
      size: 8,
      font: boldFont,
      color: TITLE_COLOR,
    })
    if (index > 0) {
      page.drawLine({
        start: { x: cursorX, y: y - ROW_HEIGHT + 3 },
        end: { x: cursorX, y },
        thickness: 1,
        color: BORDER_COLOR,
      })
    }
    cursorX += width
  })

  page.drawLine({
    start: { x: MARGIN_X, y: y - ROW_HEIGHT + 3 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: y - ROW_HEIGHT + 3 },
    thickness: 1,
    color: BORDER_COLOR,
  })

  return y - ROW_HEIGHT - 4
}

function drawRow(page: PDFPage, row: Array<string | number | null>, widths: number[], y: number, font: PDFFont, index: number) {
  if (index % 2 === 0) {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - ROW_HEIGHT + 3,
      width: PAGE_WIDTH - MARGIN_X * 2,
      height: ROW_HEIGHT,
      color: rgb(0.99, 0.99, 1),
    })
  }

  let cursorX = MARGIN_X
  row.forEach((cell, cellIndex) => {
    const width = widths[cellIndex] ?? widths[0] ?? 0
    const text = truncateText(font, formatCellValue(cell), 8, width - 8)
    page.drawText(text, {
      x: cursorX + 4,
      y: y - 10,
      size: 8,
      font,
      color: TITLE_COLOR,
    })
    if (cellIndex > 0) {
      page.drawLine({
        start: { x: cursorX, y: y - ROW_HEIGHT + 3 },
        end: { x: cursorX, y: y + 3 },
        thickness: 1,
        color: rgb(0.92, 0.94, 0.96),
      })
    }
    cursorX += width
  })

  page.drawLine({
    start: { x: MARGIN_X, y: y - ROW_HEIGHT + 3 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: y - ROW_HEIGHT + 3 },
    thickness: 1,
    color: rgb(0.92, 0.94, 0.96),
  })

  return y - ROW_HEIGHT
}

export async function buildReportPdf(section: ExportSectionKey, periodo: string, payload: ReportExportPayload) {
  const pdf = await PDFDocument.create()
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
  const widths = buildColumnWidths(payload.headers.length)
  const title = SECTION_TITLES[section]
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let cursorY = PAGE_HEIGHT - MARGIN_TOP

  drawHeader(page, title, periodo, regularFont, boldFont)
  cursorY = PAGE_HEIGHT - MARGIN_TOP - HEADER_HEIGHT - 14
  cursorY = drawTableHeader(page, payload.headers, widths, cursorY, boldFont)

  payload.rows.forEach((row, index) => {
    if (cursorY < MARGIN_BOTTOM + ROW_HEIGHT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      drawHeader(page, title, periodo, regularFont, boldFont)
      cursorY = PAGE_HEIGHT - MARGIN_TOP - HEADER_HEIGHT - 14
      cursorY = drawTableHeader(page, payload.headers, widths, cursorY, boldFont)
    }

    cursorY = drawRow(page, row, widths, cursorY, regularFont, index)
  })

  return pdf.save()
}

