'use server'

import { revalidatePath } from 'next/cache'
import { requerirActorActivo } from '@/lib/auth/session'
import { obtenerUrlBaseAplicacion } from '@/lib/auth/admin'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { createClient } from '@/lib/supabase/server'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeRequestedAccountId, readRequestAccountScope } from '@/lib/tenant/accountScope'
import { readDirectR2Manifest, registerDirectR2EvidenceList } from '@/lib/storage/directR2Server'
import type { ArchivoHash, CuentaCliente, Empleado, MensajeInterno, MensajeReceptor, Puesto } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseMessageSurveyWorkbook,
  type ImportedSurveyQuestion,
  type SurveyQuestionType,
} from './lib/messageSurveyImport'
import { ESTADO_MENSAJE_INICIAL, type MensajeActionState } from './state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type EmpleadoRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>
type ArchivoHashRow = Pick<ArchivoHash, 'id' | 'sha256'>

const GENERAL_WRITE_ROLES = ['ADMINISTRADOR', 'COORDINADOR'] as const satisfies Puesto[]
const INCIDENT_WRITE_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'DERMOCONSEJERO'] as const satisfies Puesto[]
const SUPPORT_WRITE_ROLES = ['DERMOCONSEJERO'] as const satisfies Puesto[]
const MENSAJES_BUCKET = 'operacion-evidencias'
const MENSAJE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MENSAJE_ALLOWED_SURVEY_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]
const READ_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'DERMOCONSEJERO',
  'LOVE_IS',
  'VENTAS',
  'NOMINA',
  'LOGISTICA',
  'RECLUTAMIENTO',
] as const satisfies Puesto[]

function hasRole(roles: readonly Puesto[], puesto: Puesto) {
  return roles.includes(puesto)
}

function buildState(partial: Partial<MensajeActionState>): MensajeActionState {
  return {
    ...ESTADO_MENSAJE_INICIAL,
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

function normalizeTargetPuesto(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  if (!normalized) {
    return null
  }

  const allowedRoles = [
    'RECLUTAMIENTO',
    'NOMINA',
    'LOGISTICA',
    'LOVE_IS',
    'VENTAS',
    'SUPERVISOR',
    'COORDINADOR',
    'ADMINISTRADOR',
  ] as const

  if (!allowedRoles.includes(normalized as (typeof allowedRoles)[number])) {
    throw new Error('El rol destino no es valido para mensajeria interna.')
  }

  return normalized as (typeof allowedRoles)[number]
}

function normalizeOptionLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: `opt-${index + 1}`, label }))
}

function normalizeSurveyMode(value: FormDataEntryValue | null): SurveyQuestionType {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'RESPUESTA_LIBRE') {
    return 'RESPUESTA_LIBRE'
  }

  return 'OPCION_MULTIPLE'
}

function normalizeSurveyVisibility(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized === 'IDENTIFICADA' ? 'IDENTIFICADA' : 'ANONIMA'
}

function buildManualSurveyQuestions(formData: FormData): ImportedSurveyQuestion[] {
  const titulo = normalizeRequiredText(formData.get('pregunta_titulo'), 'Pregunta')
  const descripcion = normalizeOptionalText(formData.get('pregunta_descripcion'))
  const tipoPregunta = normalizeSurveyMode(formData.get('pregunta_tipo'))
  const opciones =
    tipoPregunta === 'OPCION_MULTIPLE'
      ? normalizeOptionLines(String(formData.get('opciones_respuesta') ?? ''))
      : []

  if (tipoPregunta === 'OPCION_MULTIPLE' && opciones.length < 2) {
    throw new Error('La encuesta requiere al menos dos opciones de respuesta.')
  }

  return [
    {
      orden: 1,
      titulo,
      descripcion,
      tipoPregunta,
      obligatoria: true,
      opciones,
    },
  ]
}

function getUploadedFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((item): item is File => item instanceof File && item.size > 0)
}

async function requireReadableActor() {
  const actor = await requerirActorActivo()
  if (!hasRole(READ_ROLES, actor.puesto)) {
    throw new Error('No tienes permisos para acceder a mensajes.')
  }

  return actor
}

async function requireManagerActor() {
  const actor = await requerirActorActivo()
  if (!hasRole(GENERAL_WRITE_ROLES, actor.puesto)) {
    throw new Error('No tienes permisos para publicar mensajes.')
  }

  return actor
}

async function requireIncidentActor() {
  const actor = await requerirActorActivo()
  if (!hasRole(INCIDENT_WRITE_ROLES, actor.puesto)) {
    throw new Error('No tienes permisos para registrar incidencias.')
  }

  return actor
}

async function requireSupportActor() {
  const actor = await requerirActorActivo()
  if (!hasRole(SUPPORT_WRITE_ROLES, actor.puesto)) {
    throw new Error('No tienes permisos para enviar mensajes de soporte.')
  }

  return actor
}

async function ensureMensajesBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(MENSAJES_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: MENSAJE_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

function revalidateMensajesPaths() {
  revalidatePath('/mensajes')
  revalidatePath('/dashboard')
}

async function resolveCuentaCliente(
  actor: Awaited<ReturnType<typeof requireManagerActor>>,
  service: TypedSupabaseClient,
  formData: FormData
) {
  const requestedAccountId = normalizeRequestedAccountId(formData.get('cuenta_cliente_id'))
  const scope = await readRequestAccountScope()
  const candidateId =
    actor.puesto === 'ADMINISTRADOR'
      ? requestedAccountId ?? scope.accountId
      : actor.cuentaClienteId ?? requestedAccountId ?? scope.accountId

  if (!candidateId) {
    throw new Error('Selecciona una cuenta cliente activa para mensajeria.')
  }

  const { data, error } = await service
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('id', candidateId)
    .maybeSingle()

  const cuenta = data as CuentaCliente | null
  if (error || !cuenta || !cuenta.activa) {
    throw new Error(error?.message ?? 'La cuenta cliente seleccionada no existe o no esta activa.')
  }

  return cuenta
}

async function ensureCuentaClienteValida(service: TypedSupabaseClient, cuentaClienteId: string) {
  const { data, error } = await service
    .from('cuenta_cliente')
    .select('id, activa')
    .eq('id', cuentaClienteId)
    .maybeSingle()

  const cuenta = data as CuentaCliente | null
  if (error || !cuenta || !cuenta.activa) {
    throw new Error(error?.message ?? 'La cuenta cliente seleccionada no existe o no esta activa.')
  }
}

async function resolveRecipients(
  service: TypedSupabaseClient,
  cuentaClienteId: string,
  actorSupervisorId: string,
  grupoDestino: MensajeInterno['grupo_destino'],
  zona: string | null,
  supervisorEmpleadoId: string | null,
  puestoDestino: Puesto | null
) {
  const query = service
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
    .eq('estatus_laboral', 'ACTIVO')

  if (grupoDestino === 'TODOS_DCS') {
    query.eq('puesto', 'DERMOCONSEJERO')
  }

  if (grupoDestino === 'ZONA') {
    if (!zona) {
      throw new Error('La zona es obligatoria para el grupo seleccionado.')
    }

    query.eq('zona', zona)
  }

  if (grupoDestino === 'SUPERVISOR') {
    query.eq('supervisor_empleado_id', supervisorEmpleadoId ?? actorSupervisorId)
  }

  if (grupoDestino === 'PUESTO') {
    if (!puestoDestino) {
      throw new Error('El rol destino es obligatorio para el grupo seleccionado.')
    }

    query.eq('puesto', puestoDestino)
  }

  const { data, error } = await query.order('nombre_completo', { ascending: true })
  if (error) {
    throw new Error(error.message)
  }

  const empleados = (data ?? []) as EmpleadoRow[]
  if (empleados.length === 0) {
    throw new Error('No se encontraron receptores para el grupo seleccionado.')
  }

  return empleados.map((empleado) => ({
    mensaje_id: '',
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: empleado.id,
    estado: 'PENDIENTE',
    metadata: {
      empleado_nombre: empleado.nombre_completo,
      puesto: empleado.puesto,
    },
  }))
}

async function registrarEventoAudit(
  service: TypedSupabaseClient,
  {
    tabla,
    registroId,
    cuentaClienteId,
    actorUsuarioId,
    payload,
  }: {
    tabla: string
    registroId: string
    cuentaClienteId: string
    actorUsuarioId?: string | null
    payload: Record<string, unknown>
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId ?? null,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function resolveArchivoHashId(service: TypedSupabaseClient, sha256: string) {
  const { data, error } = await service.from('archivo_hash').select('id, sha256').eq('sha256', sha256).maybeSingle()
  const archivo = data as ArchivoHashRow | null

  if (error || !archivo?.id) {
    throw new Error(error?.message ?? 'No fue posible resolver el hash del adjunto.')
  }

  return archivo.id
}

async function uploadMensajeAdjuntos(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    mensajeId,
    files,
    directReferences = [],
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    mensajeId: string
    files: File[]
    directReferences?: ReturnType<typeof readDirectR2Manifest>
  }
) {
  if (files.length === 0 && directReferences.length === 0) {
    return []
  }

  await ensureMensajesBucket(service)
  const rows: Array<Record<string, unknown>> = []

  for (const file of files) {
    if (exceedsOperationalDocumentUploadLimit(file)) {
      throw new Error(buildOperationalDocumentUploadLimitMessage('adjunto', file))
    }

    if (!MENSAJE_ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error('Los adjuntos deben ser JPEG, PNG, WEBP o PDF.')
    }

    const stored = await storeOptimizedEvidence({
      service,
      bucket: MENSAJES_BUCKET,
      actorUsuarioId,
      storagePrefix: `mensajes/${cuentaClienteId}/${mensajeId}`,
      file,
    })

    const archivoHashId = await resolveArchivoHashId(service, stored.archivo.hash)

    rows.push({
      mensaje_id: mensajeId,
      cuenta_cliente_id: cuentaClienteId,
      archivo_hash_id: archivoHashId,
      nombre_archivo_original: file.name,
      mime_type: file.type || stored.optimization.mimeType,
      tamano_bytes: stored.optimization.optimizedBytes,
      metadata: {
        archivo_url: stored.archivo.url,
        archivo_hash: stored.archivo.hash,
        miniatura_url: stored.miniatura?.url ?? null,
        miniatura_hash: stored.miniatura?.hash ?? null,
        optimization: {
          kind: stored.optimization.optimizationKind,
          originalBytes: stored.optimization.originalBytes,
          finalBytes: stored.optimization.optimizedBytes,
          targetMet: stored.optimization.targetMet,
          notes: stored.optimization.notes,
          officialAssetKind: stored.optimization.officialAssetKind,
        },
      },
    })
  }

  if (directReferences.length > 0) {
    const registered = await registerDirectR2EvidenceList(service, {
      actorUsuarioId,
      modulo: 'mensajes',
      referenciaEntidadId: mensajeId,
      references: directReferences,
    })

    for (const item of registered) {
      rows.push({
        mensaje_id: mensajeId,
        cuenta_cliente_id: cuentaClienteId,
        archivo_hash_id: item.archivoHashId,
        nombre_archivo_original: item.fileName,
        mime_type: item.contentType,
        tamano_bytes: item.size,
        metadata: {
          archivo_url: item.url,
          archivo_hash: item.hash,
          miniatura_url: null,
          miniatura_hash: null,
          optimization: {
            kind: 'r2_direct',
            originalBytes: item.size,
            finalBytes: item.size,
            targetMet: true,
            notes: ['Subida directa via R2'],
            officialAssetKind: 'original',
          },
        },
      })
    }
  }

  const { error } = await service.from('mensaje_adjunto').insert(rows)
  if (error) {
    throw new Error(error.message)
  }

  return rows
}

async function parseSurveyQuestionsFromForm(formData: FormData) {
  const uploaded = formData.get('encuesta_excel')
  if (uploaded instanceof File && uploaded.size > 0) {
    if (!MENSAJE_ALLOWED_SURVEY_MIME_TYPES.includes(uploaded.type) && !uploaded.name.toLowerCase().endsWith('.xlsx')) {
      throw new Error('La encuesta debe cargarse como archivo XLSX valido.')
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer())
    return parseMessageSurveyWorkbook(buffer, uploaded.name)
  }

  return buildManualSurveyQuestions(formData)
}

async function insertSurveyQuestions(
  service: TypedSupabaseClient,
  {
    mensajeId,
    cuentaClienteId,
    questions,
    surveyVisibility,
    actorUsuarioId,
  }: {
    mensajeId: string
    cuentaClienteId: string
    questions: ImportedSurveyQuestion[]
    surveyVisibility: 'ANONIMA' | 'IDENTIFICADA'
    actorUsuarioId: string
  }
) {
  if (questions.length === 0) {
    return
  }

  const rows = questions.map((question) => ({
    mensaje_id: mensajeId,
    cuenta_cliente_id: cuentaClienteId,
    orden: question.orden,
    titulo: question.titulo,
    descripcion: question.descripcion,
    tipo_pregunta: question.tipoPregunta,
    opciones: question.opciones,
    obligatoria: question.obligatoria,
    metadata: {
      survey_visibility: surveyVisibility,
    },
  }))

  const { error } = await service.from('mensaje_encuesta_pregunta').insert(rows)
  if (error) {
    throw new Error(error.message)
  }

  await registrarEventoAudit(service, {
    tabla: 'mensaje_interno',
    registroId: mensajeId,
    cuentaClienteId,
    actorUsuarioId,
    payload: {
      accion: 'registrar_preguntas_encuesta',
      total_preguntas: questions.length,
      survey_visibility: surveyVisibility,
    },
  })
}

export async function publicarMensajeInterno(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireManagerActor()
    const service = createServiceClient() as TypedSupabaseClient
    const cuenta = await resolveCuentaCliente(actor, service, formData)
    const titulo = normalizeRequiredText(formData.get('titulo'), 'Titulo')
    const cuerpo = normalizeRequiredText(formData.get('cuerpo'), 'Mensaje')
    const tipo = normalizeRequiredText(formData.get('tipo'), 'Tipo') as MensajeInterno['tipo']
    const grupoDestino = normalizeRequiredText(formData.get('grupo_destino'), 'Grupo destino') as MensajeInterno['grupo_destino']
    const zona = normalizeOptionalText(formData.get('zona'))
    const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))
    const puestoDestino = normalizeTargetPuesto(formData.get('puesto_destino'))
    const attachmentFiles = getUploadedFiles(formData, 'adjunto')
    const attachmentR2Manifest = readDirectR2Manifest(formData, 'adjunto_r2_manifest')
    const surveyVisibility = normalizeSurveyVisibility(formData.get('survey_visibility'))
    const surveyQuestions = tipo === 'ENCUESTA' ? await parseSurveyQuestionsFromForm(formData) : []
    const opciones =
      tipo === 'ENCUESTA' && surveyQuestions.length === 1 && surveyQuestions[0]?.tipoPregunta === 'OPCION_MULTIPLE'
        ? surveyQuestions[0].opciones
        : []

    const recipientDrafts = await resolveRecipients(
      service,
      cuenta.id,
      actor.empleadoId,
      grupoDestino,
      zona,
      supervisorEmpleadoId,
      puestoDestino
    )

    const { data: createdRaw, error: createError } = await service
      .from('mensaje_interno')
      .insert({
        cuenta_cliente_id: cuenta.id,
        creado_por_usuario_id: actor.usuarioId,
        titulo,
        cuerpo,
        tipo,
        grupo_destino: grupoDestino,
        zona,
        supervisor_empleado_id: supervisorEmpleadoId,
        opciones_respuesta: opciones,
        metadata: {
          audience_label: grupoDestino === 'PUESTO' && puestoDestino ? `Rol ${puestoDestino}` : undefined,
          puesto_destino: grupoDestino === 'PUESTO' ? puestoDestino : null,
          total_receptores: recipientDrafts.length,
          survey_visibility: tipo === 'ENCUESTA' ? surveyVisibility : null,
          survey_question_count: tipo === 'ENCUESTA' ? surveyQuestions.length : 0,
          survey_source:
            tipo === 'ENCUESTA' && formData.get('encuesta_excel') instanceof File ? 'XLSX' : tipo === 'ENCUESTA' ? 'MANUAL' : null,
        },
      })
      .select('id')
      .maybeSingle()

    if (createError || !createdRaw?.id) {
      throw new Error(createError?.message ?? 'No se pudo publicar el mensaje.')
    }

    const recipientRows = recipientDrafts.map((item) => ({
      ...item,
      mensaje_id: createdRaw.id,
    }))

    const { error: recipientError } = await service.from('mensaje_receptor').insert(recipientRows)
    if (recipientError) {
      throw new Error(recipientError.message)
    }

    if (tipo === 'ENCUESTA') {
      await insertSurveyQuestions(service, {
        mensajeId: createdRaw.id,
        cuentaClienteId: cuenta.id,
        questions: surveyQuestions,
        surveyVisibility,
        actorUsuarioId: actor.usuarioId,
      })
    }

    const adjuntos = await uploadMensajeAdjuntos(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: cuenta.id,
      mensajeId: createdRaw.id,
      files: attachmentFiles,
      directReferences: attachmentR2Manifest,
    })

    let pushFanoutState: 'ENVIADO' | 'PENDIENTE' = 'ENVIADO'

    try {
      await sendOperationalPushNotification({
        employeeIds: recipientRows.map((item) => item.empleado_id),
        title: titulo,
        body: cuerpo,
        path: '/mensajes',
        tag: `mensaje-${createdRaw.id}`,
        cuentaClienteId: cuenta.id,
        audit: {
          tabla: 'mensaje_interno',
          registroId: createdRaw.id,
          accion: 'fanout_mensaje_push',
        },
        data: {
          mensajeId: createdRaw.id,
          tipo,
          grupoDestino,
          cuentaClienteId: cuenta.id,
        },
      })
    } catch (pushError) {
      pushFanoutState = 'PENDIENTE'
      await registrarEventoAudit(service, {
        tabla: 'mensaje_interno',
        registroId: createdRaw.id,
        cuentaClienteId: cuenta.id,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'fanout_push_pendiente',
          detalle: pushError instanceof Error ? pushError.message : 'Error desconocido en edge function',
        },
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'mensaje_interno',
      registroId: createdRaw.id,
      cuentaClienteId: cuenta.id,
      actorUsuarioId: actor.usuarioId,
      payload: {
        accion: 'publicar_mensaje_interno',
        tipo,
        grupo_destino: grupoDestino,
        total_receptores: recipientRows.length,
        total_adjuntos: adjuntos.length,
        total_preguntas_encuesta: surveyQuestions.length,
        push_fanout: pushFanoutState,
      },
    })

    revalidateMensajesPaths()
    return buildState({
      ok: true,
      message: pushFanoutState === 'ENVIADO' ? 'Mensaje publicado correctamente.' : 'Mensaje publicado. El envio push quedo pendiente.',
    })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

function normalizeIncidentType(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (!['RETARDO', 'NO_LLEGARE', 'DESABASTO'].includes(normalized)) {
    throw new Error('El tipo de incidencia no es valido.')
  }

  return normalized as 'RETARDO' | 'NO_LLEGARE' | 'DESABASTO'
}

function buildIncidentTitle(tipo: 'RETARDO' | 'NO_LLEGARE' | 'DESABASTO') {
  if (tipo === 'RETARDO') {
    return 'Incidencia: retardo reportado'
  }

  if (tipo === 'NO_LLEGARE') {
    return 'Incidencia: no llegare a sucursal'
  }

  return 'Incidencia: desabasto en PDV'
}

function buildIncidentBody(
  tipo: 'RETARDO' | 'NO_LLEGARE' | 'DESABASTO',
  {
    actorNombre,
    pdvNombre,
    detalle,
  }: {
    actorNombre: string
    pdvNombre: string | null
    detalle: string | null
  }
) {
  const base =
    tipo === 'RETARDO'
      ? `${actorNombre} reporto un retardo${pdvNombre ? ` para ${pdvNombre}` : ''}.`
      : tipo === 'NO_LLEGARE'
        ? `${actorNombre} aviso que no llegara${pdvNombre ? ` a ${pdvNombre}` : ' a la sucursal asignada'}.`
        : `${actorNombre} reporto desabasto${pdvNombre ? ` en ${pdvNombre}` : ' en el punto de venta'}.`

  return detalle ? `${base} Detalle: ${detalle}` : base
}

function normalizeSupportCategory(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  if (!['FALLA_APP', 'BONO', 'NOMINA', 'RECIBO_NOMINA', 'OTRO'].includes(normalized)) {
    throw new Error('La categoria del mensaje no es valida.')
  }

  return normalized as 'FALLA_APP' | 'BONO' | 'NOMINA' | 'RECIBO_NOMINA' | 'OTRO'
}

function buildSupportTitle(category: ReturnType<typeof normalizeSupportCategory>) {
  switch (category) {
    case 'FALLA_APP':
      return 'Soporte dermoconsejo: falla en la app'
    case 'BONO':
      return 'Soporte dermoconsejo: bono no recibido'
    case 'NOMINA':
      return 'Soporte dermoconsejo: nomina no recibida'
    case 'RECIBO_NOMINA':
      return 'Soporte dermoconsejo: recibo de nomina pendiente'
    default:
      return 'Soporte dermoconsejo: reporte operativo'
  }
}

function buildSupportBody(
  category: ReturnType<typeof normalizeSupportCategory>,
  {
    actorNombre,
    detalle,
    pdvNombre,
  }: {
    actorNombre: string
    detalle: string
    pdvNombre: string | null
  }
) {
  const categoryLabel =
    category === 'FALLA_APP'
      ? 'falla en la aplicacion'
      : category === 'BONO'
        ? 'bono no recibido'
        : category === 'NOMINA'
          ? 'nomina no recibida'
          : category === 'RECIBO_NOMINA'
            ? 'recibo de nomina pendiente'
            : 'reporte operativo'

  return `${actorNombre} envio un mensaje de ${categoryLabel}${pdvNombre ? ` desde ${pdvNombre}` : ''}. Detalle: ${detalle}`
}

function normalizeCorrectionField(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  if (!['CORREO_ELECTRONICO', 'TELEFONO', 'DOMICILIO_COMPLETO'].includes(normalized)) {
    throw new Error('El campo a corregir no es valido.')
  }

  return normalized as 'CORREO_ELECTRONICO' | 'TELEFONO' | 'DOMICILIO_COMPLETO'
}

function buildCorrectionTitle(field: ReturnType<typeof normalizeCorrectionField>) {
  switch (field) {
    case 'CORREO_ELECTRONICO':
      return 'Correccion de perfil: correo electronico'
    case 'TELEFONO':
      return 'Correccion de perfil: telefono'
    default:
      return 'Correccion de perfil: domicilio'
  }
}

function buildCorrectionBody(
  field: ReturnType<typeof normalizeCorrectionField>,
  {
    actorNombre,
    currentValue,
    nextValue,
  }: {
    actorNombre: string
    currentValue: string | null
    nextValue: string
  }
) {
  const fieldLabel =
    field === 'CORREO_ELECTRONICO'
      ? 'correo electronico'
      : field === 'TELEFONO'
        ? 'telefono'
        : 'domicilio'

  return `${actorNombre} solicito corregir ${fieldLabel}. Actual: ${currentValue ?? 'sin dato'}. Nuevo: ${nextValue}.`
}

async function triggerEmailVerificationChange(nextEmail: string) {
  const authClient = await createClient({ bypassTenantScope: true })
  const siteUrl = await obtenerUrlBaseAplicacion()

  const { error } = await authClient.auth.updateUser(
    {
      email: nextEmail,
    },
    {
      emailRedirectTo: `${siteUrl}/update-password`,
    }
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function resolveSupportRecipients(
  service: TypedSupabaseClient,
  cuentaClienteId: string
) {
  const query = service
    .from('empleado')
    .select('id, nombre_completo, puesto')
    .eq('estatus_laboral', 'ACTIVO')

  const result =
    typeof query.in === 'function'
      ? await query.in('puesto', ['COORDINADOR', 'ADMINISTRADOR']).order('nombre_completo', {
          ascending: true,
        })
      : await query.order('nombre_completo', { ascending: true })

  if (result.error) {
    throw new Error(result.error.message)
  }

  const employees = ((result.data ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>>).filter(
    (item) => item.puesto === 'COORDINADOR' || item.puesto === 'ADMINISTRADOR'
  )

  if (employees.length === 0) {
    throw new Error('No se encontro personal de Coordinacion o Administracion para recibir el mensaje.')
  }

  return employees.map((employee) => ({
    mensaje_id: '',
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: employee.id,
    estado: 'PENDIENTE',
    metadata: {
      origen: 'SOPORTE_DERMOCONSEJO',
      receptor_puesto: employee.puesto,
      empleado_nombre: employee.nombre_completo,
    },
  }))
}

export async function registrarIncidenciaOperativa(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireIncidentActor()
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))
    const pdvId = normalizeOptionalText(formData.get('pdv_id'))
    const pdvNombre = normalizeOptionalText(formData.get('pdv_nombre'))
    const incidenciaTipo = normalizeIncidentType(formData.get('incidencia_tipo'))
    const detalle = normalizeOptionalText(formData.get('detalle'))

    await ensureCuentaClienteValida(service, cuentaClienteId)

    if (!supervisorEmpleadoId) {
      throw new Error('No existe un supervisor asignado para registrar esta incidencia.')
    }

    const titulo = buildIncidentTitle(incidenciaTipo)
    const cuerpo = buildIncidentBody(incidenciaTipo, {
      actorNombre: actor.nombreCompleto,
      pdvNombre,
      detalle,
    })

    const { data: createdRaw, error: createError } = await service
      .from('mensaje_interno')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        creado_por_usuario_id: actor.usuarioId,
        titulo,
        cuerpo,
        tipo: 'MENSAJE',
        grupo_destino: 'SUPERVISOR',
        zona: null,
        supervisor_empleado_id: supervisorEmpleadoId,
        opciones_respuesta: [],
        metadata: {
          contexto: 'INCIDENCIA_OPERATIVA_DERMO',
          incidencia_tipo: incidenciaTipo,
          empleado_id: empleadoId,
          pdv_id: pdvId,
          pdv_nombre: pdvNombre,
          detalle,
          registrado_en: new Date().toISOString(),
        },
      })
      .select('id')
      .maybeSingle()

    if (createError || !createdRaw?.id) {
      throw new Error(createError?.message ?? 'No se pudo registrar la incidencia.')
    }

    const recipientRows = [
      {
        mensaje_id: createdRaw.id,
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: supervisorEmpleadoId,
        estado: 'PENDIENTE',
        metadata: {
          origen: 'INCIDENCIA_OPERATIVA_DERMO',
          incidencia_tipo: incidenciaTipo,
          actor_puesto: actor.puesto,
        },
      },
    ]

    const { error: recipientError } = await service.from('mensaje_receptor').insert(recipientRows)
    if (recipientError) {
      throw new Error(recipientError.message)
    }

    let pushFanoutState: 'ENVIADO' | 'PENDIENTE' = 'ENVIADO'

    try {
      await sendOperationalPushNotification({
        employeeIds: [supervisorEmpleadoId],
        title: titulo,
        body: cuerpo,
        path: '/mensajes',
        tag: `incidencia-${createdRaw.id}`,
        cuentaClienteId,
        audit: {
          tabla: 'mensaje_interno',
          registroId: createdRaw.id,
          accion: 'fanout_incidencia_operativa_push',
        },
        data: {
          mensajeId: createdRaw.id,
          incidenciaTipo,
          empleadoId,
          pdvId,
        },
      })
    } catch (pushError) {
      pushFanoutState = 'PENDIENTE'
      await registrarEventoAudit(service, {
        tabla: 'mensaje_interno',
        registroId: createdRaw.id,
        cuentaClienteId,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'fanout_incidencia_push_pendiente',
          detalle: pushError instanceof Error ? pushError.message : 'Error desconocido en edge function',
        },
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'mensaje_interno',
      registroId: createdRaw.id,
      cuentaClienteId,
      actorUsuarioId: actor.usuarioId,
      payload: {
        accion: 'registrar_incidencia_operativa_dermo',
        incidencia_tipo: incidenciaTipo,
        supervisor_empleado_id: supervisorEmpleadoId,
        pdv_id: pdvId,
        push_fanout: pushFanoutState,
      },
    })

    revalidateMensajesPaths()
    return buildState({
      ok: true,
      message:
        incidenciaTipo === 'DESABASTO'
          ? 'Desabasto reportado al supervisor.'
          : incidenciaTipo === 'NO_LLEGARE'
            ? 'Aviso de no llegada enviado.'
            : 'Retardo reportado correctamente.',
    })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function enviarMensajeSoporteDermoconsejo(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireSupportActor()
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const pdvId = normalizeOptionalText(formData.get('pdv_id'))
    const pdvNombre = normalizeOptionalText(formData.get('pdv_nombre'))
    const category = normalizeSupportCategory(formData.get('categoria'))
    const detalle = normalizeRequiredText(formData.get('detalle'), 'Detalle')

    await ensureCuentaClienteValida(service, cuentaClienteId)

    const recipientDrafts = await resolveSupportRecipients(service, cuentaClienteId)
    const title = buildSupportTitle(category)
    const body = buildSupportBody(category, {
      actorNombre: actor.nombreCompleto,
      detalle,
      pdvNombre,
    })

    const { data: createdRaw, error: createError } = await service
      .from('mensaje_interno')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        creado_por_usuario_id: actor.usuarioId,
        titulo: title,
        cuerpo: body,
        tipo: 'MENSAJE',
        grupo_destino: 'TODOS_DCS',
        zona: null,
        supervisor_empleado_id: null,
        opciones_respuesta: [],
        metadata: {
          contexto: 'SOPORTE_DERMOCONSEJO',
          audience_label: 'Coordinacion y Administracion',
          soporte_categoria: category,
          empleado_id: empleadoId,
          pdv_id: pdvId,
          pdv_nombre: pdvNombre,
          detalle,
          total_receptores: recipientDrafts.length,
          registrado_en: new Date().toISOString(),
        },
      })
      .select('id')
      .maybeSingle()

    if (createError || !createdRaw?.id) {
      throw new Error(createError?.message ?? 'No fue posible enviar el mensaje a Coordinacion.')
    }

    const recipientRows = recipientDrafts.map((item) => ({
      ...item,
      mensaje_id: createdRaw.id,
    }))

    const { error: recipientError } = await service.from('mensaje_receptor').insert(recipientRows)
    if (recipientError) {
      throw new Error(recipientError.message)
    }

    let pushFanoutState: 'ENVIADO' | 'PENDIENTE' = 'ENVIADO'

    try {
      await sendOperationalPushNotification({
        employeeIds: recipientRows.map((item) => item.empleado_id),
        title,
        body,
        path: '/mensajes',
        tag: `soporte-dermo-${createdRaw.id}`,
        cuentaClienteId,
        audit: {
          tabla: 'mensaje_interno',
          registroId: createdRaw.id,
          accion: 'fanout_soporte_dermoconsejo_push',
        },
        data: {
          mensajeId: createdRaw.id,
          contexto: 'SOPORTE_DERMOCONSEJO',
          categoria: category,
          empleadoId,
          pdvId,
        },
      })
    } catch (pushError) {
      pushFanoutState = 'PENDIENTE'
      await registrarEventoAudit(service, {
        tabla: 'mensaje_interno',
        registroId: createdRaw.id,
        cuentaClienteId,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'fanout_soporte_dermo_push_pendiente',
          detalle: pushError instanceof Error ? pushError.message : 'Error desconocido en edge function',
        },
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'mensaje_interno',
      registroId: createdRaw.id,
      cuentaClienteId,
      actorUsuarioId: actor.usuarioId,
      payload: {
        accion: 'enviar_mensaje_soporte_dermoconsejo',
        soporte_categoria: category,
        pdv_id: pdvId,
        total_receptores: recipientRows.length,
        push_fanout: pushFanoutState,
      },
    })

    revalidateMensajesPaths()
    return buildState({
      ok: true,
      message:
        pushFanoutState === 'ENVIADO'
          ? 'Mensaje enviado a Coordinacion con copia a Administracion.'
          : 'Mensaje enviado. La notificacion push quedo pendiente.',
    })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function solicitarCorreccionPerfilDermoconsejo(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireSupportActor()
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const field = normalizeCorrectionField(formData.get('campo'))
    const currentValue = normalizeOptionalText(formData.get('valor_actual'))
    const nextValue = normalizeRequiredText(formData.get('valor_nuevo'), 'Nuevo valor')
    const detail = normalizeOptionalText(formData.get('detalle'))
    const evidenceFiles = getUploadedFiles(formData, 'evidencia')
    const evidenceR2Manifest = readDirectR2Manifest(formData, 'evidencia_r2_manifest')

    await ensureCuentaClienteValida(service, cuentaClienteId)

    if (field !== 'CORREO_ELECTRONICO' && evidenceFiles.length === 0 && evidenceR2Manifest.length === 0) {
      throw new Error('Adjunta una evidencia para solicitar esta correccion.')
    }

    if (field === 'CORREO_ELECTRONICO') {
      await triggerEmailVerificationChange(nextValue.trim().toLowerCase())
    }

    const recipientDrafts = await resolveSupportRecipients(service, cuentaClienteId)
    const title = buildCorrectionTitle(field)
    const body = buildCorrectionBody(field, {
      actorNombre: actor.nombreCompleto,
      currentValue,
      nextValue,
    })

    const { data: createdRaw, error: createError } = await service
      .from('mensaje_interno')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        creado_por_usuario_id: actor.usuarioId,
        titulo: title,
        cuerpo: detail ? `${body} Detalle: ${detail}` : body,
        tipo: 'MENSAJE',
        grupo_destino: 'TODOS_DCS',
        zona: null,
        supervisor_empleado_id: null,
        opciones_respuesta: [],
        metadata: {
          contexto: 'CORRECCION_PERFIL_DERMOCONSEJO',
          audience_label: 'Coordinacion y Administracion',
          correction_field: field,
          empleado_id: empleadoId,
          current_value: currentValue,
          requested_value: nextValue,
          detail,
          evidence_required: field !== 'CORREO_ELECTRONICO',
          email_verification_requested: field === 'CORREO_ELECTRONICO',
          requested_at: new Date().toISOString(),
        },
      })
      .select('id')
      .maybeSingle()

    if (createError || !createdRaw?.id) {
      throw new Error(createError?.message ?? 'No fue posible registrar la solicitud de correccion.')
    }

    const recipientRows = recipientDrafts.map((item) => ({
      ...item,
      mensaje_id: createdRaw.id,
      metadata: {
        ...item.metadata,
        origen: 'CORRECCION_PERFIL_DERMOCONSEJO',
        correction_field: field,
      },
    }))

    const { error: recipientError } = await service.from('mensaje_receptor').insert(recipientRows)
    if (recipientError) {
      throw new Error(recipientError.message)
    }

    const adjuntos = await uploadMensajeAdjuntos(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId,
      mensajeId: createdRaw.id,
      files: evidenceFiles,
      directReferences: evidenceR2Manifest,
    })

    let pushFanoutState: 'ENVIADO' | 'PENDIENTE' = 'ENVIADO'

    try {
      await sendOperationalPushNotification({
        employeeIds: recipientRows.map((item) => item.empleado_id),
        title,
        body,
        path: '/mensajes',
        tag: `correccion-perfil-${createdRaw.id}`,
        cuentaClienteId,
        audit: {
          tabla: 'mensaje_interno',
          registroId: createdRaw.id,
          accion: 'fanout_correccion_perfil_push',
        },
        data: {
          mensajeId: createdRaw.id,
          contexto: 'CORRECCION_PERFIL_DERMOCONSEJERO',
          correctionField: field,
          empleadoId,
        },
      })
    } catch (pushError) {
      pushFanoutState = 'PENDIENTE'
      await registrarEventoAudit(service, {
        tabla: 'mensaje_interno',
        registroId: createdRaw.id,
        cuentaClienteId,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'fanout_correccion_perfil_push_pendiente',
          detalle: pushError instanceof Error ? pushError.message : 'Error desconocido en edge function',
        },
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'mensaje_interno',
      registroId: createdRaw.id,
      cuentaClienteId,
      actorUsuarioId: actor.usuarioId,
      payload: {
        accion: 'solicitar_correccion_perfil_dermoconsejo',
        correction_field: field,
        total_receptores: recipientRows.length,
        total_adjuntos: adjuntos.length,
        email_verification_requested: field === 'CORREO_ELECTRONICO',
        push_fanout: pushFanoutState,
      },
    })

    revalidateMensajesPaths()
    return buildState({
      ok: true,
      message:
        field === 'CORREO_ELECTRONICO'
          ? 'Solicitud enviada. Revisa tu nuevo correo para continuar la verificacion.'
          : 'Solicitud de correccion enviada correctamente.',
    })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function marcarMensajeLeido(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireReadableActor()
    const service = createServiceClient() as TypedSupabaseClient
    const receptorId = normalizeRequiredText(formData.get('receptor_id'), 'Receptor')

    const { data: receptorRaw, error } = await service
      .from('mensaje_receptor')
      .select('id, mensaje_id, cuenta_cliente_id, empleado_id, estado')
      .eq('id', receptorId)
      .maybeSingle()

    const receptor = receptorRaw as Pick<MensajeReceptor, 'id' | 'mensaje_id' | 'cuenta_cliente_id' | 'empleado_id' | 'estado'> | null
    if (error || !receptor) {
      throw new Error(error?.message ?? 'No se encontro el mensaje seleccionado.')
    }

    if (receptor.empleado_id !== actor.empleadoId && !hasRole(GENERAL_WRITE_ROLES, actor.puesto)) {
      throw new Error('No puedes modificar el estado de otro receptor.')
    }

    if (receptor.estado === 'PENDIENTE') {
      const { error: updateError } = await service
        .from('mensaje_receptor')
        .update({ estado: 'LEIDO', leido_en: new Date().toISOString() })
        .eq('id', receptor.id)

      if (updateError) {
        throw new Error(updateError.message)
      }
    }

    revalidateMensajesPaths()
    return buildState({ ok: true, message: 'Mensaje marcado como leido.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function responderEncuesta(
  _prevState: MensajeActionState,
  formData: FormData
): Promise<MensajeActionState> {
  try {
    const actor = await requireReadableActor()
    const service = createServiceClient() as TypedSupabaseClient
    const receptorId = normalizeRequiredText(formData.get('receptor_id'), 'Receptor')
    const { data: receptorRaw, error } = await service
      .from('mensaje_receptor')
      .select('id, mensaje_id, cuenta_cliente_id, empleado_id')
      .eq('id', receptorId)
      .maybeSingle()

    const receptor = receptorRaw as Pick<MensajeReceptor, 'id' | 'mensaje_id' | 'cuenta_cliente_id' | 'empleado_id'> | null
    if (error || !receptor) {
      throw new Error(error?.message ?? 'No se encontro la encuesta seleccionada.')
    }

    if (receptor.empleado_id !== actor.empleadoId && !hasRole(GENERAL_WRITE_ROLES, actor.puesto)) {
      throw new Error('No puedes responder una encuesta de otro receptor.')
    }

    const nowIso = new Date().toISOString()
    const { data: surveyQuestionsRaw, error: surveyQuestionsError } = await service
      .from('mensaje_encuesta_pregunta')
      .select('id, titulo, tipo_pregunta, opciones, obligatoria')
      .eq('mensaje_id', receptor.mensaje_id)
      .order('orden', { ascending: true })

    if (surveyQuestionsError) {
      throw new Error(surveyQuestionsError.message)
    }

    const surveyQuestions = (surveyQuestionsRaw ?? []) as Array<{
      id: string
      titulo: string
      tipo_pregunta: SurveyQuestionType
      opciones: Array<Record<string, unknown>>
      obligatoria: boolean
    }>

    if (surveyQuestions.length === 0) {
      const respuesta = normalizeRequiredText(formData.get('respuesta'), 'Respuesta')
      const { error: updateError } = await service
        .from('mensaje_receptor')
        .update({
          estado: 'RESPONDIDO',
          respuesta,
          leido_en: nowIso,
          respondido_en: nowIso,
        })
        .eq('id', receptor.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      await registrarEventoAudit(service, {
        tabla: 'mensaje_receptor',
        registroId: receptor.id,
        cuentaClienteId: receptor.cuenta_cliente_id,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'responder_encuesta_operativa',
          respuesta,
          mensaje_id: receptor.mensaje_id,
        },
      })
    } else {
      const rows: Array<{
        mensaje_id: string
        mensaje_receptor_id: string
        pregunta_id: string
        cuenta_cliente_id: string
        empleado_id: string
        opcion_id: string | null
        opcion_label: string | null
        respuesta_texto: string | null
        metadata: { answer_kind: string }
      }> = []

      for (const question of surveyQuestions) {
          const rawValue = String(formData.get(`pregunta_${question.id}`) ?? '').trim()
          if (!rawValue && question.obligatoria) {
            throw new Error(`${question.titulo} es obligatoria.`)
          }

          if (!rawValue) {
            continue
          }

          const metadata =
            question.tipo_pregunta === 'RESPUESTA_LIBRE'
              ? { answer_kind: 'free_text' }
              : { answer_kind: 'multiple_choice' }

          rows.push({
            mensaje_id: receptor.mensaje_id,
            mensaje_receptor_id: receptor.id,
            pregunta_id: question.id,
            cuenta_cliente_id: receptor.cuenta_cliente_id,
            empleado_id: actor.empleadoId,
            opcion_id: question.tipo_pregunta === 'OPCION_MULTIPLE' ? rawValue : null,
            opcion_label: question.tipo_pregunta === 'OPCION_MULTIPLE' ? rawValue : null,
            respuesta_texto: question.tipo_pregunta === 'RESPUESTA_LIBRE' ? rawValue : null,
            metadata,
          })
      }

      const { error: insertError } = await service
        .from('mensaje_encuesta_respuesta')
        .upsert(rows, { onConflict: 'mensaje_receptor_id,pregunta_id' })

      if (insertError) {
        throw new Error(insertError.message)
      }

      const summaryText = rows
        .map((item) => item.respuesta_texto ?? item.opcion_label ?? '')
        .filter(Boolean)
        .join(' | ')

      const { error: updateError } = await service
        .from('mensaje_receptor')
        .update({
          estado: 'RESPONDIDO',
          respuesta: summaryText || 'Encuesta respondida',
          leido_en: nowIso,
          respondido_en: nowIso,
        })
        .eq('id', receptor.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      await registrarEventoAudit(service, {
        tabla: 'mensaje_receptor',
        registroId: receptor.id,
        cuentaClienteId: receptor.cuenta_cliente_id,
        actorUsuarioId: actor.usuarioId,
        payload: {
          accion: 'responder_encuesta_operativa',
          mensaje_id: receptor.mensaje_id,
          total_preguntas: rows.length,
        },
      })
    }

    revalidateMensajesPaths()
    return buildState({ ok: true, message: 'Respuesta registrada.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}
