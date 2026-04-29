import { NextRequest, NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelVentas } from '@/features/ventas/services/ventaService'

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirActorActivo()
    const page = parsePositiveInt(request.nextUrl.searchParams.get('page'), 1)
    const pageSize = parsePositiveInt(request.nextUrl.searchParams.get('pageSize'), 50)
    const data = await obtenerPanelVentas(actor, { page, pageSize })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'No fue posible refrescar el panel de ventas.',
      },
      { status: 500 }
    )
  }
}
