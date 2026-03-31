import { Workbook, type Worksheet } from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  collectReportExportPayload,
  isExportFormat,
  isExportSectionKey,
  type ReportExportPayload,
} from '@/features/reportes/services/reporteExport'
import { buildReportPdf } from '@/features/reportes/services/reportePdf'
import { applyReportWorksheetStyling } from '@/features/reportes/services/reporteXlsxTheme'

function escapeCsvValue(value: string | number | null) {
  const normalized = value == null ? '' : String(value)
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function buildCsvStream(payload: ReportExportPayload) {
  const encoder = new TextEncoder()
  const csvRows = [
    ...(payload.xlsx?.leadingRows ?? []),
    payload.headers,
    ...payload.rows,
  ]
  let index = 0

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === 0) {
        controller.enqueue(encoder.encode('\uFEFF'))
      }

      if (index >= csvRows.length) {
        controller.close()
        return
      }

      const row = csvRows[index]
      controller.enqueue(encoder.encode(`${row.map((value) => escapeCsvValue(value)).join(',')}\n`))
      index += 1
    },
  })
}

function parseFreezeCell(cell: string | undefined) {
  if (!cell) {
    return null
  }

  const match = /^([A-Z]+)(\d+)$/.exec(cell.toUpperCase())
  if (!match) {
    return null
  }

  const columnLetters = match[1]
  const rowNumber = Number(match[2])
  let xSplit = 0
  for (const char of columnLetters) {
    xSplit = xSplit * 26 + (char.charCodeAt(0) - 64)
  }

  return {
    xSplit: Math.max(0, xSplit - 1),
    ySplit: Math.max(0, rowNumber - 1),
  }
}

function populateWorksheet(worksheet: Worksheet, payload: ReportExportPayload) {
  if (payload.xlsx?.columnWidths?.length) {
    worksheet.columns = payload.xlsx.columnWidths.map((width) => ({ width }))
  }

  const frozenView = parseFreezeCell(payload.xlsx?.freezeCell)
  if (frozenView) {
    worksheet.views = [{ state: 'frozen', ...frozenView }]
  }

  for (const row of payload.xlsx?.leadingRows ?? []) {
    worksheet.addRow(row.map((value) => value ?? ''))
  }

  worksheet.addRow(payload.headers)
  for (const row of payload.rows) {
    worksheet.addRow(row.map((value) => value ?? ''))
  }

  for (const row of payload.xlsx?.footerRows ?? []) {
    worksheet.addRow(row.map((value) => value ?? ''))
  }

  for (const merge of payload.xlsx?.merges ?? []) {
    worksheet.mergeCells(merge)
  }

  applyReportWorksheetStyling(worksheet, payload)
}

async function buildXlsxBytes(payload: ReportExportPayload) {
  const workbook = new Workbook()
  const worksheet = workbook.addWorksheet(payload.sheetName ?? 'reportes')
  populateWorksheet(worksheet, payload)

  for (const sheet of payload.extraSheets ?? []) {
    const extraWorksheet = workbook.addWorksheet(sheet.name)
    populateWorksheet(extraWorksheet, {
      filenameBase: payload.filenameBase,
      headers: sheet.headers,
      rows: sheet.rows,
      sheetName: sheet.name,
      xlsx: sheet.xlsx,
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || actor.puesto !== 'ADMINISTRADOR') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const section = request.nextUrl.searchParams.get('section')
  const periodo = request.nextUrl.searchParams.get('periodo')
  const formatValue = request.nextUrl.searchParams.get('format') ?? 'csv'

  if (!section || !isExportSectionKey(section)) {
    return NextResponse.json({ error: 'Seccion de exportacion invalida.' }, { status: 400 })
  }

  if (!periodo) {
    return NextResponse.json({ error: 'El periodo es obligatorio.' }, { status: 400 })
  }

  if (!isExportFormat(formatValue)) {
    return NextResponse.json({ error: 'Formato de exportacion invalido.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const payload = await collectReportExportPayload(supabase, actor, section, periodo)

    if (formatValue === 'pdf') {
      const bytes = await buildReportPdf(section, periodo, payload)
      return new Response(Buffer.from(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (formatValue === 'xlsx') {
      const bytes = await buildXlsxBytes(payload)
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return new Response(buildCsvStream(payload), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible generar la exportacion.' },
      { status: 500 }
    )
  }
}
