export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerDetalleAdministrativoAsistencia } from '@/features/asistencias/services/attendanceAdminService'

const ALLOWED_ROLES = new Set(['ADMINISTRADOR', 'COORDINADOR', 'NOMINA'])

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual()
  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.has(actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const empleadoId = request.nextUrl.searchParams.get('empleadoId')
  const fecha = request.nextUrl.searchParams.get('fecha')
  const month = request.nextUrl.searchParams.get('month')

  if (!empleadoId || !fecha) {
    return NextResponse.json({ error: 'empleadoId y fecha son obligatorios.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const detail = await obtenerDetalleAdministrativoAsistencia(supabase as never, actor, empleadoId, fecha, month)
    if (!detail) {
      return NextResponse.json({ error: 'No se encontro detalle para la fecha solicitada.' }, { status: 404 })
    }
    return NextResponse.json({ detail })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible obtener el detalle.' },
      { status: 500 }
    )
  }
}

