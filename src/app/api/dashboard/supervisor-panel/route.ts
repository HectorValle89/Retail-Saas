import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelDashboard } from '@/features/dashboard/services/dashboardService'

export async function GET() {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'SUPERVISOR') {
      return NextResponse.json(
        { message: 'La carga extendida del dashboard solo aplica para supervisor.' },
        { status: 403 }
      )
    }

    const data = await obtenerPanelDashboard(actor, {
      includeSupervisorSecondaryData: true,
    })

    return NextResponse.json({
      data: {
        supervisorNotifications: data.supervisorNotifications,
        supervisorAuthorizations: data.supervisorAuthorizations,
        supervisorRequestInbox: data.supervisorRequestInbox,
        supervisorSelfRequestStatus: data.supervisorSelfRequestStatus,
        supervisorVacationPolicy: data.supervisorVacationPolicy,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el detalle operativo del supervisor.',
      },
      { status: 500 }
    )
  }
}
