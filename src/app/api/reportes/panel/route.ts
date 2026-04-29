import { NextRequest, NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerPanelReportes, obtenerPanelReportesShell } from '@/features/reportes/services/reporteService'

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

function resolveCurrentMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR'])
    const { searchParams } = request.nextUrl
    const periodo = pickString(searchParams.get('periodo'))
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 25)

    const data = periodo
      ? await obtenerPanelReportes(actor, {
          period: periodo,
          page,
          pageSize,
        })
      : obtenerPanelReportesShell(resolveCurrentMonth(), page, pageSize)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de reportes.',
      },
      { status: 500 }
    )
  }
}
