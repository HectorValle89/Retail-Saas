export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import { enqueueAndProcessMaterializedAssignments } from '@/features/asignaciones/services/asignacionMaterializationService'

type TypedSupabaseClient = ReturnType<typeof createServiceClient>

interface PublishedBaseRow {
  id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
}

function getCurrentMxMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function addUtcMonths(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset, 1)
  return date.toISOString().slice(0, 7)
}

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

function formatMonthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function intersectsMonth(row: PublishedBaseRow, month: string) {
  const lowerBound = startOfMonth(month)
  const upperBound = endOfMonth(month)
  const normalizedStart = row.fecha_inicio.slice(0, 10)
  const normalizedEnd = row.fecha_fin ? row.fecha_fin.slice(0, 10) : upperBound
  const effectiveStart = normalizedStart > lowerBound ? normalizedStart : lowerBound
  const effectiveEnd = normalizedEnd < upperBound ? normalizedEnd : upperBound
  return effectiveStart <= effectiveEnd
}

async function publishOperationalMonth(
  service: TypedSupabaseClient,
  cuentaClienteId: string,
  month: string
) {
  const { data, error } = await service
    .from('asignacion')
    .select('id, empleado_id, fecha_inicio, fecha_fin')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('naturaleza', 'BASE')
    .eq('estado_publicacion', 'PUBLICADA')
    .order('empleado_id', { ascending: true })
    .order('fecha_inicio', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as PublishedBaseRow[]
  const eligibleRows = rows.filter((row) => intersectsMonth(row, month))
  const employeeIds = Array.from(new Set(eligibleRows.map((row) => row.empleado_id)))

  if (employeeIds.length > 0) {
    await enqueueAndProcessMaterializedAssignments(
      employeeIds.map((empleadoId) => ({
        empleadoId,
        fechaInicio: startOfMonth(month),
        fechaFin: endOfMonth(month),
        motivo: 'OPERACION_MENSUAL_AUTOMATICA',
        payload: {
          month,
          source: 'scheduled-publication',
        },
      })),
      service as never
    )
  }

  await service.from('audit_log').insert({
    tabla: 'asignacion',
    registro_id: `operacion-mensual-automatica-${month}`,
    accion: 'EVENTO',
    payload: {
      evento: 'asignacion_operacion_mensual_automatica',
      month,
      month_label: formatMonthLabel(month),
      asignaciones_cubiertas: eligibleRows.length,
      empleados_materializados: employeeIds.length,
    },
    usuario_id: null,
    cuenta_cliente_id: cuentaClienteId,
  })

  return {
    month,
    monthLabel: formatMonthLabel(month),
    publishedRows: eligibleRows.length,
    materializedEmployees: employeeIds.length,
  }
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.ASIGNACIONES_CRON_SECRET
  if (!expectedSecret || request.headers.get('x-asignaciones-cron-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const service = createServiceClient()
    const accountId = getSingleTenantAccountId()
    const forcedMonth = request.nextUrl.searchParams.get('month')
    const baseMonth = /^\d{4}-\d{2}$/.test(forcedMonth ?? '') ? String(forcedMonth) : getCurrentMxMonth()
    const months = [baseMonth, addUtcMonths(baseMonth, 1)]
    const results = [] as Array<{
      month: string
      monthLabel: string
      publishedRows: number
      materializedEmployees: number
    }>

    for (const month of months) {
      results.push(await publishOperationalMonth(service as never, accountId, month))
    }

    return NextResponse.json({
      ok: true,
      accountId,
      months: results,
      message: 'Publicacion mensual automatica ejecutada para mes actual y siguiente.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No fue posible ejecutar la publicacion automatica de asignaciones.',
      },
      { status: 500 }
    )
  }
}

