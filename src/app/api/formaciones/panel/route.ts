import { NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { obtenerPanelFormaciones } from '@/features/formaciones/services/formacionService'

const FORMACION_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'] as const

export async function GET() {
  try {
    const actor = await requerirPuestosActivos([...FORMACION_ROLES])
    const accountScope = await readRequestAccountScope()
    const data = await obtenerPanelFormaciones(actor, {
      scopeAccountId: accountScope.accountId,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'No fue posible refrescar el panel de formaciones.' },
      { status: 500 }
    )
  }
}
