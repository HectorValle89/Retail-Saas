import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { obtenerSesionesUsuario } from '@/features/usuarios/services/usuarioService'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ usuarioId: string }> }
) {
  try {
    await requerirAdministradorActivo()
    const { usuarioId } = await params
    const sessions = await obtenerSesionesUsuario(usuarioId)

    return NextResponse.json({ sessions })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar las sesiones del usuario.',
      },
      { status: 500 }
    )
  }
}
