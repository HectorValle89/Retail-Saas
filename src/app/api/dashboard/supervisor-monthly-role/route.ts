import { NextRequest, NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { obtenerRolMensualSupervisor } from '@/features/dashboard/services/supervisorMonthlyRoleService'
import type { SupervisorMonthlyPdvStoreType } from '@/features/asignaciones/services/asignacionMaterializationService'

function currentMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? new Date().toISOString().slice(0, 4)
  const month = parts.find((part) => part.type === 'month')?.value ?? new Date().toISOString().slice(5, 7)
  return `${year}-${month}`
}

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  if (actor.puesto !== 'SUPERVISOR') {
    return NextResponse.json({ error: 'No autorizado para Rol mensual.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || currentMonthValue()
  const cadenaCodigo = searchParams.get('cadena')
  const storeTypeValue = searchParams.get('storeType')
  const storeType =
    storeTypeValue === 'FIJO' || storeTypeValue === 'ROTATIVO'
      ? (storeTypeValue as SupervisorMonthlyPdvStoreType)
      : null

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'El mes debe tener formato YYYY-MM.' }, { status: 400 })
  }

  try {
    const calendar = await obtenerRolMensualSupervisor(actor, {
      month,
      cadenaCodigo,
      storeType,
    })

    return NextResponse.json(
      { calendar },
      {
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible cargar el rol mensual.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}