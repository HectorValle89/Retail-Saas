import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { collectPdvsExportPayload } from '@/features/pdvs/services/pdvService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function escapeCsvValue(value: string | number | null) {
  const normalized = value == null ? '' : String(value)
  if (normalized.includes('"') || normalized.includes(',') || normalized.includes(String.fromCharCode(10))) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

const PDV_EXPORT_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const

export async function GET() {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !PDV_EXPORT_ROLES.some((role) => role === actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const payload = await collectPdvsExportPayload(supabase)
    const csv = `﻿${payload.headers.join(',')}\n${payload.rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n')}${payload.rows.length > 0 ? '\n' : ''}`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${payload.filenameBase}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible exportar PDVs.' },
      { status: 500 }
    )
  }
}
