import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { obtenerPanelReglas } from '@/features/reglas/services/reglaService'

export async function GET() {
  try {
    const actor = await requerirAdministradorActivo()
    const data = await obtenerPanelReglas(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de reglas.',
      },
      { status: 500 }
    )
  }
}
