import { NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { obtenerPanelEmpleados } from '@/features/empleados/services/empleadoService'

export async function GET() {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'COORDINADOR'])
    const serviceSupabase = createServiceClient()
    let data = await obtenerPanelEmpleados(
      actor,
      {
        emitCoverageSideEffects: actor.puesto === 'RECLUTAMIENTO' || actor.puesto === 'ADMINISTRADOR',
      },
      serviceSupabase
    )

    const infraError = String(data.mensajeInfraestructura ?? '')
    if (!data.infraestructuraLista && /invalid api key/i.test(infraError)) {
      const readSupabase = await createClient({ bypassTenantScope: false })
      data = await obtenerPanelEmpleados(
        actor,
        {
          emitCoverageSideEffects: false,
        },
        readSupabase
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de empleados.',
      },
      { status: 500 }
    )
  }
}
