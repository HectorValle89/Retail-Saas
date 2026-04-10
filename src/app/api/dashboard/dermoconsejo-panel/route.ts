import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelDashboard } from '@/features/dashboard/services/dashboardService'

export async function GET() {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'DERMOCONSEJERO') {
      return NextResponse.json(
        { message: 'La carga extendida del dashboard solo aplica para dermoconsejo.' },
        { status: 403 }
      )
    }

    const data = await obtenerPanelDashboard(actor, {
      includeDermoSecondaryData: true,
    })

    return NextResponse.json({ data: data.dermoconsejo })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el detalle completo del dashboard.',
      },
      { status: 500 }
    )
  }
}
