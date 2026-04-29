import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerPanelMateriales } from '@/features/materiales/services/materialService'

export async function GET() {
  try {
    const actor = await requerirActorActivo()
    const data = await obtenerPanelMateriales(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de materiales.',
      },
      { status: 500 }
    )
  }
}
