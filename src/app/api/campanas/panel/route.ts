import { NextResponse } from 'next/server'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerInicioCampanasParaActor } from '@/features/campanas/services/campanaService'

const CAMPANA_ROLES = [
  'ADMINISTRADOR',
  'VENTAS',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'DERMOCONSEJERO',
  'CLIENTE',
] as const

export async function GET() {
  try {
    const actor = await requerirPuestosActivos([...CAMPANA_ROLES])
    const accountScope = await readRequestAccountScope()
    const data = await obtenerInicioCampanasParaActor(actor, {
      scopeAccountId: accountScope.accountId,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el resumen de campanas.',
      },
      { status: 500 }
    )
  }
}
