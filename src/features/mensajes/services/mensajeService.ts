import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  Empleado,
  MensajeAdjunto,
  MensajeEncuestaPregunta,
  MensajeEncuestaRespuesta,
  MensajeInterno,
  MensajeReceptor,
  Puesto,
  UsuarioSistema,
} from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type MensajeRow = Pick<
  MensajeInterno,
  | 'id'
  | 'creado_por_usuario_id'
  | 'titulo'
  | 'cuerpo'
  | 'tipo'
  | 'grupo_destino'
  | 'zona'
  | 'supervisor_empleado_id'
  | 'opciones_respuesta'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>

type MensajeReceptorRow = Pick<
  MensajeReceptor,
  'id' | 'mensaje_id' | 'empleado_id' | 'estado' | 'leido_en' | 'respondido_en' | 'respuesta'
>

type MensajeAdjuntoRow = Pick<
  MensajeAdjunto,
  'id' | 'mensaje_id' | 'nombre_archivo_original' | 'mime_type' | 'tamano_bytes' | 'metadata' | 'created_at'
>

type EncuestaPreguntaRow = Pick<
  MensajeEncuestaPregunta,
  | 'id'
  | 'mensaje_id'
  | 'orden'
  | 'titulo'
  | 'descripcion'
  | 'tipo_pregunta'
  | 'opciones'
  | 'obligatoria'
  | 'metadata'
>

type EncuestaRespuestaRow = Pick<
  MensajeEncuestaRespuesta,
  | 'id'
  | 'mensaje_id'
  | 'mensaje_receptor_id'
  | 'pregunta_id'
  | 'empleado_id'
  | 'opcion_id'
  | 'opcion_label'
  | 'respuesta_texto'
  | 'created_at'
>

type EmpleadoOptionRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>
type UsuarioCreatorRow = Pick<UsuarioSistema, 'id' | 'empleado_id'>

const MANAGER_ROLES = ['ADMINISTRADOR', 'COORDINADOR'] as const satisfies Puesto[]
const READ_ROLES = [...MANAGER_ROLES, 'SUPERVISOR', 'DERMOCONSEJERO', 'LOVE_IS', 'VENTAS', 'NOMINA', 'LOGISTICA', 'RECLUTAMIENTO'] as const satisfies Puesto[]
const AUDIENCE_ROLE_OPTIONS = ['RECLUTAMIENTO', 'NOMINA', 'LOGISTICA', 'LOVE_IS', 'VENTAS', 'SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'] as const satisfies Puesto[]

function hasRole(roles: readonly Puesto[], puesto: Puesto) {
  return roles.includes(puesto)
}

function normalizeResponseOptions(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as { id: string; label: string }[]
  }

  return raw
    .map((value, index) => {
      const candidate = value as Record<string, unknown>
      const id = typeof candidate.id === 'string' ? candidate.id : `opt-${index + 1}`
      const label = typeof candidate.label === 'string' ? candidate.label : null

      if (!label) {
        return null
      }

      return { id, label }
    })
    .filter(Boolean) as { id: string; label: string }[]
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }

  return value as Record<string, unknown>
}

function pickString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeDirection(value?: string | null) {
  if (value === 'enviados' || value === 'recibidos' || value === 'leidos') {
    return value
  }

  return 'todos' as const
}

function normalizeTab(value?: string | null) {
  return value === 'analitica' ? 'analitica' : 'bandeja'
}

function buildAudienceLabel(
  group: MensajeInterno['grupo_destino'],
  zona: string | null,
  supervisorEmpleadoId: string | null,
  metadata: Record<string, unknown>
) {
  const explicitLabel = pickString(metadata, 'audience_label')
  if (explicitLabel) {
    return explicitLabel
  }

  if (group === 'TODOS_DCS') {
    return 'Todos los DCs'
  }

  if (group === 'ZONA') {
    return zona ? `Zona ${zona}` : 'Zona sin definir'
  }

  if (group === 'PUESTO') {
    const puestoDestino = pickString(metadata, 'puesto_destino')
    return puestoDestino ? `Rol ${puestoDestino}` : 'Rol sin definir'
  }

  return supervisorEmpleadoId ? 'Equipo de supervisor' : 'Supervisor sin definir'
}

export interface MensajeAudienceOption {
  value: string
  label: string
}

export interface MensajeSurveyQuestionItem {
  id: string
  titulo: string
  descripcion: string | null
  tipoPregunta: 'OPCION_MULTIPLE' | 'RESPUESTA_LIBRE'
  obligatoria: boolean
  opciones: { id: string; label: string }[]
}

export interface MensajeRecipientState {
  id: string
  estado: MensajeReceptor['estado']
  leidoEn: string | null
  respondidoEn: string | null
  respuesta: string | null
}

export interface MensajeAttachmentItem {
  id: string
  nombreArchivoOriginal: string
  mimeType: string | null
  tamanoBytes: number | null
  archivoUrl: string | null
  archivoHash: string | null
  thumbnailUrl: string | null
  thumbnailHash: string | null
  createdAt: string
}

export interface MensajeItem {
  id: string
  titulo: string
  cuerpo: string
  tipo: MensajeInterno['tipo']
  grupoDestino: MensajeInterno['grupo_destino']
  zona: string | null
  supervisorEmpleadoId: string | null
  audienceLabel: string
  opcionesRespuesta: { id: string; label: string }[]
  surveyVisibility: 'ANONIMA' | 'IDENTIFICADA'
  surveyQuestions: MensajeSurveyQuestionItem[]
  creadoPor: string | null
  enviadoPorMi: boolean
  recibidoPorMi: boolean
  totalReceptores: number
  respondidas: number
  noLeidas: number
  recipientState: MensajeRecipientState | null
  adjuntos: MensajeAttachmentItem[]
  createdAt: string
  updatedAt: string
}

export interface MensajesResumen {
  totalMensajes: number
  noLeidos: number
  leidos: number
  encuestasPendientes: number
  enviados: number
  recibidos: number
}

export interface SurveyQuestionAnalytics {
  id: string
  titulo: string
  tipoPregunta: 'OPCION_MULTIPLE' | 'RESPUESTA_LIBRE'
  respuestasTotales: number
  opciones: Array<{ id: string; label: string; count: number; percentage: number }>
  respuestasTexto: Array<{ value: string; respondedAt: string; empleadoNombre: string | null }>
}

export interface SurveyAnalyticsItem {
  id: string
  titulo: string
  cuerpo: string
  audienceLabel: string
  createdAt: string
  creadoPor: string | null
  anonymous: boolean
  totalReceptores: number
  respondidas: number
  pendientes: number
  responseRate: number
  questions: SurveyQuestionAnalytics[]
}

export interface MensajesPanelData {
  puedeGestionar: boolean
  puedeVerAnalitica: boolean
  esSoloReceptor: boolean
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  resumen: MensajesResumen
  mensajes: MensajeItem[]
  surveyAnalytics: SurveyAnalyticsItem[]
  unreadCount: number
  page: number
  pageSize: number
  hasMore: boolean
  direction: 'todos' | 'enviados' | 'recibidos' | 'leidos'
  tab: 'bandeja' | 'analitica'
  zonas: MensajeAudienceOption[]
  supervisores: MensajeAudienceOption[]
  puestosDestino: MensajeAudienceOption[]
}

const EMPTY_DATA: MensajesPanelData = {
  puedeGestionar: false,
  puedeVerAnalitica: false,
  esSoloReceptor: true,
  infraestructuraLista: true,
  resumen: {
    totalMensajes: 0,
    noLeidos: 0,
    leidos: 0,
    encuestasPendientes: 0,
    enviados: 0,
    recibidos: 0,
  },
  mensajes: [],
  surveyAnalytics: [],
  unreadCount: 0,
  page: 1,
  pageSize: 20,
  hasMore: false,
  direction: 'recibidos',
  tab: 'bandeja',
  zonas: [],
  supervisores: [],
  puestosDestino: [],
}

async function fetchAudienceOptions(service: TypedSupabaseClient) {
  const empleadosQuery = service
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
    .eq('estatus_laboral', 'ACTIVO')
    .order('nombre_completo', { ascending: true })

  const empleadosResult = await empleadosQuery
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoOptionRow[]

  return {
    empleadosRaw,
    error: empleadosResult.error?.message ?? null,
    zonas: Array.from(new Set(empleadosRaw.map((item) => item.zona).filter(Boolean))).map((item) => ({
      value: item as string,
      label: item as string,
    })),
    supervisores: empleadosRaw
      .filter((item) => item.puesto === 'SUPERVISOR' || item.puesto === 'COORDINADOR')
      .map((item) => ({ value: item.id, label: `${item.nombre_completo} · ${item.puesto}` })),
    puestosDestino: AUDIENCE_ROLE_OPTIONS.map((puesto) => ({
      value: puesto,
      label: puesto.replaceAll('_', ' '),
    })),
  }
}

async function fetchCreatorNameByUserId(service: TypedSupabaseClient, messages: MensajeRow[]) {
  const creatorUserIds = Array.from(
    new Set(messages.map((item) => item.creado_por_usuario_id).filter((item): item is string => Boolean(item)))
  )

  const creatorNameByUserId = new Map<string, string>()
  if (creatorUserIds.length === 0) {
    return { creatorNameByUserId, error: null as string | null }
  }

  const { data: usuariosRaw, error: usuariosError } = await service.from('usuario').select('id, empleado_id').in('id', creatorUserIds)
  if (usuariosError) {
    return { creatorNameByUserId, error: usuariosError.message }
  }

  const usuarios = (usuariosRaw ?? []) as UsuarioCreatorRow[]
  const creatorEmployeeIds = Array.from(
    new Set(usuarios.map((item) => item.empleado_id).filter((item): item is string => Boolean(item)))
  )

  if (creatorEmployeeIds.length === 0) {
    return { creatorNameByUserId, error: null as string | null }
  }

  const { data: creatorEmployeesRaw, error: creatorEmployeesError } = await service
    .from('empleado')
    .select('id, nombre_completo')
    .in('id', creatorEmployeeIds)

  if (creatorEmployeesError) {
    return { creatorNameByUserId, error: creatorEmployeesError.message }
  }

  const employeeNameById = new Map<string, string>()
  for (const employee of (creatorEmployeesRaw ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo'>>) {
    employeeNameById.set(employee.id, employee.nombre_completo)
  }

  for (const usuario of usuarios) {
    const creatorName = employeeNameById.get(usuario.empleado_id)
    if (creatorName) {
      creatorNameByUserId.set(usuario.id, creatorName)
    }
  }

  return { creatorNameByUserId, error: null as string | null }
}

async function fetchSurveyQuestionsByMessageId(service: TypedSupabaseClient, messageIds: string[]) {
  const questionsByMessageId = new Map<string, MensajeSurveyQuestionItem[]>()
  if (messageIds.length === 0) {
    return { questionsByMessageId, error: null as string | null }
  }

  const { data, error } = await service
    .from('mensaje_encuesta_pregunta')
    .select('id, mensaje_id, orden, titulo, descripcion, tipo_pregunta, opciones, obligatoria, metadata')
    .in('mensaje_id', messageIds)
    .order('orden', { ascending: true })

  if (error) {
    return { questionsByMessageId, error: error.message }
  }

  for (const row of (data ?? []) as EncuestaPreguntaRow[]) {
    const current = questionsByMessageId.get(row.mensaje_id) ?? []
    current.push({
      id: row.id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      tipoPregunta: row.tipo_pregunta,
      obligatoria: row.obligatoria,
      opciones: normalizeResponseOptions(row.opciones),
    })
    questionsByMessageId.set(row.mensaje_id, current)
  }

  return { questionsByMessageId, error: null as string | null }
}

async function buildInboxData(
  actor: ActorActual,
  {
    service,
    targetAccountId,
    page,
    pageSize,
    direction,
    canManage,
    canViewAnalytics,
  }: {
    service: TypedSupabaseClient
    targetAccountId: string
    page: number
    pageSize: number
    direction: 'todos' | 'enviados' | 'recibidos' | 'leidos'
    canManage: boolean
    canViewAnalytics: boolean
  }
) {
  const start = (page - 1) * pageSize
  const mensajeQuery = service
    .from('mensaje_interno')
    .select('id, creado_por_usuario_id, titulo, cuerpo, tipo, grupo_destino, zona, supervisor_empleado_id, opciones_respuesta, metadata, created_at, updated_at')
    .eq('cuenta_cliente_id', targetAccountId)
    .order('created_at', { ascending: false })

  if (direction === 'enviados') {
    mensajeQuery.eq('creado_por_usuario_id', actor.usuarioId)
  }

  const receptorQuery = service
    .from('mensaje_receptor')
    .select('id, mensaje_id, empleado_id, estado, leido_en, respondido_en, respuesta')
    .eq('cuenta_cliente_id', targetAccountId)
    .order('created_at', { ascending: false })

  if (!canManage || direction === 'recibidos') {
    receptorQuery.eq('empleado_id', actor.empleadoId)
  }

  const [mensajesResult, receptoresResult] = await Promise.all([mensajeQuery, receptorQuery])
  const errorMessage = mensajesResult.error?.message ?? receptoresResult.error?.message ?? null
  if (errorMessage) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      infraestructuraLista: false,
      mensajeInfraestructura: errorMessage,
      page,
      pageSize,
      direction,
    }
  }

  const mensajesRaw = (mensajesResult.data ?? []) as MensajeRow[]
  const receptoresRaw = (receptoresResult.data ?? []) as MensajeReceptorRow[]

  const receptoresPorMensaje = new Map<string, MensajeReceptorRow[]>()
  for (const receptor of receptoresRaw) {
    const current = receptoresPorMensaje.get(receptor.mensaje_id) ?? []
    current.push(receptor)
    receptoresPorMensaje.set(receptor.mensaje_id, current)
  }

  const allowedIds = direction === 'recibidos' || direction === 'leidos' || !canManage ? new Set(receptoresRaw.map((item) => item.mensaje_id)) : null
  const baseVisible = allowedIds ? mensajesRaw.filter((item) => allowedIds.has(item.id)) : mensajesRaw
  const visibleBase =
    direction === 'leidos'
      ? baseVisible.filter((item) =>
          (receptoresPorMensaje.get(item.id) ?? []).some(
            (receptor) => receptor.empleado_id === actor.empleadoId && receptor.estado !== 'PENDIENTE'
          )
        )
      : baseVisible
  const hasMore = visibleBase.length > start + pageSize
  const visibleMensajes = visibleBase.slice(start, start + pageSize)
  const visibleIds = visibleMensajes.map((item) => item.id)

  const [{ creatorNameByUserId, error: creatorError }, { questionsByMessageId, error: questionsError }] = await Promise.all([
    fetchCreatorNameByUserId(service, visibleMensajes),
    fetchSurveyQuestionsByMessageId(service, visibleIds),
  ])

  if (creatorError || questionsError) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      puedeVerAnalitica: canViewAnalytics,
      esSoloReceptor: !canManage,
      infraestructuraLista: false,
      mensajeInfraestructura: creatorError ?? questionsError ?? 'No fue posible cargar la bandeja de mensajes.',
      page,
      pageSize,
      direction,
    }
  }

  const adjuntosPorMensaje = new Map<string, MensajeAttachmentItem[]>()
  if (visibleIds.length > 0) {
    const { data: adjuntosRaw, error: adjuntosError } = await service
      .from('mensaje_adjunto')
      .select('id, mensaje_id, nombre_archivo_original, mime_type, tamano_bytes, metadata, created_at')
      .in('mensaje_id', visibleIds)
      .order('created_at', { ascending: true })

    if (adjuntosError) {
      return {
        ...EMPTY_DATA,
        puedeGestionar: canManage,
        infraestructuraLista: false,
        mensajeInfraestructura: adjuntosError.message,
        page,
        pageSize,
        direction,
      }
    }

    for (const adjunto of (adjuntosRaw ?? []) as MensajeAdjuntoRow[]) {
      const metadata = normalizeMetadata(adjunto.metadata)
      const current = adjuntosPorMensaje.get(adjunto.mensaje_id) ?? []
      current.push({
        id: adjunto.id,
        nombreArchivoOriginal: adjunto.nombre_archivo_original,
        mimeType: adjunto.mime_type,
        tamanoBytes: adjunto.tamano_bytes,
        archivoUrl: pickString(metadata, 'archivo_url'),
        archivoHash: pickString(metadata, 'archivo_hash'),
        thumbnailUrl: pickString(metadata, 'miniatura_url'),
        thumbnailHash: pickString(metadata, 'miniatura_hash'),
        createdAt: adjunto.created_at,
      })
      adjuntosPorMensaje.set(adjunto.mensaje_id, current)
    }
  }

  const mensajes = visibleMensajes.map((item) => {
    const metadata = normalizeMetadata(item.metadata)
    const receptores = receptoresPorMensaje.get(item.id) ?? []
    const recipientState = receptores.find((receptor) => receptor.empleado_id === actor.empleadoId) ?? null
    const noLeidas = receptores.filter((receptor) => receptor.estado === 'PENDIENTE').length
    const respondidas = receptores.filter((receptor) => receptor.estado === 'RESPONDIDO').length
    const enviadoPorMi = item.creado_por_usuario_id === actor.usuarioId
    const recibidoPorMi = Boolean(recipientState)
    const surveyQuestions = questionsByMessageId.get(item.id) ?? []

    return {
      id: item.id,
      titulo: item.titulo,
      cuerpo: item.cuerpo,
      tipo: item.tipo,
      grupoDestino: item.grupo_destino,
      zona: item.zona,
      supervisorEmpleadoId: item.supervisor_empleado_id,
      audienceLabel: buildAudienceLabel(item.grupo_destino, item.zona, item.supervisor_empleado_id, metadata),
      opcionesRespuesta: normalizeResponseOptions(item.opciones_respuesta),
      surveyVisibility: pickString(metadata, 'survey_visibility') === 'IDENTIFICADA' ? 'IDENTIFICADA' : 'ANONIMA',
      surveyQuestions,
      creadoPor: item.creado_por_usuario_id ? creatorNameByUserId.get(item.creado_por_usuario_id) ?? null : null,
      enviadoPorMi,
      recibidoPorMi,
      totalReceptores: receptores.length,
      respondidas,
      noLeidas,
      recipientState: recipientState
        ? {
            id: recipientState.id,
            estado: recipientState.estado,
            leidoEn: recipientState.leido_en,
            respondidoEn: recipientState.respondido_en,
            respuesta: recipientState.respuesta,
          }
        : null,
      adjuntos: adjuntosPorMensaje.get(item.id) ?? [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    } satisfies MensajeItem
  })

  const recipientStatesForActor = receptoresRaw.filter((item) => item.empleado_id === actor.empleadoId)
  const receivedMessageIdsForActor = new Set(recipientStatesForActor.map((item) => item.mensaje_id))
  const unreadCount = recipientStatesForActor.filter((item) => item.estado === 'PENDIENTE').length
  const readCount = recipientStatesForActor.filter((item) => item.estado !== 'PENDIENTE').length
  const surveyMessageById = new Map(
    mensajesRaw.filter((item) => item.tipo === 'ENCUESTA').map((item) => [item.id, item] as const)
  )
  const resumen: MensajesResumen = {
    totalMensajes: visibleBase.length,
    noLeidos: unreadCount,
    leidos: readCount,
    encuestasPendientes: recipientStatesForActor.filter(
      (item) => surveyMessageById.has(item.mensaje_id) && item.estado !== 'RESPONDIDO'
    ).length,
    enviados: mensajes.filter((item) => item.enviadoPorMi).length,
    recibidos: receivedMessageIdsForActor.size,
  }

  return {
    ...EMPTY_DATA,
    puedeGestionar: canManage,
    puedeVerAnalitica: canViewAnalytics,
    esSoloReceptor: !canManage,
    infraestructuraLista: true,
    resumen,
    mensajes,
    unreadCount,
    page,
    pageSize,
    hasMore,
    direction,
  } satisfies MensajesPanelData
}

async function buildSurveyAnalytics(
  actor: ActorActual,
  {
    service,
    targetAccountId,
    canManage,
    page,
    pageSize,
  }: {
    service: TypedSupabaseClient
    targetAccountId: string
    canManage: boolean
    page: number
    pageSize: number
  }
) {
  if (!canManage) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: false,
      puedeVerAnalitica: false,
      esSoloReceptor: true,
      infraestructuraLista: false,
      mensajeInfraestructura: 'Solo Administracion y Coordinacion pueden consultar la analitica de encuestas.',
      page,
      pageSize,
      tab: 'analitica' as const,
    }
  }

  const surveyQuery = service
    .from('mensaje_interno')
    .select('id, creado_por_usuario_id, titulo, cuerpo, tipo, grupo_destino, zona, supervisor_empleado_id, opciones_respuesta, metadata, created_at, updated_at')
    .eq('cuenta_cliente_id', targetAccountId)
    .eq('tipo', 'ENCUESTA')
    .order('created_at', { ascending: false })

  const surveyResult = await surveyQuery
  if (surveyResult.error) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      puedeVerAnalitica: true,
      esSoloReceptor: false,
      infraestructuraLista: false,
      mensajeInfraestructura: surveyResult.error.message,
      page,
      pageSize,
      tab: 'analitica' as const,
    }
  }

  const surveys = ((surveyResult.data ?? []) as MensajeRow[]).slice((page - 1) * pageSize, page * pageSize)
  const surveyIds = surveys.map((item) => item.id)

  const [
    { creatorNameByUserId, error: creatorError },
    { questionsByMessageId, error: questionsError },
    recipientResult,
    answersResult,
  ] = await Promise.all([
    fetchCreatorNameByUserId(service, surveys),
    fetchSurveyQuestionsByMessageId(service, surveyIds),
    service
      .from('mensaje_receptor')
      .select('id, mensaje_id, empleado_id, estado, leido_en, respondido_en, respuesta')
      .eq('cuenta_cliente_id', targetAccountId)
      .in('mensaje_id', surveyIds),
    service
      .from('mensaje_encuesta_respuesta')
      .select('id, mensaje_id, mensaje_receptor_id, pregunta_id, empleado_id, opcion_id, opcion_label, respuesta_texto, created_at')
      .eq('cuenta_cliente_id', targetAccountId)
      .in('mensaje_id', surveyIds),
  ])

  const errorMessage =
    creatorError ??
    questionsError ??
    recipientResult.error?.message ??
    answersResult.error?.message ??
    null

  if (errorMessage) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      puedeVerAnalitica: true,
      esSoloReceptor: false,
      infraestructuraLista: false,
      mensajeInfraestructura: errorMessage,
      page,
      pageSize,
      tab: 'analitica' as const,
    }
  }

  const recipients = (recipientResult.data ?? []) as MensajeReceptorRow[]
  const answers = (answersResult.data ?? []) as EncuestaRespuestaRow[]
  const recipientById = new Map(recipients.map((item) => [item.id, item] as const))
  const respondentIds = Array.from(new Set(answers.map((item) => item.empleado_id)))

  let respondentNameById = new Map<string, string>()
  if (respondentIds.length > 0) {
    const { data: employeesRaw, error: employeesError } = await service
      .from('empleado')
      .select('id, nombre_completo')
      .in('id', respondentIds)

    if (employeesError) {
      return {
        ...EMPTY_DATA,
        puedeGestionar: canManage,
        puedeVerAnalitica: true,
        esSoloReceptor: false,
        infraestructuraLista: false,
        mensajeInfraestructura: employeesError.message,
        page,
        pageSize,
        tab: 'analitica' as const,
      }
    }

    respondentNameById = new Map(
      ((employeesRaw ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo'>>).map((item) => [item.id, item.nombre_completo] as const)
    )
  }

  const responsesByQuestionId = new Map<string, EncuestaRespuestaRow[]>()
  for (const answer of answers) {
    const current = responsesByQuestionId.get(answer.pregunta_id) ?? []
    current.push(answer)
    responsesByQuestionId.set(answer.pregunta_id, current)
  }

  const surveyAnalytics: SurveyAnalyticsItem[] = surveys.map((survey) => {
    const metadata = normalizeMetadata(survey.metadata)
    const totalRecipients = recipients.filter((item) => item.mensaje_id === survey.id).length
    const responded = recipients.filter((item) => item.mensaje_id === survey.id && item.estado === 'RESPONDIDO').length
    const anonymous = pickString(metadata, 'survey_visibility') !== 'IDENTIFICADA'
    const questions = (questionsByMessageId.get(survey.id) ?? []).map((question) => {
      const rows = responsesByQuestionId.get(question.id) ?? []
      const respuestasTotales = rows.length

      return {
        id: question.id,
        titulo: question.titulo,
        tipoPregunta: question.tipoPregunta,
        respuestasTotales,
        opciones:
          question.tipoPregunta === 'OPCION_MULTIPLE'
            ? question.opciones.map((option) => {
                const count = rows.filter((row) => (row.opcion_id ?? row.opcion_label) === option.id || row.opcion_label === option.label).length
                return {
                  id: option.id,
                  label: option.label,
                  count,
                  percentage: respuestasTotales > 0 ? Number(((count / respuestasTotales) * 100).toFixed(2)) : 0,
                }
              })
            : [],
        respuestasTexto:
          question.tipoPregunta === 'RESPUESTA_LIBRE'
            ? rows
                .filter((row) => row.respuesta_texto)
                .map((row) => ({
                  value: row.respuesta_texto ?? '',
                  respondedAt: row.created_at,
                  empleadoNombre: anonymous ? null : respondentNameById.get(row.empleado_id) ?? null,
                }))
            : [],
      } satisfies SurveyQuestionAnalytics
    })

    return {
      id: survey.id,
      titulo: survey.titulo,
      cuerpo: survey.cuerpo,
      audienceLabel: buildAudienceLabel(survey.grupo_destino, survey.zona, survey.supervisor_empleado_id, metadata),
      createdAt: survey.created_at,
      creadoPor: survey.creado_por_usuario_id ? creatorNameByUserId.get(survey.creado_por_usuario_id) ?? null : null,
      anonymous,
      totalReceptores: totalRecipients,
      respondidas: responded,
      pendientes: Math.max(totalRecipients - responded, 0),
      responseRate: totalRecipients > 0 ? Number(((responded / totalRecipients) * 100).toFixed(2)) : 0,
      questions,
    } satisfies SurveyAnalyticsItem
  })

  const unreadCount = recipients.filter((item) => item.empleado_id === actor.empleadoId && item.estado === 'PENDIENTE').length

  return {
    ...EMPTY_DATA,
    puedeGestionar: canManage,
    puedeVerAnalitica: true,
    esSoloReceptor: false,
    infraestructuraLista: true,
    surveyAnalytics,
    unreadCount,
    page,
    pageSize,
    hasMore: (surveyResult.data ?? []).length > page * pageSize,
    tab: 'analitica' as const,
  } satisfies MensajesPanelData
}

export async function obtenerPanelMensajes(
  actor: ActorActual,
  options?: {
    scopeAccountId?: string | null
    page?: number
    pageSize?: number
    direction?: string | null
    tab?: string | null
    serviceClient?: TypedSupabaseClient
  }
): Promise<MensajesPanelData> {
  if (!hasRole(READ_ROLES, actor.puesto)) {
    return {
      ...EMPTY_DATA,
      infraestructuraLista: false,
      mensajeInfraestructura: 'No tienes permisos para acceder a mensajes.',
    }
  }

  const service = options?.serviceClient ?? createServiceClient()
  const targetAccountId = options?.scopeAccountId ?? actor.cuentaClienteId
  const page = Math.max(1, options?.page ?? 1)
  const pageSize = Math.min(50, Math.max(10, options?.pageSize ?? 20))
  const canManage = hasRole(MANAGER_ROLES, actor.puesto)
  const canViewAnalytics = canManage
  const requestedDirection = normalizeDirection(options?.direction)
  const direction = canManage
    ? requestedDirection
    : requestedDirection === 'leidos'
      ? 'leidos'
      : 'recibidos'
  const requestedTab = normalizeTab(options?.tab)
  const tab = canViewAnalytics ? requestedTab : 'bandeja'

  const audienceOptions = await fetchAudienceOptions(service)
  if (!targetAccountId) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      puedeVerAnalitica: canViewAnalytics,
      esSoloReceptor: !canManage,
      infraestructuraLista: false,
      mensajeInfraestructura: 'No existe una cuenta cliente activa para consultar mensajes.',
      page,
      pageSize,
      direction,
      tab,
      zonas: audienceOptions.zonas,
      supervisores: audienceOptions.supervisores,
      puestosDestino: audienceOptions.puestosDestino,
    }
  }

  const baseData =
    tab === 'analitica'
      ? await buildSurveyAnalytics(actor, {
          service,
          targetAccountId,
          canManage,
          page,
          pageSize,
        })
      : await buildInboxData(actor, {
          service,
          targetAccountId,
          page,
          pageSize,
          direction,
          canManage,
          canViewAnalytics,
        })

  return {
    ...baseData,
    direction,
    tab,
    zonas: audienceOptions.zonas,
    supervisores: audienceOptions.supervisores,
    puestosDestino: audienceOptions.puestosDestino,
  }
}
