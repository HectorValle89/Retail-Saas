import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildGeofencePushAlert } from '@/features/asistencias/lib/geofencePushAlert'
import {
  ensureVisitTaskSession,
  getPendingVisitTaskLabels,
  readCampaignTaskVariability,
  readVisitTaskTemplate,
} from '@/features/campanas/lib/campaignProgress'
import { hasCheckoutCoordinates } from '@/features/asistencias/lib/asistenciaRules'
import { selectAttendanceMission, type AttendanceMissionCatalogItem } from '@/features/asistencias/lib/attendanceMission'
import { resolveEmployeeBiometricContext, validateAttendanceBiometrics } from '@/lib/biometrics/attendanceBiometrics'
import { obtenerActorActual, type ActorActual } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import {
  DEFAULT_MEXICO_OPERATION_TIMEZONE,
  formatIsoDateInTimezone,
  resolveMexicoTimezoneFromState,
} from '@/lib/geo/mexicoStateTimezone'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { createServiceClient } from '@/lib/supabase/server'
import { isFallbackableAttendanceRpcError } from './attendanceSyncErrors'
import { resolveCheckInAssignmentForPersistence } from './assignmentPersistence'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

const ASISTENCIAS_BUCKET = 'operacion-evidencias'
const ASISTENCIAS_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null
  }

  return value
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function normalizeRelatedRecord<T extends Record<string, unknown>>(value: T | T[] | null | undefined) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? (value[0] ?? null) : value
}

function ensureNativeCheckInCapture(metadata: Record<string, unknown>, selfieCheckInFile: File | null) {
  const selfieMetadata = normalizeMetadata(metadata.selfie)
  const captureSource = typeof selfieMetadata.capture_source === 'string' ? selfieMetadata.capture_source : null
  const timestampStamped = selfieMetadata.timestamp_stamped === true

  if (!selfieCheckInFile) {
    throw new Error('El check-in requiere selfie de entrada capturada desde la cámara nativa.')
  }

  if (captureSource !== 'native-getusermedia') {
    throw new Error('La selfie de check-in debe provenir de captura nativa con getUserMedia.')
  }

  if (!timestampStamped) {
    throw new Error('La selfie de check-in debe incluir sello operativo visible de fecha, hora y GPS.')
  }
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(ASISTENCIAS_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: ASISTENCIAS_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function uploadAttendanceEvidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    file,
    evidenceKind,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    file: File
    evidenceKind: 'check-in' | 'check-out'
  }
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('selfie', file))
  }

  if (!ASISTENCIAS_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La selfie debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureBucket(service)
  return storeOptimizedEvidence({
    service,
    bucket: ASISTENCIAS_BUCKET,
    actorUsuarioId,
    storagePrefix: `asistencias/${cuentaClienteId}/${empleadoId}/${evidenceKind}`,
    file,
  })
}

async function ensureNoPendingVisitTasks(
  service: TypedSupabaseClient,
  {
    attendanceId,
    cuentaClienteId,
    empleadoId,
    pdvId,
    fechaOperacion,
  }: {
    attendanceId: string
    cuentaClienteId: string
    empleadoId: string
    pdvId: string
    fechaOperacion: string
  }
) {
  const { data: campaignRows, error: campaignRowsError } = await service
    .from('campana_pdv')
    .select('id, campana_id, dc_empleado_id, tareas_requeridas, tareas_cumplidas, metadata')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('pdv_id', pdvId)
    .or(`dc_empleado_id.eq.${empleadoId},dc_empleado_id.is.null`)
    .limit(50)

  if (campaignRowsError) {
    throw new Error(campaignRowsError.message)
  }

  const campaignIds = Array.from(
    new Set((campaignRows ?? []).map((item) => item.campana_id).filter((item): item is string => Boolean(item)))
  )

  if (campaignIds.length === 0) {
    return
  }

  const { data: activeCampaigns, error: activeCampaignsError } = await service
    .from('campana')
    .select('id, metadata')
    .in('id', campaignIds)
    .eq('estado', 'ACTIVA')
    .lte('fecha_inicio', fechaOperacion)
    .gte('fecha_fin', fechaOperacion)

  if (activeCampaignsError) {
    throw new Error(activeCampaignsError.message)
  }

  const activeCampaignMap = new Map((activeCampaigns ?? []).map((item) => [item.id, item]))

  const pendingRows = (campaignRows ?? [])
    .filter((item) => activeCampaignMap.has(item.campana_id))
    .map((item) => {
      const campaign = activeCampaignMap.get(item.campana_id)
      const session = ensureVisitTaskSession(item.metadata, {
        attendanceId,
        templateTasks: readVisitTaskTemplate(campaign?.metadata, item.tareas_requeridas ?? []),
        variabilityCount: readCampaignTaskVariability(campaign?.metadata, (item.tareas_requeridas ?? []).length),
        generatedAt: new Date().toISOString(),
      }).session

      return {
        id: item.id,
        pendingTasks: getPendingVisitTaskLabels(session),
      }
    })
    .filter((item) => item.pendingTasks.length > 0)

  if (pendingRows.length === 0) {
    return
  }

  const pendingList = pendingRows
    .flatMap((item) => item.pendingTasks)
    .slice(0, 5)
    .join(', ')

  throw new Error(
    `No puedes cerrar el check-out mientras existan tareas de visita pendientes${pendingList ? `: ${pendingList}.` : '.'}`
  )
}

async function resolveAttendanceMission(
  service: TypedSupabaseClient,
  {
    attendanceId,
    empleadoId,
    pdvId,
    fechaOperacion,
  }: {
    attendanceId: string
    empleadoId: string
    pdvId: string
    fechaOperacion: string
  }
) {
  const { data: missionRows, error: missionRowsError } = await service
    .from('mision_dia')
    .select('id, codigo, instruccion, orden, peso')
    .eq('activa', true)
    .order('orden', { ascending: true, nullsFirst: false })
    .order('peso', { ascending: false })
    .order('created_at', { ascending: true })

  if (missionRowsError) {
    throw new Error(missionRowsError.message)
  }

  const missions = ((missionRows ?? []) as AttendanceMissionCatalogItem[])

  if (missions.length === 0) {
    throw new Error('No hay misiones activas disponibles para registrar el check-in.')
  }

  const { data: previousMissionRows, error: previousMissionError } = await service
    .from('asistencia')
    .select('mision_dia_id')
    .eq('empleado_id', empleadoId)
    .eq('pdv_id', pdvId)
    .neq('id', attendanceId)
    .not('mision_dia_id', 'is', null)
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (previousMissionError) {
    throw new Error(previousMissionError.message)
  }

  const selection = selectAttendanceMission({
    empleadoId,
    pdvId,
    fechaOperacion,
    previousMissionId: previousMissionRows?.[0]?.mision_dia_id ?? null,
    missions,
  })

  if (!selection.mission) {
    throw new Error('No fue posible resolver la mision del dia para este check-in.')
  }

  return selection
}

async function ensureCheckoutCoordinates({
  latitudCheckOut,
  longitudCheckOut,
}: {
  latitudCheckOut: number | null
  longitudCheckOut: number | null
}) {
  if (!hasCheckoutCoordinates(latitudCheckOut, longitudCheckOut)) {
    throw new Error('El check-out requiere capturar coordenadas de salida.')
  }
}

async function resolvePdvOperationTimezone(service: TypedSupabaseClient, pdvId: string) {
  const { data: pdvRow, error: pdvError } = await service
    .from('pdv')
    .select('ciudad:ciudad_id(nombre)')
    .eq('id', pdvId)
    .maybeSingle()

  if (pdvError) {
    throw new Error(pdvError.message)
  }

  const cityRelation =
    pdvRow && typeof pdvRow === 'object' && 'ciudad' in pdvRow ? pdvRow.ciudad : null
  const cityRow = Array.isArray(cityRelation) ? cityRelation[0] : cityRelation
  const cityName =
    cityRow && typeof cityRow === 'object' && 'nombre' in cityRow && typeof cityRow.nombre === 'string'
      ? cityRow.nombre
      : null

  const stateName = resolveMexicoStateFromCity(cityName)
  return resolveMexicoTimezoneFromState(stateName) ?? DEFAULT_MEXICO_OPERATION_TIMEZONE
}

async function resolveAttendanceOperationDate(
  service: TypedSupabaseClient,
  {
    existingFechaOperacion,
    pdvId,
    checkInUtc,
    checkOutUtc,
    fallbackFechaOperacion,
  }: {
    existingFechaOperacion: string | null
    pdvId: string
    checkInUtc: string | null
    checkOutUtc: string | null
    fallbackFechaOperacion: string | null
  }
) {
  if (existingFechaOperacion) {
    return existingFechaOperacion
  }

  const pivotTimestamp = checkInUtc ?? checkOutUtc
  if (!pivotTimestamp) {
    return fallbackFechaOperacion
  }

  const operationTimezone = await resolvePdvOperationTimezone(service, pdvId)
  return formatIsoDateInTimezone(pivotTimestamp, operationTimezone)
}

async function registrarEventoAudit(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    tabla,
    registroId,
    payload,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    tabla: string
    registroId: string
    payload: Record<string, unknown>
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

function buildAttendancePersistenceRow(
  record: Record<string, unknown>,
  metadata: Record<string, unknown>,
  existingAttendanceState?: {
    biometriaEstado?: string | null
    biometriaScore?: number | null
  }
) {
  const hasExplicitBiometriaEstado =
    typeof record.biometria_estado === 'string' && record.biometria_estado.trim().length > 0
  const preservedBiometriaEstado =
    typeof existingAttendanceState?.biometriaEstado === 'string' &&
    existingAttendanceState.biometriaEstado.trim().length > 0
      ? existingAttendanceState.biometriaEstado.trim()
      : null

  return {
    id: String(record.id),
    cuenta_cliente_id: String(record.cuenta_cliente_id),
    asignacion_id:
      typeof record.asignacion_id === 'string' && record.asignacion_id.length > 0
        ? record.asignacion_id
        : null,
    empleado_id: String(record.empleado_id),
    empleado_nombre:
      typeof record.empleado_nombre === 'string' && record.empleado_nombre.trim().length > 0
        ? record.empleado_nombre.trim()
        : String(record.empleado_id),
    supervisor_empleado_id:
      typeof record.supervisor_empleado_id === 'string' && record.supervisor_empleado_id.length > 0
        ? record.supervisor_empleado_id
        : null,
    pdv_id: String(record.pdv_id),
    pdv_clave_btl:
      typeof record.pdv_clave_btl === 'string' && record.pdv_clave_btl.trim().length > 0
        ? record.pdv_clave_btl.trim()
        : String(record.pdv_id),
    pdv_nombre:
      typeof record.pdv_nombre === 'string' && record.pdv_nombre.trim().length > 0
        ? record.pdv_nombre.trim()
        : String(record.pdv_id),
    pdv_zona:
      typeof record.pdv_zona === 'string' && record.pdv_zona.trim().length > 0
        ? record.pdv_zona.trim()
        : null,
    cadena_nombre:
      typeof record.cadena_nombre === 'string' && record.cadena_nombre.trim().length > 0
        ? record.cadena_nombre.trim()
        : null,
    fecha_operacion: String(record.fecha_operacion),
    check_in_utc: typeof record.check_in_utc === 'string' ? record.check_in_utc : null,
    check_out_utc: typeof record.check_out_utc === 'string' ? record.check_out_utc : null,
    distancia_check_in_metros:
      typeof record.distancia_check_in_metros === 'number' ? record.distancia_check_in_metros : null,
    distancia_check_out_metros:
      typeof record.distancia_check_out_metros === 'number' ? record.distancia_check_out_metros : null,
    latitud_check_in: typeof record.latitud_check_in === 'number' ? record.latitud_check_in : null,
    longitud_check_in: typeof record.longitud_check_in === 'number' ? record.longitud_check_in : null,
    latitud_check_out: typeof record.latitud_check_out === 'number' ? record.latitud_check_out : null,
    longitud_check_out: typeof record.longitud_check_out === 'number' ? record.longitud_check_out : null,
    estado_gps: typeof record.estado_gps === 'string' ? record.estado_gps : null,
    biometria_estado: (
      hasExplicitBiometriaEstado
        ? String(record.biometria_estado).trim()
        : preservedBiometriaEstado ?? 'NO_EVALUADA'
    ) as 'PENDIENTE' | 'VALIDA' | 'RECHAZADA' | 'NO_EVALUADA',
    biometria_score:
      typeof record.biometria_score === 'number'
        ? record.biometria_score
        : existingAttendanceState?.biometriaScore ?? null,
    selfie_check_in_url:
      typeof record.selfie_check_in_url === 'string' ? record.selfie_check_in_url : null,
    selfie_check_in_hash:
      typeof record.selfie_check_in_hash === 'string' ? record.selfie_check_in_hash : null,
    selfie_check_out_url:
      typeof record.selfie_check_out_url === 'string' ? record.selfie_check_out_url : null,
    selfie_check_out_hash:
      typeof record.selfie_check_out_hash === 'string' ? record.selfie_check_out_hash : null,
    justificacion_fuera_geocerca:
      typeof record.justificacion_fuera_geocerca === 'string'
        ? record.justificacion_fuera_geocerca
        : null,
    estatus: (typeof record.estatus === 'string' ? record.estatus : null) as
      | 'PENDIENTE_VALIDACION'
      | 'VALIDA'
      | 'RECHAZADA'
      | 'CERRADA'
      | null,
    mision_dia_id:
      typeof record.mision_dia_id === 'string' && record.mision_dia_id.length > 0
        ? record.mision_dia_id
        : null,
    mision_codigo:
      typeof record.mision_codigo === 'string' ? record.mision_codigo : null,
    mision_instruccion:
      typeof record.mision_instruccion === 'string' ? record.mision_instruccion : null,
    origen: typeof record.origen === 'string' ? record.origen : null,
    metadata,
  }
}

async function hydrateAttendanceServerSnapshot(
  service: TypedSupabaseClient,
  {
    actor,
    empleadoId,
    pdvId,
    record,
  }: {
    actor: ActorActual
    empleadoId: string
    pdvId: string
    record: Record<string, unknown>
  }
) {
  const hasEmpleadoNombre =
    typeof record.empleado_nombre === 'string' && record.empleado_nombre.trim().length > 0
  const hasPdvNombre = typeof record.pdv_nombre === 'string' && record.pdv_nombre.trim().length > 0
  const hasPdvClaveBtl =
    typeof record.pdv_clave_btl === 'string' && record.pdv_clave_btl.trim().length > 0
  const hasPdvZona = typeof record.pdv_zona === 'string' && record.pdv_zona.trim().length > 0
  const hasCadenaNombre =
    typeof record.cadena_nombre === 'string' && record.cadena_nombre.trim().length > 0

  if (hasEmpleadoNombre && hasPdvNombre && hasPdvClaveBtl && hasPdvZona && hasCadenaNombre) {
    return
  }

  if (!hasEmpleadoNombre) {
    if (actor.empleadoId === empleadoId && actor.nombreCompleto.trim().length > 0) {
      record.empleado_nombre = actor.nombreCompleto.trim()
    } else {
      const { data: empleadoRow, error: empleadoError } = await service
        .from('empleado')
        .select('id, nombre_completo')
        .eq('id', empleadoId)
        .maybeSingle()

      if (empleadoError) {
        throw new Error(empleadoError.message)
      }

      record.empleado_nombre =
        typeof empleadoRow?.nombre_completo === 'string' && empleadoRow.nombre_completo.trim().length > 0
          ? empleadoRow.nombre_completo.trim()
          : empleadoId
    }
  }

  if (!hasPdvNombre || !hasPdvClaveBtl || !hasPdvZona || !hasCadenaNombre) {
    const { data: pdvRow, error: pdvError } = await service
      .from('pdv')
      .select('id, nombre, clave_btl, zona, cadena:cadena_id(nombre)')
      .eq('id', pdvId)
      .maybeSingle()

    if (pdvError) {
      throw new Error(pdvError.message)
    }

    const cadena = normalizeRelatedRecord(pdvRow?.cadena as Record<string, unknown> | Record<string, unknown>[] | null | undefined)

    if (!hasPdvNombre) {
      record.pdv_nombre =
        typeof pdvRow?.nombre === 'string' && pdvRow.nombre.trim().length > 0
          ? pdvRow.nombre.trim()
          : pdvId
    }

    if (!hasPdvClaveBtl) {
      record.pdv_clave_btl =
        typeof pdvRow?.clave_btl === 'string' && pdvRow.clave_btl.trim().length > 0
          ? pdvRow.clave_btl.trim()
          : pdvId
    }

    if (!hasPdvZona && typeof pdvRow?.zona === 'string' && pdvRow.zona.trim().length > 0) {
      record.pdv_zona = pdvRow.zona.trim()
    }

    if (
      !hasCadenaNombre &&
      cadena &&
      typeof cadena.nombre === 'string' &&
      cadena.nombre.trim().length > 0
    ) {
      record.cadena_nombre = cadena.nombre.trim()
    }
  }
}

async function persistAttendanceRecord(
  service: TypedSupabaseClient,
  {
    actor,
    actorUsuarioId,
    cuentaClienteId,
    record,
    metadata,
  }: {
    actor: ActorActual
    actorUsuarioId: string
    cuentaClienteId: string
    record: Record<string, unknown>
    metadata: Record<string, unknown>
  }
) {
  const { data: rpcResult, error: rpcError } = await service.rpc('rpc_registrar_asistencia_dc', {
    p_datos: { ...record, metadata },
  })

  if (!rpcError && rpcResult?.ok) {
    return rpcResult as {
      ok: true
      id: string
      mision_dia_id?: string | null
      mision_codigo?: string | null
    }
  }

  if (rpcError && !isFallbackableAttendanceRpcError(rpcError.message)) {
    throw new Error(rpcError.message)
  }

  console.warn('[asistencias.sync] rpc_registrar_asistencia_dc_missing_fallback', {
    attendanceId: record.id,
    message: rpcError?.message ?? null,
  })

  if (record.check_in_utc && !record.check_out_utc && !record.mision_dia_id) {
    const missionSelection = await resolveAttendanceMission(service, {
      attendanceId: String(record.id),
      empleadoId: String(record.empleado_id),
      pdvId: String(record.pdv_id),
      fechaOperacion: String(record.fecha_operacion),
    })

    if (!missionSelection.mission) {
      throw new Error('No fue posible resolver la mision del dia para este check-in.')
    }

    record.mision_dia_id = missionSelection.mission.id
    record.mision_codigo = missionSelection.mission.codigo
    record.mision_instruccion = missionSelection.mission.instruccion
  }

  await hydrateAttendanceServerSnapshot(service, {
    actor,
    empleadoId: String(record.empleado_id),
    pdvId: String(record.pdv_id),
    record,
  })

  if (record.check_out_utc) {
    const { data: existingAttendance, error: existingAttendanceError } = await service
      .from('asistencia')
      .select('id, mision_dia_id, mision_codigo, biometria_estado, biometria_score')
      .eq('id', String(record.id))
      .maybeSingle()

    if (existingAttendanceError) {
      throw new Error(existingAttendanceError.message)
    }

    if (!existingAttendance?.id) {
      throw new Error(
        'No fue posible localizar la asistencia abierta para completar el check-out manual.'
      )
    }

    const persistenceRow = buildAttendancePersistenceRow(record, metadata, {
      biometriaEstado: existingAttendance.biometria_estado,
      biometriaScore: existingAttendance.biometria_score,
    })

    const { data: updatedAttendance, error: updateAttendanceError } = await service
      .from('asistencia')
      .update({
        check_out_utc: persistenceRow.check_out_utc,
        distancia_check_out_metros: persistenceRow.distancia_check_out_metros,
        latitud_check_out: persistenceRow.latitud_check_out,
        longitud_check_out: persistenceRow.longitud_check_out,
        selfie_check_out_url: persistenceRow.selfie_check_out_url,
        selfie_check_out_hash: persistenceRow.selfie_check_out_hash,
        estatus: persistenceRow.estatus,
        biometria_estado: persistenceRow.biometria_estado,
        biometria_score: persistenceRow.biometria_score,
        metadata: persistenceRow.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', persistenceRow.id)
      .select('id, mision_dia_id, mision_codigo')
      .maybeSingle()

    if (updateAttendanceError || !updatedAttendance?.id) {
      throw new Error(
        updateAttendanceError?.message ??
          'No fue posible actualizar la asistencia sin la RPC registrar_asistencia_dc.'
      )
    }

    record.biometria_estado = persistenceRow.biometria_estado
    record.biometria_score = persistenceRow.biometria_score

    await registrarEventoAudit(service, {
      actorUsuarioId,
      cuentaClienteId,
      tabla: 'asistencia',
      registroId: updatedAttendance.id,
      payload: {
        evento: 'checkout_dc',
        source: 'sync_route_manual_fallback',
      },
    })

    return {
      ok: true as const,
      id: updatedAttendance.id,
      mision_dia_id: updatedAttendance.mision_dia_id ?? null,
      mision_codigo: updatedAttendance.mision_codigo ?? null,
    }
  }

  const persistenceRow = buildAttendancePersistenceRow(record, metadata)

  const { data: savedAttendance, error: saveAttendanceError } = await service
    .from('asistencia')
    .upsert(persistenceRow, { onConflict: 'id' })
    .select('id, mision_dia_id, mision_codigo')
    .maybeSingle()

  if (saveAttendanceError || !savedAttendance?.id) {
    throw new Error(
      saveAttendanceError?.message ??
        'No fue posible registrar la asistencia sin la RPC registrar_asistencia_dc.'
    )
  }

  await registrarEventoAudit(service, {
    actorUsuarioId,
    cuentaClienteId,
    tabla: 'asistencia',
    registroId: savedAttendance.id,
    payload: {
      evento: 'checkin_dc',
      source: 'sync_route_manual_fallback',
    },
  })

  return {
    ok: true as const,
    id: savedAttendance.id,
    mision_dia_id: savedAttendance.mision_dia_id ?? null,
    mision_codigo: savedAttendance.mision_codigo ?? null,
  }
}

async function notifyBiometricMismatch(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    supervisorEmpleadoId,
    empleadoId,
    pdvId,
    attendanceId,
    score,
    threshold,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    supervisorEmpleadoId: string | null
    empleadoId: string
    pdvId: string
    attendanceId: string
    score: number | null
    threshold: number
  }
) {
  if (!supervisorEmpleadoId) {
    return
  }

  const { data: createdMessage, error: messageError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: actorUsuarioId,
    titulo: 'Check-in rechazado por biometría',
    cuerpo: `Se rechazó un check-in biométrico del empleado ${empleadoId} en el PDV ${pdvId}. Score ${score?.toFixed(4) ?? 'N/A'} vs umbral ${threshold.toFixed(2)}.`,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      supervisor_empleado_id: supervisorEmpleadoId,
      opciones_respuesta: [],
      metadata: {
        origen: 'asistencia_biometria',
        attendance_id: attendanceId,
        empleado_id: empleadoId,
        pdv_id: pdvId,
        biometric_score: score,
        biometric_threshold: threshold,
        event_code: 'BIOMETRIC_MISMATCH',
      },
    })
    .select('id')
    .maybeSingle()

  if (messageError || !createdMessage?.id) {
  throw new Error(messageError?.message ?? 'No fue posible notificar el rechazo biométrico al supervisor.')
  }

  const { error: recipientError } = await service.from('mensaje_receptor').insert({
    mensaje_id: createdMessage.id,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: supervisorEmpleadoId,
    estado: 'PENDIENTE',
    metadata: {
      origen: 'asistencia_biometria',
      attendance_id: attendanceId,
      empleado_id: empleadoId,
      pdv_id: pdvId,
    },
  })

  if (recipientError) {
    throw new Error(recipientError.message)
  }
}

async function notifyPendingAttendanceReview(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    supervisorEmpleadoId,
    empleadoId,
    pdvId,
    attendanceId,
    estadoGps,
    justificacionFueraGeocerca,
    biometriaEstado,
    reviewTarget,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    supervisorEmpleadoId: string | null
    empleadoId: string
    pdvId: string
    attendanceId: string
    estadoGps: string | null
    justificacionFueraGeocerca: string | null
    biometriaEstado: string | null
    reviewTarget: 'CHECK_IN' | 'CHECK_OUT'
  }
) {
  if (!supervisorEmpleadoId) {
    return
  }

  const motivos = [
    estadoGps === 'SIN_GPS' ? 'sin GPS disponible' : null,
    estadoGps === 'FUERA_GEOCERCA' ? 'fuera de geocerca' : null,
    reviewTarget === 'CHECK_IN' && biometriaEstado === 'PENDIENTE' ? 'biometria pendiente' : null,
  ].filter((value): value is string => Boolean(value))

  const motivoResumen = motivos.length > 0 ? motivos.join(', ') : 'validacion operativa pendiente'
  const targetLabel = reviewTarget === 'CHECK_OUT' ? 'Check-out' : 'Check-in'
  const eventCode =
    reviewTarget === 'CHECK_OUT' ? 'ATTENDANCE_CHECKOUT_PENDING_REVIEW' : 'ATTENDANCE_PENDING_REVIEW'

  const { data: createdMessage, error: messageError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: actorUsuarioId,
      titulo: `${targetLabel} pendiente de revision`,
      cuerpo: `El ${targetLabel.toLowerCase()} del empleado ${empleadoId} en el PDV ${pdvId} quedo pendiente de revision (${motivoResumen}).`,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      supervisor_empleado_id: supervisorEmpleadoId,
      opciones_respuesta: [],
      metadata: {
        origen: 'asistencia_revision',
        attendance_id: attendanceId,
        empleado_id: empleadoId,
        pdv_id: pdvId,
        estado_gps: estadoGps,
        biometria_estado: biometriaEstado,
        justificacion_fuera_geocerca: justificacionFueraGeocerca,
        review_target: reviewTarget,
        event_code: eventCode,
      },
    })
    .select('id')
    .maybeSingle()

  if (messageError || !createdMessage?.id) {
    throw new Error(messageError?.message ?? 'No fue posible notificar la revision pendiente al supervisor.')
  }

  const { error: recipientError } = await service.from('mensaje_receptor').insert({
    mensaje_id: createdMessage.id,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: supervisorEmpleadoId,
    estado: 'PENDIENTE',
    metadata: {
      origen: 'asistencia_revision',
      attendance_id: attendanceId,
      empleado_id: empleadoId,
      pdv_id: pdvId,
      estado_gps: estadoGps,
      biometria_estado: biometriaEstado,
      review_target: reviewTarget,
      event_code: eventCode,
    },
  })

  if (recipientError) {
    throw new Error(recipientError.message)
  }
}

async function notifyGeofenceAlertPush({
  attendanceId,
  cuentaClienteId,
  empleadoId,
  supervisorEmpleadoId,
  pdvId,
  pdvNombre,
  estadoGps,
  distanciaCheckInMetros,
  justificacionFueraGeocerca,
  checkInUtc,
}: {
  attendanceId: string
  cuentaClienteId: string
  empleadoId: string
  supervisorEmpleadoId: string | null
  pdvId: string
  pdvNombre: string | null
  estadoGps: string | null
  distanciaCheckInMetros: number | null
  justificacionFueraGeocerca: string | null
  checkInUtc: string | null
}) {
  const payload = buildGeofencePushAlert({
    attendanceId,
    cuentaClienteId,
    empleadoId,
    supervisorEmpleadoId,
    pdvId,
    pdvNombre,
    estadoGps,
    distanciaCheckInMetros,
    justificacionFueraGeocerca,
    checkInUtc,
  })

  if (!payload) {
    return
  }

  await sendOperationalPushNotification(payload)
}

function resolveAttendanceStatusAfterBiometrics(
  estadoGps: unknown,
  biometriaStatus: 'VALIDA' | 'RECHAZADA' | 'PENDIENTE'
) {
  if (biometriaStatus === 'RECHAZADA') {
    return 'RECHAZADA'
  }

  return estadoGps === 'DENTRO_GEOCERCA' && biometriaStatus === 'VALIDA'
    ? 'VALIDA'
    : 'PENDIENTE_VALIDACION'
}

async function resolveActiveAssignmentForCheckIn(
  service: TypedSupabaseClient,
  {
    assignmentId,
    empleadoId,
    pdvId,
    fechaOperacion,
  }: {
    assignmentId: string | null
    empleadoId: string
    pdvId: string
    fechaOperacion: string
  }
) {
  return resolveCheckInAssignmentForPersistence(service as never, {
    assignmentId,
    empleadoId,
    pdvId,
    fechaOperacion,
  })
}

export async function POST(request: Request) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const payloadRaw = String(formData.get('payload') ?? '').trim()

    if (!payloadRaw) {
      return NextResponse.json({ error: 'El payload de asistencia es obligatorio.' }, { status: 400 })
    }

    const payload = JSON.parse(payloadRaw) as Record<string, unknown>
    const selfieCheckInFile = asUploadedFile(formData.get('selfie_check_in_file'))
    const selfieCheckOutFile = asUploadedFile(formData.get('selfie_check_out_file'))

    const id = String(payload.id ?? '').trim()
    const payloadCuentaClienteId = String(payload.cuenta_cliente_id ?? '').trim()
    const empleadoId = String(payload.empleado_id ?? '').trim()
    const pdvId = String(payload.pdv_id ?? '').trim()
    const payloadFechaOperacion = String(payload.fecha_operacion ?? '').trim()

    const cuentaClienteId =
      actor.puesto !== 'ADMINISTRADOR' && actor.cuentaClienteId
        ? actor.cuentaClienteId
        : payloadCuentaClienteId

    if (!id || !cuentaClienteId || !empleadoId || !pdvId) {
      return NextResponse.json(
        { error: 'La asistencia requiere id, cuenta_cliente_id, empleado_id y pdv_id.' },
        { status: 400 }
      )
    }

    if (actor.puesto !== 'ADMINISTRADOR' && empleadoId !== actor.empleadoId) {
      return NextResponse.json({ error: 'No puedes sincronizar asistencias de otro empleado.' }, { status: 403 })
    }

    if (
      actor.puesto !== 'ADMINISTRADOR' &&
      actor.cuentaClienteId &&
      payloadCuentaClienteId &&
      payloadCuentaClienteId !== actor.cuentaClienteId
    ) {
      console.warn('[asistencias.sync] account_mismatch_payload_overridden', {
        actorUsuarioId: actor.usuarioId,
        actorEmpleadoId: actor.empleadoId,
        actorCuentaClienteId: actor.cuentaClienteId,
        payloadCuentaClienteId,
        attendanceId: id,
      })
    }

    const service = createServiceClient() as TypedSupabaseClient
    const { data: existingAttendanceRow, error: existingAttendanceError } = await service
      .from('asistencia')
      .select('metadata, fecha_operacion')
      .eq('id', id)
      .maybeSingle()

    if (existingAttendanceError) {
      return NextResponse.json({ error: existingAttendanceError.message }, { status: 500 })
    }

    const metadata = {
      ...normalizeMetadata(existingAttendanceRow?.metadata),
      ...normalizeMetadata(payload.metadata),
    }
    const currentSupervision = normalizeMetadata(metadata.supervision)
    const record: Record<string, unknown> = {
      ...payload,
      cuenta_cliente_id: cuentaClienteId,
      origen: payload.origen ?? 'OFFLINE_SYNC',
      metadata,
    }
    const resolvedFechaOperacion = await resolveAttendanceOperationDate(service, {
      existingFechaOperacion: existingAttendanceRow?.fecha_operacion ?? null,
      pdvId,
      checkInUtc: typeof record.check_in_utc === 'string' ? record.check_in_utc : null,
      checkOutUtc: typeof record.check_out_utc === 'string' ? record.check_out_utc : null,
      fallbackFechaOperacion: payloadFechaOperacion || null,
    })

    if (!resolvedFechaOperacion) {
      return NextResponse.json(
        { error: 'No fue posible resolver la fecha operativa de la asistencia.' },
        { status: 400 }
      )
    }

    record.fecha_operacion = resolvedFechaOperacion

    if (selfieCheckInFile) {
      const stored = await uploadAttendanceEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId,
        file: selfieCheckInFile,
        evidenceKind: 'check-in',
      })

      record.selfie_check_in_url = stored.archivo.url
      record.selfie_check_in_hash = stored.archivo.hash
      metadata.selfie_check_in_thumbnail_url = stored.miniatura?.url ?? null
      metadata.selfie_check_in_thumbnail_hash = stored.miniatura?.hash ?? null
      metadata.selfie_check_in_optimization = {
        kind: stored.optimization.optimizationKind,
        originalBytes: stored.optimization.originalBytes,
        finalBytes: stored.optimization.optimizedBytes,
        targetMet: stored.optimization.targetMet,
        notes: stored.optimization.notes,
        officialAssetKind: stored.optimization.officialAssetKind,
        deduplicated: stored.deduplicated,
      }
    }

    if (selfieCheckOutFile) {
      const stored = await uploadAttendanceEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId,
        file: selfieCheckOutFile,
        evidenceKind: 'check-out',
      })

      record.selfie_check_out_url = stored.archivo.url
      record.selfie_check_out_hash = stored.archivo.hash
      metadata.selfie_check_out_thumbnail_url = stored.miniatura?.url ?? null
      metadata.selfie_check_out_thumbnail_hash = stored.miniatura?.hash ?? null
      metadata.selfie_check_out_optimization = {
        kind: stored.optimization.optimizationKind,
        originalBytes: stored.optimization.originalBytes,
        finalBytes: stored.optimization.optimizedBytes,
        targetMet: stored.optimization.targetMet,
        notes: stored.optimization.notes,
        officialAssetKind: stored.optimization.officialAssetKind,
        deduplicated: stored.deduplicated,
      }
    }

    let biometricEmployeeContext:
      | Awaited<ReturnType<typeof resolveEmployeeBiometricContext>>
      | null = null
    let resolvedSupervisorEmpleadoId =
      (typeof record.supervisor_empleado_id === 'string' && record.supervisor_empleado_id) || null

    if (record.check_in_utc && !record.check_out_utc) {
      ensureNativeCheckInCapture(metadata, selfieCheckInFile)
      const activeAssignment = await resolveActiveAssignmentForCheckIn(service, {
        assignmentId: typeof record.asignacion_id === 'string' ? record.asignacion_id : null,
        empleadoId,
        pdvId,
        fechaOperacion: resolvedFechaOperacion,
      })

      record.asignacion_id = activeAssignment.id
      if (
        typeof activeAssignment.cuenta_cliente_id === 'string' &&
        activeAssignment.cuenta_cliente_id.length > 0
      ) {
        record.cuenta_cliente_id = activeAssignment.cuenta_cliente_id
      }
      if (
        !resolvedSupervisorEmpleadoId &&
        typeof activeAssignment.supervisor_empleado_id === 'string' &&
        activeAssignment.supervisor_empleado_id.length > 0
      ) {
        resolvedSupervisorEmpleadoId = activeAssignment.supervisor_empleado_id
      }

      const biometricEmployee = await resolveEmployeeBiometricContext(service, empleadoId)
      biometricEmployeeContext = biometricEmployee
      resolvedSupervisorEmpleadoId = resolvedSupervisorEmpleadoId || biometricEmployee.supervisor_empleado_id
      const checkInSelfie = selfieCheckInFile

      if (!checkInSelfie) {
        throw new Error('El check-in requiere selfie de entrada capturada desde la cámara nativa.')
      }

      const biometricValidation = await validateAttendanceBiometrics({
        service,
        empleadoId,
        selfieBuffer: Buffer.from(await checkInSelfie.arrayBuffer()),
      })

      record.biometria_estado = biometricValidation.status
      record.biometria_score = biometricValidation.score
      record.estatus = resolveAttendanceStatusAfterBiometrics(
        record.estado_gps,
        biometricValidation.status
      )
      metadata.biometria = {
        ...normalizeMetadata(metadata.biometria),
        provider: biometricValidation.provider,
        threshold: biometricValidation.threshold,
        score: biometricValidation.score,
        validation_status: biometricValidation.status,
        reason: biometricValidation.reason,
        reference_source: biometricValidation.reference?.source ?? null,
        reference_bucket: biometricValidation.reference?.bucket ?? null,
        reference_path: biometricValidation.reference?.path ?? null,
        reference_hash: biometricValidation.reference?.hash ?? null,
        validated_by: 'server',
      }
      metadata.supervision = {
        ...currentSupervision,
        entry_status: 'PENDIENTE_VALIDACION',
        entry_pending_at: new Date().toISOString(),
        checkout_status: null,
      }

    }

    if (record.check_out_utc) {
      await ensureCheckoutCoordinates({
        latitudCheckOut:
          typeof record.latitud_check_out === 'number' ? record.latitud_check_out : null,
        longitudCheckOut:
          typeof record.longitud_check_out === 'number' ? record.longitud_check_out : null,
      })

      await ensureNoPendingVisitTasks(service, {
        attendanceId: id,
        cuentaClienteId,
        empleadoId,
        pdvId,
        fechaOperacion: resolvedFechaOperacion,
      })

      metadata.supervision = {
        ...currentSupervision,
        ...(normalizeMetadata(metadata.supervision)),
        checkout_status: resolvedSupervisorEmpleadoId ? 'PENDIENTE_VALIDACION' : 'VALIDA',
        checkout_pending_at: new Date().toISOString(),
      }
      record.estatus = resolvedSupervisorEmpleadoId ? 'PENDIENTE_VALIDACION' : 'CERRADA'
    }

    const rpcResult = await persistAttendanceRecord(service, {
      actor,
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId,
      record,
      metadata,
    })

    if (record.check_in_utc && !record.check_out_utc) {
      // Inyectar misiones resueltas por RPC para notificaciones locales
      record.mision_dia_id = rpcResult.mision_dia_id
      record.mision_codigo = rpcResult.mision_codigo
    }

    if (record.check_in_utc && !record.check_out_utc) {
      resolvedSupervisorEmpleadoId = resolvedSupervisorEmpleadoId || biometricEmployeeContext?.supervisor_empleado_id || null

      try {
        await notifyGeofenceAlertPush({
          attendanceId: id,
          cuentaClienteId,
          empleadoId,
          supervisorEmpleadoId: resolvedSupervisorEmpleadoId,
          pdvId,
          pdvNombre: typeof record.pdv_nombre === 'string' ? record.pdv_nombre : null,
          estadoGps: typeof record.estado_gps === 'string' ? record.estado_gps : null,
          distanciaCheckInMetros:
            typeof record.distancia_check_in_metros === 'number'
              ? record.distancia_check_in_metros
              : null,
          justificacionFueraGeocerca:
            typeof record.justificacion_fuera_geocerca === 'string'
              ? record.justificacion_fuera_geocerca
              : null,
          checkInUtc: typeof record.check_in_utc === 'string' ? record.check_in_utc : null,
        })
      } catch {
        // Keep the asistencia sync successful even if push fanout fails.
      }

      if (resolvedSupervisorEmpleadoId) {
        try {
          await notifyPendingAttendanceReview(service, {
            cuentaClienteId,
            actorUsuarioId: actor.usuarioId,
            supervisorEmpleadoId: resolvedSupervisorEmpleadoId,
            empleadoId,
            pdvId,
            attendanceId: id,
            estadoGps: typeof record.estado_gps === 'string' ? record.estado_gps : null,
            justificacionFueraGeocerca:
              typeof record.justificacion_fuera_geocerca === 'string'
                ? record.justificacion_fuera_geocerca
                : null,
            biometriaEstado: typeof record.biometria_estado === 'string' ? record.biometria_estado : null,
            reviewTarget: 'CHECK_IN',
          })
        } catch {
          // Keep the asistencia sync successful even if inbox notification fails.
        }
      }
    }

    if (record.check_out_utc && resolvedSupervisorEmpleadoId) {
      try {
        await notifyPendingAttendanceReview(service, {
          cuentaClienteId,
          actorUsuarioId: actor.usuarioId,
          supervisorEmpleadoId: resolvedSupervisorEmpleadoId,
          empleadoId,
          pdvId,
          attendanceId: id,
          estadoGps: typeof record.estado_gps === 'string' ? record.estado_gps : null,
          justificacionFueraGeocerca:
            typeof record.justificacion_fuera_geocerca === 'string'
              ? record.justificacion_fuera_geocerca
              : null,
          biometriaEstado: typeof record.biometria_estado === 'string' ? record.biometria_estado : null,
          reviewTarget: 'CHECK_OUT',
        })
      } catch {
        // Keep checkout sync successful even if inbox notification fails.
      }
    }

    if (record.check_in_utc && !record.check_out_utc && record.biometria_estado === 'RECHAZADA') {
      try {
        await notifyBiometricMismatch(service, {
          cuentaClienteId,
          actorUsuarioId: actor.usuarioId,
          supervisorEmpleadoId: resolvedSupervisorEmpleadoId,
          empleadoId,
          pdvId,
          attendanceId: id,
          score: typeof record.biometria_score === 'number' ? record.biometria_score : null,
          threshold:
            typeof metadata.biometria === 'object' &&
            metadata.biometria &&
            'threshold' in metadata.biometria &&
            typeof metadata.biometria.threshold === 'number'
              ? metadata.biometria.threshold
              : 0.8,
        })
      } catch {
        // Keep rejected attendance persisted even if biometric inbox fanout fails.
      }

      return NextResponse.json(
        {
          error:
    'El check-in fue rechazado por biometría. Se registró el intento fallido y se notificó al supervisor.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No fue posible sincronizar la asistencia.'
    console.error('[asistencias.sync] sync_failed', {
      actorUsuarioId: actor?.usuarioId ?? null,
      actorEmpleadoId: actor?.empleadoId ?? null,
      actorPuesto: actor?.puesto ?? null,
      message,
    })
    const status =
      /No puedes cerrar el check-out mientras existan tareas de visita pendientes|El check-out requiere capturar coordenadas de salida|No hay misiones activas disponibles para registrar el check-in|No fue posible resolver la mision del dia|El check-in requiere selfie de entrada capturada desde la camara nativa|La selfie de check-in debe provenir de captura nativa con getUserMedia|La selfie de check-in debe incluir sello operativo visible|El check-in requiere una asignacion activa con PDV y horario de referencia/i.test(
        message
      )
      ? 409
      : 500

    return NextResponse.json(
      { error: message },
      { status }
    )
  }
}
