import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { obtenerPanelConfiguracion } from '@/features/configuracion/services/configuracionService'

export async function GET() {
  try {
    const actor = await requerirAdministradorActivo()
    const data = await obtenerPanelConfiguracion(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de configuracion.',
      },
      { status: 500 }
    )
  }
}
