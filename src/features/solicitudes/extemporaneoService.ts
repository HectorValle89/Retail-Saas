import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, Empleado, Pdv, Puesto, RegistroExtemporaneo } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre'>
type EmpleadoRelacion = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>
type PdvRelacion = Pick<Pdv, 'id' | 'nombre' | 'clave_btl'>

interface RegistroExtemporaneoQueryRow
  extends Pick<
    RegistroExtemporaneo,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'pdv_id'
    | 'fecha_operativa'
    | 'fecha_registro_utc'
    | 'tipo_registro'
    | 'estatus'
    | 'motivo'
    | 'motivo_rechazo'
    | 'evidencia_url'
    | 'evidencia_hash'
    | 'evidencia_thumbnail_url'
    | 'evidencia_thumbnail_hash'
    | 'venta_payload'
    | 'love_payload'
    | 'venta_registro_id'
    | 'love_registro_id'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  supervisor: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

export interface RegistroExtemporaneoResumen {
  total: number
  pendientes: number
  aprobados: number
  rechazados: number
}

export interface RegistroExtemporaneoListadoItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleadoId: string
  empleado: string
  supervisorId: string | null
  supervisor: string | null
  pdvId: string
  pdv: string | null
  pdvClaveBtl: string | null
  fechaOperativa: string
  fechaRegistroUtc: string
  tipoRegistro: RegistroExtemporaneo['tipo_registro']
  estatus: RegistroExtemporaneo['estatus']
  motivo: string
  motivoRechazo: string | null
  evidenciaUrl: string | null
  evidenciaHash: string | null
  evidenciaThumbnailUrl: string | null
  evidenciaThumbnailHash: string | null
  ventaPayload: Record<string, unknown>
  lovePayload: Record<string, unknown>
  recurrenciaMes: number
  gapDiasRetraso: number
  requiereAccionActor: boolean
}

const getFirst = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

function getMonthRange(date: string) {
  const [yearRaw, monthRaw] = date.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10),
  }
}

function canActorResolve(actorPuesto: Puesto | null, actorEmpleadoId: string | null | undefined, row: RegistroExtemporaneoQueryRow) {
  if (row.estatus !== 'PENDIENTE_APROBACION') {
    return false
  }

  if (actorPuesto === 'ADMINISTRADOR') {
    return true
  }

  if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
    return row.supervisor_empleado_id === actorEmpleadoId
  }

  return false
}

function mapItem(
  row: RegistroExtemporaneoQueryRow,
  actorPuesto: Puesto | null,
  actorEmpleadoId: string | null | undefined,
  recurrenceByEmployee: Map<string, number>
): RegistroExtemporaneoListadoItem {
  const metadata = normalizeMetadata(row.metadata)
  return {
    id: row.id,
    cuentaClienteId: row.cuenta_cliente_id,
    cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
    empleadoId: row.empleado_id,
    empleado: getFirst(row.empleado)?.nombre_completo ?? 'Sin empleado',
    supervisorId: row.supervisor_empleado_id,
    supervisor: getFirst(row.supervisor)?.nombre_completo ?? null,
    pdvId: row.pdv_id,
    pdv: getFirst(row.pdv)?.nombre ?? null,
    pdvClaveBtl: getFirst(row.pdv)?.clave_btl ?? null,
    fechaOperativa: row.fecha_operativa,
    fechaRegistroUtc: row.fecha_registro_utc,
    tipoRegistro: row.tipo_registro,
    estatus: row.estatus,
    motivo: row.motivo,
    motivoRechazo: row.motivo_rechazo,
    evidenciaUrl: row.evidencia_url,
    evidenciaHash: row.evidencia_hash,
    evidenciaThumbnailUrl: row.evidencia_thumbnail_url,
    evidenciaThumbnailHash: row.evidencia_thumbnail_hash,
    ventaPayload: normalizeMetadata(row.venta_payload),
    lovePayload: normalizeMetadata(row.love_payload),
    recurrenciaMes: recurrenceByEmployee.get(row.empleado_id) ?? Number(metadata.recurrencia_mes ?? 0),
    gapDiasRetraso: Number(metadata.gap_dias_retraso ?? 0),
    requiereAccionActor: canActorResolve(actorPuesto, actorEmpleadoId, row),
  }
}

export async function obtenerRegistrosExtemporaneosPanel(
  client: TypedSupabaseClient,
  {
    actorPuesto,
    actorEmpleadoId,
  }: {
    actorPuesto?: Puesto | null
    actorEmpleadoId?: string | null
  }
): Promise<{
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  resumen: RegistroExtemporaneoResumen
  registros: RegistroExtemporaneoListadoItem[]
}> {
  const result = await client
    .from('registro_extemporaneo')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      supervisor_empleado_id,
      pdv_id,
      fecha_operativa,
      fecha_registro_utc,
      tipo_registro,
      estatus,
      motivo,
      motivo_rechazo,
      evidencia_url,
      evidencia_hash,
      evidencia_thumbnail_url,
      evidencia_thumbnail_hash,
      venta_payload,
      love_payload,
      venta_registro_id,
      love_registro_id,
      metadata,
      cuenta_cliente:cuenta_cliente_id(id, nombre),
      empleado:empleado_id(id, nombre_completo, puesto),
      supervisor:supervisor_empleado_id(id, nombre_completo, puesto),
      pdv:pdv_id(id, nombre, clave_btl)
    `)
    .order('fecha_operativa', { ascending: false })
    .limit(100)

  if (result.error) {
    return {
      infraestructuraLista: false,
      mensajeInfraestructura: `La tabla \`registro_extemporaneo\` aun no esta disponible en Supabase. ${result.error.message}`,
      resumen: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registros: [],
    }
  }

  const rows = (result.data ?? []) as RegistroExtemporaneoQueryRow[]
  const recurrenceByEmployee = new Map<string, number>()
  const employeeIds = Array.from(new Set(rows.map((row) => row.empleado_id))).filter(Boolean)

  if (employeeIds.length > 0) {
    const currentMonthStart = getMonthRange(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())).start
    const currentMonthEnd = getMonthRange(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())).end
    const recurrenceResult = await client
      .from('registro_extemporaneo')
      .select('empleado_id, fecha_operativa')
      .in('empleado_id', employeeIds)
      .gte('fecha_operativa', currentMonthStart)
      .lte('fecha_operativa', currentMonthEnd)

    const recurrenceRows = (recurrenceResult.data ?? []) as Array<{ empleado_id: string }>
    for (const row of recurrenceRows) {
      recurrenceByEmployee.set(row.empleado_id, (recurrenceByEmployee.get(row.empleado_id) ?? 0) + 1)
    }
  }

  const registros = rows.map((row) => mapItem(row, actorPuesto ?? null, actorEmpleadoId, recurrenceByEmployee))

  return {
    infraestructuraLista: true,
    resumen: {
      total: registros.length,
      pendientes: registros.filter((item) => item.estatus === 'PENDIENTE_APROBACION').length,
      aprobados: registros.filter((item) => item.estatus === 'APROBADO').length,
      rechazados: registros.filter((item) => item.estatus === 'RECHAZADO').length,
    },
    registros,
  }
}
