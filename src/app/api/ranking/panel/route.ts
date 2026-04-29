import { NextRequest, NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerPanelRanking } from '@/features/rankings/services/rankingService'
import type { Puesto } from '@/types/database'
import { createClient } from '@/lib/supabase/server'

const RANKING_ROLES = [
  'DERMOCONSEJERO',
  'SUPERVISOR',
  'COORDINADOR',
  'LOVE_IS',
  'VENTAS',
  'ADMINISTRADOR',
  'CLIENTE',
] as const satisfies Puesto[]

function pickString(value: string | null) {
  return value?.trim() || undefined
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos([...RANKING_ROLES])
    const supabase = await createClient()
    const { searchParams } = request.nextUrl

    const data = await obtenerPanelRanking(actor, supabase, {
      periodo: pickString(searchParams.get('periodo')),
      corte: pickString(searchParams.get('corte')),
      zona: pickString(searchParams.get('zona')),
      supervisorId: pickString(searchParams.get('supervisorId')),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el ranking operativo.',
      },
      { status: 500 }
    )
  }
}
