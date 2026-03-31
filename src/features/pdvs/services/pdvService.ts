import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SCHEDULE_PRIORITY_RULE_CODE,
  readSchedulePriorityRule,
  resolveScheduleHierarchy,
  type BusinessRuleRow,
  type SchedulePriorityRuleDefinition,
} from '@/features/reglas/lib/businessRules'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import type { Pdv } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type PdvStatus = 'ACTIVO' | 'INACTIVO'
type HorarioMode = 'CADENA' | 'PERSONALIZADO' | 'BASE_PDV' | 'GLOBAL' | 'SIN_HORARIO'
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
        ciudad:ciudad_id(id, nombre, zona, estado),
        geocerca_pdv(id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion),
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
        supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona, estatus_laboral)),
        horario_pdv(id, nivel_prioridad, fecha_especifica, dia_semana, codigo_turno, hora_entrada, hora_salida, activo, observaciones)
      `)
    .order('nombre', { ascending: true })
}

async function fetchCitiesWithStateCompatibility(supabase: SupabaseClient) {
  const withState = await supabase
    .from('ciudad')
    .select('id, nombre, zona, estado')
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
  horarios: PdvHorarioItem[]
  supervisorActualId: string | null
  supervisorActual: string | null
  supervisorVigenteDesde: string | null
  supervisorHistorial: PdvSupervisorHistoryItem[]
  latitud: number | null
  longitud: number | null
  radioMetros: number | null
  permiteCheckinConJustificacion: boolean
  geocercaCompleta: boolean
  estatus: PdvStatus
  alertarGeocercaFueraDeRango: boolean
  historialAsignaciones: PdvAssignmentHistoryItem[]
  historialAsistencias: PdvAttendanceHistoryItem[]
  metadata: Record<string, unknown>
}

export interface PdvsPanelData {
  resumen: PdvResumen
  pdvs: PdvListadoItem[]
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
}
export interface PdvsExportPayload {
  headers: string[]
  rows: Array<Array<string | number | null>>
  filenameBase: string
}

const SIGNED_DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
const MAX_HISTORY_PER_PDV = 5

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

export async function obtenerPanelPdvs(
  supabase: SupabaseClient
): Promise<PdvsPanelData> {
  const [pdvsResult, ciudadesResult] = await Promise.all([
    fetchPdvsWithCityStateCompatibility(supabase),
    fetchCitiesWithStateCompatibility(supabase),
  ])

  const [
      cadenasResult,
      supervisorsResult,
      turnCatalogResult,
      geocercaDefaultResult,
    geocercaJustificacionResult,
    scheduleRuleResult,
    asignacionesResult,
    asistenciasResult,
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
      .order('fecha_inicio', { ascending: false })
      .limit(800),
    supabase
      .from('asistencia')
      .select('id, pdv_id, fecha_operacion, empleado_nombre, estatus, estado_gps, check_in_utc, distancia_check_in_metros')
      .order('fecha_operacion', { ascending: false })
      .limit(800),
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
    asignacionesResult.error,
    asistenciasResult.error,
  ]
    .filter(Boolean)
    .map((error) => error?.message)

  if (pdvsResult.error) {
    return {
      resumen: { total: 0, activos: 0, conGeocerca: 0, conSupervisor: 0, conHorario: 0 },
      pdvs: [],
      infraestructuraLista: false,
      mensajeInfraestructura: infraErrors.join(' '),
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
  const asignacionesPorPdv = groupRecentItems((asignacionesResult.data ?? []) as AsignacionQueryRow[])
  const asistenciasPorPdv = groupRecentItems((asistenciasResult.data ?? []) as AsistenciaQueryRow[])

  const pdvs = ((pdvsResult.data ?? []) as PdvQueryRow[]).map((pdv) => {
    const cadena = obtenerPrimero(pdv.cadena)
    const ciudad = obtenerPrimero(pdv.ciudad)
    const geocerca = obtenerPrimero(pdv.geocerca_pdv)
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
      horarios: horario.entries,
      supervisorActualId: currentSupervisorEmpleado?.id ?? null,
      supervisorActual: currentSupervisorEmpleado?.nombre_completo ?? null,
      supervisorVigenteDesde: currentSupervisor?.fecha_inicio ?? null,
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
      historialAsignaciones: (asignacionesPorPdv.get(pdv.id) ?? []).map((item) => ({
        id: item.id,
        empleado: obtenerPrimero(item.empleado)?.nombre_completo ?? null,
        tipo: item.tipo,
        estadoPublicacion: item.estado_publicacion,
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
      })),
      historialAsistencias: (asistenciasPorPdv.get(pdv.id) ?? []).map((item) => ({
        id: item.id,
        empleado: item.empleado_nombre,
        fechaOperacion: item.fecha_operacion,
        estatus: item.estatus,
        estadoGps: item.estado_gps,
        checkInUtc: item.check_in_utc,
        distanciaCheckInMetros: item.distancia_check_in_metros,
      })),
      metadata: mapMetadata(pdv.metadata),
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
  const estados = Array.from(
    new Set(
      pdvs
        .map((pdv) => pdv.estado)
        .concat(ciudades.map((city) => city.estado))
        .filter((item): item is string => Boolean(item))
    )
  ).sort((left, right) => left.localeCompare(right, 'es-MX'))

  const zonas = Array.from(
    new Set(
      pdvs
        .map((pdv) => pdv.zona)
        .concat(ciudades.map((city) => city.zona))
        .filter((item): item is string => Boolean(item))
    )
  ).sort((left, right) => left.localeCompare(right, 'es-MX'))

  return {
    resumen: {
      total: pdvs.length,
      activos: pdvs.filter((item) => item.estatus === 'ACTIVO').length,
      conGeocerca: pdvs.filter((item) => item.geocercaCompleta).length,
      conSupervisor: pdvs.filter((item) => item.supervisorActual !== null).length,
      conHorario: pdvs.filter((item) => item.horarios.length > 0).length,
    },
    pdvs,
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
  }
}
function formatSupervisorHistory(items: PdvSupervisorHistoryItem[]) {
  if (items.length === 0) {
    return 'Sin historial'
  }

  return items
    .map((item) => {
      const empleado = item.empleado ?? 'Sin supervisor'
      const vigencia = item.fechaFin ? `${item.fechaInicio} a ${item.fechaFin}` : `desde ${item.fechaInicio}`
      return `${empleado} (${item.activo ? 'Activo' : 'Historico'} · ${vigencia})`
    })
    .join(' | ')
}

function formatHorarios(items: PdvHorarioItem[]) {
  if (items.length === 0) {
    return 'Sin horario'
  }

  return items
    .map((item) => {
      const tramo =
        item.horaEntrada && item.horaSalida
          ? `${item.horaEntrada.slice(0, 5)}-${item.horaSalida.slice(0, 5)}`
          : 'Sin tramo'
      const code = item.code ? ` · ${item.code}` : ''
      const observations = item.observations ? ` · ${item.observations}` : ''
      return `${item.dayLabel}: ${tramo}${code}${observations}`
    })
    .join(' | ')
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
    'HORARIOS_DETALLE',
    'HISTORIAL_SUPERVISORES',
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
    formatHorarios(pdv.horarios),
    formatSupervisorHistory(pdv.supervisorHistorial),
  ])

  const today = sanitizeFilenameDate(new Date().toISOString().slice(0, 10))

  return {
    headers,
    rows,
    filenameBase: `pdvs-${today}`,
  }
}
