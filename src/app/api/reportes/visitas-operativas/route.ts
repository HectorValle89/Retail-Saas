import { NextRequest, NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerRankingVisitasOperativas } from '@/features/reportes/services/reporteVisitasOperativasService'

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
    const top = parsePositiveInt(searchParams.get('top'), 10)

    const data = await obtenerRankingVisitasOperativas(actor, {
      periodo,
      top,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'No fue posible generar el ranking de visitas.',
      },
      { status: 500 }
    )
  }
}
