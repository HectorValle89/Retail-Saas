export const runtime = 'edge';
// import { Readable, PassThrough } from 'node:stream'
// import ExcelJS from 'exceljs'
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
  const encoder = new TextEncoder()
  const lines = [
    `# bitacora_export_signature=${payload.signature.digest}`,
    `# bitacora_export_algorithm=${payload.signature.algorithm}`,
    `# bitacora_export_generated_at=${payload.signature.generatedAt}`,
    `# bitacora_export_total_rows=${payload.signature.totalRows}`,
    `# bitacora_export_invalid_rows=${payload.signature.invalidRows}`,
  ]

  return encoder.encode(`\uFEFF${lines.join('\n')}\n`)
}

function buildXlsxStream_orig(payload: Awaited<ReturnType<typeof collectBitacoraExportPayload>>) {
  const output = new PassThrough()

  void (async () => {
    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: false, useSharedStrings: false })
      const worksheet = workbook.addWorksheet('bitacora')
      const metadata = workbook.addWorksheet('firma')

      worksheet.addRow(payload.headers).commit()
      for (const row of payload.rows) {
        worksheet.addRow(row.map((value) => value ?? '')).commit()
      }

      metadata.addRow(['campo', 'valor']).commit()
      metadata.addRow(['signature', payload.signature.digest]).commit()
      metadata.addRow(['algorithm', payload.signature.algorithm]).commit()
      metadata.addRow(['generated_at', payload.signature.generatedAt]).commit()
      metadata.addRow(['total_rows', payload.signature.totalRows]).commit()
      metadata.addRow(['invalid_rows', payload.signature.invalidRows]).commit()

      worksheet.commit()
      metadata.commit()
      await workbook.commit()
    } catch (error) {
      output.destroy(error instanceof Error ? error : new Error('No fue posible generar el archivo XLSX.'))
    }
  })()

  return Readable.toWeb(output) as ReadableStream<Uint8Array>
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
      return new Response(buildXlsxStream(payload), {
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


function buildXlsxStream(payload: any) {
    throw new Error('Exportacion XLSX no disponible en este entorno. Usa CSV.');
}