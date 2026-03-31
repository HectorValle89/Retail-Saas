import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { collectEmpleadosExportPayload } from '@/features/empleados/services/empleadoService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function escapeCsvValue(value: string | number | null) {
  const normalized = value == null ? '' : String(value)
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

export async function GET() {
  const actor = await obtenerActorActual()

  if (
    !actor ||
    actor.estadoCuenta !== 'ACTIVA' ||
    !['ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA'].includes(actor.puesto)
  ) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const payload = await collectEmpleadosExportPayload(supabase)
    const csv = `\uFEFF${payload.headers.join(',')}\n${payload.rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n')}${payload.rows.length > 0 ? '\n' : ''}`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible exportar empleados.' },
      { status: 500 }
    )
  }
}
