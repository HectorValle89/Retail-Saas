import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import {
  getMaterializedMonthlyCalendar,
  type MaterializedCalendarDay,
  type MaterializedCalendarEmployeeRow,
  type MaterializedMonthlyCalendar,
  type MaterializedMonthlyFilters,
} from '@/features/asignaciones/services/asignacionMaterializationService'
import {
  normalizeDiaLaboralCode,
  parseDiasLaborales,
  type DiaLaboralCode,
} from '@/features/asignaciones/lib/assignmentPlanning'
import {
  deriveAttendanceDiscipline,
  type AttendanceDisciplineAssignment,
  type AttendanceDisciplineAttendance,
  type AttendanceDisciplineSolicitud,
} from '@/features/asistencias/lib/attendanceDiscipline'
import type { Asignacion, Asistencia, Cadena, Ciudad, ConfiguracionSistema, Empleado, Pdv, Solicitud } from '@/types/database'

type TypedSupabaseClient = SupabaseClient<any>
type MaybeMany<T> = T | T[] | null

type PdvWithRelations = Pick<
  Pdv,
  'id' | 'nombre' | 'clave_btl' | 'zona' | 'estatus' | 'horario_entrada' | 'horario_salida'
> & {
  cadena: MaybeMany<Pick<Cadena, 'id' | 'nombre'>>
  ciudad: MaybeMany<Pick<Ciudad, 'id' | 'nombre' | 'estado'>>
}

type EmployeeMonthRow = Pick<
  Empleado,
  'id' | 'id_nomina' | 'nombre_completo' | 'fecha_alta' | 'fecha_baja' | 'estatus_laboral' | 'supervisor_empleado_id' | 'sueldo_base_mensual'
>

type SupervisorRow = Pick<Empleado, 'id' | 'nombre_completo'>

type AssignmentMonthRow = Pick<
  Asignacion,
  'id' | 'empleado_id' | 'pdv_id' | 'cuenta_cliente_id' | 'supervisor_empleado_id' | 'fecha_inicio' | 'fecha_fin' | 'dias_laborales' | 'dia_descanso' | 'horario_referencia' | 'naturaleza' | 'prioridad' | 'estado_publicacion' | 'tipo'
>

type AttendanceMonthRow = Pick<
  Asistencia,
  'id' | 'empleado_id' | 'supervisor_empleado_id' | 'pdv_id' | 'fecha_operacion' | 'check_in_utc' | 'check_out_utc' | 'distancia_check_in_metros' | 'distancia_check_out_metros' | 'estado_gps' | 'biometria_estado' | 'biometria_score' | 'selfie_check_in_url' | 'selfie_check_in_hash' | 'selfie_check_out_url' | 'selfie_check_out_hash' | 'justificacion_fuera_geocerca' | 'estatus' | 'created_at'
>

type SolicitudMonthRow = Pick<
  Solicitud,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'supervisor_empleado_id' | 'tipo' | 'fecha_inicio' | 'fecha_fin' | 'motivo' | 'justificante_url' | 'justificante_hash' | 'estatus' | 'comentarios' | 'metadata' | 'created_at'
>

type ConfigRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>

export type AttendanceAdminDayCode = '' | 'A' | 'D' | 'FE' | 'AR' | 'F' | 'FR' | 'V' | 'B' | 'VC' | 'IP' | 'I' | 'ISP' | 'IS' | 'JUS'
export type AttendanceAdminCellTone = 'neutral' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'slate'

export interface AttendanceAdminMonthFilters {
  month: string
  supervisorId?: string | null
  cadena?: string | null
  zona?: string | null
  ciudad?: string | null
  estadoDia?: AttendanceAdminDayCode | null
}

export interface AttendanceAdminFilterOption {
  value: string
  label: string
}

export interface AttendanceAdminDayHeader {
  fecha: string
  dayNumber: number
  weekdayLetter: 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D'
}

export interface AttendanceAdminDayCell {
  fecha: string
  codigo: AttendanceAdminDayCode
  label: string
  tone: AttendanceAdminCellTone
  hasDetail: boolean
  detailRef: string
}

export interface AttendanceAdminEmployeeRow {
  empleadoId: string
  idNomina: string | null
  nombre: string
  supervisor: string | null
  cadenaPrincipalMes: string | null
  dias: AttendanceAdminDayCell[]
}

export interface AttendanceAdminSummary {
  empleadosVisibles: number
  asistencias: number
  retardos: number
  faltas: number
  faltasPorRetardo: number
  vacaciones: number
  incapacidades: number
  justificadas: number
}

export interface AttendanceAdminMonthData {
  month: string
  days: AttendanceAdminDayHeader[]
  rows: AttendanceAdminEmployeeRow[]
  summary: AttendanceAdminSummary
  filters: AttendanceAdminMonthFilters
  supervisors: AttendanceAdminFilterOption[]
  cadenas: AttendanceAdminFilterOption[]
  ciudades: AttendanceAdminFilterOption[]
  zonas: AttendanceAdminFilterOption[]
  estadosDia: AttendanceAdminFilterOption[]
  canExport: boolean
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

export interface AttendanceAdminEvidenceItem {
  label: string
  url: string
  kind: 'SELFIE_IN' | 'SELFIE_OUT' | 'JUSTIFICANTE'
  hash: string | null
}

export interface AttendanceAdminDayDetail {
  fecha: string
  codigo: AttendanceAdminDayCode
  descripcion: string
  pdv: string | null
  cadena: string | null
  sucursal: string | null
  horarioEsperado: string | null
  checkIn: string | null
  checkOut: string | null
  gps: string | null
  biometria: string | null
  supervisor: string | null
  sourceType: 'ASISTENCIA' | 'SOLICITUD' | 'SISTEMA' | 'ASIGNACION'
  sourceId: string | null
  evidencias: AttendanceAdminEvidenceItem[]
}

export interface AttendanceAdminExportPayload {
  filenameBase: string
  headers: Array<string | number>
  rows: Array<Array<string | number | null>>
  leadingRows: Array<Array<string | number | null>>
  footerRows: Array<Array<string | number | null>>
}

interface CellDraft {
  fecha: string
  codigo: AttendanceAdminDayCode
  label: string
  tone: AttendanceAdminCellTone
  description: string
  detailRef: string
  hasDetail: boolean
  sourceType: 'ASISTENCIA' | 'SOLICITUD' | 'SISTEMA' | 'ASIGNACION'
  sourceId: string | null
  isTardy: boolean
}

interface IncapacityMarker {
  code: Extract<AttendanceAdminDayCode, 'IP' | 'I' | 'ISP' | 'IS'>
  clase: 'INICIAL' | 'SUBSECUENTE'
  solicitudId: string
}

interface AttendanceAdminContext {
  month: string
  monthStart: string
  monthEnd: string
  calendar: MaterializedMonthlyCalendar
  employees: Map<string, EmployeeMonthRow>
  supervisors: Map<string, string>
  assignmentsByEmployee: Map<string, AssignmentMonthRow[]>
  attendancesByEmployeeDate: Map<string, AttendanceMonthRow>
  requestsByEmployee: Map<string, SolicitudMonthRow[]>
  incapacityMarkersByEmployee: Map<string, Map<string, IncapacityMarker>>
  tardyDatesByEmployee: Map<string, Set<string>>
  frDatesByEmployee: Map<string, Set<string>>
  pdvs: Map<string, PdvWithRelations>
  toleranceMinutes: number
}

const MEXICO_TZ = 'America/Mexico_City'
const LOOKBACK_DAYS = 90
const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const DAY_CODE_OPTIONS: AttendanceAdminFilterOption[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'A', label: 'A · Asistencia' },
  { value: 'AR', label: 'AR · Retardo' },
  { value: 'FR', label: 'FR · Falta por retardos' },
  { value: 'F', label: 'F · Falta' },
  { value: 'JUS', label: 'JUS · Justificada' },
  { value: 'V', label: 'V · Vacaciones' },
  { value: 'IP', label: 'IP · Incapacidad inicial pagada' },
  { value: 'I', label: 'I · Incapacidad inicial sin pago' },
  { value: 'ISP', label: 'ISP · Incapacidad subsecuente pagada' },
  { value: 'IS', label: 'IS · Incapacidad subsecuente sin pago' },
  { value: 'D', label: 'D · Descanso' },
  { value: 'FE', label: 'FE · Feriado' },
  { value: 'B', label: 'B · Baja' },
  { value: 'VC', label: 'VC · Vacante / no contable' },
]

function obtenerPrimero<T>(value: MaybeMany<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeMonth(value?: string | null) {
  const normalized = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const value = new Date(`${month}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + 1, 0)
  return value.toISOString().slice(0, 10)
}

function addDays(dateIso: string, offset: number) {
  const value = new Date(`${dateIso}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
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

function getTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function weekdayLetter(dateIso: string): AttendanceAdminDayHeader['weekdayLetter'] {
  return WEEKDAY_LETTERS[new Date(`${dateIso}T12:00:00Z`).getUTCDay()] ?? 'D'
}

function buildAttendanceKey(empleadoId: string, fecha: string) {
  return `${empleadoId}::${fecha}`
}

function buildDetailRef(empleadoId: string, fecha: string) {
  return `${empleadoId}::${fecha}`
}

function compareLatestCreatedAt(left: AttendanceMonthRow, right: AttendanceMonthRow) {
  return String(right.created_at).localeCompare(String(left.created_at))
}

function formatHour(isoValue: string | null) {
  if (!isoValue) return null
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: MEXICO_TZ,
  }).format(date)
}

function resolveExpectedMinutes(day: MaterializedCalendarDay) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(day.horarioInicio ?? '')
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function resolveActualMinutes(isoValue: string | null) {
  const formatted = formatHour(isoValue)
  const match = /^(\d{2}):(\d{2})$/.exec(formatted ?? '')
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}
function isApprovedSolicitudForCalendar(item: SolicitudMonthRow) {
  if (item.tipo === 'INCAPACIDAD') {
    return item.estatus === 'REGISTRADA_RH'
  }
  return item.estatus === 'REGISTRADA_RH' || item.estatus === 'REGISTRADA'
}

function isApprovedAttendanceJustification(item: SolicitudMonthRow) {
  if (!isApprovedSolicitudForCalendar(item)) return false
  if (item.tipo === 'JUSTIFICACION_FALTA' || item.tipo === 'PERMISO') return true
  const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? (item.metadata as Record<string, unknown>)
    : {}
  return Boolean(metadata.justifica_asistencia)
}

function extractIncapacityClass(item: SolicitudMonthRow): 'INICIAL' | 'SUBSECUENTE' {
  const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? (item.metadata as Record<string, unknown>)
    : {}
  const rawValue = normalizeText(metadata.incapacidad_clase ?? metadata.clase_incapacidad ?? metadata.tipo_incapacidad)
  return rawValue === 'SUBSECUENTE' ? 'SUBSECUENTE' : 'INICIAL'
}

function overlapsDate(start: string, end: string | null, target: string) {
  return start <= target && (end ?? '9999-12-31') >= target
}

function isWorkday(assignment: AssignmentMonthRow, date: string) {
  const dateValue = new Date(`${date}T12:00:00Z`)
  const code = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][dateValue.getUTCDay() === 0 ? 6 : dateValue.getUTCDay() - 1] as DiaLaboralCode
  const descanso = normalizeDiaLaboralCode(assignment.dia_descanso)
  if (descanso && descanso === code) return false
  const parsed = parseDiasLaborales(assignment.dias_laborales)
  if (parsed.dias.length === 0) return true
  return parsed.dias.includes(code)
}

function resolveNumericConfigValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (value && typeof value === 'object' && 'valor' in (value as Record<string, unknown>)) {
    return resolveNumericConfigValue((value as Record<string, unknown>).valor, fallback)
  }
  return fallback
}

function toneForCode(code: AttendanceAdminDayCode): AttendanceAdminCellTone {
  switch (code) {
    case 'A': return 'emerald'
    case 'AR': return 'amber'
    case 'FR':
    case 'F':
    case 'B': return 'rose'
    case 'V':
    case 'IP':
    case 'I':
    case 'ISP':
    case 'IS':
    case 'JUS': return 'violet'
    case 'FE': return 'sky'
    case 'D':
    case 'VC': return 'slate'
    default: return 'neutral'
  }
}

function labelForCode(code: AttendanceAdminDayCode) {
  switch (code) {
    case 'A': return 'Asistencia'
    case 'AR': return 'Retardo'
    case 'FR': return 'Falta por retardos'
    case 'F': return 'Falta'
    case 'V': return 'Vacaciones'
    case 'IP': return 'Incapacidad inicial pagada'
    case 'I': return 'Incapacidad inicial sin pago'
    case 'ISP': return 'Incapacidad subsecuente pagada'
    case 'IS': return 'Incapacidad subsecuente sin pago'
    case 'JUS': return 'Falta justificada'
    case 'D': return 'Descanso'
    case 'FE': return 'Feriado'
    case 'B': return 'Baja'
    case 'VC': return 'Vacante / no contable'
    default: return 'Pendiente'
  }
}

function buildMonthHeaders(month: string): AttendanceAdminDayHeader[] {
  return listDatesInclusive(startOfMonth(month), endOfMonth(month)).map((fecha) => ({
    fecha,
    dayNumber: Number(fecha.slice(-2)),
    weekdayLetter: weekdayLetter(fecha),
  }))
}

function buildAttendanceAdminFallbackData(
  input: Partial<AttendanceAdminMonthFilters>,
  message: string
): AttendanceAdminMonthData {
  const month = normalizeMonth(input.month)
  return {
    month,
    days: buildMonthHeaders(month),
    rows: [],
    summary: {
      empleadosVisibles: 0,
      asistencias: 0,
      retardos: 0,
      faltas: 0,
      faltasPorRetardo: 0,
      vacaciones: 0,
      incapacidades: 0,
      justificadas: 0,
    },
    filters: {
      month,
      supervisorId: normalizeText(input.supervisorId) ?? null,
      cadena: normalizeText(input.cadena) ?? null,
      zona: normalizeText(input.zona) ?? null,
      ciudad: normalizeText(input.ciudad) ?? null,
      estadoDia: (normalizeText(input.estadoDia) as AttendanceAdminDayCode | null) ?? null,
    },
    supervisors: [{ value: '', label: 'Todos los supervisores' }],
    cadenas: [{ value: '', label: 'Todas las cadenas' }],
    ciudades: [{ value: '', label: 'Todas las ciudades' }],
    zonas: [{ value: '', label: 'Todas las zonas' }],
    estadosDia: DAY_CODE_OPTIONS,
    canExport: false,
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

export function applyFrEscalation(cells: CellDraft[]): Set<string> {
  const tardyDates = cells.filter((cell) => cell.isTardy).map((cell) => cell.fecha).sort()
  const frDates = new Set<string>()
  for (let index = 2; index < tardyDates.length; index += 3) {
    const fecha = tardyDates[index]
    if (!fecha) continue
    frDates.add(fecha)
  }
  return frDates
}

export function applyIncapacityMarkers(
  requests: SolicitudMonthRow[],
  normalAttendanceDates: Set<string>,
  visibleStart: string,
  visibleEnd: string
): Map<string, IncapacityMarker> {
  const approved = requests
    .filter((item) => item.tipo === 'INCAPACIDAD' && item.estatus === 'REGISTRADA_RH')
    .sort((left, right) => left.fecha_inicio.localeCompare(right.fecha_inicio) || left.created_at.localeCompare(right.created_at))

  const markers = new Map<string, IncapacityMarker>()
  let previousRequestEnd: string | null = null
  let continuousCount = 0

  for (const request of approved) {
    const shouldReset = !previousRequestEnd || hasNormalAttendanceBetween(previousRequestEnd, request.fecha_inicio, normalAttendanceDates)
    if (shouldReset) {
      continuousCount = 0
    }

    const clase = extractIncapacityClass(request)
    for (const fecha of listDatesInclusive(request.fecha_inicio, request.fecha_fin)) {
      if (fecha < visibleStart || fecha > visibleEnd) continue
      if (markers.has(fecha)) continue
      continuousCount += 1
      const code = clase === 'SUBSECUENTE'
        ? (continuousCount <= 3 ? 'ISP' : 'IS')
        : (continuousCount <= 3 ? 'IP' : 'I')
      markers.set(fecha, { code, clase, solicitudId: request.id })
    }

    previousRequestEnd = request.fecha_fin > (previousRequestEnd ?? request.fecha_fin) ? request.fecha_fin : (previousRequestEnd ?? request.fecha_fin)
  }

  return markers
}

function hasNormalAttendanceBetween(previousEnd: string, nextStart: string, normalAttendanceDates: Set<string>) {
  const start = addDays(previousEnd, 1)
  const end = addDays(nextStart, -1)
  if (start > end) return false
  for (const fecha of listDatesInclusive(start, end)) {
    if (normalAttendanceDates.has(fecha)) return true
  }
  return false
}

function buildScopeFilters(actor: ActorActual, filters: AttendanceAdminMonthFilters): MaterializedMonthlyFilters {
  const scope: MaterializedMonthlyFilters = { month: filters.month }
  if (actor.puesto === 'COORDINADOR') {
    scope.coordinadorEmpleadoId = actor.empleadoId
  }
  if (actor.cuentaClienteId) {
    scope.cuentaClienteId = actor.cuentaClienteId
  }
  if (filters.supervisorId) {
    scope.supervisorEmpleadoId = filters.supervisorId
  }
  if (filters.zona) {
    scope.zona = filters.zona
  }
  return scope
}

async function loadAttendanceAdminContext(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  input: Partial<AttendanceAdminMonthFilters>
): Promise<AttendanceAdminContext> {
  const filters: AttendanceAdminMonthFilters = {
    month: normalizeMonth(input.month),
    supervisorId: normalizeText(input.supervisorId) ?? null,
    cadena: normalizeText(input.cadena) ?? null,
    zona: normalizeText(input.zona) ?? null,
    ciudad: normalizeText(input.ciudad) ?? null,
    estadoDia: (normalizeText(input.estadoDia) as AttendanceAdminDayCode | null) ?? null,
  }

  const monthStart = startOfMonth(filters.month)
  const monthEnd = endOfMonth(filters.month)
  const lookbackStart = addDays(monthStart, -LOOKBACK_DAYS)
  const calendar = await getMaterializedMonthlyCalendar(buildScopeFilters(actor, filters))
  const employeeIds = calendar.empleados.map((item) => item.empleadoId)

  if (employeeIds.length === 0) {
    return {
      month: filters.month,
      monthStart,
      monthEnd,
      calendar,
      employees: new Map(),
      supervisors: new Map(),
      assignmentsByEmployee: new Map(),
      attendancesByEmployeeDate: new Map(),
      requestsByEmployee: new Map(),
      incapacityMarkersByEmployee: new Map(),
      tardyDatesByEmployee: new Map(),
      frDatesByEmployee: new Map(),
      pdvs: new Map(),
      toleranceMinutes: 15,
    }
  }

  const [employeesResult, assignmentsResult, attendancesResult, solicitudesResult, configResult] = await Promise.all([
    supabase
      .from('empleado')
      .select('id, id_nomina, nombre_completo, fecha_alta, fecha_baja, estatus_laboral, supervisor_empleado_id, sueldo_base_mensual')
      .in('id', employeeIds),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, cuenta_cliente_id, supervisor_empleado_id, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, naturaleza, prioridad, estado_publicacion, tipo')
      .in('empleado_id', employeeIds)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', monthEnd)
      .or(`fecha_fin.is.null,fecha_fin.gte.${monthStart}`),
    supabase
      .from('asistencia')
      .select('id, empleado_id, supervisor_empleado_id, pdv_id, fecha_operacion, check_in_utc, check_out_utc, distancia_check_in_metros, distancia_check_out_metros, estado_gps, biometria_estado, biometria_score, selfie_check_in_url, selfie_check_in_hash, selfie_check_out_url, selfie_check_out_hash, justificacion_fuera_geocerca, estatus, created_at')
      .in('empleado_id', employeeIds)
      .gte('fecha_operacion', lookbackStart)
      .lte('fecha_operacion', monthEnd),
    supabase
      .from('solicitud')
      .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, motivo, justificante_url, justificante_hash, estatus, comentarios, metadata, created_at')
      .in('empleado_id', employeeIds)
      .lte('fecha_inicio', monthEnd)
      .gte('fecha_fin', lookbackStart),
    supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['asistencias.tolerancia_checkin_minutos', 'nomina.deduccion_falta_dias']),
  ])

  if (employeesResult.error) throw new Error(employeesResult.error.message)
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message)
  if (attendancesResult.error) throw new Error(attendancesResult.error.message)
  if (solicitudesResult.error) throw new Error(solicitudesResult.error.message)
  if (configResult.error) throw new Error(configResult.error.message)

  const employees = new Map(((employeesResult.data ?? []) as EmployeeMonthRow[]).map((item) => [item.id, item]))
  const assignments = (assignmentsResult.data ?? []) as AssignmentMonthRow[]
  const attendances = (attendancesResult.data ?? []) as AttendanceMonthRow[]
  const solicitudes = (solicitudesResult.data ?? []) as SolicitudMonthRow[]
  const toleranceMinutes = resolveNumericConfigValue(
    ((configResult.data ?? []) as ConfigRow[]).find((item) => item.clave === 'asistencias.tolerancia_checkin_minutos')?.valor,
    15
  )
  const payrollDeductionDays = resolveNumericConfigValue(
    ((configResult.data ?? []) as ConfigRow[]).find((item) => item.clave === 'nomina.deduccion_falta_dias')?.valor,
    1
  )

  const pdvIds = Array.from(new Set([
    ...calendar.empleados.flatMap((row) => row.dias.map((day) => day.pdvId).filter((value): value is string => Boolean(value))),
    ...assignments.map((item) => item.pdv_id).filter((value): value is string => Boolean(value)),
    ...attendances.map((item) => item.pdv_id).filter((value): value is string => Boolean(value)),
  ]))
  const supervisorIds = Array.from(new Set([
    ...calendar.empleados.map((item) => item.supervisorEmpleadoId).filter((value): value is string => Boolean(value)),
    ...Array.from(employees.values()).map((item) => item.supervisor_empleado_id).filter((value): value is string => Boolean(value)),
  ]))

  const [pdvsResult, supervisorsResult] = await Promise.all([
    pdvIds.length > 0
      ? supabase.from('pdv').select('id, nombre, clave_btl, zona, estatus, horario_entrada, horario_salida, cadena:cadena_id(id, nombre), ciudad:ciudad_id(id, nombre, estado)').in('id', pdvIds)
      : Promise.resolve({ data: [], error: null }),
    supervisorIds.length > 0
      ? supabase.from('empleado').select('id, nombre_completo').in('id', supervisorIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (pdvsResult.error) throw new Error(pdvsResult.error.message)
  if (supervisorsResult.error) throw new Error(supervisorsResult.error.message)

  const pdvs = new Map(((pdvsResult.data ?? []) as PdvWithRelations[]).map((item) => [item.id, item]))
  const supervisors = new Map(((supervisorsResult.data ?? []) as SupervisorRow[]).map((item) => [item.id, item.nombre_completo]))

  const assignmentsByEmployee = new Map<string, AssignmentMonthRow[]>()
  for (const assignment of assignments) {
    const bucket = assignmentsByEmployee.get(assignment.empleado_id) ?? []
    bucket.push(assignment)
    assignmentsByEmployee.set(assignment.empleado_id, bucket)
  }

  const attendancesByEmployeeDate = new Map<string, AttendanceMonthRow>()
  for (const attendance of attendances.sort(compareLatestCreatedAt)) {
    const key = buildAttendanceKey(attendance.empleado_id, attendance.fecha_operacion)
    if (!attendancesByEmployeeDate.has(key)) {
      attendancesByEmployeeDate.set(key, attendance)
    }
  }

  const requestsByEmployee = new Map<string, SolicitudMonthRow[]>()
  for (const solicitud of solicitudes) {
    const bucket = requestsByEmployee.get(solicitud.empleado_id) ?? []
    bucket.push(solicitud)
    requestsByEmployee.set(solicitud.empleado_id, bucket)
  }

  const discipline = deriveAttendanceDiscipline({
    assignments: assignments.map<AttendanceDisciplineAssignment>((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      pdvId: item.pdv_id,
      cuentaClienteId: item.cuenta_cliente_id,
      supervisorEmpleadoId: item.supervisor_empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      diasLaborales: item.dias_laborales,
      diaDescanso: item.dia_descanso,
      horarioReferencia: item.horario_referencia,
      naturaleza: item.naturaleza,
      prioridad: item.prioridad,
    })),
    attendances: attendances.map<AttendanceDisciplineAttendance>((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      cuentaClienteId: null,
      fechaOperacion: item.fecha_operacion,
      checkInUtc: item.check_in_utc,
      checkOutUtc: item.check_out_utc,
      estatus: item.estatus,
    })),
    solicitudes: solicitudes.map<AttendanceDisciplineSolicitud>((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      estatus: item.estatus,
      metadata: (item.metadata as Record<string, unknown>) ?? {},
    })),
    toleranceMinutes,
    payrollDeductionDays,
    salaries: Array.from(employees.values()).map((item) => ({
      empleadoId: item.id,
      sueldoBaseMensual: item.sueldo_base_mensual,
    })),
    periodStart: lookbackStart,
    periodEnd: monthEnd,
  })

  const tardyDatesByEmployee = new Map<string, Set<string>>()
  const normalAttendanceDatesByEmployee = new Map<string, Set<string>>()
  const frDatesByEmployee = new Map<string, Set<string>>()

  for (const record of discipline.records) {
    if (record.estado === 'RETARDO') {
      const bucket = tardyDatesByEmployee.get(record.empleadoId) ?? new Set<string>()
      bucket.add(record.fecha)
      tardyDatesByEmployee.set(record.empleadoId, bucket)
    }
    if (record.estado === 'ASISTENCIA') {
      const bucket = normalAttendanceDatesByEmployee.get(record.empleadoId) ?? new Set<string>()
      bucket.add(record.fecha)
      normalAttendanceDatesByEmployee.set(record.empleadoId, bucket)
    }
  }

  for (const [empleadoId, tardyDates] of tardyDatesByEmployee.entries()) {
    const drafts = Array.from(tardyDates).sort().map<CellDraft>((fecha) => ({
      fecha,
      codigo: 'AR',
      label: 'Retardo',
      tone: 'amber',
      description: 'Asistencia con retardo confirmado.',
      detailRef: buildDetailRef(empleadoId, fecha),
      hasDetail: true,
      sourceType: 'ASISTENCIA',
      sourceId: attendancesByEmployeeDate.get(buildAttendanceKey(empleadoId, fecha))?.id ?? null,
      isTardy: true,
    }))
    frDatesByEmployee.set(empleadoId, applyFrEscalation(drafts))
  }

  const incapacityMarkersByEmployee = new Map<string, Map<string, IncapacityMarker>>()
  for (const [empleadoId, employeeRequests] of requestsByEmployee.entries()) {
    incapacityMarkersByEmployee.set(
      empleadoId,
      applyIncapacityMarkers(
        employeeRequests,
        normalAttendanceDatesByEmployee.get(empleadoId) ?? new Set<string>(),
        lookbackStart,
        monthEnd
      )
    )
  }

  return {
    month: filters.month,
    monthStart,
    monthEnd,
    calendar,
    employees,
    supervisors,
    assignmentsByEmployee,
    attendancesByEmployeeDate,
    requestsByEmployee,
    incapacityMarkersByEmployee,
    tardyDatesByEmployee,
    frDatesByEmployee,
    pdvs,
    toleranceMinutes,
  }
}
function resolvePrimaryChain(days: MaterializedCalendarDay[], pdvs: Map<string, PdvWithRelations>) {
  const counters = new Map<string, { count: number; latestDate: string }>()
  for (const day of days) {
    if (!day.pdvId) continue
    const cadena = normalizeText(obtenerPrimero(pdvs.get(day.pdvId)?.cadena)?.nombre)
    if (!cadena) continue
    const current = counters.get(cadena) ?? { count: 0, latestDate: '' }
    current.count += 1
    if (day.fecha > current.latestDate) current.latestDate = day.fecha
    counters.set(cadena, current)
  }
  return Array.from(counters.entries())
    .sort((left, right) => right[1].count - left[1].count || right[1].latestDate.localeCompare(left[1].latestDate))[0]?.[0] ?? null
}

function hasApprovedRequestForDate(requests: SolicitudMonthRow[], date: string, predicate: (item: SolicitudMonthRow) => boolean) {
  return requests.find((item) => predicate(item) && overlapsDate(item.fecha_inicio, item.fecha_fin, date)) ?? null
}

function buildCellDraft(
  empleadoId: string,
  employee: EmployeeMonthRow | undefined,
  day: MaterializedCalendarDay,
  todayIso: string,
  assignments: AssignmentMonthRow[],
  attendance: AttendanceMonthRow | null,
  requests: SolicitudMonthRow[],
  incapacityMarker: IncapacityMarker | null,
  isTardy: boolean,
  isFr: boolean
): CellDraft {
  const detailRef = buildDetailRef(empleadoId, day.fecha)
  const sourceId = attendance?.id ?? null
  const activeAssignments = assignments.filter((item) => overlapsDate(item.fecha_inicio, item.fecha_fin, day.fecha))
  const hasAssignment = activeAssignments.length > 0
  const scheduledWorkday = activeAssignments.some((item) => isWorkday(item, day.fecha)) || (day.laborable && day.estadoOperativo === 'ASIGNADA_PDV')

  if (employee?.fecha_baja && day.fecha >= employee.fecha_baja) {
    return { fecha: day.fecha, codigo: 'B', label: labelForCode('B'), tone: toneForCode('B'), description: 'Empleado dado de baja en este tramo.', detailRef, hasDetail: true, sourceType: 'SISTEMA', sourceId: employee.id, isTardy: false }
  }
  if (employee?.fecha_alta && day.fecha < employee.fecha_alta) {
    return { fecha: day.fecha, codigo: 'VC', label: labelForCode('VC'), tone: toneForCode('VC'), description: 'Dia previo al alta; no cuenta para asistencia.', detailRef, hasDetail: true, sourceType: 'SISTEMA', sourceId: employee.id, isTardy: false }
  }
  if (incapacityMarker) {
    return { fecha: day.fecha, codigo: incapacityMarker.code, label: labelForCode(incapacityMarker.code), tone: toneForCode(incapacityMarker.code), description: labelForCode(incapacityMarker.code), detailRef, hasDetail: true, sourceType: 'SOLICITUD', sourceId: incapacityMarker.solicitudId, isTardy: false }
  }

  const vacation = hasApprovedRequestForDate(requests, day.fecha, (item) => item.tipo === 'VACACIONES' && isApprovedSolicitudForCalendar(item))
  if (vacation) {
    return { fecha: day.fecha, codigo: 'V', label: labelForCode('V'), tone: toneForCode('V'), description: 'Vacaciones aprobadas.', detailRef, hasDetail: true, sourceType: 'SOLICITUD', sourceId: vacation.id, isTardy: false }
  }

  const justificada = hasApprovedRequestForDate(requests, day.fecha, (item) => item.tipo !== 'INCAPACIDAD' && isApprovedAttendanceJustification(item))
  if (justificada) {
    return { fecha: day.fecha, codigo: 'JUS', label: labelForCode('JUS'), tone: toneForCode('JUS'), description: 'Falta justificada aprobada.', detailRef, hasDetail: true, sourceType: 'SOLICITUD', sourceId: justificada.id, isTardy: false }
  }

  const feriadoFlag = Boolean(day.flags?.feriado ?? day.flags?.es_feriado ?? day.flags?.holiday)
  if (feriadoFlag) {
    return { fecha: day.fecha, codigo: 'FE', label: labelForCode('FE'), tone: toneForCode('FE'), description: 'Dia feriado configurado.', detailRef, hasDetail: true, sourceType: 'SISTEMA', sourceId: null, isTardy: false }
  }

  if (attendance && (attendance.estatus === 'VALIDA' || attendance.estatus === 'CERRADA')) {
    const code: AttendanceAdminDayCode = isFr ? 'FR' : isTardy ? 'AR' : 'A'
    return { fecha: day.fecha, codigo: code, label: labelForCode(code), tone: toneForCode(code), description: labelForCode(code), detailRef, hasDetail: true, sourceType: 'ASISTENCIA', sourceId, isTardy }
  }

  if (attendance?.estatus === 'PENDIENTE_VALIDACION') {
    return { fecha: day.fecha, codigo: '', label: 'Pendiente de validacion', tone: 'neutral', description: 'Asistencia capturada y pendiente de validacion.', detailRef, hasDetail: true, sourceType: 'ASISTENCIA', sourceId, isTardy: false }
  }

  if (day.estadoOperativo === 'FORMACION') {
    return { fecha: day.fecha, codigo: 'JUS', label: 'Formacion', tone: 'sky', description: day.mensajeOperativo ?? 'Formacion activa del dia.', detailRef, hasDetail: true, sourceType: 'SISTEMA', sourceId: null, isTardy: false }
  }

  if (!hasAssignment && day.estadoOperativo === 'SIN_ASIGNACION') {
    return { fecha: day.fecha, codigo: 'VC', label: labelForCode('VC'), tone: toneForCode('VC'), description: 'Sin asignacion operativa visible en el dia.', detailRef, hasDetail: true, sourceType: 'ASIGNACION', sourceId: null, isTardy: false }
  }

  if (!scheduledWorkday) {
    return { fecha: day.fecha, codigo: 'D', label: labelForCode('D'), tone: toneForCode('D'), description: 'Dia de descanso o no laborable.', detailRef, hasDetail: true, sourceType: 'ASIGNACION', sourceId: activeAssignments[0]?.id ?? null, isTardy: false }
  }

  if (day.fecha > todayIso) {
    return { fecha: day.fecha, codigo: '', label: 'Por operar', tone: 'neutral', description: 'Jornada futura aun no operada.', detailRef, hasDetail: true, sourceType: 'ASIGNACION', sourceId: activeAssignments[0]?.id ?? null, isTardy: false }
  }

  return { fecha: day.fecha, codigo: 'F', label: labelForCode('F'), tone: toneForCode('F'), description: 'Falta sin registro valido de asistencia.', detailRef, hasDetail: true, sourceType: 'ASIGNACION', sourceId: activeAssignments[0]?.id ?? null, isTardy: false }
}

function buildFilterOptions(rows: AttendanceAdminEmployeeRow[], context: AttendanceAdminContext) {
  const supervisors = new Map<string, string>()
  const cadenas = new Set<string>()
  const ciudades = new Set<string>()
  const zonas = new Set<string>()

  for (const row of rows) {
    const employee = context.employees.get(row.empleadoId)
    const supervisorId = employee?.supervisor_empleado_id ?? null
    if (supervisorId && row.supervisor) {
      supervisors.set(supervisorId, row.supervisor)
    }
    if (row.cadenaPrincipalMes) cadenas.add(row.cadenaPrincipalMes)
    const calendarRow = context.calendar.empleados.find((item) => item.empleadoId === row.empleadoId)
    for (const day of calendarRow?.dias ?? []) {
      if (!day.pdvId) continue
      const pdv = context.pdvs.get(day.pdvId)
      const ciudad = normalizeText(obtenerPrimero(pdv?.ciudad)?.nombre)
      const zona = normalizeText(pdv?.zona)
      if (ciudad) ciudades.add(ciudad)
      if (zona) zonas.add(zona)
    }
  }

  return {
    supervisors: [{ value: '', label: 'Todos los supervisores' }, ...Array.from(supervisors.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es-MX')).map(([value, label]) => ({ value, label }))],
    cadenas: [{ value: '', label: 'Todas las cadenas' }, ...Array.from(cadenas).sort((a, b) => a.localeCompare(b, 'es-MX')).map((value) => ({ value, label: value }))],
    ciudades: [{ value: '', label: 'Todas las ciudades' }, ...Array.from(ciudades).sort((a, b) => a.localeCompare(b, 'es-MX')).map((value) => ({ value, label: value }))],
    zonas: [{ value: '', label: 'Todas las zonas' }, ...Array.from(zonas).sort((a, b) => a.localeCompare(b, 'es-MX')).map((value) => ({ value, label: value }))],
  }
}

function buildSummary(rows: AttendanceAdminEmployeeRow[]): AttendanceAdminSummary {
  return rows.reduce<AttendanceAdminSummary>((acc, row) => {
    acc.empleadosVisibles += 1
    for (const day of row.dias) {
      if (day.codigo === 'A') acc.asistencias += 1
      if (day.codigo === 'AR') acc.retardos += 1
      if (day.codigo === 'F') acc.faltas += 1
      if (day.codigo === 'FR') acc.faltasPorRetardo += 1
      if (day.codigo === 'V') acc.vacaciones += 1
      if (day.codigo === 'JUS') acc.justificadas += 1
      if (day.codigo === 'IP' || day.codigo === 'I' || day.codigo === 'ISP' || day.codigo === 'IS') acc.incapacidades += 1
    }
    return acc
  }, {
    empleadosVisibles: 0,
    asistencias: 0,
    retardos: 0,
    faltas: 0,
    faltasPorRetardo: 0,
    vacaciones: 0,
    incapacidades: 0,
    justificadas: 0,
  })
}

export async function obtenerCalendarioAdministrativoAsistencias(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  input: Partial<AttendanceAdminMonthFilters>
): Promise<AttendanceAdminMonthData> {
  let context: AttendanceAdminContext
  try {
    context = await loadAttendanceAdminContext(supabase, actor, input)
  } catch (error) {
    return buildAttendanceAdminFallbackData(
      input,
      error instanceof Error
        ? `No fue posible cargar el calendario administrativo: ${error.message}`
        : 'No fue posible cargar el calendario administrativo.'
    )
  }
  const todayIso = getTodayIso()
  const filters: AttendanceAdminMonthFilters = {
    month: context.month,
    supervisorId: normalizeText(input.supervisorId) ?? null,
    cadena: normalizeText(input.cadena) ?? null,
    zona: normalizeText(input.zona) ?? null,
    ciudad: normalizeText(input.ciudad) ?? null,
    estadoDia: (normalizeText(input.estadoDia) as AttendanceAdminDayCode | null) ?? null,
  }

  let rows = context.calendar.empleados.map<AttendanceAdminEmployeeRow>((item) => {
    const employee = context.employees.get(item.empleadoId)
    const requests = context.requestsByEmployee.get(item.empleadoId) ?? []
    const assignments = context.assignmentsByEmployee.get(item.empleadoId) ?? []
    const incapacityMarkers = context.incapacityMarkersByEmployee.get(item.empleadoId) ?? new Map<string, IncapacityMarker>()
    const tardyDates = context.tardyDatesByEmployee.get(item.empleadoId) ?? new Set<string>()
    const frDates = context.frDatesByEmployee.get(item.empleadoId) ?? new Set<string>()

    const dias = item.dias.map<AttendanceAdminDayCell>((day) => {
      const fechaKey = buildAttendanceKey(item.empleadoId, day.fecha)
      const draft = buildCellDraft(
        item.empleadoId,
        employee,
        day,
        todayIso,
        assignments,
        context.attendancesByEmployeeDate.get(fechaKey) ?? null,
        requests,
        incapacityMarkers.get(day.fecha) ?? null,
        tardyDates.has(day.fecha),
        frDates.has(day.fecha)
      )
      return {
        fecha: draft.fecha,
        codigo: draft.codigo,
        label: draft.label,
        tone: draft.tone,
        hasDetail: draft.hasDetail,
        detailRef: draft.detailRef,
      }
    })

    return {
      empleadoId: item.empleadoId,
      idNomina: employee?.id_nomina ?? null,
      nombre: employee?.nombre_completo ?? item.nombreCompleto,
      supervisor: item.supervisorNombre ?? (employee?.supervisor_empleado_id ? context.supervisors.get(employee.supervisor_empleado_id) ?? null : null),
      cadenaPrincipalMes: resolvePrimaryChain(item.dias, context.pdvs),
      dias,
    }
  })

  if (filters.supervisorId) {
    rows = rows.filter((row) => context.employees.get(row.empleadoId)?.supervisor_empleado_id === filters.supervisorId)
  }
  if (filters.cadena) {
    rows = rows.filter((row) => row.cadenaPrincipalMes === filters.cadena)
  }
  if (filters.zona) {
    rows = rows.filter((row) => (context.calendar.empleados.find((item) => item.empleadoId === row.empleadoId)?.zona ?? null) === filters.zona)
  }
  if (filters.ciudad) {
    rows = rows.filter((row) => {
      const calendarRow = context.calendar.empleados.find((item) => item.empleadoId === row.empleadoId)
      return (calendarRow?.dias ?? []).some((day) => normalizeText(obtenerPrimero(context.pdvs.get(day.pdvId ?? '')?.ciudad)?.nombre) === filters.ciudad)
    })
  }
  if (filters.estadoDia) {
    rows = rows.filter((row) => row.dias.some((day) => day.codigo === filters.estadoDia))
  }

  rows.sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX'))
  const filterOptions = buildFilterOptions(rows, context)

  return {
    month: context.month,
    days: buildMonthHeaders(context.month),
    rows,
    summary: buildSummary(rows),
    filters,
    supervisors: filterOptions.supervisors,
    cadenas: filterOptions.cadenas,
    ciudades: filterOptions.ciudades,
    zonas: filterOptions.zonas,
    estadosDia: DAY_CODE_OPTIONS,
    canExport: true,
    infraestructuraLista: true,
  }
}

export async function obtenerDetalleAdministrativoAsistencia(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  empleadoId: string,
  fecha: string,
  month?: string | null
): Promise<AttendanceAdminDayDetail | null> {
  const normalizedMonth = normalizeMonth(month ?? fecha.slice(0, 7))
  const context = await loadAttendanceAdminContext(supabase, actor, { month: normalizedMonth })
  const calendarRow = context.calendar.empleados.find((item) => item.empleadoId === empleadoId)
  const day = calendarRow?.dias.find((item) => item.fecha === fecha)
  const employee = context.employees.get(empleadoId)
  if (!calendarRow || !day || !employee) return null

  const requests = context.requestsByEmployee.get(empleadoId) ?? []
  const assignments = context.assignmentsByEmployee.get(empleadoId) ?? []
  const incapacityMarker = context.incapacityMarkersByEmployee.get(empleadoId)?.get(fecha) ?? null
  const attendance = context.attendancesByEmployeeDate.get(buildAttendanceKey(empleadoId, fecha)) ?? null
  const draft = buildCellDraft(
    empleadoId,
    employee,
    day,
    getTodayIso(),
    assignments,
    attendance,
    requests,
    incapacityMarker,
    (context.tardyDatesByEmployee.get(empleadoId) ?? new Set<string>()).has(fecha),
    (context.frDatesByEmployee.get(empleadoId) ?? new Set<string>()).has(fecha)
  )
  const pdv = day.pdvId ? context.pdvs.get(day.pdvId) ?? null : null
  const requestSource = draft.sourceType === 'SOLICITUD' ? requests.find((item) => item.id === draft.sourceId) ?? null : null
  const evidencias: AttendanceAdminEvidenceItem[] = []
  if (attendance?.selfie_check_in_url) evidencias.push({ label: 'Selfie de entrada', url: attendance.selfie_check_in_url, kind: 'SELFIE_IN', hash: attendance.selfie_check_in_hash })
  if (attendance?.selfie_check_out_url) evidencias.push({ label: 'Selfie de salida', url: attendance.selfie_check_out_url, kind: 'SELFIE_OUT', hash: attendance.selfie_check_out_hash })
  if (requestSource?.justificante_url) evidencias.push({ label: 'Justificante', url: requestSource.justificante_url, kind: 'JUSTIFICANTE', hash: requestSource.justificante_hash })

  return {
    fecha,
    codigo: draft.codigo,
    descripcion: draft.description,
    pdv: day.pdvClaveBtl ?? pdv?.clave_btl ?? null,
    cadena: normalizeText(obtenerPrimero(pdv?.cadena)?.nombre),
    sucursal: day.pdvNombre ?? pdv?.nombre ?? null,
    horarioEsperado: day.horarioInicio && day.horarioFin ? `${day.horarioInicio} a ${day.horarioFin}` : day.horarioInicio ?? null,
    checkIn: formatHour(attendance?.check_in_utc ?? null),
    checkOut: formatHour(attendance?.check_out_utc ?? null),
    gps: attendance
      ? `${attendance.estado_gps}${attendance.distancia_check_in_metros !== null ? ` · ${Math.round(attendance.distancia_check_in_metros)} m entrada` : ''}${attendance.distancia_check_out_metros !== null ? ` · ${Math.round(attendance.distancia_check_out_metros)} m salida` : ''}`
      : null,
    biometria: attendance ? `${attendance.biometria_estado}${attendance.biometria_score !== null ? ` · score ${attendance.biometria_score}` : ''}` : null,
    supervisor: calendarRow.supervisorNombre ?? (employee.supervisor_empleado_id ? context.supervisors.get(employee.supervisor_empleado_id) ?? null : null),
    sourceType: draft.sourceType,
    sourceId: draft.sourceId,
    evidencias,
  }
}

export async function buildAttendanceAdminExportPayload(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  input: Partial<AttendanceAdminMonthFilters>
): Promise<AttendanceAdminExportPayload> {
  const data = await obtenerCalendarioAdministrativoAsistencias(supabase, actor, input)
  const headers: Array<string | number> = ['ID nomina', 'Nombre', 'Supervisor', 'Cadena principal', ...data.days.flatMap((day) => [`${day.weekdayLetter} ${day.dayNumber}`])]
  const rows = data.rows.map((row) => [
    row.idNomina ?? '',
    row.nombre,
    row.supervisor ?? '',
    row.cadenaPrincipalMes ?? '',
    ...row.dias.map((day) => day.codigo || '-'),
  ])

  return {
    filenameBase: `asistencias-administrativas-${data.month}`,
    headers,
    rows,
    leadingRows: [
      ['Calendario administrativo de asistencias'],
      ['Periodo', data.month],
      ['Generado en', new Date().toLocaleString('es-MX', { timeZone: MEXICO_TZ })],
    ],
    footerRows: [
      [],
      ['Leyenda'],
      ['A', 'Asistencia'],
      ['AR', 'Retardo'],
      ['FR', 'Falta por retardos'],
      ['F', 'Falta'],
      ['JUS', 'Falta justificada'],
      ['V', 'Vacaciones'],
      ['IP / I / ISP / IS', 'Incapacidades pagadas o sin pago'],
      ['D', 'Descanso'],
      ['FE', 'Feriado'],
      ['B', 'Baja'],
      ['VC', 'Vacante / no contable'],
    ],
  }
}
