import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente } from '@/types/database'
import { buildReportWindowMetadata, resolveReportWindow, resolveTimestampAgainstReportWindow } from '@/lib/operations/reportWindow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type CuentaClienteRow = Pick<CuentaCliente, 'id' | 'activa' | 'identificador' | 'nombre'>

interface LoveAttendanceRow {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  pdv_id: string
  fecha_operacion: string
  check_in_utc: string | null
  check_out_utc: string | null
  estatus: 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
}

interface LovePdvRow {
  id: string
  nombre: string
  clave_btl: string
  zona: string | null
  cadena_id: string | null
  ciudad:
    | { nombre: string | null; estado: string | null }
    | Array<{ nombre: string | null; estado: string | null }>
    | null
}

interface LoveEmpleadoRow {
  id: string
  supervisor_empleado_id: string | null
}

interface LoveCadenaRow {
  id: string
  nombre: string
}

interface LoveQrCodigoRow {
  id: string
  codigo: string
  imagen_url: string | null
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
}

interface LoveQrAsignacionRow {
  id: string
  cuenta_cliente_id: string
  qr_codigo_id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
}

const getFirst = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export interface LoveQrActivo {
  codigoId: string
  asignacionId: string
  codigo: string
  imageUrl: string | null
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
}

export interface LoveResolvedContext {
  cuentaClienteId: string
  cuentaClienteIdentificador: string | null
  cuentaClienteNombre: string | null
  empleadoId: string
  pdvId: string
  attendanceId: string
  fechaOperacion: string
  supervisorEmpleadoId: string | null
  pdvClaveBtl: string | null
  pdvNombre: string | null
  zona: string | null
  cadena: string | null
  pdvEstado: string | null
  timezone: string
  qr: LoveQrActivo
}

export interface RegisterLoveAffiliationInput {
  id?: string | null
  cuentaClienteId: string
  empleadoId: string
  pdvId: string
  asistenciaId: string | null
  afiliadoNombre: string
  afiliadoContacto: string | null
  ticketFolio: string | null
  fechaUtc: string
  origen: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
  metadata?: Record<string, unknown>
  evidenciaUrl?: string | null
  evidenciaHash?: string | null
  evidenciaThumbnailUrl?: string | null
  evidenciaThumbnailHash?: string | null
  evidenciaOptimization?: Record<string, unknown> | null
  allowOutsideStandardWindow?: boolean
}

export interface RegisterLoveAffiliationResult {
  id: string
  context: LoveResolvedContext
  inserted: boolean
}

export async function resolveLoveEffectiveAccount(
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

async function resolveAttendanceContext(
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
    throw new Error('Necesitas un check-in valido del mismo dia para registrar afiliaciones LOVE ISDIN.')
  }

  const { data, error } = await service
    .from('asistencia')
    .select('id, cuenta_cliente_id, empleado_id, pdv_id, fecha_operacion, check_in_utc, check_out_utc, estatus')
    .eq('id', asistenciaId)
    .maybeSingle()

  const asistencia = data as LoveAttendanceRow | null

  if (error || !asistencia) {
    throw new Error('La jornada del dia ya no esta disponible para registrar LOVE ISDIN.')
  }

  if (asistencia.cuenta_cliente_id !== cuentaClienteId) {
    throw new Error('La jornada del dia no corresponde a la cuenta cliente seleccionada.')
  }

  if (asistencia.empleado_id !== empleadoId) {
    throw new Error('La jornada del dia no corresponde a la dermoconsejera seleccionada.')
  }

  if (asistencia.pdv_id !== pdvId) {
    throw new Error('La afiliacion debe registrarse sobre el PDV real del token del dia.')
  }

  if (asistencia.estatus === 'RECHAZADA') {
    throw new Error('La jornada del dia fue rechazada y no puede usarse para registrar LOVE ISDIN.')
  }

  return asistencia
}

export async function resolveActiveLoveQr(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    empleadoId,
  }: {
    cuentaClienteId: string
    empleadoId: string
  }
): Promise<LoveQrActivo> {
  const { data: asignacionData, error: asignacionError } = await service
    .from('love_isdin_qr_asignacion')
    .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('empleado_id', empleadoId)
    .is('fecha_fin', null)
    .order('fecha_inicio', { ascending: false })
    .maybeSingle()

  const asignacion = asignacionData as LoveQrAsignacionRow | null

  if (asignacionError || !asignacion) {
    throw new Error('La dermoconsejera no tiene un QR oficial activo asignado.')
  }

  const { data: codigoData, error: codigoError } = await service
    .from('love_isdin_qr_codigo')
    .select('id, codigo, imagen_url, estado')
    .eq('id', asignacion.qr_codigo_id)
    .maybeSingle()

  const codigo = codigoData as LoveQrCodigoRow | null

  if (codigoError || !codigo) {
    throw new Error('El QR oficial asignado ya no esta disponible.')
  }

  if (codigo.estado !== 'ACTIVO') {
    throw new Error('El QR oficial asignado no esta activo para operar afiliaciones.')
  }

  return {
    codigoId: codigo.id,
    asignacionId: asignacion.id,
    codigo: codigo.codigo,
    imageUrl: codigo.imagen_url,
    estado: codigo.estado,
  }
}

export async function resolveLoveOperationalContext(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    empleadoId,
    pdvId,
    asistenciaId,
  }: {
    cuentaClienteId: string
    empleadoId: string
    pdvId: string
    asistenciaId: string | null
  }
): Promise<LoveResolvedContext> {
  const cuenta = await resolveLoveEffectiveAccount(service, cuentaClienteId)
  const [asistencia, qr, empleadoResult, pdvResult] = await Promise.all([
    resolveAttendanceContext(service, {
      cuentaClienteId: cuenta.id,
      empleadoId,
      pdvId,
      asistenciaId,
      fechaUtc: new Date().toISOString(),
    }),
    resolveActiveLoveQr(service, {
      cuentaClienteId: cuenta.id,
      empleadoId,
    }),
    service
      .from('empleado')
      .select('id, supervisor_empleado_id')
      .eq('id', empleadoId)
      .maybeSingle(),
    service
      .from('pdv')
      .select('id, nombre, clave_btl, zona, cadena_id, ciudad:ciudad_id(nombre, estado)')
      .eq('id', pdvId)
      .maybeSingle(),
  ])

  const empleado = empleadoResult.data as LoveEmpleadoRow | null
  const pdv = pdvResult.data as LovePdvRow | null

  if (empleadoResult.error || !empleado) {
    throw new Error('La dermoconsejera ligada a la jornada activa ya no esta disponible.')
  }

  if (pdvResult.error || !pdv) {
    throw new Error('El PDV ligado a la jornada activa ya no esta disponible.')
  }

  const pdvCity = getFirst(pdv.ciudad)
  const reportWindow = resolveReportWindow({
    operationDate: asistencia.fecha_operacion,
    pdvState: pdvCity?.estado ?? null,
    checkInUtc: asistencia.check_in_utc,
    checkOutUtc: asistencia.check_out_utc,
  })

  if (!reportWindow.hasValidCheckIn) {
    throw new Error('Necesitas un check-in valido del mismo dia para registrar LOVE ISDIN.')
  }

  let cadenaNombre: string | null = null

  if (pdv.cadena_id) {
    const { data: cadenaData, error: cadenaError } = await service
      .from('cadena')
      .select('id, nombre')
      .eq('id', pdv.cadena_id)
      .maybeSingle()

    const cadena = cadenaData as LoveCadenaRow | null

    if (cadenaError) {
      throw new Error(cadenaError.message)
    }

    cadenaNombre = cadena?.nombre ?? null
  }

  return {
    cuentaClienteId: cuenta.id,
    cuentaClienteIdentificador: cuenta.identificador ?? null,
    cuentaClienteNombre: cuenta.nombre ?? null,
    empleadoId,
    pdvId,
    attendanceId: asistencia.id,
    fechaOperacion: asistencia.fecha_operacion,
    supervisorEmpleadoId: empleado.supervisor_empleado_id,
    pdvClaveBtl: pdv.clave_btl ?? null,
    pdvNombre: pdv.nombre ?? null,
    zona: pdv.zona ?? null,
    cadena: cadenaNombre,
    pdvEstado: pdvCity?.estado ?? null,
    timezone: reportWindow.timezone,
    qr,
  }
}

export async function registerLoveAffiliationWithService(
  service: TypedSupabaseClient,
  input: RegisterLoveAffiliationInput
): Promise<RegisterLoveAffiliationResult> {
  const context = await resolveLoveOperationalContext(service, {
    cuentaClienteId: input.cuentaClienteId,
    empleadoId: input.empleadoId,
    pdvId: input.pdvId,
    asistenciaId: input.asistenciaId,
  })

  if (!(input.allowOutsideStandardWindow ?? false)) {
    const timestamp = resolveTimestampAgainstReportWindow({
      timestampUtc: input.fechaUtc,
      operationDate: context.fechaOperacion,
      pdvState: context.pdvEstado,
    })

    if (!timestamp.withinStandardWindow) {
      throw new Error('La ventana digital de LOVE ISDIN ya cerro para este dia. Usa un registro extemporaneo.')
    }
  }

  if (input.id) {
    const { data: existing, error: existingError } = await service
      .from('love_isdin')
      .select('id')
      .eq('id', input.id)
      .maybeSingle()

    if (existingError) {
      throw new Error(existingError.message)
    }

    if (existing?.id) {
      return {
        id: existing.id as string,
        context,
        inserted: false,
      }
    }
  }

  const duplicateQuery = await service
    .from('love_isdin')
    .select('id, metadata')
    .eq('empleado_id', context.empleadoId)
    .eq('pdv_id', context.pdvId)
    .order('fecha_utc', { ascending: false })
    .limit(24)

  if (duplicateQuery.error) {
    throw new Error(duplicateQuery.error.message)
  }

  const sameDayDuplicate = ((duplicateQuery.data ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>)
    .find((item) => {
      const metadata =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? item.metadata
          : {}
      const sameOperationDate = String(metadata.fecha_operativa ?? '') === context.fechaOperacion
      const sameContacto =
        input.afiliadoContacto &&
        String(metadata.afiliado_contacto_normalizado ?? '').toUpperCase() === input.afiliadoContacto.trim().toUpperCase()
      const sameNombre =
        !input.afiliadoContacto &&
        String(metadata.afiliado_nombre_normalizado ?? '').toUpperCase() === input.afiliadoNombre.trim().toUpperCase()
      return sameOperationDate && (sameContacto || sameNombre)
    })

  if (sameDayDuplicate) {
    return {
      id: sameDayDuplicate.id,
      context,
      inserted: false,
    }
  }

  const { data: created, error } = await service
    .from('love_isdin')
    .insert({
      id: input.id ?? undefined,
      cuenta_cliente_id: context.cuentaClienteId,
      asistencia_id: context.attendanceId,
      empleado_id: context.empleadoId,
      pdv_id: context.pdvId,
      qr_codigo_id: context.qr.codigoId,
      qr_asignacion_id: context.qr.asignacionId,
      qr_personal: context.qr.codigo,
      afiliado_nombre: input.afiliadoNombre,
      afiliado_contacto: input.afiliadoContacto,
      ticket_folio: input.ticketFolio,
      fecha_utc: input.fechaUtc,
      evidencia_url: input.evidenciaUrl ?? null,
      evidencia_hash: input.evidenciaHash ?? null,
      estatus: 'PENDIENTE_VALIDACION',
      origen: input.origen,
      metadata: {
        ...(input.metadata ?? {}),
        ...buildReportWindowMetadata({
          timestampUtc: input.fechaUtc,
          operationDate: context.fechaOperacion,
          pdvState: context.pdvEstado,
          source: input.origen,
        }),
        qr_codigo_id: context.qr.codigoId,
        qr_asignacion_id: context.qr.asignacionId,
        qr_imagen_url: context.qr.imageUrl,
        qr_estado: context.qr.estado,
        pdv_clave_btl: context.pdvClaveBtl,
        pdv_nombre: context.pdvNombre,
        afiliado_contacto_normalizado: input.afiliadoContacto?.trim().toUpperCase() ?? null,
        afiliado_nombre_normalizado: input.afiliadoNombre.trim().toUpperCase(),
        zona_snapshot: context.zona,
        cadena_snapshot: context.cadena,
        pdv_estado_snapshot: context.pdvEstado,
        ventana_timezone: context.timezone,
        supervisor_empleado_id: context.supervisorEmpleadoId,
        evidencia_thumbnail_url: input.evidenciaThumbnailUrl ?? null,
        evidencia_thumbnail_hash: input.evidenciaThumbnailHash ?? null,
        evidencia_optimization: input.evidenciaOptimization ?? null,
      },
    })
    .select('id')
    .maybeSingle()

  if (error || !created?.id) {
    throw new Error(error?.message ?? 'No fue posible registrar la afiliacion.')
  }

  return {
    id: created.id as string,
    context,
    inserted: true,
  }
}

export async function registrarLoveAuditEvent(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    registroId,
    payload,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    registroId: string
    payload: Record<string, unknown>
  }
) {
  await service.from('audit_log').insert({
    tabla: 'love_isdin',
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}
