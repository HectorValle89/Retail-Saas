import { NextRequest, NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  normalizePdvsPanelFilters,
  obtenerPanelPdvsParaActor,
} from '@/features/pdvs/services/pdvService'

const PDV_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const

function pickString(value: string | null) {
  return value?.trim() || ''
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos([...PDV_ROLES])
    const { searchParams } = request.nextUrl
    const filters = normalizePdvsPanelFilters({
      search: pickString(searchParams.get('search')),
      cadenaId: pickString(searchParams.get('cadena')),
      ciudadId: pickString(searchParams.get('ciudad')),
      estado: pickString(searchParams.get('estado')),
      zona: pickString(searchParams.get('zona')),
      supervisorId: pickString(searchParams.get('supervisor')),
      estatus: pickString(searchParams.get('estatus')),
    })
    const data = await obtenerPanelPdvsParaActor(actor, filters)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de PDVs.',
      },
      { status: 500 }
    )
  }
}
