'use server'

import { revalidatePath } from 'next/cache'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { createServiceClient } from '@/lib/supabase/server'
import {
  enqueueAndProcessMaterializedAssignments,
  resolveMaterializationImpactRange,
} from '@/features/asignaciones/services/asignacionMaterializationService'
import { resolveApprovalFlow } from '@/features/reglas/lib/businessRules'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, Puesto, Solicitud } from '@/types/database'
import { ESTADO_SOLICITUD_INICIAL, type SolicitudActionState } from './state'

const SOLICITUD_WRITE_ROLES = [
  'ADMINISTRADOR',
  'DERMOCONSEJERO',
  'SUPERVISOR',
  'COORDINADOR',
  'NOMINA',
  'RECLUTAMIENTO',
] as const satisfies Puesto[]

const SOLICITUD_APPROVAL_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'NOMINA'] as const satisfies Puesto[]
const SOLICITUDES_BUCKET = 'operacion-evidencias'
const SOLICITUD_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const JUSTIFICACION_SLA_HOURS = 48

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type SolicitudMetadata = Record<string, unknown>

type SolicitudApprovalRow = Pick<
  Solicitud,
  | 'id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'supervisor_empleado_id'
  | 'tipo'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'motivo'
  | 'estatus'
  | 'comentarios'
  | 'metadata'
>

function buildState(partial: Partial<SolicitudActionState>): SolicitudActionState {
  return {
    ...ESTADO_SOLICITUD_INICIAL,
    ...partial,
  }
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeMetadata(value: unknown): SolicitudMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as SolicitudMetadata
}

function normalizeTipo(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (
    ![
      'INCAPACIDAD',
      'VACACIONES',
      'PERMISO',
      'AVISO_INASISTENCIA',
      'JUSTIFICACION_FALTA',
    ].includes(normalized)
  ) {
    throw new Error('El tipo de solicitud no es valido.')
  }

  return normalized as Solicitud['tipo']
}

function normalizeRequiredOptionalText(
  value: FormDataEntryValue | null,
  label: string,
  required: boolean
) {
  const normalized = normalizeOptionalText(value)

  if (required && !normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeEstatus(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (
    ![
      'BORRADOR',
      'ENVIADA',
      'VALIDADA_SUP',
      'REGISTRADA_RH',
      'REGISTRADA',
      'RECHAZADA',
      'CORRECCION_SOLICITADA',
    ].includes(normalized)
  ) {
    throw new Error('El estatus seleccionado no es valido.')
  }

  return normalized as Solicitud['estatus']
}

function normalizeSingleDateRange(
  fechaInicio: string,
  fechaFin: string,
  label: string
) {
  if (fechaInicio !== fechaFin) {
    throw new Error(`${label} debe capturarse para un solo dia.`)
  }
}

function buildDeadlineMetadata(enviadaEnIso: string, hours: number) {
  const dueAt = new Date(new Date(enviadaEnIso).getTime() + hours * 60 * 60 * 1000).toISOString()
  return {
    enviada_en: enviadaEnIso,
    sla_hours: hours,
    resolver_antes_de: dueAt,
  }
}

function asUploadedFile(...values: Array<FormDataEntryValue | null>) {
  for (const value of values) {
    if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
      continue
    }

    return value
  }

  return null
}

function appendNotification(
  metadata: SolicitudMetadata,
  payload: {
    canal?: string
    mensaje: string
    estado?: string
    destinatarioEmpleadoId?: string | null
    destinatarioPuesto?: string | null
  }
) {
  const current = Array.isArray(metadata.notificaciones) ? [...metadata.notificaciones] : []

  current.push({
    canal: payload.canal ?? 'IN_APP',
    mensaje: payload.mensaje,
    estado: payload.estado ?? 'GENERADA',
    destinatario_empleado_id: payload.destinatarioEmpleadoId ?? null,
    destinatario_puesto: payload.destinatarioPuesto ?? null,
    creada_en: new Date().toISOString(),
  })

  return current
}

async function notifySolicitudResolutionPush(
  solicitud: SolicitudApprovalRow,
  estatus: Solicitud['estatus'],
  actorPuesto: Puesto
) {
  if (!['REGISTRADA_RH', 'REGISTRADA', 'RECHAZADA', 'CORRECCION_SOLICITADA'].includes(estatus)) {
    return
  }

  const isApproved = estatus === 'REGISTRADA_RH' || estatus === 'REGISTRADA'
  const isCorrection = estatus === 'CORRECCION_SOLICITADA'
  const title = isApproved
    ? 'Solicitud aprobada'
    : isCorrection
      ? 'Solicitud con correccion requerida'
      : 'Solicitud rechazada'
  const body = isApproved
    ? `Tu solicitud de ${solicitud.tipo.toLowerCase()} fue aprobada por ${actorPuesto.toLowerCase()}.`
    : isCorrection
      ? `Tu solicitud de ${solicitud.tipo.toLowerCase()} requiere correccion para continuar.`
      : `Tu solicitud de ${solicitud.tipo.toLowerCase()} fue rechazada. Revisa comentarios y siguiente accion.`

  await sendOperationalPushNotification({
    employeeIds: [solicitud.empleado_id],
    title,
    body,
    path: '/solicitudes',
    tag: `solicitud-${solicitud.id}-${estatus.toLowerCase()}`,
    cuentaClienteId: solicitud.cuenta_cliente_id,
    audit: {
      tabla: 'solicitud',
      registroId: solicitud.id,
      accion: isApproved ? 'fanout_solicitud_aprobada_push' : 'fanout_solicitud_rechazada_push',
    },
    data: {
      solicitudId: solicitud.id,
      tipo: solicitud.tipo,
      estatus,
      actorPuesto,
    },
  })
}

async function validarCuentaCliente(service: TypedSupabaseClient, cuentaClienteId: string) {
  const { data: cuentaRaw, error } = await service
    .from('cuenta_cliente')
    .select('id, activa')
    .eq('id', cuentaClienteId)
    .maybeSingle()

  const cuenta = cuentaRaw as CuentaCliente | null

  if (error || !cuenta || !cuenta.activa) {
    throw new Error('La cuenta cliente seleccionada no existe o no esta activa.')
  }
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(SOLICITUDES_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: SOLICITUD_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function uploadJustificanteSolicitud(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    file: File
  }
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('justificante', file))
  }

  if (!SOLICITUD_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('El justificante debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureBucket(service)
  const stored = await storeOptimizedEvidence({
    service,
    bucket: SOLICITUDES_BUCKET,
    actorUsuarioId,
    storagePrefix: `solicitudes/${cuentaClienteId}/${empleadoId}`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    thumbnailUrl: stored.miniatura?.url ?? null,
    thumbnailHash: stored.miniatura?.hash ?? null,
    optimization: {
      kind: stored.optimization.optimizationKind,
      originalBytes: stored.optimization.originalBytes,
      finalBytes: stored.optimization.optimizedBytes,
      targetMet: stored.optimization.targetMet,
      notes: stored.optimization.notes,
      officialAssetKind: stored.optimization.officialAssetKind,
    },
  }
}

function buildApprovalMetadata(
  tipo: Solicitud['tipo'],
  options?: { requesterPuesto?: Puesto; selfRequest?: boolean }
) {
  const isSupervisorSelfRequest =
    options?.requesterPuesto === 'SUPERVISOR' && options?.selfRequest === true

  if (tipo === 'INCAPACIDAD') {
    return {
      approval_path: ['NOMINA'],
      approval_target_statuses: ['REGISTRADA_RH'],
      justifica_asistencia: true,
      estado_resolucion: 'PENDIENTE',
      notificaciones: [],
    }
  }

  if (tipo === 'AVISO_INASISTENCIA') {
    return {
      approval_path: [],
      approval_target_statuses: [],
      justifica_asistencia: false,
      estado_resolucion: 'APROBADA',
      notificaciones: [],
    }
  }

  if (tipo === 'JUSTIFICACION_FALTA') {
    return {
      approval_path: ['SUPERVISOR'],
      approval_target_statuses: ['REGISTRADA'],
      justifica_asistencia: true,
      estado_resolucion: 'PENDIENTE',
      notificaciones: [],
    }
  }

  const flow = resolveApprovalFlow(tipo, [])
  const steps = isSupervisorSelfRequest
    ? flow.steps.filter((step) => step.actor !== 'SUPERVISOR')
    : flow.steps
  return {
    approval_path: steps.map((step) => step.actor),
    approval_target_statuses: steps.map((step) => step.targetStatus),
    justifica_asistencia: ['INCAPACIDAD', 'VACACIONES', 'PERMISO'].includes(tipo),
    estado_resolucion: 'PENDIENTE',
    notificaciones: [],
  }
}

function requestStatusAffectsMaterialization(tipo: Solicitud['tipo'], estatus: Solicitud['estatus']) {
  if (tipo === 'INCAPACIDAD') {
    return estatus === 'REGISTRADA_RH'
  }

  if (tipo === 'VACACIONES' || tipo === 'JUSTIFICACION_FALTA') {
    return estatus === 'REGISTRADA'
  }

  return false
}

async function refreshSolicitudMaterializationIfNeeded(
  service: TypedSupabaseClient,
  input: {
    solicitud: SolicitudApprovalRow
    previousStatus: Solicitud['estatus']
    nextStatus: Solicitud['estatus']
  }
) {
  if (!['INCAPACIDAD', 'VACACIONES', 'JUSTIFICACION_FALTA'].includes(input.solicitud.tipo)) {
    return
  }

  const previousAffects = requestStatusAffectsMaterialization(input.solicitud.tipo, input.previousStatus)
  const nextAffects = requestStatusAffectsMaterialization(input.solicitud.tipo, input.nextStatus)

  if (!previousAffects && !nextAffects) {
    return
  }

  const impact = resolveMaterializationImpactRange(
    input.solicitud.fecha_inicio,
    input.solicitud.fecha_fin
  )

  if (!impact) {
    return
  }

  await enqueueAndProcessMaterializedAssignments(
    [
      {
        empleadoId: input.solicitud.empleado_id,
        fechaInicio: impact.fechaInicio,
        fechaFin: impact.fechaFin,
        motivo: 'SOLICITUD_RESUELTA',
        payload: {
          solicitud_id: input.solicitud.id,
          estatus_anterior: input.previousStatus,
          estatus_nuevo: input.nextStatus,
        },
      },
    ],
    service
  )
}
async function validarAvisoPrevioInasistencia(
  service: TypedSupabaseClient,
  {
    empleadoId,
    fechaFalta,
  }: {
    empleadoId: string
    fechaFalta: string
  }
) {
  const { data, error } = await service
    .from('solicitud')
    .select('id, estatus, metadata')
    .eq('empleado_id', empleadoId)
    .eq('tipo', 'AVISO_INASISTENCIA')
    .eq('fecha_inicio', fechaFalta)
    .eq('fecha_fin', fechaFalta)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data || (data.estatus !== 'REGISTRADA' && data.estatus !== 'ENVIADA')) {
    throw new Error(
      'La falta solo puede justificarse si existe un aviso previo de inasistencia registrado para ese dia.'
    )
  }

  return {
    id: String(data.id),
    metadata: normalizeMetadata(data.metadata),
  }
}

async function notificarAvisoInasistenciaSupervisor(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    supervisorEmpleadoId,
    empleadoId,
    fechaFalta,
    motivo,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    supervisorEmpleadoId: string | null
    empleadoId: string
    fechaFalta: string
    motivo: string | null
  }
) {
  if (!supervisorEmpleadoId) {
    return
  }

  await sendOperationalPushNotification({
    employeeIds: [supervisorEmpleadoId],
    title: 'Aviso de inasistencia',
    body: `Se registro un aviso de inasistencia para ${fechaFalta}${motivo ? `: ${motivo}` : '.'}`,
    path: '/dashboard',
    tag: `aviso-inasistencia-${empleadoId}-${fechaFalta}`,
    cuentaClienteId,
    audit: {
      tabla: 'solicitud',
      registroId: empleadoId,
      accion: 'notificar_aviso_inasistencia_supervisor',
    },
    data: {
      workflow: 'aviso_inasistencia',
      empleadoId,
      fechaFalta,
    },
  })
}

async function registrarNotificacionIncapacidad(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    supervisorEmpleadoId,
    fechaInicio,
    fechaFin,
    empleadoNombre,
    motivo,
    incapacidadClase,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    supervisorEmpleadoId: string | null
    fechaInicio: string
    fechaFin: string
    empleadoNombre: string
    motivo: string | null
    incapacidadClase: string | null
  }
) {
  const { data: recipients, error } = await service
    .from('empleado')
    .select('id, puesto')
    .in('puesto', ['NOMINA', 'COORDINADOR', 'RECLUTAMIENTO'])
    .eq('estatus_laboral', 'ACTIVO')

  if (error) {
    throw new Error(error.message)
  }

  const recipientIds = new Set<string>(
    (recipients ?? []).map((item) => String(item.id)).filter(Boolean)
  )

  if (supervisorEmpleadoId) {
    recipientIds.add(supervisorEmpleadoId)
  }

  if (recipientIds.size === 0) {
    return
  }

  const claseLabel =
    incapacidadClase === 'SUBSECUENTE'
      ? 'Incapacidad subsecuente'
      : incapacidadClase === 'INICIAL'
        ? 'Incapacidad inicial'
        : 'Incapacidad'
  const body = `${empleadoNombre} reporto ${claseLabel.toLowerCase()} del ${fechaInicio} al ${fechaFin}${motivo ? `. Motivo: ${motivo}.` : '.'}`

  const { data: mensaje, error: mensajeError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: actorUsuarioId,
      titulo: `${claseLabel} registrada`,
      cuerpo: body,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      zona: null,
      supervisor_empleado_id: supervisorEmpleadoId,
      opciones_respuesta: [],
      metadata: {
        workflow: 'solicitud_incapacidad_directa_nomina',
        empleado_id: empleadoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        incapacidad_clase: incapacidadClase,
      },
    })
    .select('id')
    .maybeSingle()

  if (!mensajeError && mensaje?.id) {
    await service.from('mensaje_receptor').insert(
      Array.from(recipientIds).map((recipientId) => ({
        mensaje_id: mensaje.id,
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: recipientId,
        estado: 'PENDIENTE',
        metadata: {
          workflow: 'solicitud_incapacidad_directa_nomina',
          empleado_id: empleadoId,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          incapacidad_clase: incapacidadClase,
          requiere_accion: recipients?.some(
            (item) => String(item.id) === recipientId && String(item.puesto) === 'NOMINA'
          ) ?? false,
        },
      }))
    )
  }

  try {
    await sendOperationalPushNotification({
      employeeIds: Array.from(recipientIds),
      title: `${claseLabel} registrada`,
      body,
      path: '/solicitudes?tipo=INCAPACIDAD',
      tag: `solicitud-incapacidad-${empleadoId}-${fechaInicio}-${fechaFin}`,
      cuentaClienteId,
      audit: {
        tabla: 'solicitud',
        registroId: empleadoId,
        accion: 'notificar_incapacidad_directa_nomina',
      },
      data: {
        workflow: 'solicitud_incapacidad_directa_nomina',
        empleadoId,
        fechaInicio,
        fechaFin,
        incapacidadClase,
      },
    })
  } catch {
    // El mensaje interno cubre el flujo si push falla.
  }
}

export async function registrarSolicitudOperativa(
  _prevState: SolicitudActionState,
  formData: FormData
): Promise<SolicitudActionState> {
  try {
    const actor = await requerirPuestosActivos(SOLICITUD_WRITE_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))
    const tipo = normalizeTipo(formData.get('tipo'))
    const fechaInicio = normalizeRequiredText(formData.get('fecha_inicio'), 'Fecha inicio')
    const fechaFin = normalizeRequiredText(formData.get('fecha_fin'), 'Fecha fin')
    const requiereMotivo =
      tipo === 'INCAPACIDAD' || tipo === 'AVISO_INASISTENCIA' || tipo === 'JUSTIFICACION_FALTA'
    const motivo = normalizeRequiredOptionalText(formData.get('motivo'), 'Motivo', requiereMotivo)
    const comentarios =
      normalizeRequiredOptionalText(
        formData.get('comentarios'),
        tipo === 'JUSTIFICACION_FALTA' ? 'Detalle' : 'Solicitud',
        tipo === 'INCAPACIDAD'
      )
      ?? null
    const isSelfRequest = empleadoId === actor.empleadoId
    const incapacidadClase =
      tipo === 'INCAPACIDAD'
        ? normalizeRequiredText(formData.get('incapacidad_clase'), 'Tipo de incapacidad').toUpperCase()
        : null
    const justificante = asUploadedFile(
      formData.get('justificante'),
      formData.get('justificante_camera')
    )
    const isAvisoInasistencia = tipo === 'AVISO_INASISTENCIA'
    const isJustificacionFalta = tipo === 'JUSTIFICACION_FALTA'

    if (isAvisoInasistencia || isJustificacionFalta) {
      normalizeSingleDateRange(fechaInicio, fechaFin, isAvisoInasistencia ? 'El aviso de inasistencia' : 'La justificacion de falta')
    }

    if (tipo === 'INCAPACIDAD' && !justificante) {
      throw new Error('Debes adjuntar el documento de incapacidad desde galeria o camara.')
    }

    if (isJustificacionFalta && !justificante) {
      throw new Error('Debes adjuntar obligatoriamente la receta del IMSS para justificar la falta.')
    }

    await validarCuentaCliente(service, cuentaClienteId)

    const avisoPrevio = isJustificacionFalta
      ? await validarAvisoPrevioInasistencia(service, {
          empleadoId,
          fechaFalta: fechaInicio,
        })
      : null

    const justificanteUpload = justificante
      ? await uploadJustificanteSolicitud(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId,
          empleadoId,
          file: justificante,
        })
      : null

    const approvalMetadata = buildApprovalMetadata(tipo, {
      requesterPuesto: actor.puesto,
      selfRequest: isSelfRequest,
    })
    const initialStatus = isAvisoInasistencia
      ? 'REGISTRADA'
      : actor.puesto === 'DERMOCONSEJERO' || (actor.puesto === 'SUPERVISOR' && isSelfRequest)
        ? 'ENVIADA'
        : 'BORRADOR'
    const sentAtIso =
      initialStatus === 'ENVIADA' || initialStatus === 'REGISTRADA' ? new Date().toISOString() : null
    const nextRole =
      initialStatus === 'ENVIADA'
        ? tipo === 'INCAPACIDAD'
          ? 'NOMINA'
          : tipo === 'JUSTIFICACION_FALTA'
            ? 'SUPERVISOR'
          : actor.puesto === 'SUPERVISOR' && isSelfRequest
            ? 'COORDINADOR'
          : 'SUPERVISOR'
        : null
    const metadata = {
      ...approvalMetadata,
      capturado_desde: 'panel_solicitudes',
      actor_puesto: actor.puesto,
      solicitud_autogestion_supervisor: actor.puesto === 'SUPERVISOR' && isSelfRequest,
      incapacidad_clase: incapacidadClase,
      tiene_justificante: Boolean(justificanteUpload),
      justificante_clase: isJustificacionFalta ? 'RECETA_IMSS' : null,
      justificante_thumbnail_url: justificanteUpload?.thumbnailUrl ?? null,
      justificante_thumbnail_hash: justificanteUpload?.thumbnailHash ?? null,
      justificante_optimization: justificanteUpload?.optimization ?? null,
      aviso_inasistencia_id: avisoPrevio?.id ?? null,
      requiere_aviso_previo: isJustificacionFalta,
      ...(isJustificacionFalta && sentAtIso ? buildDeadlineMetadata(sentAtIso, JUSTIFICACION_SLA_HOURS) : {}),
      enviada_en: initialStatus === 'ENVIADA' ? sentAtIso : null,
      notificaciones:
        initialStatus === 'ENVIADA'
          ? appendNotification(approvalMetadata, {
              mensaje:
                tipo === 'INCAPACIDAD'
                  ? 'Incapacidad enviada y pendiente de revision de nomina.'
                  : tipo === 'JUSTIFICACION_FALTA'
                    ? 'Justificacion de falta enviada y pendiente de revision de supervision.'
                  : actor.puesto === 'SUPERVISOR' && isSelfRequest
                    ? 'Solicitud enviada y pendiente de revision de coordinacion.'
                    : 'Solicitud enviada y pendiente de revision operativa.',
              destinatarioEmpleadoId: empleadoId,
              destinatarioPuesto: actor.puesto,
            })
          : isAvisoInasistencia
            ? appendNotification(approvalMetadata, {
                mensaje: 'Aviso de inasistencia registrado y notificado a supervision.',
                destinatarioEmpleadoId: empleadoId,
                destinatarioPuesto: actor.puesto,
              })
          : [],
      siguiente_actor: nextRole,
    }

    const { data: created, error } = await service
      .from('solicitud')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: empleadoId,
        supervisor_empleado_id: supervisorEmpleadoId,
        tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        motivo,
        justificante_url: justificanteUpload?.url ?? null,
        justificante_hash: justificanteUpload?.hash ?? null,
        estatus: initialStatus,
        comentarios,
        metadata,
      })
      .select('id')
      .maybeSingle()

    if (error || !created?.id) {
      throw new Error(error?.message ?? 'No fue posible registrar la solicitud.')
    }

    if (tipo === 'INCAPACIDAD' && initialStatus === 'ENVIADA') {
      const { data: empleado } = await service
        .from('empleado')
        .select('id, nombre_completo')
        .eq('id', empleadoId)
        .maybeSingle()

      await registrarNotificacionIncapacidad(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId,
        supervisorEmpleadoId,
        fechaInicio,
        fechaFin,
        empleadoNombre: String(empleado?.nombre_completo ?? 'Colaborador'),
        motivo,
        incapacidadClase,
      })
    }

    if (isAvisoInasistencia) {
      await notificarAvisoInasistenciaSupervisor(service, {
        cuentaClienteId,
        actorUsuarioId: actor.usuarioId,
        supervisorEmpleadoId,
        empleadoId,
        fechaFalta: fechaInicio,
        motivo,
      })
    }

    await service.from('audit_log').insert({
      tabla: 'solicitud',
      registro_id: created.id,
      accion: 'EVENTO',
      payload: {
        evento: 'solicitud_registrada',
        tipo,
        estatus: initialStatus,
        empleado_id: empleadoId,
        justificante: Boolean(justificanteUpload),
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: cuentaClienteId,
    })

    revalidatePath('/solicitudes')
    revalidatePath('/asistencias')
    revalidatePath('/nomina')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: isAvisoInasistencia
        ? 'Aviso de inasistencia registrado.'
        : isJustificacionFalta
          ? 'Justificacion de falta enviada.'
          : 'Solicitud operativa registrada.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la solicitud.',
    })
  }
}

async function resolverEstatusSolicitud(
  formData: FormData,
  updatedFrom: 'panel_solicitudes' | 'dashboard_supervision'
): Promise<SolicitudActionState> {
  const actor = await requerirPuestosActivos(SOLICITUD_APPROVAL_ROLES)
  const service = createServiceClient() as TypedSupabaseClient
  const solicitudId = normalizeRequiredText(formData.get('solicitud_id'), 'Solicitud')
  const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
  const estatus = normalizeEstatus(formData.get('estatus'))
  const comentariosResolucion = normalizeOptionalText(formData.get('comentarios_resolucion'))

  await validarCuentaCliente(service, cuentaClienteId)

  const { data: solicitudRaw, error: solicitudError } = await service
    .from('solicitud')
    .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, estatus, comentarios, metadata')
    .eq('id', solicitudId)
    .eq('cuenta_cliente_id', cuentaClienteId)
    .maybeSingle()

  const solicitud = solicitudRaw as SolicitudApprovalRow | null

  if (solicitudError || !solicitud) {
    throw new Error(solicitudError?.message ?? 'No fue posible cargar la solicitud para actualizarla.')
  }

  const metadata = normalizeMetadata(solicitud.metadata)
  const nextMetadata: SolicitudMetadata = {
    ...metadata,
    actualizado_desde: updatedFrom,
    actualizado_por_usuario_id: actor.usuarioId,
    actualizado_por_puesto: actor.puesto,
  }

  const comentariosBase = solicitud.comentarios ? `${solicitud.comentarios}`.trim() : ''
  const comentariosActualizados = comentariosResolucion
    ? [comentariosBase, `${actor.puesto}: ${comentariosResolucion}`].filter(Boolean).join('\n')
    : comentariosBase || null
  let shouldNotifyIncapacidad = false
  const requesterPuesto =
    typeof metadata.actor_puesto === 'string' ? metadata.actor_puesto : 'DERMOCONSEJERO'

  if (estatus === 'VALIDADA_SUP') {
    if (actor.puesto !== 'SUPERVISOR' && actor.puesto !== 'ADMINISTRADOR') {
      throw new Error('Solo SUPERVISOR o ADMINISTRADOR pueden registrar la validacion operativa.')
    }

    if (!['ENVIADA', 'BORRADOR'].includes(solicitud.estatus)) {
      throw new Error('La validacion operativa solo aplica sobre solicitudes enviadas o en borrador.')
    }

    nextMetadata.validada_supervisor_en = new Date().toISOString()
    nextMetadata.validada_supervisor_por_usuario_id = actor.usuarioId
    nextMetadata.validada_supervisor_por_puesto = actor.puesto
    nextMetadata.estado_resolucion = 'PENDIENTE'
    nextMetadata.siguiente_actor = solicitud.tipo === 'INCAPACIDAD' ? 'NOMINA' : 'COORDINADOR'
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje: 'Solicitud validada por supervisor y en espera de resolucion final.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
  }

  if (estatus === 'REGISTRADA_RH') {
    if (actor.puesto !== 'NOMINA' && actor.puesto !== 'ADMINISTRADOR') {
      throw new Error('Solo NOMINA o ADMINISTRADOR pueden formalizar en RH.')
    }

    if (solicitud.tipo === 'INCAPACIDAD' && !['ENVIADA', 'VALIDADA_SUP'].includes(solicitud.estatus)) {
      throw new Error('La incapacidad debe estar enviada a nomina para poder formalizarse.')
    }

    nextMetadata.registrada_rh_en = new Date().toISOString()
    nextMetadata.registrada_rh_por_usuario_id = actor.usuarioId
    nextMetadata.registrada_rh_por_puesto = actor.puesto
    nextMetadata.justifica_asistencia = true
    nextMetadata.estado_resolucion = 'APROBADA'
    nextMetadata.siguiente_actor = null
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje: 'Tu solicitud fue aprobada y formalizada por nomina.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
  }

  if (estatus === 'REGISTRADA') {
    if (
      solicitud.tipo === 'JUSTIFICACION_FALTA' &&
      !['SUPERVISOR', 'ADMINISTRADOR'].includes(actor.puesto)
    ) {
      throw new Error('Solo SUPERVISOR o ADMINISTRADOR pueden aprobar una justificacion de falta.')
    }

    if (
      solicitud.tipo !== 'JUSTIFICACION_FALTA' &&
      !['COORDINADOR', 'ADMINISTRADOR'].includes(actor.puesto)
    ) {
      throw new Error('Solo COORDINADOR o ADMINISTRADOR pueden cerrar solicitudes no RH como REGISTRADA.')
    }

    const canCloseDirectFromSent =
      solicitud.estatus === 'ENVIADA' &&
      metadata.solicitud_autogestion_supervisor === true &&
      solicitud.tipo !== 'INCAPACIDAD'

    const canCloseJustificacion =
      solicitud.tipo === 'JUSTIFICACION_FALTA' &&
      ['ENVIADA', 'CORRECCION_SOLICITADA'].includes(solicitud.estatus)

    if (solicitud.estatus !== 'VALIDADA_SUP' && !canCloseDirectFromSent && !canCloseJustificacion) {
      throw new Error('La solicitud debe pasar primero por VALIDADA_SUP.')
    }

    nextMetadata.registrada_en = new Date().toISOString()
    nextMetadata.registrada_por_usuario_id = actor.usuarioId
    nextMetadata.registrada_por_puesto = actor.puesto
    nextMetadata.estado_resolucion = 'APROBADA'
    nextMetadata.siguiente_actor = null
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje: 'Tu solicitud fue aprobada.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
  }

  if (estatus === 'RECHAZADA') {
    if (solicitud.tipo === 'INCAPACIDAD' && actor.puesto !== 'NOMINA' && actor.puesto !== 'ADMINISTRADOR') {
      throw new Error('Solo NOMINA o ADMINISTRADOR pueden rechazar una incapacidad.')
    }

    if (solicitud.tipo === 'JUSTIFICACION_FALTA' && !['SUPERVISOR', 'ADMINISTRADOR'].includes(actor.puesto)) {
      throw new Error('Solo SUPERVISOR o ADMINISTRADOR pueden rechazar una justificacion de falta.')
    }

    nextMetadata.rechazada_en = new Date().toISOString()
    nextMetadata.rechazada_por_usuario_id = actor.usuarioId
    nextMetadata.rechazada_por_puesto = actor.puesto
    nextMetadata.estado_resolucion = 'RECHAZADA'
    nextMetadata.siguiente_actor = null
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje: 'Tu solicitud fue rechazada. Revisa comentarios y vuelve a capturarla si aplica.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
  }

  if (estatus === 'CORRECCION_SOLICITADA') {
    if (solicitud.tipo !== 'JUSTIFICACION_FALTA') {
      throw new Error('La correccion solo esta disponible para justificacion de faltas.')
    }

    if (!['SUPERVISOR', 'ADMINISTRADOR'].includes(actor.puesto)) {
      throw new Error('Solo SUPERVISOR o ADMINISTRADOR pueden pedir correccion.')
    }

    if (!['ENVIADA', 'CORRECCION_SOLICITADA'].includes(solicitud.estatus)) {
      throw new Error('La correccion solo aplica sobre solicitudes pendientes de supervision.')
    }

    nextMetadata.correccion_solicitada_en = new Date().toISOString()
    nextMetadata.correccion_solicitada_por_usuario_id = actor.usuarioId
    nextMetadata.correccion_solicitada_por_puesto = actor.puesto
    nextMetadata.estado_resolucion = 'PENDIENTE'
    nextMetadata.siguiente_actor = requesterPuesto
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje: 'Tu justificacion requiere correccion y reenvio con receta IMSS valida.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
  }

  if (estatus === 'ENVIADA') {
    if (solicitud.tipo === 'JUSTIFICACION_FALTA' && solicitud.estatus === 'CORRECCION_SOLICITADA') {
      Object.assign(nextMetadata, buildDeadlineMetadata(new Date().toISOString(), JUSTIFICACION_SLA_HOURS))
    }
    nextMetadata.enviada_en = new Date().toISOString()
    nextMetadata.enviada_por_usuario_id = actor.usuarioId
    nextMetadata.estado_resolucion = 'PENDIENTE'
    nextMetadata.siguiente_actor =
      solicitud.tipo === 'INCAPACIDAD'
        ? 'NOMINA'
        : metadata.solicitud_autogestion_supervisor === true
          ? 'COORDINADOR'
          : 'SUPERVISOR'
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      mensaje:
        solicitud.tipo === 'INCAPACIDAD'
          ? 'Incapacidad reenviada y pendiente de revision de nomina.'
          : metadata.solicitud_autogestion_supervisor === true
            ? 'Solicitud reenviada y pendiente de revision de coordinacion.'
            : 'Solicitud enviada y pendiente de revision operativa.',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: requesterPuesto,
    })
    shouldNotifyIncapacidad = solicitud.tipo === 'INCAPACIDAD'
  }

  const { error } = await service
    .from('solicitud')
    .update({
      estatus,
      comentarios: comentariosActualizados,
      metadata: nextMetadata,
    })
    .eq('id', solicitudId)
    .eq('cuenta_cliente_id', cuentaClienteId)

  if (error) {
    throw new Error(error.message)
  }

  await refreshSolicitudMaterializationIfNeeded(service, {
    solicitud,
    previousStatus: solicitud.estatus,
    nextStatus: estatus,
  })

  if (shouldNotifyIncapacidad) {
    const { data: empleado } = await service
      .from('empleado')
      .select('id, nombre_completo')
      .eq('id', solicitud.empleado_id)
      .maybeSingle()

    await registrarNotificacionIncapacidad(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId,
      empleadoId: solicitud.empleado_id,
      supervisorEmpleadoId: solicitud.supervisor_empleado_id,
      fechaInicio: solicitud.fecha_inicio,
      fechaFin: solicitud.fecha_fin,
      empleadoNombre: String(empleado?.nombre_completo ?? 'Colaborador'),
      motivo: solicitud.motivo ?? null,
      incapacidadClase:
        typeof nextMetadata.incapacidad_clase === 'string' ? nextMetadata.incapacidad_clase : null,
    })
  }

  try {
    await notifySolicitudResolutionPush(solicitud, estatus, actor.puesto)
  } catch {
    nextMetadata.notificaciones = appendNotification(nextMetadata, {
      canal: 'PUSH',
      mensaje: 'La notificacion push quedo pendiente de reenvio manual.',
      estado: 'PENDIENTE',
      destinatarioEmpleadoId: solicitud.empleado_id,
      destinatarioPuesto: 'DERMOCONSEJERO',
    })

    await service
      .from('solicitud')
      .update({
        metadata: nextMetadata,
      })
      .eq('id', solicitudId)
      .eq('cuenta_cliente_id', cuentaClienteId)
  }

  await service.from('audit_log').insert({
    tabla: 'solicitud',
    registro_id: solicitudId,
    accion: 'EVENTO',
    payload: {
      evento: 'solicitud_estatus_actualizado',
      tipo: solicitud.tipo,
      estatus,
      actor_puesto: actor.puesto,
      estado_resolucion: nextMetadata.estado_resolucion ?? null,
    },
    usuario_id: actor.usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })

  revalidatePath('/solicitudes')
  revalidatePath('/asistencias')
  revalidatePath('/dashboard')
  revalidatePath('/nomina')

  return buildState({
    ok: true,
    message:
      estatus === 'RECHAZADA'
        ? 'Solicitud rechazada.'
        : estatus === 'CORRECCION_SOLICITADA'
          ? 'Correccion solicitada al colaborador.'
        : estatus === 'VALIDADA_SUP'
          ? 'Solicitud validada por supervisor.'
        : 'Solicitud actualizada.',
  })
}

export async function actualizarEstatusSolicitud(formData: FormData): Promise<void> {
  await resolverEstatusSolicitud(formData, 'panel_solicitudes')
}

export async function resolverSolicitudDesdeDashboard(
  _prevState: SolicitudActionState,
  formData: FormData
): Promise<SolicitudActionState> {
  try {
    return await resolverEstatusSolicitud(formData, 'dashboard_supervision')
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible resolver la solicitud.',
    })
  }
}
