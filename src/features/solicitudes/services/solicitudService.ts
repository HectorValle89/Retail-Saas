import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, Empleado, Puesto, Solicitud } from '@/types/database'
import {
  getIncapacidadApprovalPath,
  getIncapacidadNextActor,
} from '../lib/incapacidadWorkflow'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre'>
type EmpleadoRelacion = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>

interface SolicitudQueryRow
  extends Pick<
    Solicitud,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'tipo'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'motivo'
    | 'justificante_url'
    | 'justificante_hash'
    | 'estatus'
    | 'comentarios'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  supervisor: MaybeMany<EmpleadoRelacion>
}

export interface SelectorOption {
  id: string
  label: string
}

export interface SolicitudResumen {
  total: number
  pendientes: number
  validadasSupervisor: number
  registradasRh: number
  rechazadas: number
  aprobadas: number
  pendientesAccionables: number
}

export interface SolicitudNotificacionItem {
  canal: string
  mensaje: string
  estado: string
  destinatarioPuesto: string | null
  creadaEn: string | null
}

export interface SolicitudListadoItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleadoId: string
  empleado: string
  empleadoPuesto: string | null
  supervisorId: string | null
  supervisor: string | null
  tipo: Solicitud['tipo']
  fechaInicio: string
  fechaFin: string
  motivo: string | null
  justificanteUrl: string | null
  justificanteHash: string | null
  tieneJustificante: boolean
  estatus: Solicitud['estatus']
  estadoResolucion: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  comentarios: string | null
  approvalPath: string[]
  justificaAsistencia: boolean
  diaJustificado: boolean
  siguienteActor: string | null
  requiereAccionActor: boolean
  notificaciones: SolicitudNotificacionItem[]
}

export interface SolicitudesFilterState {
  tipo: string
  estatus: string
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  month: string
}

export interface SolicitudCalendarEvent {
  id: string
  empleado: string
  tipo: Solicitud['tipo']
  estatus: Solicitud['estatus']
  fechaInicio: string
  fechaFin: string
  cuentaCliente: string | null
}

export interface SolicitudCalendarDay {
  date: string
  inCurrentMonth: boolean
  isToday: boolean
  events: SolicitudCalendarEvent[]
}

export interface SolicitudesCalendarData {
  month: string
  monthLabel: string
  canView: boolean
  days: SolicitudCalendarDay[]
}

export interface SolicitudesPanelData {
  resumen: SolicitudResumen
  solicitudes: SolicitudListadoItem[]
  pendientesAccionables: SolicitudListadoItem[]
  cuentas: SelectorOption[]
  empleados: SelectorOption[]
  supervisores: SelectorOption[]
  actorPuesto: Puesto | null
  paginacion: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  filtros: SolicitudesFilterState
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
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

function normalizeNotifications(value: unknown): SolicitudNotificacionItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null
      }

      const payload = item as Record<string, unknown>
      const mensaje = String(payload.mensaje ?? '').trim()

      if (!mensaje) {
        return null
      }

      return {
        canal: String(payload.canal ?? 'IN_APP').trim() || 'IN_APP',
        mensaje,
        estado: String(payload.estado ?? 'GENERADA').trim() || 'GENERADA',
        destinatarioPuesto: payload.destinatario_puesto ? String(payload.destinatario_puesto) : null,
        creadaEn: payload.creada_en ? String(payload.creada_en) : null,
      }
    })
    .filter((item): item is SolicitudNotificacionItem => Boolean(item))
}

function getApprovalPath(tipo: Solicitud['tipo'], metadata: unknown) {
  const payload = normalizeMetadata(metadata)
  const configuredPath = payload.approval_path

  if (Array.isArray(configuredPath)) {
    return configuredPath
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0)
  }

  if (tipo === 'INCAPACIDAD') {
    return getIncapacidadApprovalPath({ metadata })
  }

  if (tipo === 'AVISO_INASISTENCIA') {
    return ['SUPERVISOR']
  }

  if (tipo === 'JUSTIFICACION_FALTA') {
    return ['SUPERVISOR']
  }

  if (tipo === 'VACACIONES') {
    return ['COORDINADOR']
  }

  return ['SUPERVISOR', 'COORDINADOR']
}

function getResolutionState(estatus: Solicitud['estatus']): 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' {
  if (estatus === 'RECHAZADA') {
    return 'RECHAZADA'
  }

  if (estatus === 'REGISTRADA_RH' || estatus === 'REGISTRADA') {
    return 'APROBADA'
  }

  return 'PENDIENTE'
}

function getNextActor(tipo: Solicitud['tipo'], estatus: Solicitud['estatus'], metadata?: unknown) {
  const approvalPath = getApprovalPath(tipo, metadata)

  if (tipo === 'INCAPACIDAD') {
    return getIncapacidadNextActor({
      estatus,
      metadata,
    })
  }

  if (tipo === 'JUSTIFICACION_FALTA' && (estatus === 'ENVIADA' || estatus === 'CORRECCION_SOLICITADA')) {
    return estatus === 'CORRECCION_SOLICITADA' ? 'DERMOCONSEJERO' : 'SUPERVISOR'
  }

  if (estatus === 'BORRADOR' || estatus === 'ENVIADA') {
    return approvalPath[0] ?? null
  }

  if (estatus === 'VALIDADA_SUP') {
    return approvalPath[1] ?? null
  }

  return null
}

function canActorResolve(actorPuesto: Puesto | null, nextActor: string | null) {
  if (!actorPuesto || !nextActor) {
    return false
  }

  return actorPuesto === 'ADMINISTRADOR' || actorPuesto === nextActor
}

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 50
  }

  return Math.min(50, Math.max(10, Math.floor(value)))
}

function normalizeFilterToken(value?: string | null) {
  return String(value ?? '').trim()
}

function normalizeMonth(value?: string | null) {
  const normalized = normalizeFilterToken(value)

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getMonthRange(month: string) {
  const [yearRaw, monthRaw] = month.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const monthStartDate = new Date(Date.UTC(year, monthIndex, 1))
  const nextMonthDate = new Date(Date.UTC(year, monthIndex + 1, 1))
  const monthEndDate = new Date(Date.UTC(year, monthIndex + 1, 0))
  return {
    start: monthStartDate.toISOString().slice(0, 10),
    end: monthEndDate.toISOString().slice(0, 10),
    monthStartDate,
    nextMonthDate,
  }
}

function shiftIsoDate(date: string, deltaDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + deltaDays)
  return value.toISOString().slice(0, 10)
}

function formatMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1))
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function getTodayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

function createEmptySummary(): SolicitudResumen {
  return {
    total: 0,
    pendientes: 0,
    validadasSupervisor: 0,
    registradasRh: 0,
    rechazadas: 0,
    aprobadas: 0,
    pendientesAccionables: 0,
  }
}

function buildDefaultFilters(month?: string): SolicitudesFilterState {
  return {
    tipo: '',
    estatus: '',
    empleadoId: '',
    fechaInicio: '',
    fechaFin: '',
    month: normalizeMonth(month),
  }
}

function buildEmptyCalendar(month: string, canView: boolean): SolicitudesCalendarData {
  return {
    month,
    monthLabel: formatMonthLabel(month),
    canView,
    days: [],
  }
}

function buildCalendar(
  month: string,
  solicitudes: SolicitudListadoItem[],
  canView: boolean
): SolicitudesCalendarData {
  const { start, end, monthStartDate } = getMonthRange(month)
  const firstVisible = shiftIsoDate(start, -monthStartDate.getUTCDay())
  const lastVisible = shiftIsoDate(
    end,
    6 - new Date(`${end}T00:00:00.000Z`).getUTCDay()
  )
  const todayIso = getTodayIso()
  const days: SolicitudCalendarDay[] = []

  for (let cursor = firstVisible; cursor <= lastVisible; cursor = shiftIsoDate(cursor, 1)) {
    const events = solicitudes
      .filter((item) => item.fechaInicio <= cursor && item.fechaFin >= cursor)
      .map((item) => ({
        id: item.id,
        empleado: item.empleado,
        tipo: item.tipo,
        estatus: item.estatus,
        fechaInicio: item.fechaInicio,
        fechaFin: item.fechaFin,
        cuentaCliente: item.cuentaCliente,
      }))

    days.push({
      date: cursor,
      inCurrentMonth: cursor >= start && cursor <= end,
      isToday: cursor === todayIso,
      events,
    })
  }

  return {
    month,
    monthLabel: formatMonthLabel(month),
    canView,
    days,
  }
}

function mapSolicitudRow(item: SolicitudQueryRow, actorPuesto: Puesto | null): SolicitudListadoItem {
  const empleado = obtenerPrimero(item.empleado)
  const supervisor = obtenerPrimero(item.supervisor)
  const metadata = normalizeMetadata(item.metadata)
  const approvalPath = getApprovalPath(item.tipo, item.metadata)
  const estadoResolucion = getResolutionState(item.estatus)
  const siguienteActor =
    typeof metadata.siguiente_actor === 'string' && metadata.siguiente_actor.trim().length > 0
      ? metadata.siguiente_actor.trim()
      : getNextActor(item.tipo, item.estatus, item.metadata)

  return {
    id: item.id,
    cuentaClienteId: item.cuenta_cliente_id,
    cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
    empleadoId: item.empleado_id,
    empleado: empleado?.nombre_completo ?? 'Sin empleado',
    empleadoPuesto: empleado?.puesto ?? null,
    supervisorId: item.supervisor_empleado_id,
    supervisor: supervisor?.nombre_completo ?? null,
    tipo: item.tipo,
    fechaInicio: item.fecha_inicio,
    fechaFin: item.fecha_fin,
    motivo: item.motivo,
    justificanteUrl: item.justificante_url,
    justificanteHash: item.justificante_hash,
    tieneJustificante: Boolean(item.justificante_url),
    estatus: item.estatus,
    estadoResolucion,
    comentarios: item.comentarios,
    approvalPath,
    justificaAsistencia: Boolean(metadata.justifica_asistencia),
    diaJustificado: Boolean(metadata.justifica_asistencia) && estadoResolucion === 'APROBADA',
    siguienteActor,
    requiereAccionActor: canActorResolve(actorPuesto, siguienteActor),
    notificaciones: normalizeNotifications(metadata.notificaciones),
  }
}

// Supabase encadena builders con tipos recursivos; aqui priorizamos un helper legible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySolicitudFilters(query: any, filters: SolicitudesFilterState) {
  let current = query

  if (filters.tipo) {
    current = current.eq('tipo', filters.tipo)
  }

  if (filters.estatus) {
    current = current.eq('estatus', filters.estatus)
  }

  if (filters.empleadoId) {
    current = current.eq('empleado_id', filters.empleadoId)
  }

  if (filters.fechaInicio) {
    current = current.gte('fecha_inicio', filters.fechaInicio)
  }

  if (filters.fechaFin) {
    current = current.lte('fecha_fin', filters.fechaFin)
  }

  return current
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

export async function obtenerPanelSolicitudes(
  supabase: TypedSupabaseClient,
  options?: {
    serviceClient?: TypedSupabaseClient
    actorPuesto?: Puesto | null
    actorEmpleadoId?: string | null
    page?: number
    pageSize?: number
    filters?: Partial<SolicitudesFilterState>
  }
): Promise<SolicitudesPanelData> {
  const client = options?.serviceClient ?? supabase
  const actorPuesto = options?.actorPuesto ?? null
  const actorEmpleadoId = options?.actorEmpleadoId ?? null
  const page = normalizePage(options?.page)
  const pageSize = normalizePageSize(options?.pageSize)
  const filters: SolicitudesFilterState = {
    ...buildDefaultFilters(options?.filters?.month),
    tipo: normalizeFilterToken(options?.filters?.tipo),
    estatus: normalizeFilterToken(options?.filters?.estatus),
    empleadoId: normalizeFilterToken(options?.filters?.empleadoId),
    fechaInicio: normalizeFilterToken(options?.filters?.fechaInicio),
    fechaFin: normalizeFilterToken(options?.filters?.fechaFin),
    month: normalizeMonth(options?.filters?.month),
  }
  const countQuery = client.from('solicitud').select('id', { count: 'exact', head: true })
  const { count, error: countError } = await applySolicitudFilters(countQuery, filters)

  if (countError) {
    return {
      resumen: createEmptySummary(),
      solicitudes: [],
      pendientesAccionables: [],
      cuentas: [],
      empleados: [],
      supervisores: [],
      actorPuesto,
      paginacion: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
      filtros: filters,
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `solicitud` aun no esta disponible en Supabase. Ejecuta la migracion de solicitudes.',
    }
  }

  const totalItems = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * pageSize
  const to = from + pageSize - 1

  const solicitudesQuery = applySolicitudFilters(
    client
      .from('solicitud')
      .select(`
        id,
        cuenta_cliente_id,
        empleado_id,
        supervisor_empleado_id,
        tipo,
        fecha_inicio,
        fecha_fin,
        motivo,
        justificante_url,
        justificante_hash,
        estatus,
        comentarios,
        metadata,
        cuenta_cliente:cuenta_cliente_id(id, nombre),
        empleado:empleado_id(id, nombre_completo, puesto),
        supervisor:supervisor_empleado_id(id, nombre_completo, puesto)
      `),
    filters
  )

  const [solicitudesResult, cuentasResult, empleadosResult, supervisoresResult] = await Promise.all([
    solicitudesQuery.order('fecha_inicio', { ascending: false }).range(from, to),
    client.from('cuenta_cliente').select('id, nombre').eq('activa', true).order('nombre'),
    client
      .from('empleado')
      .select('id, nombre_completo, puesto')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo')
      .limit(40),
    client
      .from('empleado')
      .select('id, nombre_completo, puesto')
      .in('puesto', ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR', 'NOMINA'])
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo')
      .limit(40),
  ])

  if (solicitudesResult.error) {
    return {
      resumen: createEmptySummary(),
      solicitudes: [],
      pendientesAccionables: [],
      cuentas: [],
      empleados: [],
      supervisores: [],
      actorPuesto,
      paginacion: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      filtros: filters,
      infraestructuraLista: false,
      mensajeInfraestructura:
        `La tabla \`solicitud\` aun no esta disponible en Supabase. ${solicitudesResult.error.message}`,
    }
  }

  const solicitudes = ((solicitudesResult.data ?? []) as SolicitudQueryRow[]).map((item) => mapSolicitudRow(item, actorPuesto))
  const pendientesAccionables = solicitudes.filter((item) => item.requiereAccionActor)

  return {
    resumen: {
      total: totalItems,
      pendientes: solicitudes.filter((item) => item.estadoResolucion === 'PENDIENTE').length,
      validadasSupervisor: solicitudes.filter((item) => item.estatus === 'VALIDADA_SUP').length,
      registradasRh: solicitudes.filter((item) => ['REGISTRADA_RH', 'REGISTRADA'].includes(item.estatus)).length,
      rechazadas: solicitudes.filter((item) => item.estatus === 'RECHAZADA').length,
      aprobadas: solicitudes.filter((item) => item.estadoResolucion === 'APROBADA').length,
      pendientesAccionables: pendientesAccionables.length,
    },
    solicitudes,
    pendientesAccionables,
    cuentas: ((cuentasResult.data ?? []) as Pick<CuentaCliente, 'id' | 'nombre'>[]).map((item) => ({
      id: item.id,
      label: item.nombre,
    })),
    empleados: ((empleadosResult.data ?? []) as Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>[]).map((item) => ({
      id: item.id,
      label: `${item.nombre_completo} - ${item.puesto}`,
    })),
    supervisores: ((supervisoresResult.data ?? []) as Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>[]).map((item) => ({
      id: item.id,
      label: `${item.nombre_completo} - ${item.puesto}`,
    })),
    actorPuesto,
    paginacion: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    filtros: filters,
    infraestructuraLista: true,
  }
}
