import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente } from '@/types/database'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import { buildReportWindowMetadata, resolveReportWindow, resolveTimestampAgainstReportWindow } from '@/lib/operations/reportWindow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type CuentaClienteRow = Pick<CuentaCliente, 'id' | 'activa' | 'identificador' | 'nombre'>

interface VentaAttendanceRow {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  pdv_id: string
  fecha_operacion: string
  check_in_utc: string | null
  check_out_utc: string | null
  estatus: 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
}

interface VentaPdvRow {
  id: string
  clave_btl: string | null
  nombre: string | null
  ciudad:
    | { nombre: string | null }
    | Array<{ nombre: string | null }>
    | null
}

interface ExistingVentaRow {
  id: string
  metadata: Record<string, unknown> | null
}

export interface RegisterVentaInput {
  id?: string | null
  cuentaClienteId: string
  empleadoId: string
  pdvId: string
  asistenciaId: string | null
  productoId: string | null
  productoSku: string | null
  productoNombre: string
  productoNombreCorto: string | null
  fechaUtc: string
  totalUnidades: number
  totalMonto: number
  confirmada: boolean
  validadaPorEmpleadoId: string | null
  validadaEn: string | null
  observaciones: string | null
  origen: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
  metadata?: Record<string, unknown>
  allowOutsideStandardWindow?: boolean
}

export interface RegisterVentaResult {
  id: string
  inserted: boolean
  replacedExisting: boolean
  context: {
    cuentaClienteId: string
    cuentaClienteNombre: string | null
    cuentaClienteIdentificador: string | null
    empleadoId: string
    pdvId: string
    attendanceId: string
    fechaOperacion: string
    timezone: string
    pdvEstado: string | null
    pdvClaveBtl: string | null
    pdvNombre: string | null
  }
}

const getFirst = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

async function resolveVentaEffectiveAccount(
  service: TypedSupabaseClient,
  requestedAccountId: string | null
) {
  if (requestedAccountId) {
    const { data, error } = await service
      .from('cuenta_cliente')
      .select('id, activa, identificador, nombre')
      .eq('id', requestedAccountId)
      .maybeSingle()

    const cuenta = data as CuentaClienteRow | null

    if (error || !cuenta || !cuenta.activa) {
      throw new Error('La cuenta cliente seleccionada no existe o no esta activa.')
    }

    return cuenta
  }

  const { data, error } = await service
    .from('cuenta_cliente')
    .select('id, activa, identificador, nombre')
    .eq('identificador', 'isdin_mexico')
    .eq('activa', true)
    .maybeSingle()

  const fallback = data as CuentaClienteRow | null

  if (error || !fallback) {
    throw new Error('No fue posible resolver la cuenta operativa de ISDIN.')
  }

  return fallback
}

async function resolveVentaAttendanceContext(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    empleadoId,
    pdvId,
    asistenciaId,
    fechaUtc,
  }: {
    cuentaClienteId: string
    empleadoId: string
    pdvId: string
    asistenciaId: string | null
    fechaUtc: string
  }
) {
  if (!asistenciaId) {
    throw new Error('Necesitas un check-in valido del mismo dia para registrar ventas.')
  }

  const [attendanceResult, pdvResult] = await Promise.all([
    service
      .from('asistencia')
      .select('id, cuenta_cliente_id, empleado_id, pdv_id, fecha_operacion, check_in_utc, check_out_utc, estatus')
      .eq('id', asistenciaId)
      .maybeSingle(),
    service
      .from('pdv')
      .select('id, clave_btl, nombre, ciudad:ciudad_id(nombre)')
      .eq('id', pdvId)
      .maybeSingle(),
  ])

  const attendance = attendanceResult.data as VentaAttendanceRow | null
  const pdv = pdvResult.data as VentaPdvRow | null

  if (attendanceResult.error || !attendance) {
    throw new Error('La jornada del dia ya no esta disponible para registrar ventas.')
  }

  if (pdvResult.error || !pdv) {
    throw new Error('El PDV operativo ya no esta disponible para registrar ventas.')
  }

  if (attendance.cuenta_cliente_id !== cuentaClienteId) {
    throw new Error('La jornada no corresponde a la cuenta cliente operativa.')
  }

  if (attendance.empleado_id !== empleadoId) {
    throw new Error('La jornada no corresponde a la dermoconsejera seleccionada.')
  }

  if (attendance.pdv_id !== pdvId) {
    throw new Error('Las ventas deben registrarse sobre el PDV real del token del dia.')
  }

  if (!attendance.check_in_utc || attendance.estatus === 'RECHAZADA') {
    throw new Error('No existe un check-in valido para registrar ventas en esta fecha.')
  }

  const pdvCity = getFirst(pdv.ciudad)
  const pdvState = resolveMexicoStateFromCity(pdvCity?.nombre ?? null)
  const reportWindow = resolveReportWindow({
    operationDate: attendance.fecha_operacion,
    pdvState,
    checkInUtc: attendance.check_in_utc,
    checkOutUtc: attendance.check_out_utc,
    nowUtc: fechaUtc,
  })

  if (!reportWindow.canReportToday) {
    throw new Error(
      reportWindow.status === 'VENTANA_CERRADA'
        ? 'La ventana digital de reportes de este dia ya cerro para ventas.'
        : 'No existe una ventana valida de reportes para registrar ventas.'
    )
  }

  return {
    attendance,
    pdv,
    pdvState,
    timezone: reportWindow.timezone,
  }
}

async function findExistingVentaForReplacement(
  service: TypedSupabaseClient,
  {
    empleadoId,
    pdvId,
    productoId,
  }: {
    empleadoId: string
    pdvId: string
    productoId: string | null
  }
) {
  let query = service
    .from('venta')
    .select('id, metadata')
    .eq('empleado_id', empleadoId)
    .eq('pdv_id', pdvId)

  if (productoId) {
    query = query.eq('producto_id', productoId)
  }

  const result = await query.order('fecha_utc', { ascending: false }).limit(24)

  if (result.error) {
    throw new Error(result.error.message)
  }

  return (result.data ?? []) as ExistingVentaRow[]
}

export async function registerVentaWithService(
  service: TypedSupabaseClient,
  input: RegisterVentaInput
): Promise<RegisterVentaResult> {
  const cuenta = await resolveVentaEffectiveAccount(service, input.cuentaClienteId)
  const context = await resolveVentaAttendanceContext(service, {
    cuentaClienteId: cuenta.id,
    empleadoId: input.empleadoId,
    pdvId: input.pdvId,
    asistenciaId: input.asistenciaId,
    fechaUtc: input.fechaUtc,
  })

  if (!(input.allowOutsideStandardWindow ?? false)) {
    const timestamp = resolveTimestampAgainstReportWindow({
      timestampUtc: input.fechaUtc,
      operationDate: context.attendance.fecha_operacion,
      pdvState: context.pdvState,
    })

    if (!timestamp.withinStandardWindow) {
      throw new Error('La venta quedo fuera de la ventana estandar del dia. Usa un registro extemporaneo.')
    }
  }

  const metadata = {
    ...(input.metadata ?? {}),
    ...buildReportWindowMetadata({
      timestampUtc: input.fechaUtc,
      operationDate: context.attendance.fecha_operacion,
      pdvState: context.pdvState,
      source: input.origen,
    }),
    pdv_clave_btl: context.pdv.clave_btl,
    pdv_nombre: context.pdv.nombre,
  }

  const rpcPayload = {
    id: input.id ?? null,
    cuenta_cliente_id: cuenta.id,
    asistencia_id: context.attendance.id,
    empleado_id: input.empleadoId,
    pdv_id: input.pdvId,
    producto_id: input.productoId,
    producto_sku: input.productoSku,
    producto_nombre: input.productoNombre,
    producto_nombre_corto: input.productoNombreCorto,
    fecha_utc: input.fechaUtc,
    total_unidades: input.totalUnidades,
    total_monto: input.totalMonto,
    confirmada: input.confirmada,
    validada_por_empleado_id: input.validadaPorEmpleadoId,
    validada_en: input.validadaEn,
    observaciones: input.observaciones,
    origen: input.origen,
    metadata,
  }

  const { data, error } = await service.rpc('rpc_registrar_venta', {
    p_datos: rpcPayload,
  })

  if (error || !data?.ok) {
    throw new Error(error?.message ?? 'No fue posible registrar la venta mediante RPC.')
  }

  return {
    id: data.id,
    inserted: data.inserted,
    replacedExisting: data.replacedExisting,
    context: {
      cuentaClienteId: cuenta.id,
      cuentaClienteNombre: cuenta.nombre ?? null,
      cuentaClienteIdentificador: cuenta.identificador ?? null,
      empleadoId: input.empleadoId,
      pdvId: input.pdvId,
      attendanceId: context.attendance.id,
      fechaOperacion: context.attendance.fecha_operacion,
      timezone: context.timezone,
      pdvEstado: context.pdvState,
      pdvClaveBtl: context.pdv.clave_btl,
      pdvNombre: context.pdv.nombre,
    },
  }
}
