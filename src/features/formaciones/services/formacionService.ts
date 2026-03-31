import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { Ciudad, Empleado, FormacionAsistencia, FormacionEvento, Pdv, SupervisorPdv } from '@/types/database'
import {
  normalizeFormacionAttendanceMetadata,
  normalizeFormacionTargetingMetadata,
  parseFormacionLegacyParticipants,
  resolveFormacionPdvState,
} from '@/features/formaciones/lib/formacionTargeting'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type FormacionEventoRow = Pick<
  FormacionEvento,
  | 'id'
  | 'cuenta_cliente_id'
  | 'nombre'
  | 'descripcion'
  | 'sede'
  | 'ciudad'
  | 'tipo'
  | 'responsable_empleado_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'estado'
  | 'participantes'
  | 'gastos_operativos'
  | 'notificaciones'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>

type FormacionAsistenciaRow = FormacionAsistencia
type EmpleadoRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>
type CiudadRow = Pick<Ciudad, 'id' | 'nombre' | 'zona' | 'estado'>
type SupervisorPdvRow = Pick<SupervisorPdv, 'id' | 'activo' | 'fecha_inicio' | 'fecha_fin'> & {
  empleado:
    | EmpleadoRow
    | EmpleadoRow[]
    | null
}
type PdvScopeRow = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona'> & {
  ciudad:
    | CiudadRow
    | CiudadRow[]
    | null
  supervisor_pdv:
    | SupervisorPdvRow
    | SupervisorPdvRow[]
    | null
}

const FORMACION_MANAGER_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'RECLUTAMIENTO',
  'LOVE_IS',
  'VENTAS',
] as const

function isMissingCiudadEstadoColumn(message: string | null | undefined) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return normalized.includes('column ciudad.estado does not exist') || normalized.includes('column ciudad_1.estado does not exist')
}

async function fetchFormacionPdvsWithCityStateCompatibility(service: TypedSupabaseClient) {
  const withState = await service
    .from('pdv')
    .select(
      `
        id,
        clave_btl,
        nombre,
        zona,
        ciudad:ciudad_id(id, nombre, zona, estado),
        supervisor_pdv(
          id,
          activo,
          fecha_inicio,
          fecha_fin,
          empleado:empleado_id(id, nombre_completo, puesto, zona)
        )
      `
    )
    .eq('estatus', 'ACTIVO')
    .order('nombre', { ascending: true })

  if (!isMissingCiudadEstadoColumn(withState.error?.message)) {
    return withState
  }

  return service
    .from('pdv')
    .select(
      `
        id,
        clave_btl,
        nombre,
        zona,
        ciudad:ciudad_id(id, nombre, zona),
        supervisor_pdv(
          id,
          activo,
          fecha_inicio,
          fecha_fin,
          empleado:empleado_id(id, nombre_completo, puesto, zona)
        )
      `
    )
    .eq('estatus', 'ACTIVO')
    .order('nombre', { ascending: true })
}

function getFirst<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeGasto(raw: Record<string, unknown>) {
  return {
    tipo: typeof raw.tipo === 'string' ? raw.tipo : 'GENERAL',
    monto: typeof raw.monto === 'number' ? raw.monto : Number(raw.monto) || 0,
    comentario: typeof raw.comentario === 'string' ? raw.comentario : null,
  }
}

function normalizeNotificacion(raw: Record<string, unknown>) {
  return {
    participanteId: typeof raw.participante_id === 'string' ? raw.participante_id : null,
    canal: typeof raw.canal === 'string' ? raw.canal : 'GENERAL',
    mensaje: typeof raw.mensaje === 'string' ? raw.mensaje : null,
    estado: typeof raw.estado === 'string' ? raw.estado : 'ENVIADO',
    enviadoEn: typeof raw.enviado_en === 'string' ? raw.enviado_en : null,
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'es-MX')
  )
}

export interface FormacionParticipanteItem {
  empleadoId: string | null
  nombre: string
  puesto: string | null
  zona: string | null
  rol: string | null
  notificado: boolean
  confirmado: boolean
  estado: string
}

export interface FormacionGastoItem {
  tipo: string
  monto: number
  comentario: string | null
}

export interface FormacionNotificacionItem {
  participanteId: string | null
  canal: string
  mensaje: string | null
  estado: string
  enviadoEn: string | null
}

export interface FormacionAsistenciaItem {
  id: string
  eventoId: string
  empleadoId: string
  participanteNombre: string
  puesto: string | null
  confirmado: boolean
  presente: boolean
  estado: FormacionAsistencia['estado']
  evidencias: Record<string, unknown>[]
  comentarios: string | null
  originPdvId: string | null
  originPdvName: string | null
  checkInUtc: string | null
  checkOutUtc: string | null
  attendanceMode: 'PRESENCIAL' | 'EN_LINEA' | null
  checkInGeofenceStatus: 'SIN_VALIDAR' | 'DENTRO' | 'FUERA'
  checkOutGeofenceStatus: 'SIN_VALIDAR' | 'DENTRO' | 'FUERA'
}

export interface FormacionSupervisorOption {
  id: string
  nombre: string
  zona: string | null
  estados: string[]
  pdvCount: number
  coordinatorId: string | null
  coordinatorName: string | null
}

export interface FormacionCoordinatorOption {
  id: string
  nombre: string
  zona: string | null
}

export interface FormacionPdvScopeItem {
  id: string
  claveBtl: string
  nombre: string
  ciudad: string | null
  zona: string | null
  estado: string
  supervisorId: string | null
  supervisorNombre: string | null
}

export interface FormacionPdvStateGroup {
  id: string
  stateName: string
  totalPdvs: number
  supervisors: Array<{ id: string; nombre: string }>
  pdvs: FormacionPdvScopeItem[]
}

export interface FormacionEventoItem {
  id: string
  nombre: string
  descripcion: string | null
  sede: string
  ciudad: string | null
  tipo: string
  tipoEvento: 'FORMACION' | 'ISDINIZACION'
  modalidad: 'PRESENCIAL' | 'EN_LINEA'
  responsableId: string | null
  responsableNombre: string | null
  fechaInicio: string
  fechaFin: string
  estado: FormacionEvento['estado']
  participantes: FormacionParticipanteItem[]
  asistencias: FormacionAsistenciaItem[]
  gastosOperativos: FormacionGastoItem[]
  notificaciones: FormacionNotificacionItem[]
  metadata: Record<string, unknown>
  selectedStateNames: string[]
  selectedSupervisorIds: string[]
  selectedCoordinatorIds: string[]
  selectedPdvIds: string[]
  scheduleStart: string | null
  scheduleEnd: string | null
  primarySupervisorId: string | null
  primaryCoordinatorId: string | null
  supervisorName: string | null
  coordinatorName: string | null
  expectedDcCount: number
  expectedSupervisorCount: number
  expectedCoordinatorCount: number
  expectedStoreCount: number
  locationAddress: string | null
  locationLatitude: number | null
  locationLongitude: number | null
  locationRadiusMeters: number | null
  manualDocument: {
    url: string | null
    fileName: string | null
    mimeType: string | null
  } | null
  createdAt: string
  updatedAt: string
}

export interface FormacionResumen {
  totalEventos: number
  participantesConfirmados: number
  gastosTotal: number
  notificacionesPendientes: number
}

export interface FormacionesPanelData {
  puedeGestionar: boolean
  resumen: FormacionResumen
  eventos: FormacionEventoItem[]
  empleadosDisponibles: Array<{ id: string; nombre: string; puesto: string | null; zona: string | null }>
  estadosDisponibles: string[]
  supervisoresDisponibles: FormacionSupervisorOption[]
  coordinadoresDisponibles: FormacionCoordinatorOption[]
  pdvGroups: FormacionPdvStateGroup[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const EMPTY_DATA: FormacionesPanelData = {
  puedeGestionar: false,
  resumen: {
    totalEventos: 0,
    participantesConfirmados: 0,
    gastosTotal: 0,
    notificacionesPendientes: 0,
  },
  eventos: [],
  empleadosDisponibles: [],
  estadosDisponibles: [],
  supervisoresDisponibles: [],
  coordinadoresDisponibles: [],
  pdvGroups: [],
  infraestructuraLista: true,
}

async function signStorageUrl(service: TypedSupabaseClient, rawUrl: string | null | undefined) {
  const normalized = String(rawUrl ?? '').trim()

  if (!normalized) {
    return null
  }

  const segments = normalized.split('/')
  if (segments.length < 2) {
    return normalized
  }

  const [bucket, ...routeSegments] = segments
  const route = routeSegments.join('/')

  try {
    const result = await service.storage.from(bucket).createSignedUrl(route, 60 * 60)
    return result.data?.signedUrl ?? normalized
  } catch {
    return normalized
  }
}

function buildSupervisorScope(
  pdvs: FormacionPdvScopeItem[],
  empleados: EmpleadoRow[]
) {
  const employeeById = new Map(empleados.map((item) => [item.id, item] as const))
  const map = new Map<string, FormacionSupervisorOption>()

  for (const pdv of pdvs) {
    if (!pdv.supervisorId || !pdv.supervisorNombre) {
      continue
    }

    const current =
      map.get(pdv.supervisorId) ??
      {
        id: pdv.supervisorId,
        nombre: pdv.supervisorNombre,
        zona: pdv.zona,
        estados: [],
        pdvCount: 0,
        coordinatorId: null,
        coordinatorName: null,
      }

    current.pdvCount += 1
    current.estados = uniqueStrings([...current.estados, pdv.estado])
    const supervisor = employeeById.get(pdv.supervisorId)
    const coordinator = supervisor?.supervisor_empleado_id
      ? employeeById.get(supervisor.supervisor_empleado_id) ?? null
      : null
    current.coordinatorId = coordinator?.id ?? null
    current.coordinatorName = coordinator?.nombre_completo ?? null
    map.set(pdv.supervisorId, current)
  }

  return Array.from(map.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX'))
}

function buildPdvGroups(pdvs: FormacionPdvScopeItem[]) {
  const groups = new Map<string, FormacionPdvStateGroup>()

  for (const pdv of pdvs) {
    const current =
      groups.get(pdv.estado) ??
      {
        id: pdv.estado,
        stateName: pdv.estado,
        totalPdvs: 0,
        supervisors: [],
        pdvs: [],
      }

    current.totalPdvs += 1
    current.pdvs.push(pdv)

    if (pdv.supervisorId && pdv.supervisorNombre) {
      const existing = current.supervisors.some((item) => item.id === pdv.supervisorId)
      if (!existing) {
        current.supervisors.push({ id: pdv.supervisorId, nombre: pdv.supervisorNombre })
      }
    }

    groups.set(pdv.estado, current)
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      supervisors: [...group.supervisors].sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX')),
      pdvs: [...group.pdvs].sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX')),
    }))
    .sort((left, right) => left.stateName.localeCompare(right.stateName, 'es-MX'))
}

export async function obtenerPanelFormaciones(
  actor: ActorActual,
  options?: {
    scopeAccountId?: string | null
    serviceClient?: TypedSupabaseClient
  }
): Promise<FormacionesPanelData> {
  const service = options?.serviceClient ?? createServiceClient()
  const targetAccountId = options?.scopeAccountId ?? actor.cuentaClienteId
  const puedeGestionar = FORMACION_MANAGER_ROLES.includes(actor.puesto as (typeof FORMACION_MANAGER_ROLES)[number])

  const eventoQuery = service
    .from('formacion_evento')
    .select(
      `
        id,
        cuenta_cliente_id,
        nombre,
        descripcion,
        sede,
        ciudad,
        tipo,
        responsable_empleado_id,
        fecha_inicio,
        fecha_fin,
        estado,
        participantes,
        gastos_operativos,
        notificaciones,
        metadata,
        created_at,
        updated_at,
        responsable:responsable_empleado_id(id, nombre_completo, puesto)
      `
    )
    .order('fecha_inicio', { ascending: false })

  const asistenciaQuery = service
    .from('formacion_asistencia')
    .select(`
      id,
      evento_id,
      empleado_id,
      participante_nombre,
      puesto,
      confirmado,
      presente,
      estado,
      evidencias,
      comentarios,
      metadata
    `)
    .order('created_at', { ascending: true })

  const empleadoQuery = service
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
    .eq('estatus_laboral', 'ACTIVO')
    .order('nombre_completo', { ascending: true })

  if (targetAccountId) {
    eventoQuery.eq('cuenta_cliente_id', targetAccountId)
    asistenciaQuery.eq('cuenta_cliente_id', targetAccountId)
  }

  const [eventosResult, asistenciasResult, empleadosResult, pdvsResult, accountPdvsResult] = await Promise.all([
    eventoQuery,
    asistenciaQuery,
    empleadoQuery,
    fetchFormacionPdvsWithCityStateCompatibility(service),
    targetAccountId
      ? service
          .from('cuenta_cliente_pdv')
          .select('pdv_id')
          .eq('cuenta_cliente_id', targetAccountId)
          .eq('activo', true)
      : Promise.resolve({ data: [] as Array<{ pdv_id: string }>, error: null }),
  ])

  const errorMessage =
    eventosResult.error?.message ??
    asistenciasResult.error?.message ??
    empleadosResult.error?.message ??
    pdvsResult.error?.message ??
    accountPdvsResult.error?.message ??
    null

  if (errorMessage) {
    return {
      ...EMPTY_DATA,
      infraestructuraLista: false,
      mensajeInfraestructura: errorMessage,
      puedeGestionar,
    }
  }

  const eventosRaw = (eventosResult.data ?? []) as unknown as (FormacionEventoRow & {
    responsable: EmpleadoRow[] | EmpleadoRow | null
  })[]
  const asistenciasRaw = (asistenciasResult.data ?? []) as FormacionAsistenciaRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoRow[]
  const accountPdvIds = new Set(
    ((accountPdvsResult.data ?? []) as Array<{ pdv_id: string }>).map((item) => item.pdv_id)
  )
  const pdvsRaw = ((pdvsResult.data ?? []) as unknown as PdvScopeRow[]).filter((item) =>
    !targetAccountId || accountPdvIds.has(item.id)
  )

  const asistenciasPorEvento = new Map<string, FormacionAsistenciaItem[]>()
  for (const row of asistenciasRaw) {
    const current = asistenciasPorEvento.get(row.evento_id) ?? []
    current.push({
      id: row.id,
      eventoId: row.evento_id,
      empleadoId: row.empleado_id,
      participanteNombre: row.participante_nombre ?? 'Sin nombre',
      puesto: row.puesto,
      confirmado: row.confirmado,
      presente: row.presente,
      estado: row.estado,
      evidencias: row.evidencias,
      comentarios: row.comentarios,
      originPdvId: normalizeFormacionAttendanceMetadata(row.metadata).originPdvId,
      originPdvName: normalizeFormacionAttendanceMetadata(row.metadata).originPdvName,
      checkInUtc: normalizeFormacionAttendanceMetadata(row.metadata).checkInUtc,
      checkOutUtc: normalizeFormacionAttendanceMetadata(row.metadata).checkOutUtc,
      attendanceMode: normalizeFormacionAttendanceMetadata(row.metadata).attendanceMode,
      checkInGeofenceStatus: normalizeFormacionAttendanceMetadata(row.metadata).checkInGeofenceStatus,
      checkOutGeofenceStatus: normalizeFormacionAttendanceMetadata(row.metadata).checkOutGeofenceStatus,
    })
    asistenciasPorEvento.set(row.evento_id, current)
  }

  const pdvScope = pdvsRaw
    .map<FormacionPdvScopeItem | null>((item) => {
      const ciudad = getFirst(item.ciudad)
      const supervisorRelation = (Array.isArray(item.supervisor_pdv) ? item.supervisor_pdv : [item.supervisor_pdv])
        .filter((relation): relation is SupervisorPdvRow => Boolean(relation))
        .sort((left, right) => right.fecha_inicio.localeCompare(left.fecha_inicio))[0] ?? null
      const supervisor = getFirst(supervisorRelation?.empleado ?? null)
      const stateName =
        resolveFormacionPdvState({
          ciudadNombre: ciudad?.nombre ?? null,
          ciudadEstado: ciudad?.estado ?? null,
        }) ?? 'Sin estado'

      return {
        id: item.id,
        claveBtl: item.clave_btl,
        nombre: item.nombre,
        ciudad: ciudad?.nombre ?? null,
        zona: item.zona ?? ciudad?.zona ?? null,
        estado: stateName,
        supervisorId: supervisor?.id ?? null,
        supervisorNombre: supervisor?.nombre_completo ?? null,
      }
    })
    .filter((item): item is FormacionPdvScopeItem => Boolean(item))

  const supervisorScope = buildSupervisorScope(pdvScope, empleadosRaw)
  const coordinadoresDisponibles = empleadosRaw
    .filter((item) => item.puesto === 'COORDINADOR')
    .map<FormacionCoordinatorOption>((item) => ({
      id: item.id,
      nombre: item.nombre_completo,
      zona: item.zona,
    }))
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX'))

  const eventos = await Promise.all(eventosRaw.map<Promise<FormacionEventoItem>>(async (item) => {
    const participantes = parseFormacionLegacyParticipants(item.participantes)
    const gastosOperativos = Array.isArray(item.gastos_operativos)
      ? item.gastos_operativos
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
          .map((value) => normalizeGasto(value))
      : []
    const notificaciones = Array.isArray(item.notificaciones)
      ? item.notificaciones
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
          .map((value) => normalizeNotificacion(value))
      : []
    const targeting = normalizeFormacionTargetingMetadata(item.metadata)
    const asistencias = asistenciasPorEvento.get(item.id) ?? []
    const manualUrl = await signStorageUrl(service, targeting.manualDocument?.url ?? null)

    return {
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      sede: item.sede,
      ciudad: item.ciudad,
      tipo: item.tipo,
      tipoEvento: targeting.eventType,
      modalidad: targeting.modality,
      responsableId: item.responsable_empleado_id,
      responsableNombre: getFirst(item.responsable)?.nombre_completo ?? null,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      estado: item.estado,
      participantes,
      asistencias,
      gastosOperativos,
      notificaciones,
      metadata: item.metadata,
      selectedStateNames: targeting.stateNames,
      selectedSupervisorIds: targeting.supervisorIds,
      selectedCoordinatorIds: targeting.coordinatorIds,
      selectedPdvIds: targeting.pdvIds,
      scheduleStart: targeting.scheduleStart,
      scheduleEnd: targeting.scheduleEnd,
      primarySupervisorId: targeting.primarySupervisorId,
      primaryCoordinatorId: targeting.primaryCoordinatorId,
      supervisorName: targeting.supervisorName,
      coordinatorName: targeting.coordinatorName,
      expectedDcCount: targeting.expectedDcCount,
      expectedSupervisorCount: targeting.expectedSupervisorCount,
      expectedCoordinatorCount: targeting.expectedCoordinatorCount,
      expectedStoreCount: targeting.expectedStoreCount,
      locationAddress: targeting.locationAddress,
      locationLatitude: targeting.locationLatitude,
      locationLongitude: targeting.locationLongitude,
      locationRadiusMeters: targeting.locationRadiusMeters,
      manualDocument: targeting.manualDocument
        ? {
            url: manualUrl,
            fileName: targeting.manualDocument.fileName,
            mimeType: targeting.manualDocument.mimeType,
          }
        : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }))

  const resumen: FormacionResumen = {
    totalEventos: eventos.length,
    participantesConfirmados: eventos.reduce(
      (acc, evento) => acc + evento.participantes.filter((participante) => participante.confirmado).length,
      0
    ),
    gastosTotal: eventos.reduce(
      (acc, evento) => acc + evento.gastosOperativos.reduce((sum, gasto) => sum + gasto.monto, 0),
      0
    ),
    notificacionesPendientes: eventos.reduce(
      (acc, evento) => acc + evento.notificaciones.filter((item) => item.estado !== 'ENVIADO').length,
      0
    ),
  }

  return {
    puedeGestionar,
    resumen,
    eventos,
    empleadosDisponibles: empleadosRaw.map((item) => ({
      id: item.id,
      nombre: item.nombre_completo,
      puesto: item.puesto,
      zona: item.zona,
    })),
    estadosDisponibles: uniqueStrings(pdvScope.map((item) => item.estado)),
    supervisoresDisponibles: supervisorScope,
    coordinadoresDisponibles,
    pdvGroups: buildPdvGroups(pdvScope),
    infraestructuraLista: true,
  }
}
