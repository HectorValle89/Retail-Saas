import { NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { obtenerPanelMensajes } from '@/features/mensajes/services/mensajeService'

const MENSAJES_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'DERMOCONSEJERO',
  'LOVE_IS',
  'VENTAS',
  'NOMINA',
  'LOGISTICA',
  'RECLUTAMIENTO',
] as const

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([...MENSAJES_ROLES])
    const accountScope = await readRequestAccountScope()
    const { searchParams } = new URL(request.url)
    const data = await obtenerPanelMensajes(actor, {
      scopeAccountId: accountScope.accountId,
      page: parsePositiveInt(searchParams.get('page'), 1),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 20),
      direction: searchParams.get('direction'),
      tab: searchParams.get('tab'),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de mensajes.',
      },
      { status: 500 }
    )
  }
}
