import { Workbook } from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { buildAttendanceAdminExportPayload } from '@/features/asistencias/services/attendanceAdminService'

const ALLOWED_ROLES = new Set(['ADMINISTRADOR', 'COORDINADOR', 'NOMINA'])

function escapeCsvValue(value: string | number | null) {
  const normalized = value == null ? '' : String(value)
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function buildCsv(payload: Awaited<ReturnType<typeof buildAttendanceAdminExportPayload>>) {
  const rows = [...payload.leadingRows, payload.headers, ...payload.rows, ...payload.footerRows]
  return Buffer.from(`\uFEFF${rows.map((row) => row.map((value) => escapeCsvValue(value)).join(',')).join('\n')}`, 'utf8')
}

async function buildXlsx(payload: Awaited<ReturnType<typeof buildAttendanceAdminExportPayload>>) {
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('asistencias')
  for (const row of payload.leadingRows) sheet.addRow(row.map((value) => value ?? ''))
  sheet.addRow(payload.headers)
  for (const row of payload.rows) sheet.addRow(row.map((value) => value ?? ''))
  for (const row of payload.footerRows) sheet.addRow(row.map((value) => value ?? ''))
  sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: payload.leadingRows.length + 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual()
  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.has(actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const month = request.nextUrl.searchParams.get('month')
  if (!month) {
    return NextResponse.json({ error: 'El mes es obligatorio.' }, { status: 400 })
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'xlsx'

  try {
    const supabase = await createClient()
    const payload = await buildAttendanceAdminExportPayload(supabase as never, actor, {
      month,
      supervisorId: request.nextUrl.searchParams.get('supervisorId'),
      cadena: request.nextUrl.searchParams.get('cadena'),
      ciudad: request.nextUrl.searchParams.get('ciudad'),
      zona: request.nextUrl.searchParams.get('zona'),
      estadoDia: request.nextUrl.searchParams.get('estadoDia') as never,
    })

    if (format === 'csv') {
      return new Response(buildCsv(payload), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const bytes = await buildXlsx(payload)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.xlsx"`,
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
