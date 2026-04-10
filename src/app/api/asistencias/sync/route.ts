export const runtime = 'edge';
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
import { obtenerActorActual } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { createServiceClient } from '@/lib/supabase/server'

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

function ensureNativeCheckInCapture(metadata: Record<string, unknown>, selfieCheckInFile: File | null) {
  const selfieMetadata = normalizeMetadata(metadata.selfie)
  const captureSource = typeof selfieMetadata.capture_source === 'string' ? selfieMetadata.capture_source : null
  const timestampStamped = selfieMetadata.timestamp_stamped === true

  if (!selfieCheckInFile) {
    throw new Error('El check-in requiere selfie de entrada capturada desde la cÃ¡mara nativa.')
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
      titulo: 'Check-in rechazado por biometrÃ­a',
      cuerpo: `Se rechazÃ³ un check-in biomÃ©trico del empleado ${empleadoId} en el PDV ${pdvId}. Score ${score?.toFixed(4) ?? 'N/A'} vs umbral ${threshold.toFixed(2)}.`,
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
    throw new Error(messageError?.message ?? 'No fue posible notificar el rechazo biomÃ©trico al supervisor.')
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

async function ensureActiveAssignmentForCheckIn(
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
  if (!assignmentId) {
    throw new Error('El check-in requiere una asignacion activa con PDV y horario de referencia.')
  }

  const { data: assignment, error: assignmentError } = await service
    .from('asignacion')
    .select('id, empleado_id, pdv_id, fecha_inicio, fecha_fin, horario_referencia, estado_publicacion')
    .eq('id', assignmentId)
    .maybeSingle()

  if (assignmentError) {
    throw new Error(assignmentError.message)
  }

  const assignmentStart = assignment?.fecha_inicio ?? null
  const assignmentEnd = assignment?.fecha_fin ?? null
  const isActiveByDate =
    Boolean(assignmentStart) &&
    assignmentStart <= fechaOperacion &&
    (!assignmentEnd || assignmentEnd >= fechaOperacion)

  if (
    !assignment ||
    assignment.empleado_id !== empleadoId ||
    assignment.pdv_id !== pdvId ||
    assignment.estado_publicacion !== 'PUBLICADA' ||
    !assignment.horario_referencia ||
    !isActiveByDate
  ) {
    throw new Error('El check-in requiere una asignacion activa con PDV y horario de referencia.')
  }
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
    const cuentaClienteId = String(payload.cuenta_cliente_id ?? '').trim()
    const empleadoId = String(payload.empleado_id ?? '').trim()
    const pdvId = String(payload.pdv_id ?? '').trim()
    const fechaOperacion = String(payload.fecha_operacion ?? '').trim()

    if (!id || !cuentaClienteId || !empleadoId || !pdvId || !fechaOperacion) {
      return NextResponse.json(
        { error: 'La asistencia requiere id, cuenta_cliente_id, empleado_id, pdv_id y fecha_operacion.' },
        { status: 400 }
      )
    }

    if (actor.puesto !== 'ADMINISTRADOR' && empleadoId !== actor.empleadoId) {
      return NextResponse.json({ error: 'No puedes sincronizar asistencias de otro empleado.' }, { status: 403 })
    }

    if (actor.puesto !== 'ADMINISTRADOR' && actor.cuentaClienteId && cuentaClienteId !== actor.cuentaClienteId) {
      return NextResponse.json({ error: 'La asistencia no pertenece a la cuenta del usuario autenticado.' }, { status: 403 })
    }

    const service = createServiceClient() as TypedSupabaseClient
    const { data: existingAttendanceRow, error: existingAttendanceError } = await service
      .from('asistencia')
      .select('metadata')
      .eq('id', id)
      .maybeSingle()

    if (existingAttendanceError) {
      return NextResponse.json({ error: existingAttendanceError.message }, { status: 500 })
    }

    const metadata = {
      ...normalizeMetadata(existingAttendanceRow?.metadata),
      ...normalizeMetadata(payload.metadata),
    }
    const record: Record<string, unknown> = {
      ...payload,
      origen: payload.origen ?? 'OFFLINE_SYNC',
      metadata,
    }

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

    if (record.check_in_utc && !record.check_out_utc) {
      ensureNativeCheckInCapture(metadata, selfieCheckInFile)
      await ensureActiveAssignmentForCheckIn(service, {
        assignmentId:
          typeof record.asignacion_id === 'string' && record.asignacion_id.trim()
            ? record.asignacion_id
            : null,
        empleadoId,
        pdvId,
        fechaOperacion,
      })

      const missionSelection = await resolveAttendanceMission(service, {
        attendanceId: id,
        empleadoId,
        pdvId,
        fechaOperacion,
      })

      const selectedMission = missionSelection.mission

      if (!selectedMission) {
        throw new Error('No fue posible resolver la mision del dia para este check-in.')
      }

      record.mision_dia_id = selectedMission.id
      record.mision_codigo = selectedMission.codigo
      record.mision_instruccion = selectedMission.instruccion
      metadata.mision_dia = {
        ...normalizeMetadata(metadata.mision_dia),
        id: selectedMission.id,
        codigo: selectedMission.codigo,
        instruccion: selectedMission.instruccion,
        avoided_immediate_repeat: missionSelection.avoidedImmediateRepeat,
        assigned_by: 'server',
      }

      const biometricEmployee = await resolveEmployeeBiometricContext(service, empleadoId)
      const checkInSelfie = selfieCheckInFile

      if (!checkInSelfie) {
        throw new Error('El check-in requiere selfie de entrada capturada desde la cÃ¡mara nativa.')
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

      if (biometricValidation.status === 'RECHAZADA') {
        await registrarEventoAudit(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId,
          tabla: 'asistencia',
          registroId: id,
          payload: {
            evento: 'checkin_biometria_rechazada',
            empleado_id: empleadoId,
            pdv_id: pdvId,
            biometric_score: biometricValidation.score,
            biometric_threshold: biometricValidation.threshold,
            event_code: 'BIOMETRIC_MISMATCH',
          },
        })

        await notifyBiometricMismatch(service, {
          cuentaClienteId,
          actorUsuarioId: actor.usuarioId,
          supervisorEmpleadoId:
            (typeof record.supervisor_empleado_id === 'string' && record.supervisor_empleado_id) ||
            biometricEmployee.supervisor_empleado_id,
          empleadoId,
          pdvId,
          attendanceId: id,
          score: biometricValidation.score,
          threshold: biometricValidation.threshold,
        })
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
        fechaOperacion,
      })
    }

    const { error } = await service.from('asistencia').upsert(record, { onConflict: 'id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (record.check_in_utc && !record.check_out_utc) {
      try {
        await notifyGeofenceAlertPush({
          attendanceId: id,
          cuentaClienteId,
          empleadoId,
          supervisorEmpleadoId:
            typeof record.supervisor_empleado_id === 'string' ? record.supervisor_empleado_id : null,
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
    }

    if (record.check_in_utc && !record.check_out_utc && record.biometria_estado === 'RECHAZADA') {
      return NextResponse.json(
        {
          error:
            'El check-in fue rechazado por biometrÃ­a. Se registrÃ³ el intento fallido y se notificÃ³ al supervisor.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No fue posible sincronizar la asistencia.'
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

