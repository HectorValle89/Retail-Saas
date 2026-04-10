export const runtime = 'edge';
import { Workbook, type Worksheet } from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { collectReportExportPayload, isExportFormat, isExportSectionKey, type ExportSectionKey, type ReportExportPayload } from '@/features/reportes/services/reporteExport'
import { buildReportPdf } from '@/features/reportes/services/reportePdf'
import { getScheduledReportPeriod } from '@/features/reportes/services/reporteScheduleService'
import { applyReportWorksheetStyling } from '@/features/reportes/services/reporteXlsxTheme'

interface ScheduleRow {
  id: string
  cuenta_cliente_id: string | null
  creado_por_usuario_id: string
  destinatario_email: string
  seccion: string
  formato: string
  activa: boolean
}

function buildCsvBytes(payload: ReportExportPayload) {
  const lines = [...(payload.xlsx?.leadingRows ?? []), payload.headers, ...payload.rows].map((row) =>
    row
      .map((value) => {
        const normalized = value == null ? '' : String(value)
        return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized
      })
      .join(',')
  )

  return Buffer.from(`\uFEFF${lines.join('\n')}\n`, 'utf8')
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

async function buildActorFromSchedule(service: ReturnType<typeof createServiceClient>, schedule: ScheduleRow): Promise<ActorActual> {
  const { data: usuario, error: usuarioError } = await service
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id, username, correo_electronico, correo_verificado, estado_cuenta')
    .eq('id', schedule.creado_por_usuario_id)
    .single()

  if (usuarioError || !usuario) {
    throw new Error(usuarioError?.message ?? 'No fue posible resolver el usuario creador del reporte programado.')
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto')
    .eq('id', usuario.empleado_id)
    .single()

  if (empleadoError || !empleado) {
    throw new Error(empleadoError?.message ?? 'No fue posible resolver el empleado creador del reporte programado.')
  }

  return {
    authUserId: 'scheduled-report-system',
    usuarioId: usuario.id,
    empleadoId: usuario.empleado_id,
    cuentaClienteId: schedule.cuenta_cliente_id,
    username: usuario.username,
    correoElectronico: usuario.correo_electronico,
    correoVerificado: usuario.correo_verificado,
    estadoCuenta: usuario.estado_cuenta,
    nombreCompleto: empleado.nombre_completo,
    puesto: empleado.puesto,
  }
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.REPORTES_CRON_SECRET
  if (!expectedSecret || request.headers.get('x-reportes-cron-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const scheduleId = request.nextUrl.searchParams.get('scheduleId')
  if (!scheduleId) {
    return NextResponse.json({ error: 'La programacion es obligatoria.' }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('reporte_programado')
      .select('id, cuenta_cliente_id, creado_por_usuario_id, destinatario_email, seccion, formato, activa')
      .eq('id', scheduleId)
      .single()

    if (error || !data) {
      throw new Error(error?.message ?? 'No fue posible encontrar la programacion solicitada.')
    }

    const schedule = data as ScheduleRow
    if (!schedule.activa) {
      return NextResponse.json({ error: 'La programacion esta inactiva.' }, { status: 409 })
    }

    if (!isExportSectionKey(schedule.seccion) || !isExportFormat(schedule.formato)) {
      throw new Error('La programacion contiene una seccion o formato invalido.')
    }

    const actor = await buildActorFromSchedule(service, schedule)
    const periodo = getScheduledReportPeriod()
    const payload = await collectReportExportPayload(service as never, actor, schedule.seccion as ExportSectionKey, periodo)

    if (schedule.formato === 'pdf') {
      const bytes = await buildReportPdf(schedule.seccion as ExportSectionKey, periodo, payload)
      return new Response(Buffer.from(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.pdf"`,
          'X-Report-Filename': `${payload.filenameBase}.pdf`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (schedule.formato === 'xlsx') {
      const bytes = await buildXlsxBytes(payload)
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.xlsx"`,
          'X-Report-Filename': `${payload.filenameBase}.xlsx`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const bytes = buildCsvBytes(payload)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
        'X-Report-Filename': `${payload.filenameBase}.csv`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible generar el reporte programado.' },
      { status: 500 }
    )
  }
}

