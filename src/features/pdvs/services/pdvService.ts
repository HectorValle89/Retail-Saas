import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { buildModuleCacheTags } from '@/lib/cache/moduleTags'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import { createServiceClient } from '@/lib/supabase/server'
import {
  SCHEDULE_PRIORITY_RULE_CODE,
  readSchedulePriorityRule,
  resolveScheduleHierarchy,
  type BusinessRuleRow,
  type SchedulePriorityRuleDefinition,
} from '@/features/reglas/lib/businessRules'
import { isOperablePdvStatus } from '@/features/pdvs/lib/pdvStatus'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import type { AsignacionDiariaResuelta, Pdv } from '@/types/database'
import {
  hasActivePdvsPanelFilters,
  resolveDefaultPdvsPanelFilters,
  type PdvsPanelFilters,
} from '../lib/pdvPanelFilters'

type MaybeMany<T> = T | T[] | null

type PdvStatus = 'ACTIVO' | 'TEMPORAL' | 'INACTIVO'
type HorarioMode = 'CADENA' | 'PERSONALIZADO' | 'BASE_PDV' | 'GLOBAL' | 'SIN_HORARIO'
type PdvMonthlyPublicationState = 'ASIGNADO' | 'PARCIAL' | 'SIN_ASIGNACION' | 'INACTIVO'
type AssignmentType = 'FIJA' | 'ROTATIVA' | 'COBERTURA'
type AssignmentState = 'BORRADOR' | 'PUBLICADA'
type AttendanceState = 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
type AttendanceGpsState = 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'

interface CadenaRelacion {
  id: string
  codigo: string
  nombre: string
}

interface CiudadRelacion {
  id: string
  nombre: string
  zona: string
  estado: string | null
}

interface GeocercaRelacion {
  id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number
  permite_checkin_con_justificacion: boolean
}

interface CuentaClientePdvRelacion {
  cuenta_cliente_id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
}

interface EmpleadoRelacion {
  id: string
  nombre_completo: string
  zona: string | null
  estatus_laboral?: string | null
}

interface SupervisorRelacion {
  id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  empleado: MaybeMany<EmpleadoRelacion>
}

interface HorarioRelacion {
  id: string
  nivel_prioridad: number
  fecha_especifica: string | null
  dia_semana: number | null
  codigo_turno: string | null
  hora_entrada: string | null
  hora_salida: string | null
  activo: boolean
  observaciones: string | null
}

interface PdvQueryRow extends Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'direccion' | 'zona' | 'formato' | 'horario_entrada' | 'horario_salida' | 'estatus' | 'metadata' | 'created_at' | 'updated_at'> {
  cadena_id: string | null
  ciudad_id: string | null
  id_cadena: string | null
  cadena: MaybeMany<CadenaRelacion>
  ciudad: MaybeMany<CiudadRelacion>
  geocerca_pdv: MaybeMany<GeocercaRelacion>
  cuenta_cliente_pdv: MaybeMany<CuentaClientePdvRelacion>
  supervisor_pdv: MaybeMany<SupervisorRelacion>
  horario_pdv: MaybeMany<HorarioRelacion>
}

interface AsignacionRelacion {
  nombre_completo: string
}

interface AsignacionQueryRow {
  id: string
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  tipo: AssignmentType
  estado_publicacion: AssignmentState
  empleado: MaybeMany<AsignacionRelacion>
}

interface AsistenciaQueryRow {
  id: string
  pdv_id: string
  fecha_operacion: string
  empleado_nombre: string
  estatus: AttendanceState
  estado_gps: AttendanceGpsState
  check_in_utc: string | null
  distancia_check_in_metros: number | null
}

interface ConfiguracionTurnoRow {
  valor: unknown
}

type ReglaNegocioQueryRow = BusinessRuleRow

interface PdvMetadata {
  horario_mode?: string
  horario_chain_nomenclatura?: string
  horario_chain_turno?: string
  horario_chain_horario?: string
}

function isMissingCiudadEstadoColumn(message: string | null | undefined) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return normalized.includes('column ciudad.estado does not exist') || normalized.includes('column ciudad_1.estado does not exist')
}

async function fetchPdvsWithCityStateCompatibility(supabase: SupabaseClient) {
  const withState = await supabase
    .from('pdv')
    .select(`
        id,
        clave_btl,
        cadena_id,
        ciudad_id,
        id_cadena,
        nombre,
        direccion,
        zona,
        formato,
        horario_entrada,
        horario_salida,
        estatus,
        metadata,
        created_at,
        updated_at,
        cadena:cadena_id(id, codigo, nombre),
        ciudad:ciudad_id(id, nombre, zona),
        geocerca_pdv(id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion),
        cuenta_cliente_pdv(cuenta_cliente_id, activo, fecha_inicio, fecha_fin),
        supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona, estatus_laboral)),
        horario_pdv(id, nivel_prioridad, fecha_especifica, dia_semana, codigo_turno, hora_entrada, hora_salida, activo, observaciones)
      `)
    .order('nombre', { ascending: true })

  if (!isMissingCiudadEstadoColumn(withState.error?.message)) {
    return withState
  }

  return supabase
    .from('pdv')
    .select(`
        id,
        clave_btl,
        cadena_id,
        ciudad_id,
        id_cadena,
        nombre,
        direccion,
        zona,
        formato,
        horario_entrada,
        horario_salida,
        estatus,
        metadata,
        created_at,
      updated_at,
      cadena:cadena_id(id, codigo, nombre),
      ciudad:ciudad_id(id, nombre, zona),
      geocerca_pdv(id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion),
      cuenta_cliente_pdv(cuenta_cliente_id, activo, fecha_inicio, fecha_fin),
      supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona, estatus_laboral)),
      horario_pdv(id, nivel_prioridad, fecha_especifica, dia_semana, codigo_turno, hora_entrada, hora_salida, activo, observaciones)
      `)
    .order('nombre', { ascending: true })
}

async function fetchPdvByIdWithCityStateCompatibility(supabase: SupabaseClient, pdvId: string) {
  const withState = await supabase
    .from('pdv')
    .select(`
        id,
        clave_btl,
        cadena_id,
        ciudad_id,
        id_cadena,
        nombre,
        direccion,
        zona,
        formato,
        horario_entrada,
        horario_salida,
        estatus,
        metadata,
        created_at,
      updated_at,
      cadena:cadena_id(id, codigo, nombre),
      ciudad:ciudad_id(id, nombre, zona),
      geocerca_pdv(id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion),
      supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona, estatus_laboral)),
      horario_pdv(id, nivel_prioridad, fecha_especifica, dia_semana, codigo_turno, hora_entrada, hora_salida, activo, observaciones)
      `)
    .eq('id', pdvId)
    .maybeSingle()

  if (!isMissingCiudadEstadoColumn(withState.error?.message)) {
    return withState
  }

  return supabase
    .from('pdv')
    .select(`
        id,
        clave_btl,
        cadena_id,
        ciudad_id,
        id_cadena,
        nombre,
        direccion,
        zona,
        formato,
        horario_entrada,
        horario_salida,
        estatus,
        metadata,
        created_at,
        updated_at,
        cadena:cadena_id(id, codigo, nombre),
        ciudad:ciudad_id(id, nombre, zona),
        geocerca_pdv(id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion),
        supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona, estatus_laboral)),
        horario_pdv(id, nivel_prioridad, fecha_especifica, dia_semana, codigo_turno, hora_entrada, hora_salida, activo, observaciones)
      `)
    .eq('id', pdvId)
    .maybeSingle()
}

async function fetchCitiesWithStateCompatibility(supabase: SupabaseClient) {
  const withState = await supabase
    .from('ciudad')
    .select('id, nombre, zona')
    .eq('activa', true)
    .order('nombre', { ascending: true })

  if (!isMissingCiudadEstadoColumn(withState.error?.message)) {
    return withState
  }

  return supabase
    .from('ciudad')
    .select('id, nombre, zona')
    .eq('activa', true)
    .order('nombre', { ascending: true })
}

export interface PdvResumen {
  total: number
  activos: number
  conGeocerca: number
  conSupervisor: number
  conHorario: number
}

export interface PdvMonthlyPublicationSummary {
  month: string
  fechaInicio: string
  fechaFin: string
  total: number
  asignados: number
  parciales: number
  sinAsignacion: number
  inactivos: number
}

export interface PdvCadenaOption {
  id: string
  codigo: string
  nombre: string
}

export interface PdvCiudadOption {
  id: string
  nombre: string
  zona: string
  estado: string | null
}

export interface PdvSupervisorOption {
  id: string
  nombreCompleto: string
  zona: string | null
}

export interface PdvTurnoCatalogOption {
  nomenclatura: string
  turno: string | null
  horario: string | null
  horaEntrada: string | null
  horaSalida: string | null
  tipo: string | null
  label: string
}

export interface PdvHorarioItem {
  id: string
  source: HorarioMode
  priority: number | null
  dayLabel: string
  code: string | null
  horaEntrada: string | null
  horaSalida: string | null
  observations: string | null
}

export interface PdvSupervisorHistoryItem {
  id: string
  empleadoId: string | null
  empleado: string | null
  activo: boolean
  fechaInicio: string
  fechaFin: string | null
}

export interface PdvAssignmentHistoryItem {
  id: string
  empleado: string | null
  tipo: AssignmentType
  estadoPublicacion: AssignmentState
  fechaInicio: string
  fechaFin: string | null
}

export interface PdvAttendanceHistoryItem {
  id: string
  empleado: string
  fechaOperacion: string
  estatus: AttendanceState
  estadoGps: AttendanceGpsState
  checkInUtc: string | null
  distanciaCheckInMetros: number | null
}

export interface PdvListadoItem {
  id: string
  claveBtl: string
  nombre: string
  cadenaId: string | null
  idCadena: string | null
  cadenaCodigo: string | null
  cadena: string | null
  ciudadId: string | null
  ciudad: string | null
  estado: string | null
  zona: string | null
  direccion: string | null
  formato: string | null
  horarioEntrada: string | null
  horarioSalida: string | null
  horarioMode: HorarioMode
  supervisorActualId: string | null
  supervisorActual: string | null
  supervisorVigenteDesde: string | null
  latitud: number | null
  longitud: number | null
  radioMetros: number | null
  permiteCheckinConJustificacion: boolean
  geocercaCompleta: boolean
  estatus: PdvStatus
  alertarGeocercaFueraDeRango: boolean
  metadata: Record<string, unknown>
  publicacionMensualEstado: PdvMonthlyPublicationState
  publicacionMensualDiasAsignados: number
  publicacionMensualDiasFaltantes: number
  publicacionMensualCoberturaPct: number
  publicacionMensualEtiqueta: string
}

export interface PdvDetalleItem extends PdvListadoItem {
  horarios: PdvHorarioItem[]
  supervisorHistorial: PdvSupervisorHistoryItem[]
  historialAsignaciones: PdvAssignmentHistoryItem[]
  historialAsistencias: PdvAttendanceHistoryItem[]
}

export interface PdvDetalleResponse {
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  pdv: PdvDetalleItem | null
}

export interface PdvsPanelData {
  resumen: PdvResumen
  publicacionMensual: PdvMonthlyPublicationSummary
  pdvs: PdvListadoItem[]
  month: string
  hasActiveFilters: boolean
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  filters: PdvsPanelFilters
  cadenas: PdvCadenaOption[]
  ciudades: PdvCiudadOption[]
  estados: string[]
  zonas: string[]
  supervisores: PdvSupervisorOption[]
  turnosCadena: PdvTurnoCatalogOption[]
  geocercaDefaultMetros: number
  permiteCheckinConJustificacionDefault: boolean
}

export interface PdvsExportPayload {
  headers: string[]
  rows: Array<Array<string | number | null>>
  filenameBase: string
}

const SIGNED_DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
const MAX_HISTORY_PER_PDV = 5
const EMPTY_PDV_FILTERS: PdvsPanelFilters = {
  month: '',
  search: '',
  cadenaId: '',
  ciudadId: '',
  estado: '',
  zona: '',
  supervisorId: '',
  estatus: '',
  publicacionEstado: '',
}

function getCurrentMonthValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

function listDatesInclusive(start: string, end: string) {
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00Z`)
  const limit = new Date(`${end}T12:00:00Z`)

  while (cursor.getTime() <= limit.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function isActorActual(value: unknown): value is ActorActual {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'empleadoId' in value &&
      'usuarioId' in value &&
      'puesto' in value
  )
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function mapString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}


function mapMetadata(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function mapConfigNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return parsed
}

function mapConfigBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return fallback
}

function isMonthlyPublicationState(value: string | null | undefined): value is PdvMonthlyPublicationState {
  return (
    value === 'ASIGNADO' ||
    value === 'PARCIAL' ||
    value === 'SIN_ASIGNACION' ||
    value === 'INACTIVO'
  )
}

function buildMonthlyPublicationLabel(
  state: PdvMonthlyPublicationState,
  assignedDays: number,
  totalDays: number
) {
  if (state === 'INACTIVO') {
    return 'Inactivo'
  }

  if (state === 'SIN_ASIGNACION') {
    return 'Sin asignacion'
  }

  return `${assignedDays}/${totalDays} dias publicados`
}

function mapTurnCatalog(value: unknown): PdvTurnoCatalogOption[] {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const turnos = Array.isArray(payload.turnos) ? payload.turnos : []

  return turnos
    .map((item) => {
      const turno = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const nomenclatura = mapString(turno.nomenclatura)
      if (!nomenclatura) {
        return null
      }

      const turnoNombre = mapString(turno.turno)
      const horario = mapString(turno.horario)
      const horaEntrada = mapString(turno.hora_entrada)
      const horaSalida = mapString(turno.hora_salida)
      const tipo = mapString(turno.tipo)
      const labelParts = [nomenclatura, turnoNombre, horario].filter(Boolean)

      return {
        nomenclatura,
        turno: turnoNombre,
        horario,
        horaEntrada,
        horaSalida,
        tipo,
        label: labelParts.join(' · '),
      }
    })
    .filter((item): item is PdvTurnoCatalogOption => Boolean(item))
}

function getDayLabel(dayNumber: number | null) {
  if (dayNumber === null || dayNumber < 0 || dayNumber > 6) {
    return 'Aplica a todo el PDV'
  }

  return SIGNED_DAY_LABELS[dayNumber] ?? 'Aplica a todo el PDV'
}

function buildChainHorarioEntries(
  pdv: PdvQueryRow,
  metadata: PdvMetadata,
  turnCatalog: PdvTurnoCatalogOption[]
) {
  const inheritedTurn = turnCatalog.find(
    (item) => item.nomenclatura === metadata.horario_chain_nomenclatura
  )
  const code = metadata.horario_chain_nomenclatura ?? inheritedTurn?.nomenclatura ?? null
  const horaEntrada = inheritedTurn?.horaEntrada ?? pdv.horario_entrada
  const horaSalida = inheritedTurn?.horaSalida ?? pdv.horario_salida
  const observations =
    metadata.horario_chain_turno ??
    inheritedTurn?.turno ??
    metadata.horario_chain_horario ??
    inheritedTurn?.horario ??
    null

  if (!code && !horaEntrada && !horaSalida && !observations) {
    return []
  }

  return [
    {
      id: `cadena-${pdv.id}`,
      source: 'CADENA' as const,
      priority: 1,
      dayLabel: 'Heredado desde cadena',
      code,
      horaEntrada,
      horaSalida,
      observations,
    },
  ]
}

function buildBasePdvEntries(pdv: PdvQueryRow, metadata: PdvMetadata) {
  if (metadata.horario_mode === 'CADENA') {
    return []
  }

  if (!pdv.horario_entrada && !pdv.horario_salida) {
    return []
  }

  return [
    {
      id: `base-${pdv.id}`,
      source: 'BASE_PDV' as const,
      priority: 1,
      dayLabel: 'Horario base del PDV',
      code: null,
      horaEntrada: pdv.horario_entrada,
      horaSalida: pdv.horario_salida,
      observations: null,
    },
  ]
}

function buildGlobalFallbackEntries(
  pdv: PdvQueryRow,
  rule: SchedulePriorityRuleDefinition
) {
  const fallback = rule.globalFallback
  if (!fallback || (!fallback.horaEntrada && !fallback.horaSalida && !fallback.label)) {
    return []
  }

  return [
    {
      id: `global-${pdv.id}`,
      source: 'GLOBAL' as const,
      priority: 999,
      dayLabel: fallback.label ?? 'Horario global agencia',
      code: 'GLOBAL',
      horaEntrada: fallback.horaEntrada,
      horaSalida: fallback.horaSalida,
      observations: 'Fallback global de la plataforma',
    },
  ]
}

function buildHorarioItems(
  pdv: PdvQueryRow,
  turnCatalog: PdvTurnoCatalogOption[],
  scheduleRule: SchedulePriorityRuleDefinition
): { mode: HorarioMode; entries: PdvHorarioItem[] } {
  const metadata = mapMetadata(pdv.metadata) as PdvMetadata
  const horarios = (Array.isArray(pdv.horario_pdv) ? pdv.horario_pdv : [])
    .filter((item) => item.activo)
    .sort((left, right) => {
      if (left.nivel_prioridad !== right.nivel_prioridad) {
        return left.nivel_prioridad - right.nivel_prioridad
      }

      const leftDay = left.dia_semana ?? 99
      const rightDay = right.dia_semana ?? 99
      return leftDay - rightDay
    })
  const personalizedEntries = horarios.map((item) => ({
    id: item.id,
    source: 'PERSONALIZADO' as const,
    priority: item.nivel_prioridad,
    dayLabel: item.fecha_especifica ? `Fecha ${item.fecha_especifica}` : getDayLabel(item.dia_semana),
    code: item.codigo_turno,
    horaEntrada: item.hora_entrada,
    horaSalida: item.hora_salida,
    observations: item.observaciones,
  }))
  const datedEntries = personalizedEntries.filter((item) => item.dayLabel.startsWith('Fecha '))
  const baseCustomEntries = personalizedEntries.filter((item) => !item.dayLabel.startsWith('Fecha '))
  const basePdvEntries = buildBasePdvEntries(pdv, metadata)
  const chainEntries = buildChainHorarioEntries(pdv, metadata, turnCatalog)
  const globalEntries = buildGlobalFallbackEntries(pdv, scheduleRule)
  const resolution = resolveScheduleHierarchy<{ mode: HorarioMode; entries: PdvHorarioItem[] }>(
    [
      {
        level: 'PDV_FECHA',
        label: 'Excepcion de PDV por fecha',
        payload: datedEntries.length > 0 ? { mode: 'PERSONALIZADO' as const, entries: datedEntries } : null,
        available: datedEntries.length > 0,
      },
      {
        level: 'PDV_BASE',
        label: baseCustomEntries.length > 0 ? 'Horario personalizado del PDV' : 'Horario base del PDV',
        payload:
          baseCustomEntries.length > 0
            ? { mode: 'PERSONALIZADO' as const, entries: baseCustomEntries }
            : basePdvEntries.length > 0
              ? { mode: 'BASE_PDV' as const, entries: basePdvEntries }
              : null,
        available: baseCustomEntries.length > 0 || basePdvEntries.length > 0,
      },
      {
        level: 'CADENA_BASE',
        label: 'Horario heredado desde cadena',
        payload: chainEntries.length > 0 ? { mode: 'CADENA' as const, entries: chainEntries } : null,
        available: chainEntries.length > 0,
      },
      {
        level: 'GLOBAL',
        label: 'Fallback global',
        payload: globalEntries.length > 0 ? { mode: 'GLOBAL' as const, entries: globalEntries } : null,
        available: globalEntries.length > 0,
      },
    ],
    scheduleRule
  )

  if (resolution.candidate?.payload) {
    return {
      mode: resolution.candidate.payload.mode,
      entries: resolution.candidate.payload.entries,
    }
  }

  return { mode: 'SIN_HORARIO', entries: [] }
}

function groupRecentItems<T extends { pdv_id: string }>(items: T[]) {
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    const current = grouped.get(item.pdv_id) ?? []
    if (current.length >= MAX_HISTORY_PER_PDV) {
      continue
    }

    current.push(item)
    grouped.set(item.pdv_id, current)
  }

  return grouped
}

function normalizeFilterValue(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleUpperCase('es-MX')
}

function containsNormalizedValue(value: string | null | undefined, search: string) {
  if (!search) {
    return true
  }

  return normalizeFilterValue(value).includes(search)
}

function matchesPdvPanelFilters(
  pdv: PdvListadoItem,
  filters: PdvsPanelFilters,
  omittedKeys: Array<keyof PdvsPanelFilters> = [],
  supervisorPdvIds: Set<string> | null = null
) {
  const omitted = new Set<keyof PdvsPanelFilters>(omittedKeys)
  const normalizedSearch = omitted.has('search') ? '' : normalizeFilterValue(filters.search)

  if (normalizedSearch) {
    const searchFields = [
      pdv.nombre,
      pdv.claveBtl,
      pdv.idCadena,
      pdv.cadena,
      pdv.ciudad,
      pdv.estado,
      pdv.zona,
      pdv.supervisorActual,
    ]

    if (!searchFields.some((field) => containsNormalizedValue(field, normalizedSearch))) {
      return false
    }
  }

  if (!omitted.has('cadenaId') && filters.cadenaId && pdv.cadenaId !== filters.cadenaId) {
    return false
  }

  if (!omitted.has('ciudadId') && filters.ciudadId && pdv.ciudadId !== filters.ciudadId) {
    return false
  }

  if (!omitted.has('estado')) {
    if (filters.estado === 'SIN_ESTADO') {
      if (pdv.estado !== null) {
        return false
      }
    } else if (filters.estado && pdv.estado !== filters.estado) {
      return false
    }
  }

  if (!omitted.has('zona')) {
    if (filters.zona === 'SIN_ZONA') {
      if (pdv.zona !== null) {
        return false
      }
    } else if (filters.zona && pdv.zona !== filters.zona) {
      return false
    }
  }

  if (!omitted.has('supervisorId')) {
    if (filters.supervisorId === 'SIN_SUPERVISOR') {
      if (pdv.supervisorActualId !== null) {
        return false
      }
    } else if (filters.supervisorId) {
      if (supervisorPdvIds) {
        if (!supervisorPdvIds.has(pdv.id)) {
          return false
        }
      } else if (pdv.supervisorActualId !== filters.supervisorId) {
        return false
      }
    }
  }

  if (!omitted.has('estatus') && filters.estatus && pdv.estatus !== filters.estatus) {
    return false
  }

  if (
    !omitted.has('publicacionEstado') &&
    filters.publicacionEstado &&
    pdv.publicacionMensualEstado !== filters.publicacionEstado
  ) {
    return false
  }

  return true
}

function filterPdvsForPanel(
  pdvs: PdvListadoItem[],
  filters: PdvsPanelFilters,
  omittedKeys: Array<keyof PdvsPanelFilters> = [],
  supervisorPdvIds: Set<string> | null = null
) {
  return pdvs.filter((pdv) => matchesPdvPanelFilters(pdv, filters, omittedKeys, supervisorPdvIds))
}

function derivePdvsPanelOptions(params: {
  pdvs: PdvListadoItem[]
  filters: PdvsPanelFilters
  cadenas: PdvCadenaOption[]
  ciudades: PdvCiudadOption[]
  supervisores: PdvSupervisorOption[]
  supervisorPdvIds?: Set<string> | null
}) {
  const byDimension = {
    cadenas: filterPdvsForPanel(params.pdvs, params.filters, ['cadenaId'], params.supervisorPdvIds ?? null),
    ciudades: filterPdvsForPanel(params.pdvs, params.filters, ['ciudadId'], params.supervisorPdvIds ?? null),
    estados: filterPdvsForPanel(params.pdvs, params.filters, ['estado'], params.supervisorPdvIds ?? null),
    zonas: filterPdvsForPanel(params.pdvs, params.filters, ['zona'], params.supervisorPdvIds ?? null),
    supervisores: filterPdvsForPanel(params.pdvs, params.filters, ['supervisorId'], params.supervisorPdvIds ?? null),
  }

  const cadenaIds = new Set(
    byDimension.cadenas
      .map((pdv) => pdv.cadenaId)
      .filter((item): item is string => Boolean(item))
  )
  const ciudadIds = new Set(
    byDimension.ciudades
      .map((pdv) => pdv.ciudadId)
      .filter((item): item is string => Boolean(item))
  )
  const supervisorIds = new Set(
    byDimension.supervisores
      .map((pdv) => pdv.supervisorActualId)
      .filter((item): item is string => Boolean(item))
  )

  const supervisoresFiltrados = params.supervisores.filter((item) => supervisorIds.has(item.id))
  const supervisorSeleccionado =
    params.filters.supervisorId && params.filters.supervisorId !== 'SIN_SUPERVISOR'
      ? params.supervisores.find((item) => item.id === params.filters.supervisorId) ?? null
      : null

  return {
    cadenas: params.cadenas.filter((item) => cadenaIds.has(item.id)),
    ciudades: params.ciudades.filter((item) => ciudadIds.has(item.id)),
    estados: Array.from(
      new Set(
        byDimension.estados
          .map((pdv) => pdv.estado)
          .filter((item): item is string => Boolean(item))
      )
    ).sort((left, right) => left.localeCompare(right, 'es-MX')),
    zonas: Array.from(
      new Set(
        byDimension.zonas
          .map((pdv) => pdv.zona)
          .filter((item): item is string => Boolean(item))
      )
    ).sort((left, right) => left.localeCompare(right, 'es-MX')),
    supervisores:
      supervisorSeleccionado && !supervisoresFiltrados.some((item) => item.id === supervisorSeleccionado.id)
        ? [supervisorSeleccionado, ...supervisoresFiltrados]
        : supervisoresFiltrados,
  }
}

async function fetchActiveSupervisorPdvIds(
  supabase: SupabaseClient,
  supervisorId: string
): Promise<{ pdvIds: Set<string>; error: { message: string } | null }> {
  const result = await supabase
    .from('supervisor_pdv')
    .select('pdv_id')
    .eq('empleado_id', supervisorId)
    .eq('activo', true)
    .limit(500)

  const rows = Array.isArray(result.data) ? result.data : []
  return {
    pdvIds: new Set(
      rows
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null
          }

          return String((item as Record<string, unknown>).pdv_id ?? '').trim() || null
        })
        .filter((item): item is string => Boolean(item))
    ),
    error: result.error,
  }
}

const SUPABASE_PAGE_SIZE = 1000

/**
 * Fetches all publication rows for a month, paginating to bypass Supabase REST API's default
 * 1000-row limit. Pre-filters by cuenta_cliente_id and estado_operativo='ASIGNADA_PDV' on the
 * server side to minimize data transfer.
 */
async function fetchPublicationRowsPaginated(
  supabase: SupabaseClient,
  monthStart: string,
  monthEnd: string,
  accountScopeId: string | null
): Promise<{ data: Array<{ pdv_id: string; fecha: string; estado_operativo: string }>; error: { message: string } | null }> {
  const allRows: Array<{ pdv_id: string; fecha: string; estado_operativo: string }> = []
  let page = 0
  let hasMore = true
  let lastError: { message: string } | null = null

  while (hasMore) {
    const from = page * SUPABASE_PAGE_SIZE
    const to = from + SUPABASE_PAGE_SIZE - 1

    let query = supabase
      .from('asignacion_diaria_resuelta')
      .select('pdv_id, fecha, estado_operativo')
      .gte('fecha', monthStart)
      .lte('fecha', monthEnd)
      .eq('estado_operativo', 'ASIGNADA_PDV')
      .not('pdv_id', 'is', null)
      .order('pdv_id', { ascending: true })
      .order('fecha', { ascending: true })
      .range(from, to)

    if (accountScopeId) {
      query = query.eq('cuenta_cliente_id', accountScopeId)
    }

    const result = await query

    if (result.error) {
      lastError = result.error
      break
    }

    const rows = (result.data ?? []) as Array<{ pdv_id: string; fecha: string; estado_operativo: string }>
    allRows.push(...rows)
    hasMore = rows.length === SUPABASE_PAGE_SIZE
    page++

    // Safety cap: avoid runaway pagination (max ~30K rows)
    if (page > 30) {
      break
    }
  }

  return { data: allRows, error: lastError }
}
export function normalizePdvsPanelFilters(filters?: Partial<PdvsPanelFilters>): PdvsPanelFilters {
  return {
    month: typeof filters?.month === 'string' && /^\d{4}-\d{2}$/.test(filters.month.trim()) ? filters.month.trim() : getCurrentMonthValue(),
    search: typeof filters?.search === 'string' ? filters.search.trim() : '',
    cadenaId: typeof filters?.cadenaId === 'string' && filters.cadenaId !== 'ALL' ? filters.cadenaId.trim() : '',
    ciudadId: typeof filters?.ciudadId === 'string' && filters.ciudadId !== 'ALL' ? filters.ciudadId.trim() : '',
    estado: typeof filters?.estado === 'string' && filters.estado !== 'ALL' ? filters.estado.trim() : '',
    zona: typeof filters?.zona === 'string' && filters.zona !== 'ALL' ? filters.zona.trim() : '',
    supervisorId:
      typeof filters?.supervisorId === 'string' && filters.supervisorId !== 'ALL'
        ? filters.supervisorId.trim()
        : '',
    estatus: typeof filters?.estatus === 'string' && filters.estatus !== 'ALL' ? filters.estatus.trim() : '',
    publicacionEstado:
      typeof filters?.publicacionEstado === 'string' && filters.publicacionEstado !== 'ALL'
        ? filters.publicacionEstado.trim().toUpperCase()
        : '',
  }
}

function buildPdvsEmptyPanelData(params: {
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  cadenas: PdvCadenaOption[]
  ciudades: PdvCiudadOption[]
  estados: string[]
  zonas: string[]
  supervisores: PdvSupervisorOption[]
  turnosCadena: PdvTurnoCatalogOption[]
  geocercaDefaultMetros: number
  permiteCheckinConJustificacionDefault: boolean
  hasActiveFilters: boolean
  filters: PdvsPanelFilters
}): PdvsPanelData {
  const monthStart = startOfMonth(params.filters.month)
  const monthEnd = endOfMonth(params.filters.month)
  return {
    resumen: { total: 0, activos: 0, conGeocerca: 0, conSupervisor: 0, conHorario: 0 },
    publicacionMensual: {
      month: params.filters.month,
      fechaInicio: monthStart,
      fechaFin: monthEnd,
      total: 0,
      asignados: 0,
      parciales: 0,
      sinAsignacion: 0,
      inactivos: 0,
    },
    pdvs: [],
    month: params.filters.month,
    hasActiveFilters: params.hasActiveFilters,
    infraestructuraLista: params.infraestructuraLista,
    mensajeInfraestructura: params.mensajeInfraestructura,
    filters: params.filters,
    cadenas: params.cadenas,
    ciudades: params.ciudades,
    estados: params.estados,
    zonas: params.zonas,
    supervisores: params.supervisores,
    turnosCadena: params.turnosCadena,
    geocercaDefaultMetros: params.geocercaDefaultMetros,
    permiteCheckinConJustificacionDefault: params.permiteCheckinConJustificacionDefault,
  }
}

export async function obtenerPdvsPanelShell(
  supabase: SupabaseClient,
  filters: PdvsPanelFilters = EMPTY_PDV_FILTERS
): Promise<PdvsPanelData> {
  const [ciudadesResult, cadenasResult, supervisorsResult, turnCatalogResult, geocercaDefaultResult, geocercaJustificacionResult] = await Promise.all([
    fetchCitiesWithStateCompatibility(supabase),
    supabase.from('cadena').select('id, codigo, nombre').eq('activa', true).order('nombre', { ascending: true }),
    supabase
      .from('empleado')
      .select('id, nombre_completo, zona')
      .eq('puesto', 'SUPERVISOR')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true }),
    supabase.from('configuracion').select('valor').eq('clave', 'asistencias.san_pablo.catalogo_turnos').maybeSingle(),
    supabase.from('configuracion').select('valor').eq('clave', 'geocerca.radio_default_metros').maybeSingle(),
    supabase.from('configuracion').select('valor').eq('clave', 'geocerca.fuera_permitida_con_justificacion').maybeSingle(),
  ])

  const cadenas = (((cadenasResult.data ?? []) as CadenaRelacion[]) || []).map((item) => ({ id: item.id, codigo: item.codigo, nombre: item.nombre }))
  const ciudades = (((ciudadesResult.data ?? []) as CiudadRelacion[]) || [])
    .map((item) => ({
      id: item.id,
      nombre: item.nombre,
      zona: item.zona,
      estado: item.estado ?? resolveMexicoStateFromCity(item.nombre) ?? null,
    }))
  const supervisores = (((supervisorsResult.data ?? []) as EmpleadoRelacion[]) || [])
    .map((item) => ({ id: item.id, nombreCompleto: item.nombre_completo, zona: item.zona }))
  const turnosCadena = mapTurnCatalog((turnCatalogResult.data as ConfiguracionTurnoRow | null)?.valor)
  const geocercaDefaultMetros = mapConfigNumber((geocercaDefaultResult.data as ConfiguracionTurnoRow | null)?.valor, 150)
  const permiteCheckinConJustificacionDefault = mapConfigBoolean(
    (geocercaJustificacionResult.data as ConfiguracionTurnoRow | null)?.valor,
    true
  )
  const estados = Array.from(new Set(ciudades.map((item) => item.estado).filter((item): item is string => Boolean(item)))).sort((left, right) => left.localeCompare(right, 'es-MX'))
  const zonas = Array.from(new Set(ciudades.map((item) => item.zona).filter((item): item is string => Boolean(item)))).sort((left, right) => left.localeCompare(right, 'es-MX'))
  const infraErrors = [
    ciudadesResult.error,
    cadenasResult.error,
    supervisorsResult.error,
    turnCatalogResult.error,
    geocercaDefaultResult.error,
    geocercaJustificacionResult.error,
  ]
    .filter(Boolean)
    .map((error) => error?.message)

  return buildPdvsEmptyPanelData({
    infraestructuraLista: infraErrors.length === 0,
    mensajeInfraestructura: infraErrors.length > 0 ? infraErrors.join(' ') : undefined,
    cadenas,
    ciudades,
    estados,
    zonas,
    supervisores,
    turnosCadena,
    geocercaDefaultMetros,
    permiteCheckinConJustificacionDefault,
    hasActiveFilters: false,
    filters,
  })
}

export async function obtenerPanelPdvs(
  supabase: SupabaseClient,
  rawFilters: PdvsPanelFilters = EMPTY_PDV_FILTERS,
  scope?: { cuentaClienteId?: string | null }
): Promise<PdvsPanelData> {
  const filters = normalizePdvsPanelFilters(rawFilters)
  const hasActiveFilters = hasActivePdvsPanelFilters(filters)
  const monthStart = startOfMonth(filters.month)
  const monthEnd = endOfMonth(filters.month)
  const monthDays = listDatesInclusive(monthStart, monthEnd)
  const accountScopeId = scope?.cuentaClienteId?.trim() || getSingleTenantAccountId()

  const supervisorScope =
    hasActiveFilters && filters.supervisorId && filters.supervisorId !== 'SIN_SUPERVISOR'
      ? await fetchActiveSupervisorPdvIds(supabase, filters.supervisorId)
      : { pdvIds: null, error: null }

  const [pdvsResult, ciudadesResult, publicationRowsResult] = await Promise.all([
    fetchPdvsWithCityStateCompatibility(supabase),
    fetchCitiesWithStateCompatibility(supabase),
    fetchPublicationRowsPaginated(supabase, monthStart, monthEnd, accountScopeId),
  ])

  const [
    cadenasResult,
    supervisorsResult,
    turnCatalogResult,
    geocercaDefaultResult,
    geocercaJustificacionResult,
    scheduleRuleResult,
  ] = await Promise.all([
    supabase
      .from('cadena')
      .select('id, codigo, nombre')
      .eq('activa', true)
      .order('nombre', { ascending: true }),
    supabase
      .from('empleado')
      .select('id, nombre_completo, zona')
      .eq('puesto', 'SUPERVISOR')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true }),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'asistencias.san_pablo.catalogo_turnos')
      .maybeSingle(),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'geocerca.radio_default_metros')
      .maybeSingle(),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'geocerca.fuera_permitida_con_justificacion')
      .maybeSingle(),
    supabase
      .from('regla_negocio')
      .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
      .eq('codigo', SCHEDULE_PRIORITY_RULE_CODE)
      .maybeSingle(),
  ])

  const infraErrors = [
    pdvsResult.error,
    cadenasResult.error,
    ciudadesResult.error,
    supervisorsResult.error,
    turnCatalogResult.error,
    geocercaDefaultResult.error,
    geocercaJustificacionResult.error,
    scheduleRuleResult.error,
    publicationRowsResult.error,
    supervisorScope.error,
  ]
    .filter(Boolean)
    .map((error) => error?.message)

  if (pdvsResult.error) {
    return {
      resumen: { total: 0, activos: 0, conGeocerca: 0, conSupervisor: 0, conHorario: 0 },
      publicacionMensual: {
        month: filters.month,
        fechaInicio: monthStart,
        fechaFin: monthEnd,
        total: 0,
        asignados: 0,
        parciales: 0,
        sinAsignacion: 0,
        inactivos: 0,
      },
      pdvs: [],
      month: filters.month,
      hasActiveFilters,
      infraestructuraLista: false,
      mensajeInfraestructura: infraErrors.join(' '),
      filters,
      cadenas: [],
      ciudades: [],
      estados: [],
      zonas: [],
      supervisores: [],
      turnosCadena: [],
      geocercaDefaultMetros: 150,
      permiteCheckinConJustificacionDefault: true,
    }
  }

  const turnosCadena = mapTurnCatalog((turnCatalogResult.data as ConfiguracionTurnoRow | null)?.valor)
  const geocercaDefaultMetros = mapConfigNumber(
    (geocercaDefaultResult.data as ConfiguracionTurnoRow | null)?.valor,
    150
  )
  const permiteCheckinConJustificacionDefault = mapConfigBoolean(
    (geocercaJustificacionResult.data as ConfiguracionTurnoRow | null)?.valor,
    true
  )
  const scheduleRule = readSchedulePriorityRule(
    (scheduleRuleResult.data as ReglaNegocioQueryRow | null) ?? null
  )

  const pdvsBase = ((pdvsResult.data ?? []) as PdvQueryRow[]).map((pdv) => {
    const cadena = obtenerPrimero(pdv.cadena)
    const ciudad = obtenerPrimero(pdv.ciudad)
    const geocerca = obtenerPrimero(pdv.geocerca_pdv)
    const cuentaClienteRelaciones = Array.isArray(pdv.cuenta_cliente_pdv) ? pdv.cuenta_cliente_pdv : []
    const cuentaClienteVisible = accountScopeId
      ? cuentaClienteRelaciones.some((item) => {
          if (!item.activo || item.cuenta_cliente_id !== accountScopeId) {
            return false
          }

          return item.fecha_inicio <= monthEnd && (!item.fecha_fin || item.fecha_fin >= monthStart)
        })
      : true

    if (!cuentaClienteVisible) {
      return null
    }

    const supervisors = (Array.isArray(pdv.supervisor_pdv) ? pdv.supervisor_pdv : []).sort((left, right) => {
      if (left.activo !== right.activo) {
        return left.activo ? -1 : 1
      }

      return right.fecha_inicio.localeCompare(left.fecha_inicio)
    })
    const currentSupervisor = supervisors.find((item) => item.activo) ?? supervisors[0] ?? null
    const currentSupervisorEmpleado = obtenerPrimero(currentSupervisor?.empleado ?? null)
    const horario = buildHorarioItems(pdv, turnosCadena, scheduleRule)

    return {
      id: pdv.id,
      claveBtl: pdv.clave_btl,
      nombre: pdv.nombre,
      cadenaId: pdv.cadena_id,
      idCadena: pdv.id_cadena,
      cadenaCodigo: cadena?.codigo ?? null,
      cadena: cadena?.nombre ?? null,
      ciudadId: pdv.ciudad_id,
      ciudad: ciudad?.nombre ?? null,
      estado: ciudad?.estado ?? resolveMexicoStateFromCity(ciudad?.nombre) ?? null,
      zona: pdv.zona ?? ciudad?.zona ?? null,
      direccion: pdv.direccion,
      formato: pdv.formato,
      horarioEntrada: pdv.horario_entrada,
      horarioSalida: pdv.horario_salida,
      horarioMode: horario.mode,
      supervisorActualId: currentSupervisorEmpleado?.id ?? null,
      supervisorActual: currentSupervisorEmpleado?.nombre_completo ?? null,
      supervisorVigenteDesde: currentSupervisor?.fecha_inicio ?? null,
      latitud: geocerca?.latitud ?? null,
      longitud: geocerca?.longitud ?? null,
      radioMetros: geocerca?.radio_tolerancia_metros ?? null,
      permiteCheckinConJustificacion: geocerca?.permite_checkin_con_justificacion ?? true,
      geocercaCompleta: Boolean(
        geocerca &&
          geocerca.latitud !== null &&
          geocerca.longitud !== null &&
          geocerca.radio_tolerancia_metros !== null
      ),
      estatus: pdv.estatus,
      alertarGeocercaFueraDeRango: Boolean(
        geocerca &&
          (geocerca.radio_tolerancia_metros < 50 || geocerca.radio_tolerancia_metros > 300)
      ),
      metadata: mapMetadata(pdv.metadata),
    }
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))

  // Publication rows are already pre-filtered by cuenta_cliente_id, estado_operativo and pdv_id
  // in fetchPublicationRowsPaginated, so no further filtering is needed here.
  const publicationMap = (publicationRowsResult.data ?? []).reduce((acc, row) => {
    if (!row.pdv_id) {
      return acc
    }

    const current = acc.get(row.pdv_id) ?? new Set<string>()
    current.add(row.fecha)
    acc.set(row.pdv_id, current)
    return acc
  }, new Map<string, Set<string>>())

  const pdvsWithPublication = pdvsBase.map((pdv) => {
    const assignedDays = publicationMap.get(pdv.id)?.size ?? 0
    const totalDays = monthDays.length
    const inactive = !isOperablePdvStatus(pdv.estatus)
    const state: PdvMonthlyPublicationState = inactive
      ? 'INACTIVO'
      : assignedDays === 0
        ? 'SIN_ASIGNACION'
        : assignedDays >= totalDays
          ? 'ASIGNADO'
          : 'PARCIAL'

    return {
      ...pdv,
      publicacionMensualEstado: state,
      publicacionMensualDiasAsignados: assignedDays,
      publicacionMensualDiasFaltantes: inactive ? 0 : Math.max(totalDays - assignedDays, 0),
      publicacionMensualCoberturaPct:
        inactive || totalDays === 0 ? 0 : Math.round((assignedDays / totalDays) * 100),
      publicacionMensualEtiqueta: buildMonthlyPublicationLabel(state, assignedDays, totalDays),
    }
  })

  const cadenas = (((cadenasResult.data ?? []) as CadenaRelacion[]) || [])
    .map((item) => ({ id: item.id, codigo: item.codigo, nombre: item.nombre }))
  const ciudades = (((ciudadesResult.data ?? []) as CiudadRelacion[]) || [])
    .map((item) => ({
      id: item.id,
      nombre: item.nombre,
      zona: item.zona,
      estado: item.estado ?? resolveMexicoStateFromCity(item.nombre) ?? null,
    }))
  const supervisores = (((supervisorsResult.data ?? []) as EmpleadoRelacion[]) || [])
    .map((item) => ({ id: item.id, nombreCompleto: item.nombre_completo, zona: item.zona }))

  const supervisorPdvIds = supervisorScope.pdvIds instanceof Set ? supervisorScope.pdvIds : null
  const optionSets = derivePdvsPanelOptions({
    pdvs: pdvsWithPublication,
    filters,
    cadenas,
    ciudades,
    supervisores,
    supervisorPdvIds,
  })
  const pdvs = hasActiveFilters
    ? filterPdvsForPanel(pdvsWithPublication, filters, [], supervisorPdvIds)
    : pdvsWithPublication

  const allEstados = Array.from(
    new Set(
      pdvsWithPublication
        .map((pdv) => pdv.estado)
        .concat(ciudades.map((city) => city.estado ?? resolveMexicoStateFromCity(city.nombre) ?? null))
        .filter((item): item is string => Boolean(item))
    )
  ).sort((left, right) => left.localeCompare(right, 'es-MX'))

  const allZonas = Array.from(
    new Set(
      pdvsWithPublication
        .map((pdv) => pdv.zona)
        .concat(ciudades.map((city) => city.zona))
        .filter((item): item is string => Boolean(item))
    )
  ).sort((left, right) => left.localeCompare(right, 'es-MX'))

  const publicationSummary: PdvMonthlyPublicationSummary = {
    month: filters.month,
    fechaInicio: monthStart,
    fechaFin: monthEnd,
    total: pdvs.length,
    asignados: pdvs.filter((item) => item.publicacionMensualEstado === 'ASIGNADO').length,
    parciales: pdvs.filter((item) => item.publicacionMensualEstado === 'PARCIAL').length,
    sinAsignacion: pdvs.filter((item) => item.publicacionMensualEstado === 'SIN_ASIGNACION').length,
    inactivos: pdvs.filter((item) => item.publicacionMensualEstado === 'INACTIVO').length,
  }

  return {
    resumen: {
      total: pdvs.length,
      activos: pdvs.filter((item) => isOperablePdvStatus(item.estatus)).length,
      conGeocerca: pdvs.filter((item) => item.geocercaCompleta).length,
      conSupervisor: pdvs.filter((item) => item.supervisorActual !== null).length,
      conHorario: pdvs.filter((item) => item.horarioMode !== 'SIN_HORARIO').length,
    },
    publicacionMensual: publicationSummary,
    pdvs,
    month: filters.month,
    hasActiveFilters,
    infraestructuraLista: infraErrors.length === 0,
    mensajeInfraestructura: infraErrors.length > 0 ? infraErrors.join(' ') : undefined,
    filters,
    cadenas: hasActiveFilters ? optionSets.cadenas : cadenas,
    ciudades: hasActiveFilters ? optionSets.ciudades : ciudades,
    estados: hasActiveFilters ? optionSets.estados : allEstados,
    zonas: hasActiveFilters ? optionSets.zonas : allZonas,
    supervisores: hasActiveFilters ? optionSets.supervisores : supervisores,
    turnosCadena,
    geocercaDefaultMetros,
    permiteCheckinConJustificacionDefault,
  }
}

export async function obtenerDetallePdv(
  supabase: SupabaseClient,
  pdvId: string,
  month?: string | null
): Promise<PdvDetalleResponse> {
  if (!pdvId.trim()) {
    return {
      infraestructuraLista: false,
      mensajeInfraestructura: 'No se recibió un PDV válido para cargar el detalle.',
      pdv: null,
    }
  }

  const normalizedMonth =
    typeof month === 'string' && /^\d{4}-\d{2}$/.test(month.trim())
      ? month.trim()
      : getCurrentMonthValue()

  const [pdvResult, asignacionesResult, asistenciasResult, turnCatalogResult, scheduleRuleResult, publicationRowsResult] = await Promise.all([
    fetchPdvByIdWithCityStateCompatibility(supabase, pdvId),
    supabase
      .from('asignacion')
      .select(`
        id,
        pdv_id,
        fecha_inicio,
        fecha_fin,
        tipo,
        estado_publicacion,
        empleado:empleado_id(nombre_completo)
      `)
      .eq('pdv_id', pdvId)
      .order('fecha_inicio', { ascending: false })
      .limit(MAX_HISTORY_PER_PDV),
    supabase
      .from('asistencia')
      .select(`
        id,
        pdv_id,
        fecha_operacion,
        empleado_nombre,
        estatus,
        estado_gps,
        check_in_utc,
        distancia_check_in_metros
      `)
      .eq('pdv_id', pdvId)
      .order('fecha_operacion', { ascending: false })
      .limit(MAX_HISTORY_PER_PDV),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'asistencias.san_pablo.catalogo_turnos')
      .maybeSingle(),
    supabase
      .from('regla_negocio')
      .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
      .eq('codigo', SCHEDULE_PRIORITY_RULE_CODE)
      .maybeSingle(),
    supabase
      .from('asignacion_diaria_resuelta')
      .select('fecha, estado_operativo')
      .eq('pdv_id', pdvId)
      .gte('fecha', startOfMonth(normalizedMonth))
      .lte('fecha', endOfMonth(normalizedMonth)),
  ])

  const infraErrors = [
    pdvResult.error,
    asignacionesResult.error,
    asistenciasResult.error,
    turnCatalogResult.error,
    scheduleRuleResult.error,
    publicationRowsResult.error,
  ]
    .filter(Boolean)
    .map((error) => error?.message)

  const pdvRow = (pdvResult.data as PdvQueryRow | null) ?? null

  if (!pdvRow) {
    return {
      infraestructuraLista: infraErrors.length === 0,
      mensajeInfraestructura: infraErrors.length > 0 ? infraErrors.join(' ') : 'No se encontró el PDV solicitado.',
      pdv: null,
    }
  }

  const cadena = obtenerPrimero(pdvRow.cadena)
  const ciudad = obtenerPrimero(pdvRow.ciudad)
  const geocerca = obtenerPrimero(pdvRow.geocerca_pdv)
  const supervisors = (Array.isArray(pdvRow.supervisor_pdv) ? pdvRow.supervisor_pdv : []).sort((left, right) => {
    if (left.activo !== right.activo) {
      return left.activo ? -1 : 1
    }

    return right.fecha_inicio.localeCompare(left.fecha_inicio)
  })
  const currentSupervisor = supervisors.find((item) => item.activo) ?? supervisors[0] ?? null
  const currentSupervisorEmpleado = obtenerPrimero(currentSupervisor?.empleado ?? null)
  const horario = buildHorarioItems(
    pdvRow,
    mapTurnCatalog((turnCatalogResult.data as ConfiguracionTurnoRow | null)?.valor),
    readSchedulePriorityRule((scheduleRuleResult.data as ReglaNegocioQueryRow | null) ?? null)
  )
  const history = (Array.isArray(asignacionesResult.data) ? asignacionesResult.data : []) as AsignacionQueryRow[]
  const attendanceHistory = (Array.isArray(asistenciasResult.data) ? asistenciasResult.data : []) as AsistenciaQueryRow[]
  const publicationRows = (Array.isArray(publicationRowsResult.data) ? publicationRowsResult.data : []) as Array<{
    fecha: string
    estado_operativo: string
  }>
  const assignedDays = new Set(
    publicationRows.filter((row) => row.estado_operativo === 'ASIGNADA_PDV').map((row) => row.fecha)
  )
  const monthDays = listDatesInclusive(startOfMonth(normalizedMonth), endOfMonth(normalizedMonth))
  const publicationState: PdvMonthlyPublicationState = !isOperablePdvStatus(pdvRow.estatus)
    ? 'INACTIVO'
    : assignedDays.size === 0
      ? 'SIN_ASIGNACION'
      : assignedDays.size >= monthDays.length
        ? 'ASIGNADO'
        : 'PARCIAL'

  return {
    infraestructuraLista: infraErrors.length === 0,
    mensajeInfraestructura: infraErrors.length > 0 ? infraErrors.join(' ') : undefined,
    pdv: {
      id: pdvRow.id,
      claveBtl: pdvRow.clave_btl,
      nombre: pdvRow.nombre,
      cadenaId: pdvRow.cadena_id,
      idCadena: pdvRow.id_cadena,
      cadenaCodigo: cadena?.codigo ?? null,
      cadena: cadena?.nombre ?? null,
      ciudadId: pdvRow.ciudad_id,
      ciudad: ciudad?.nombre ?? null,
      estado: ciudad?.estado ?? resolveMexicoStateFromCity(ciudad?.nombre) ?? null,
      zona: pdvRow.zona ?? ciudad?.zona ?? null,
      direccion: pdvRow.direccion,
      formato: pdvRow.formato,
      horarioEntrada: pdvRow.horario_entrada,
      horarioSalida: pdvRow.horario_salida,
      horarioMode: horario.mode,
      supervisorActualId: currentSupervisorEmpleado?.id ?? null,
      supervisorActual: currentSupervisorEmpleado?.nombre_completo ?? null,
      supervisorVigenteDesde: currentSupervisor?.fecha_inicio ?? null,
      latitud: geocerca?.latitud ?? null,
      longitud: geocerca?.longitud ?? null,
      radioMetros: geocerca?.radio_tolerancia_metros ?? null,
      permiteCheckinConJustificacion: geocerca?.permite_checkin_con_justificacion ?? true,
      geocercaCompleta: Boolean(
        geocerca &&
          geocerca.latitud !== null &&
          geocerca.longitud !== null &&
          geocerca.radio_tolerancia_metros !== null
      ),
      estatus: pdvRow.estatus,
      alertarGeocercaFueraDeRango: Boolean(
        geocerca &&
          (geocerca.radio_tolerancia_metros < 50 || geocerca.radio_tolerancia_metros > 300)
      ),
      metadata: mapMetadata(pdvRow.metadata),
      publicacionMensualEstado: publicationState,
      publicacionMensualDiasAsignados: assignedDays.size,
      publicacionMensualDiasFaltantes: publicationState === 'INACTIVO' ? 0 : Math.max(monthDays.length - assignedDays.size, 0),
      publicacionMensualCoberturaPct:
        publicationState === 'INACTIVO' || monthDays.length === 0
          ? 0
          : Math.round((assignedDays.size / monthDays.length) * 100),
      publicacionMensualEtiqueta: buildMonthlyPublicationLabel(
        publicationState,
        assignedDays.size,
        monthDays.length
      ),
      horarios: horario.entries,
      supervisorHistorial: supervisors.map((item) => {
        const empleado = obtenerPrimero(item.empleado)
        return {
          id: item.id,
          empleadoId: empleado?.id ?? null,
          empleado: empleado?.nombre_completo ?? null,
          activo: item.activo,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
        }
      }),
      historialAsignaciones: history.map((item) => {
        const empleado = obtenerPrimero(item.empleado)
        return {
          id: item.id,
          empleado: empleado?.nombre_completo ?? null,
          tipo: item.tipo,
          estadoPublicacion: item.estado_publicacion,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
        }
      }),
      historialAsistencias: attendanceHistory.map((item) => ({
        id: item.id,
        empleado: item.empleado_nombre,
        fechaOperacion: item.fecha_operacion,
        estatus: item.estatus,
        estadoGps: item.estado_gps,
        checkInUtc: item.check_in_utc,
        distanciaCheckInMetros: item.distancia_check_in_metros,
      })),
    },
  }
}

function sanitizeFilenameDate(value: string) {
  return value.replace(/[^0-9-]/g, '')
}

export async function collectPdvsExportPayload(supabase: SupabaseClient): Promise<PdvsExportPayload> {
  const data = await obtenerPanelPdvs(supabase)

  if (!data.infraestructuraLista && data.mensajeInfraestructura) {
    throw new Error(data.mensajeInfraestructura)
  }

  const headers = [
    'CLAVE_BTL',
    'ID_CADENA',
    'CADENA_CODIGO',
    'CADENA',
    'PDV',
    'DIRECCION',
    'CIUDAD',
    'ESTADO',
    'ZONA',
    'FORMATO',
    'ESTATUS',
    'SUPERVISOR_ACTUAL',
    'SUPERVISOR_VIGENTE_DESDE',
    'LATITUD',
    'LONGITUD',
    'RADIO_METROS',
    'PERMITE_CHECKIN_CON_JUSTIFICACION',
    'GEOCERCA_COMPLETA',
    'HORARIO_MODO',
    'HORARIO_BASE_ENTRADA',
    'HORARIO_BASE_SALIDA',
  ]

  const rows = data.pdvs.map((pdv) => [
    pdv.claveBtl,
    pdv.idCadena,
    pdv.cadenaCodigo,
    pdv.cadena,
    pdv.nombre,
    pdv.direccion,
    pdv.ciudad,
    pdv.estado,
    pdv.zona,
    pdv.formato,
    pdv.estatus,
    pdv.supervisorActual,
    pdv.supervisorVigenteDesde,
    pdv.latitud,
    pdv.longitud,
    pdv.radioMetros,
    pdv.permiteCheckinConJustificacion ? 'SI' : 'NO',
    pdv.geocercaCompleta ? 'SI' : 'NO',
    pdv.horarioMode,
    pdv.horarioEntrada,
    pdv.horarioSalida,
  ])

  const today = sanitizeFilenameDate(new Date().toISOString().slice(0, 10))

  return {
    headers,
    rows,
    filenameBase: `pdvs-${today}`,
  }
}

const PDVS_PANEL_REVALIDATE_SECONDS = 90

function buildPdvsCacheKey(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  filters: PdvsPanelFilters
) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    filters,
  })
}

function buildPdvsCacheTags(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  filters: PdvsPanelFilters
) {
  return buildModuleCacheTags({
    module: 'pdvs',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
    period: hasActivePdvsPanelFilters(filters) ? 'filtered' : null,
  })
}

export async function obtenerPanelPdvsParaActor(
  actor: ActorActual,
  rawFilters: PdvsPanelFilters = EMPTY_PDV_FILTERS,
  customSupabase?: SupabaseClient
): Promise<PdvsPanelData> {
  if (!isActorActual(actor)) {
    throw new Error('Actor invalido para panel de PDVs.')
  }

  const filters = resolveDefaultPdvsPanelFilters(actor, normalizePdvsPanelFilters(rawFilters))

  if (customSupabase) {
    return obtenerPanelPdvs(customSupabase, filters, {
      cuentaClienteId: actor.cuentaClienteId ?? getSingleTenantAccountId(),
    })
  }

  const cacheKey = buildPdvsCacheKey(actor, filters)

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient
      return obtenerPanelPdvs(service, filters, {
        cuentaClienteId: actor.cuentaClienteId ?? getSingleTenantAccountId(),
      })
    },
    ['pdvs:panel', cacheKey],
    {
      tags: buildPdvsCacheTags(actor, filters),
      revalidate: PDVS_PANEL_REVALIDATE_SECONDS,
    }
  )()
}
