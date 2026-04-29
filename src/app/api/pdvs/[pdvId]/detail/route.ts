import { NextRequest, NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerDetallePdv } from '@/features/pdvs/services/pdvService'
import { createServiceClient } from '@/lib/supabase/server'

const PDV_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pdvId: string }> }
) {
  try {
    await requerirPuestosActivos([...PDV_ROLES])
    const { pdvId } = await params
    const supabase = createServiceClient()
    const data = await obtenerDetallePdv(supabase, pdvId)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el detalle del PDV.',
      },
      { status: 500 }
    )
  }
}
