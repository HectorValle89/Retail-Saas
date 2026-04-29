import { NextRequest, NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerBitacoraPanel } from '@/features/bitacora/services/bitacoraService'

function pickString(value: string | null) {
  return value?.trim() || undefined
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirAdministradorActivo()
    const supabase = await createClient({ bypassTenantScope: true })
    const { searchParams } = request.nextUrl

    const data = await obtenerBitacoraPanel(supabase, {
      actor,
      usuario: pickString(searchParams.get('usuario')),
      modulo: pickString(searchParams.get('modulo')),
      accion: pickString(searchParams.get('accion')),
      fechaDesde: pickString(searchParams.get('fechaDesde')),
      fechaHasta: pickString(searchParams.get('fechaHasta')),
      cursor: pickString(searchParams.get('cursor')),
      history: pickString(searchParams.get('history')),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 50),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar la bitacora administrativa.',
      },
      { status: 500 }
    )
  }
}
