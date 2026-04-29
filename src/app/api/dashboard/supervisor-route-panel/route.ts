import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelRutaSemanalParaActor } from '@/features/rutas/services/rutaSemanalService'

export async function GET(request: Request) {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'SUPERVISOR') {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 403 })
    }

    const requestUrl = new URL(request.url)
    const cacheBuster = requestUrl.searchParams.get('refresh')
    const focus = requestUrl.searchParams.get('focus')
    const includePlanningCatalog = focus !== 'ruta-history'
    const data = await obtenerPanelRutaSemanalParaActor(actor, {
      cacheBuster,
      includePlanningCatalog,
    })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'No fue posible cargar la ruta semanal del supervisor.',
      },
      { status: 500 }
    )
  }
}
