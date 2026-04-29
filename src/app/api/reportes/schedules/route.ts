import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { obtenerProgramacionReportes } from '@/features/reportes/services/reporteScheduleService'

export async function GET() {
  try {
    const actor = await requerirAdministradorActivo()
    const data = await obtenerProgramacionReportes(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar la programacion de reportes.',
      },
      { status: 500 }
    )
  }
}
