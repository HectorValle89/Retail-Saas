export const runtime = 'edge';
import * as XLSX from 'xlsx'
import { NextRequest, NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { collectBitacoraExportPayload } from '@/features/bitacora/services/bitacoraService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function escapeCsvValue(value: string | number | null) {
  const normalized = value == null ? '' : String(value)
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function buildCsvSignaturePreamble(payload: Awaited<ReturnType<typeof collectBitacoraExportPayload>>) {
  const lines = [
    `# bitacora_export_signature=${payload.signature.digest}`,
    `# bitacora_export_algorithm=${payload.signature.algorithm}`,
    `# bitacora_export_generated_at=${payload.signature.generatedAt}`,
    `# bitacora_export_total_rows=${payload.signature.totalRows}`,
    `# bitacora_export_invalid_rows=${payload.signature.invalidRows}`,
  ]

  return new TextEncoder().encode(`\uFEFF${lines.join('\n')}\n`)
}

function buildXlsxBuffer(payload: Awaited<ReturnType<typeof collectBitacoraExportPayload>>) {
  // Hoja principal de bitácora
  const wsData = [payload.headers, ...payload.rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Hoja de firma/metadatos
  const metaData = [
    ['campo', 'valor'],
    ['signature', payload.signature.digest],
    ['algorithm', payload.signature.algorithm],
    ['generated_at', payload.signature.generatedAt],
    ['total_rows', payload.signature.totalRows],
    ['invalid_rows', payload.signature.invalidRows],
  ]
  const wsMeta = XLSX.utils.aoa_to_sheet(metaData)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'bitacora')
  XLSX.utils.book_append_sheet(wb, wsMeta, 'firma')

  // Generar el buffer en formato XLSX (bookType: 'xlsx')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buf
}

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || actor.puesto !== 'ADMINISTRADOR') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'csv'
  if (format !== 'csv' && format !== 'xlsx') {
    return NextResponse.json({ error: 'Formato de exportacion invalido.' }, { status: 400 })
  }

  try {
    const supabase = await createClient({ bypassTenantScope: true })
    const payload = await collectBitacoraExportPayload(supabase, {
      actor,
      usuario: request.nextUrl.searchParams.get('usuario') ?? undefined,
      modulo: request.nextUrl.searchParams.get('modulo') ?? undefined,
      accion: request.nextUrl.searchParams.get('accion') ?? undefined,
      fechaDesde: request.nextUrl.searchParams.get('fechaDesde') ?? undefined,
      fechaHasta: request.nextUrl.searchParams.get('fechaHasta') ?? undefined,
    })

    if (format === 'xlsx') {
      const buf = buildXlsxBuffer(payload)
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${payload.filenameBase}.xlsx"`,
          'Cache-Control': 'no-store',
          'X-Bitacora-Export-Signature': payload.signature.digest,
          'X-Bitacora-Export-Signature-Algorithm': payload.signature.algorithm,
        },
      })
    }

    const csvBody = new Blob([
      buildCsvSignaturePreamble(payload),
      new TextEncoder().encode(
        `${payload.headers.join(',')}\n${payload.rows
          .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
          .join('\n')}${payload.rows.length > 0 ? '\n' : ''}`
      ),
    ])

    return new Response(csvBody.stream(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
        'Cache-Control': 'no-store',
        'X-Bitacora-Export-Signature': payload.signature.digest,
        'X-Bitacora-Export-Signature-Algorithm': payload.signature.algorithm,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible exportar la bitacora.' },
      { status: 500 }
    )
  }
}