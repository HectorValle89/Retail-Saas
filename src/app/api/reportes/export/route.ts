export const runtime = 'edge';
import * as XLSX from 'xlsx'
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

function buildXlsxBytes(payload: ReportExportPayload) {
  const wb = XLSX.utils.book_new()

  const populateSheet = (p: Partial<ReportExportPayload>) => {
    const rows = [
      ...(p.xlsx?.leadingRows ?? []),
      p.headers ?? [],
      ...(p.rows ?? []),
      ...(p.xlsx?.footerRows ?? []),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Aplicar anchos de columna si existen
    if (p.xlsx?.columnWidths) {
      ws['!cols'] = p.xlsx.columnWidths.map(w => ({ wch: w }))
    }

    return ws
  }

  const mainWs = populateSheet(payload)
  XLSX.utils.book_append_sheet(wb, mainWs, payload.sheetName ?? 'reportes')

  for (const sheet of payload.extraSheets ?? []) {
    const extraWs = populateSheet({
      headers: sheet.headers,
      rows: sheet.rows,
      xlsx: sheet.xlsx,
    })
    XLSX.utils.book_append_sheet(wb, extraWs, sheet.name)
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buf
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

