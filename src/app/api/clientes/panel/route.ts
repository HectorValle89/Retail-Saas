import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { obtenerPanelClientes } from '@/features/clientes/services/clienteService'

export async function GET() {
  try {
    const actor = await requerirAdministradorActivo()
    const data = await obtenerPanelClientes(actor)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de clientes.',
      },
      { status: 500 }
    )
  }
}
