import { NextRequest, NextResponse } from 'next/server'

import { requerirPuestosActivos } from '@/lib/auth/session'

import { obtenerVisitasSupervisoresDetalle } from '@/features/reportes/services/reporteVisitasSupervisoresService'

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

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR'])
    const { searchParams } = request.nextUrl
    const periodo = pickString(searchParams.get('periodo'))
    const supervisorEmpleadoId = pickString(searchParams.get('supervisorEmpleadoId'))
    const estadoFiltro = pickString(searchParams.get('estadoFiltro'))
    const limit = parsePositiveInt(searchParams.get('limit'), 25)

    const data = await obtenerVisitasSupervisoresDetalle(actor, {
      periodo,
      supervisorEmpleadoId,
      estadoFiltro,
      limit,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible generar el detalle de visitas de supervisores.',
      },
      { status: 500 }
    )
  }
}
