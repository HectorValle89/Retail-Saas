import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerPanelRutaSemanal } from '@/features/rutas/services/rutaSemanalService'

export async function GET() {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'SUPERVISOR') {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 403 })
    }

    const data = await obtenerPanelRutaSemanal(await createClient(), actor)
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
