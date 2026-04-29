import { NextRequest, NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelDashboard } from '@/features/dashboard/services/dashboardService'

function pickString(value: string | null) {
  return value?.trim() || undefined
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirActorActivo()
    const { searchParams } = request.nextUrl

    const data = await obtenerPanelDashboard(actor, {
      period: pickString(searchParams.get('periodo')),
      estado: pickString(searchParams.get('estado')),
      zona: pickString(searchParams.get('zona')),
      supervisorId: pickString(searchParams.get('supervisorId')),
      reachSupervisorId: pickString(searchParams.get('reachSupervisorId')),
      reachWeekStart: pickString(searchParams.get('reachWeekStart')),
      reachChain: pickString(searchParams.get('reachChain')),
      reachStoreType: pickString(searchParams.get('reachStoreType')),
      includeDermoSecondaryData: actor.puesto !== 'DERMOCONSEJERO',
      includeSupervisorSecondaryData: false,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel del dashboard.',
      },
      { status: 500 }
    )
  }
}
