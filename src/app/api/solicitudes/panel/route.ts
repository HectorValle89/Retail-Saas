import { NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerPanelSolicitudes } from '@/features/solicitudes/services/solicitudService'

function pickString(value: string | null) {
  return value?.trim() || undefined
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([
      'ADMINISTRADOR',
      'DERMOCONSEJERO',
      'SUPERVISOR',
      'COORDINADOR',
      'RECLUTAMIENTO',
      'NOMINA',
    ])
    const { searchParams } = new URL(request.url)
    const data = await obtenerPanelSolicitudes(actor, {
      page: parsePositiveInt(searchParams.get('page'), 1),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 50),
      filters: {
        tipo: pickString(searchParams.get('tipo')),
        estatus: pickString(searchParams.get('estatus')),
        empleadoId: pickString(searchParams.get('empleado_id')),
        fechaInicio: pickString(searchParams.get('fecha_inicio')),
        fechaFin: pickString(searchParams.get('fecha_fin')),
        month: pickString(searchParams.get('month')),
      },
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de solicitudes.',
      },
      { status: 500 }
    )
  }
}
