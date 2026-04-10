// Tipos standalone para evitar dependencia de exceljs en Edge Runtime
// Este archivo se conserva como referencia de diseño para futura migración
// a un entorno que soporte estilos XLSX avanzados (Worker dedicado, etc.)

interface BorderStyle {
  style: string
  color: { argb: string }
}

interface Borders {
  top?: BorderStyle
  left?: BorderStyle
  bottom?: BorderStyle
  right?: BorderStyle
}

interface Fill {
  type: string
  pattern: string
  fgColor: { argb: string }
}

interface Font {
  name?: string
  size?: number
  color?: { argb: string }
  bold?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Worksheet = any

import type { ReportExportPayload } from './reporteExport'

const BORDER_THIN: Partial<Borders> = {
  top: { style: 'thin', color: { argb: 'FFD7E1EA' } },
  left: { style: 'thin', color: { argb: 'FFD7E1EA' } },
  bottom: { style: 'thin', color: { argb: 'FFD7E1EA' } },
  right: { style: 'thin', color: { argb: 'FFD7E1EA' } },
}

const BORDER_WEEK_LEFT: Partial<Borders> = {
  left: { style: 'thick', color: { argb: 'FF000000' } },
}

const BORDER_WEEK_RIGHT: Partial<Borders> = {
  right: { style: 'thick', color: { argb: 'FF000000' } },
}

const FONT_BASE: Partial<Font> = {
  name: 'Aptos',
  size: 10,
  color: { argb: 'FF132238' },
}

function solidFill(argb: string): Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  }
}

function mergeBorders(base: Partial<Borders>, extra: Partial<Borders>): Partial<Borders> {
  return {
    top: extra.top ?? base.top,
    left: extra.left ?? base.left,
    bottom: extra.bottom ?? base.bottom,
    right: extra.right ?? base.right,
  }
}

function dayCodeTheme(code: string) {
  switch (code) {
    case 'RET':
      return { fill: solidFill('FFFFF2CC'), font: { color: { argb: 'FF7A5200' }, bold: true } }
    case 'PEND':
      return { fill: solidFill('FFDDEBF7'), font: { color: { argb: 'FF1F4E78' }, bold: true } }
    case 'DES':
      return { fill: solidFill('FF1F1F1F'), font: { color: { argb: 'FFFFFFFF' }, bold: true } }
    case 'INC':
      return { fill: solidFill('FFF4CCCC'), font: { color: { argb: 'FF7F0000' }, bold: true } }
    case 'VAC':
      return { fill: solidFill('FFFCE5CD'), font: { color: { argb: 'FF7F6000' }, bold: true } }
    case 'FOR':
      return { fill: solidFill('FFD9EAF7'), font: { color: { argb: 'FF0B5394' }, bold: true } }
    case 'JUS':
      return { fill: solidFill('FFD9EAD3'), font: { color: { argb: 'FF274E13' }, bold: true } }
    case 'FAL':
      return { fill: solidFill('FF000000'), font: { color: { argb: 'FFFFFFFF' }, bold: true } }
    case 'SIN':
      return { fill: solidFill('FFF3F6F9'), font: { color: { argb: 'FF6B7280' }, bold: true } }
    case '1':
      return { fill: solidFill('FFFFFFFF'), font: { color: { argb: 'FF132238' } } }
    default:
      return { fill: solidFill('FFFFFFFF'), font: { color: { argb: 'FF132238' } } }
  }
}

function summaryThemeByHeader(header: string) {
  switch (header) {
    case '# LAB':
      return { fill: solidFill('FFD9EAD3'), fontColor: 'FF274E13' }
    case '# INC':
      return { fill: solidFill('FFF4CCCC'), fontColor: 'FF7F0000' }
    case '# VAC':
      return { fill: solidFill('FFFCE5CD'), fontColor: 'FF7F6000' }
    case '# FORM':
      return { fill: solidFill('FFD9EAF7'), fontColor: 'FF0B5394' }
    case '# JUST':
      return { fill: solidFill('FFE2F0D9'), fontColor: 'FF274E13' }
    case '# FAL':
      return { fill: solidFill('FF000000'), fontColor: 'FFFFFFFF' }
    case '# SIN':
      return { fill: solidFill('FFEAEAEA'), fontColor: 'FF5F6368' }
    default:
      return { fill: solidFill('FFF5F7FA'), fontColor: 'FF132238' }
  }
}

function isMonday(dateIso: string) {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay() === 1
}

function isSunday(dateIso: string) {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay() === 0
}

function getWeekBlockIndex(dayDates: string[], offset: number) {
  let block = 0
  for (let index = 0; index <= offset; index += 1) {
    if (index > 0 && isMonday(dayDates[index] ?? '')) {
      block += 1
    }
  }
  return block
}

function getWeekBandFill(blockIndex: number) {
  return blockIndex % 2 === 0 ? solidFill('FF0B4F6C') : solidFill('FF16627D')
}

function styleWeekBoundary(border: Partial<Borders>, dateIso: string, offset: number) {
  let nextBorder = border
  if (dateIso && isMonday(dateIso) && offset > 0) {
    nextBorder = mergeBorders(nextBorder, BORDER_WEEK_LEFT)
  }
  if (dateIso && isSunday(dateIso)) {
    nextBorder = mergeBorders(nextBorder, BORDER_WEEK_RIGHT)
  }
  return nextBorder
}

function styleLegendRows(worksheet: Worksheet, startRow: number, totalColumns: number) {
  const titleRow = worksheet.getRow(startRow + 1)
  const firstCodeRow = worksheet.getRow(startRow + 2)
  const secondCodeRow = worksheet.getRow(startRow + 3)

  worksheet.mergeCells(startRow + 1, 1, startRow + 1, totalColumns)
  const titleCell = titleRow.getCell(1)
  titleCell.value = 'LEYENDA OPERATIVA'
  titleCell.fill = solidFill('FF2F3E4E')
  titleCell.font = { ...FONT_BASE, color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  titleCell.border = BORDER_THIN

  for (const row of [firstCodeRow, secondCodeRow]) {
    row.height = 20
    for (let col = 1; col <= Math.min(8, totalColumns); col += 1) {
      const cell = row.getCell(col)
      cell.border = BORDER_THIN
      cell.font = { ...FONT_BASE }
      cell.alignment = { vertical: 'middle', horizontal: col % 2 === 1 ? 'center' : 'left' }
      if (col % 2 === 0) {
        cell.fill = solidFill('FFF8FBFD')
      }
    }
  }

  const codeCells = [
    { row: startRow + 2, col: 1, code: 'RET' },
    { row: startRow + 2, col: 3, code: 'INC' },
    { row: startRow + 2, col: 5, code: 'VAC' },
    { row: startRow + 2, col: 7, code: 'FOR' },
    { row: startRow + 3, col: 1, code: 'JUS' },
    { row: startRow + 3, col: 3, code: 'FAL' },
    { row: startRow + 3, col: 5, code: 'SIN' },
    { row: startRow + 3, col: 7, code: 'DES' },
  ]

  for (const entry of codeCells) {
    const cell = worksheet.getRow(entry.row).getCell(entry.col)
    const theme = dayCodeTheme(entry.code)
    cell.fill = theme.fill
    cell.font = { ...FONT_BASE, ...(theme.font ?? {}) }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
}

export function applyReportWorksheetStyling(worksheet: Worksheet, payload: ReportExportPayload) {
  if (payload.xlsx?.theme !== 'operational_calendar' || !payload.xlsx.calendar) {
    return
  }

  const { staticColumnCount, dayColumnCount, summaryColumnCount, dayDates } = payload.xlsx.calendar
  const headerRowNumber = (payload.xlsx.leadingRows?.length ?? 0) + 1
  const dataStartRow = headerRowNumber + 1
  const footerStartRow = dataStartRow + payload.rows.length
  const monthRowNumber = 1
  const weekdayRowNumber = 2
  const totalColumns = staticColumnCount + dayColumnCount + summaryColumnCount
  const summaryStartColumn = staticColumnCount + dayColumnCount + 1

  worksheet.properties.defaultRowHeight = 20
  worksheet.getRow(monthRowNumber).height = 24
  worksheet.getRow(weekdayRowNumber).height = 20
  worksheet.getRow(headerRowNumber).height = 22

  for (let col = 1; col <= totalColumns; col += 1) {
    const headerCell = worksheet.getRow(headerRowNumber).getCell(col)
    const headerValue = String(headerCell.value ?? '')
    headerCell.font = { ...FONT_BASE, color: { argb: 'FFFFFFFF' }, bold: true, size: 10 }
    headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    headerCell.border = BORDER_THIN

    if (col >= summaryStartColumn) {
      const summaryTheme = summaryThemeByHeader(headerValue)
      headerCell.fill = summaryTheme.fill
      headerCell.font = { ...FONT_BASE, color: { argb: summaryTheme.fontColor }, bold: true, size: 10 }
    } else if (col > staticColumnCount && col <= staticColumnCount + dayColumnCount) {
      const blockIndex = getWeekBlockIndex(dayDates, col - staticColumnCount - 1)
      headerCell.fill = getWeekBandFill(blockIndex)
      headerCell.border = styleWeekBoundary(BORDER_THIN, dayDates[col - staticColumnCount - 1] ?? '', col - staticColumnCount - 1)
    } else {
      headerCell.fill = solidFill('FF2F3E4E')
    }
  }

  for (let col = staticColumnCount + 1; col <= staticColumnCount + dayColumnCount; col += 1) {
    const dateIso = dayDates[col - staticColumnCount - 1] ?? ''
    const blockIndex = getWeekBlockIndex(dayDates, col - staticColumnCount - 1)

    const monthCell = worksheet.getRow(monthRowNumber).getCell(col)
    monthCell.fill = blockIndex % 2 === 0 ? solidFill('FF54B7D8') : solidFill('FF6CC7E4')
    monthCell.font = { ...FONT_BASE, color: { argb: 'FF062B3A' }, bold: true, size: 16 }
    monthCell.alignment = { vertical: 'middle', horizontal: 'center' }
    monthCell.border = styleWeekBoundary(BORDER_THIN, dateIso, col - staticColumnCount - 1)

    const weekdayCell = worksheet.getRow(weekdayRowNumber).getCell(col)
    weekdayCell.fill = getWeekBandFill(blockIndex)
    weekdayCell.font = { ...FONT_BASE, color: { argb: 'FFFFFFFF' }, bold: true }
    weekdayCell.alignment = { vertical: 'middle', horizontal: 'center' }
    weekdayCell.border = styleWeekBoundary(BORDER_THIN, dateIso, col - staticColumnCount - 1)
  }

  for (let col = 1; col <= staticColumnCount; col += 1) {
    const cell = worksheet.getRow(headerRowNumber).getCell(col)
    if (col === staticColumnCount) {
      cell.fill = solidFill('FFEEF4F8')
      cell.font = { ...FONT_BASE, color: { argb: 'FF2F3E4E' }, bold: true }
    }
  }

  for (let rowIndex = dataStartRow; rowIndex < dataStartRow + payload.rows.length; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    row.height = 20

    for (let col = 1; col <= totalColumns; col += 1) {
      const cell = row.getCell(col)
      cell.border = BORDER_THIN
      cell.font = { ...FONT_BASE }
      cell.alignment = { vertical: 'middle', horizontal: col > staticColumnCount ? 'center' : 'left', wrapText: col === 14 }
      if (col <= staticColumnCount) {
        cell.fill = col === 14 ? solidFill('FFF8FBFD') : solidFill('FFFFFFFF')
      }
    }

    for (let offset = 0; offset < dayColumnCount; offset += 1) {
      const col = staticColumnCount + 1 + offset
      const cell = row.getCell(col)
      const code = String(cell.value ?? '').trim().toUpperCase()
      const theme = dayCodeTheme(code)
      const dateIso = dayDates[offset] ?? ''
      cell.fill = theme.fill
      cell.font = { ...FONT_BASE, ...(theme.font ?? {}) }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = styleWeekBoundary(BORDER_THIN, dateIso, offset)
    }

    for (let offset = 0; offset < summaryColumnCount; offset += 1) {
      const col = summaryStartColumn + offset
      const cell = row.getCell(col)
      const header = String(worksheet.getRow(headerRowNumber).getCell(col).value ?? '')
      const summaryTheme = summaryThemeByHeader(header)
      cell.fill = summaryTheme.fill
      cell.font = { ...FONT_BASE, color: { argb: summaryTheme.fontColor }, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }
  }

  if ((payload.xlsx.footerRows?.length ?? 0) >= 4) {
    styleLegendRows(worksheet, footerStartRow, totalColumns)
  }
}
