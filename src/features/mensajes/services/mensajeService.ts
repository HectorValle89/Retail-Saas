import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { Empleado, MensajeAdjunto, MensajeInterno, MensajeReceptor, Puesto } from '@/types/database'

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
> & {
  creador: Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>[] | Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'> | null
}

type MensajeReceptorRow = Pick<
  MensajeReceptor,
  'id' | 'mensaje_id' | 'empleado_id' | 'estado' | 'leido_en' | 'respondido_en' | 'respuesta'
>

type MensajeAdjuntoRow = Pick<
  MensajeAdjunto,
  'id' | 'mensaje_id' | 'nombre_archivo_original' | 'mime_type' | 'tamano_bytes' | 'metadata' | 'created_at'
>

type EmpleadoOptionRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>

const MANAGER_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR'] as const satisfies Puesto[]
const READ_ROLES = [...MANAGER_ROLES, 'DERMOCONSEJERO', 'LOVE_IS', 'VENTAS', 'NOMINA', 'LOGISTICA', 'RECLUTAMIENTO'] as const satisfies Puesto[]

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

  return supervisorEmpleadoId ? 'Equipo de supervisor' : 'Supervisor sin definir'
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

function pickNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeDirection(value?: string | null) {
  if (value === 'enviados' || value === 'recibidos') {
    return value
  }

  return 'todos' as const
}

export interface MensajeAudienceOption {
  value: string
  label: string
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
  encuestasPendientes: number
  enviados: number
  recibidos: number
}

export interface MensajesPanelData {
  puedeGestionar: boolean
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  resumen: MensajesResumen
  mensajes: MensajeItem[]
  unreadCount: number
  page: number
  pageSize: number
  hasMore: boolean
  direction: 'todos' | 'enviados' | 'recibidos'
  zonas: MensajeAudienceOption[]
  supervisores: MensajeAudienceOption[]
}

const EMPTY_DATA: MensajesPanelData = {
  puedeGestionar: false,
  infraestructuraLista: true,
  resumen: {
    totalMensajes: 0,
    noLeidos: 0,
    encuestasPendientes: 0,
    enviados: 0,
    recibidos: 0,
  },
  mensajes: [],
  unreadCount: 0,
  page: 1,
  pageSize: 20,
  hasMore: false,
  direction: 'todos',
  zonas: [],
  supervisores: [],
}

export async function obtenerPanelMensajes(
  actor: ActorActual,
  options?: {
    scopeAccountId?: string | null
    page?: number
    pageSize?: number
    direction?: string | null
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
  const direction = normalizeDirection(options?.direction)

  if (!targetAccountId) {
    return {
      ...EMPTY_DATA,
      puedeGestionar: canManage,
      infraestructuraLista: false,
      mensajeInfraestructura: 'No existe una cuenta cliente activa para consultar mensajes.',
      page,
      pageSize,
      direction,
    }
  }

  const start = (page - 1) * pageSize

  const mensajeQuery = service
    .from('mensaje_interno')
    .select(`
      id,
      creado_por_usuario_id,
      titulo,
      cuerpo,
      tipo,
      grupo_destino,
      zona,
      supervisor_empleado_id,
      opciones_respuesta,
      metadata,
      created_at,
      updated_at,
      creador:creado_por_usuario_id(id, nombre_completo, puesto)
    `)
    .eq('cuenta_cliente_id', targetAccountId)
    .order('created_at', { ascending: false })

  if (direction === 'enviados') {
    mensajeQuery.eq('creado_por_usuario_id', actor.usuarioId)
  }

  const receptorQuery = service
    .from('mensaje_receptor')
    .select(`
      id,
      mensaje_id,
      empleado_id,
      estado,
      leido_en,
      respondido_en,
      respuesta
    `)
    .eq('cuenta_cliente_id', targetAccountId)
    .order('created_at', { ascending: false })

  if (!canManage || direction === 'recibidos') {
    receptorQuery.eq('empleado_id', actor.empleadoId)
  }

  const empleadosQuery = service
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
    .eq('estatus_laboral', 'ACTIVO')
    .order('nombre_completo', { ascending: true })

  const [mensajesResult, receptoresResult, empleadosResult] = await Promise.all([
    mensajeQuery,
    receptorQuery,
    empleadosQuery,
  ])

  const errorMessage =
    mensajesResult.error?.message ??
    receptoresResult.error?.message ??
    empleadosResult.error?.message ??
    null

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

  const mensajesRaw = (mensajesResult.data ?? []) as unknown as MensajeRow[]
  const receptoresRaw = (receptoresResult.data ?? []) as MensajeReceptorRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoOptionRow[]

  const receptoresPorMensaje = new Map<string, MensajeReceptorRow[]>()
  for (const receptor of receptoresRaw) {
    const current = receptoresPorMensaje.get(receptor.mensaje_id) ?? []
    current.push(receptor)
    receptoresPorMensaje.set(receptor.mensaje_id, current)
  }

  const allowedIds =
    direction === 'recibidos' || !canManage ? new Set(receptoresRaw.map((item) => item.mensaje_id)) : null
  const visibleBase = allowedIds ? mensajesRaw.filter((item) => allowedIds.has(item.id)) : mensajesRaw
  const hasMore = visibleBase.length > pageSize
  const visibleMensajes = visibleBase.slice(0, pageSize)
  const visibleIds = visibleMensajes.map((item) => item.id)

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
    const receptores = receptoresPorMensaje.get(item.id) ?? []
    const recipientState = receptores.find((receptor) => receptor.empleado_id === actor.empleadoId) ?? null
    const noLeidas = receptores.filter((receptor) => receptor.estado === 'PENDIENTE').length
    const respondidas = receptores.filter((receptor) => receptor.estado === 'RESPONDIDO').length
    const enviadoPorMi = item.creado_por_usuario_id === actor.usuarioId
    const recibidoPorMi = Boolean(recipientState)

    return {
      id: item.id,
      titulo: item.titulo,
      cuerpo: item.cuerpo,
      tipo: item.tipo,
      grupoDestino: item.grupo_destino,
      zona: item.zona,
      supervisorEmpleadoId: item.supervisor_empleado_id,
      audienceLabel: buildAudienceLabel(
        item.grupo_destino,
        item.zona,
        item.supervisor_empleado_id,
        normalizeMetadata(item.metadata)
      ),
      opcionesRespuesta: normalizeResponseOptions(item.opciones_respuesta),
      creadoPor: (Array.isArray(item.creador) ? item.creador[0] : item.creador)?.nombre_completo ?? null,
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
    }
  })

  const unreadCount = mensajes.filter((item) => item.recipientState?.estado === 'PENDIENTE').length

  const resumen: MensajesResumen = {
    totalMensajes: mensajes.length,
    noLeidos: unreadCount,
    encuestasPendientes: mensajes.filter(
      (item) => item.tipo === 'ENCUESTA' && item.recipientState?.estado !== 'RESPONDIDO'
    ).length,
    enviados: mensajes.filter((item) => item.enviadoPorMi).length,
    recibidos: mensajes.filter((item) => item.recibidoPorMi).length,
  }

  const zonas = Array.from(new Set(empleadosRaw.map((item) => item.zona).filter(Boolean))).map((item) => ({
    value: item as string,
    label: item as string,
  }))

  const supervisores = empleadosRaw
    .filter((item) => item.puesto === 'SUPERVISOR' || item.puesto === 'COORDINADOR')
    .map((item) => ({ value: item.id, label: `${item.nombre_completo} · ${item.puesto}` }))

  return {
    puedeGestionar: canManage,
    infraestructuraLista: true,
    resumen,
    mensajes,
    unreadCount,
    page,
    pageSize,
    hasMore,
    direction,
    zonas,
    supervisores,
  }
}
