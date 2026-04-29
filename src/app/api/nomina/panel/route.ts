import { NextResponse } from 'next/server'
import { requerirOperadorNomina } from '@/lib/auth/session'
import { obtenerWorkspaceNomina } from '@/features/nomina/services/nominaWorkspaceService'

export async function GET() {
  try {
    const actor = await requerirOperadorNomina()
    const data = await obtenerWorkspaceNomina(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de nomina.',
      },
      { status: 500 }
    )
  }
}
