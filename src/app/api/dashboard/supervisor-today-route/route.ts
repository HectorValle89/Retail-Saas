import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerRutaHoySupervisorParaActor } from '@/features/rutas/services/rutaSemanalService'

export async function GET(request: Request) {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'SUPERVISOR') {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 403 })
    }

    const requestUrl = new URL(request.url)
    const cacheBuster = requestUrl.searchParams.get('refresh')
    const data = await obtenerRutaHoySupervisorParaActor(actor, { cacheBuster })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'No fue posible cargar la ruta de hoy del supervisor.',
      },
      { status: 500 }
    )
  }
}
