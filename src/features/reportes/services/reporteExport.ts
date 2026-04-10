import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import {
  getMaterializedMonthlyCalendar,
  type MaterializedCalendarDay,
} from '@/features/asignaciones/services/asignacionMaterializationService'
import type {
  Asignacion,
  Asistencia,
  Cadena,
  Ciudad,
  CuentaCliente,
  Empleado,
  Pdv,
} from '@/types/database'
import {
  obtenerPanelReportes,
  type ReportesPanelData,
} from './reporteService'

export type ExportSectionKey =
  | 'clientes'
  | 'asistencias'
  | 'ventas'
  | 'campanas'
  | 'ranking_ventas'
  | 'ranking_cuotas'
  | 'gastos'
  | 'love'
  | 'nomina'
  | 'calendario_operativo'
  | 'bitacora'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ReportExportXlsxConfig {
  leadingRows?: Array<Array<string | number | null>>
  merges?: string[]
  freezeCell?: string
  columnWidths?: number[]
  footerRows?: Array<Array<string | number | null>>
  theme?: 'default' | 'operational_calendar'
  calendar?: {
    staticColumnCount: number
    dayColumnCount: number
    summaryColumnCount: number
    dayDates: string[]
  }
}

export interface ReportExportSheet {
  name: string
  headers: string[]
  rows: Array<Array<string | number | null>>
  xlsx?: ReportExportXlsxConfig
}

export interface ReportExportPayload {
  filenameBase: string
  headers: string[]
  rows: Array<Array<string | number | null>>
  sheetName?: string
  xlsx?: ReportExportXlsxConfig
  extraSheets?: ReportExportSheet[]
}

type MaybeMany<T> = T | T[] | null

type ExportAssignmentRow = Pick<
  Asignacion,
  | 'id'
  | 'empleado_id'
  | 'pdv_id'
  | 'cuenta_cliente_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'dias_laborales'
  | 'dia_descanso'
  | 'horario_referencia'
  | 'naturaleza'
  | 'prioridad'
  | 'estado_publicacion'
>

type ExportEmployeeRow = Pick<Empleado, 'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'zona'>
type ExportAttendanceRow = Pick<Asistencia, 'empleado_id' | 'fecha_operacion' | 'estatus' | 'check_in_utc'>
type ExportCuentaClienteRow = Pick<CuentaCliente, 'id' | 'nombre'>
type ExportCadenaRow = Pick<Cadena, 'id' | 'nombre'>
type ExportCiudadRow = Pick<Ciudad, 'id' | 'nombre' | 'estado'>

type ExportPdvRow = Pick<Pdv, 'id' | 'nombre' | 'clave_btl' | 'horario_entrada' | 'horario_salida'> & {
  cadena: MaybeMany<ExportCadenaRow>
  ciudad: MaybeMany<ExportCiudadRow>
}

const WEEKDAY_CODES = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const
const WEEKDAY_SHORT_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const CALENDAR_STATIC_HEADERS = [
  'CADENA',
  'ID PDV',
  'SUCURSAL',
  'NOMBRE DC',
  '# DC',
  'ROL',
  'SUPERVISOR',
  'COORDINADOR',
  'CIUDAD',
  'ESTADO',
  'HORARIO',
  'DIAS',
  'DESCANSO',
  'OBSERVACIONES',
] as const

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

function weekdayCodeFromDate(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  return WEEKDAY_CODES[date.getUTCDay()] ?? 'DOM'
}

function weekdayShortFromDate(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  return WEEKDAY_SHORT_LABELS[date.getUTCDay()] ?? 'D'
}

function getMexicoToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatMonthTitle(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .toUpperCase()
}

function formatWeekdays(raw: string | null) {
  if (!raw) {
    return ''
  }

  return raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .join('-')
}

function normalizeAttendanceHour(value: string | null) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(new Date(value))
}

function chooseReferenceAssignment(rows: ExportAssignmentRow[]) {
  const natureRank: Record<ExportAssignmentRow['naturaleza'], number> = {
    COBERTURA_TEMPORAL: 3,
    COBERTURA_PERMANENTE: 2,
    BASE: 1,
    MOVIMIENTO: 0,
  }

  return [...rows].sort((left, right) => {
    const priorityDiff = (right.prioridad ?? 0) - (left.prioridad ?? 0)
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    const natureDiff = (natureRank[right.naturaleza] ?? 0) - (natureRank[left.naturaleza] ?? 0)
    if (natureDiff !== 0) {
      return natureDiff
    }

    return String(right.fecha_inicio).localeCompare(String(left.fecha_inicio))
  })[0] ?? null
}

function deriveMonthlyDcFactor(rows: ExportAssignmentRow[]) {
  const distinctPdvs = new Set(rows.map((item) => item.pdv_id).filter(Boolean))
  const pdvCount = distinctPdvs.size

  if (pdvCount <= 1) {
    return 1
  }

  return Number((1 / pdvCount).toFixed(2))
}
function buildDayObservationSummary(label: string, dates: string[]) {
  if (dates.length === 0) {
    return null
  }

  return `${label}: ${dates.map((item) => item.slice(-2)).join(',')}`
}

function buildObservationSummary(input: {
  descanso: string[]
  incapacidad: string[]
  vacaciones: string[]
  formacion: string[]
  justificada: string[]
  falta: string[]
  cumpleanos: string[]
  sinAsignacion: string[]
}) {
  return [
    buildDayObservationSummary('DESC', input.descanso),
    buildDayObservationSummary('INC', input.incapacidad),
    buildDayObservationSummary('VAC', input.vacaciones),
    buildDayObservationSummary('FORM', input.formacion),
    buildDayObservationSummary('JUST', input.justificada),
    buildDayObservationSummary('FAL', input.falta),
    buildDayObservationSummary('CUMP', input.cumpleanos),
    buildDayObservationSummary('SIN', input.sinAsignacion),
  ]
    .filter((item): item is string => Boolean(item))
    .join(' | ')
}

function buildOperationalCalendarHeaders(days: string[]) {
  return [
    ...CALENDAR_STATIC_HEADERS,
    ...days.map((date) => String(Number(date.slice(-2)))),
    '# LAB',
    '# INC',
    '# VAC',
    '# FORM',
    '# JUST',
    '# FAL',
    '# SIN',
  ]
}

function buildOperationalCalendarLeadingRows(month: string, days: string[]) {
  const totalColumns = CALENDAR_STATIC_HEADERS.length + days.length + 7
  const leadingRow = Array.from({ length: totalColumns }, () => '')
  const weekdayRow = Array.from({ length: totalColumns }, () => '')
  const staticWidth = CALENDAR_STATIC_HEADERS.length

  leadingRow[staticWidth] = formatMonthTitle(month)
  days.forEach((date, index) => {
    weekdayRow[staticWidth + index] = weekdayShortFromDate(date)
  })

  return [leadingRow, weekdayRow]
}

function buildOperationalCalendarColumnWidths(days: string[]) {
  return [
    18,
    16,
    28,
    28,
    12,
    14,
    24,
    24,
    16,
    16,
    16,
    14,
    12,
    40,
    ...days.map(() => 5),
    8,
    8,
    8,
    8,
    8,
    8,
    8,
  ]
}

function buildOperationalCalendarLegendRows() {
  return [
    [' '],
    ['LEYENDA OPERATIVA'],
    ['RET', 'Retardo', 'INC', 'Incapacidad aprobada', 'VAC', 'Vacaciones aprobadas', 'FOR', 'Formacion'],
    ['JUS', 'Falta justificada', 'FAL', 'Falta', 'SIN', 'Sin asignacion', 'DES', 'Descanso'],
  ]
}
function parseExpectedCheckInMinutes(day: MaterializedCalendarDay) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(day.horarioInicio ?? '')
  if (!match) {
    return null
  }

  return Number(match[1]) * 60 + Number(match[2])
}

function buildOperationalCalendarSummarySheet(input: {
  periodo: string
  rows: Array<Array<string | number | null>>
  dayCount: number
}) : ReportExportSheet {
  const { periodo, rows, dayCount } = input
  const totalDc = rows.length
  const uniqueChains = new Set(rows.map((row) => String(row[0] ?? '')).filter(Boolean)).size
  const uniquePdvs = new Set(rows.map((row) => String(row[1] ?? '')).filter(Boolean)).size
  const summaryStart = 14 + dayCount
  const sumAt = (offset: number) => rows.reduce((acc, row) => acc + Number(row[summaryStart + offset] ?? 0), 0)
  const executiveRows: Array<Array<string | number | null>> = [
    ['Mes', formatMonthTitle(periodo)],
    ['Dermoconsejeras visibles', totalDc],
    ['Cadenas visibles', uniqueChains],
    ['PDVs visibles', uniquePdvs],
    ['Jornadas laborando', sumAt(0)],
    ['Incapacidades', sumAt(1)],
    ['Vacaciones', sumAt(2)],
    ['Formaciones', sumAt(3)],
    ['Faltas justificadas', sumAt(4)],
    ['Faltas', sumAt(5)],
    ['Sin asignacion', sumAt(6)],
    [' ', ' '],
    ['Codigo', 'Significado'],
    ['RET', 'Retardo'],
    ['INC', 'Incapacidad aprobada'],
    ['VAC', 'Vacaciones aprobadas'],
    ['FOR', 'Formacion'],
    ['JUS', 'Falta justificada'],
    ['FAL', 'Falta'],
    ['SIN', 'Sin asignacion'],
    ['DES', 'Descanso'],
  ]

  return {
    name: 'resumen',
    headers: ['Concepto', 'Valor'],
    rows: executiveRows,
    xlsx: {
      theme: 'default',
      columnWidths: [28, 34],
    },
  }
}

function parseActualCheckInMinutes(checkInUtc: string | null) {
  const value = normalizeAttendanceHour(checkInUtc)
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) {
    return null
  }

  return Number(match[1]) * 60 + Number(match[2])
}

function isRestLikeDay(day: MaterializedCalendarDay, referenceAssignment: ExportAssignmentRow | null) {
  if (day.estadoOperativo !== 'SIN_ASIGNACION' || day.laborable) {
    return false
  }

  const descansoCode = String(referenceAssignment?.dia_descanso ?? '').trim().toUpperCase()
  const weekday = weekdayCodeFromDate(day.fecha)
  if (descansoCode && weekday === descansoCode) {
    return true
  }

  const diasLaborables = String(referenceAssignment?.dias_laborales ?? '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)

  return diasLaborables.length > 0 && !diasLaborables.includes(weekday)
}

function buildCalendarCellCode(input: {
  day: MaterializedCalendarDay
  referenceAssignment: ExportAssignmentRow | null
  attendance: ExportAttendanceRow | null
  today: string
}) {
  const { day, referenceAssignment, attendance, today } = input

  if (day.estadoOperativo === 'FORMACION') {
    return 'FOR'
  }
  if (day.estadoOperativo === 'INCAPACIDAD') {
    return 'INC'
  }
  if (day.estadoOperativo === 'VACACIONES') {
    return 'VAC'
  }
  if (day.estadoOperativo === 'FALTA_JUSTIFICADA') {
    return 'JUS'
  }
  if (day.estadoOperativo === 'SIN_ASIGNACION') {
    return isRestLikeDay(day, referenceAssignment) ? 'DES' : 'SIN'
  }

  if (attendance?.estatus === 'PENDIENTE_VALIDACION') {
    return 'PEND'
  }

  const expectedMinutes = parseExpectedCheckInMinutes(day)
  const actualMinutes = parseActualCheckInMinutes(attendance?.check_in_utc ?? null)
  if (
    attendance &&
    (attendance.estatus === 'VALIDA' || attendance.estatus === 'CERRADA') &&
    expectedMinutes !== null &&
    actualMinutes !== null &&
    actualMinutes - expectedMinutes > 15
  ) {
    return 'RET'
  }

  if (day.fecha < today && !attendance) {
    return 'FAL'
  }

  return '1'
}

function countCodes(codes: string[], targets: string[]) {
  const targetSet = new Set(targets)
  return codes.filter((item) => targetSet.has(item)).length
}

function obtenerPrimero<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function toColumnName(index: number) {
  let value = index
  let output = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    value = Math.floor((value - 1) / 26)
  }

  return output
}

function mapSectionRows(section: ExportSectionKey, data: ReportesPanelData) {
  switch (section) {
    case 'clientes':
      return data.clientes.map((item) => [item.cuentaCliente, item.identificador, item.jornadasValidas, item.jornadasPendientes, item.ventasConfirmadas, item.montoConfirmado, item.cuotasCumplidas, item.netoNominaEstimado])
    case 'asistencias':
      return data.asistencias.map((item) => [item.periodo, item.empleado, item.idNomina, item.puesto, item.cuentaCliente, item.pdv, item.jornadasValidas, item.jornadasCerradas, item.jornadasPendientes, item.retardos, item.ausenciasJustificadas, item.faltas, item.totalJornadas])
    case 'ventas':
      return data.ventas.map((item) => [item.periodo, item.dc, item.idNomina, item.puesto, item.cuentaCliente, item.pdv, item.producto, item.ventasConfirmadas, item.unidadesConfirmadas, item.montoConfirmado])
    case 'campanas':
      return data.campanas.map((item) => [item.periodo, item.campana, item.pdv, item.dc, item.estatus, item.avancePorcentaje, item.tareasPendientes, item.evidenciasPendientes])
    case 'ranking_ventas':
      return data.rankingVentas.map((item) => [item.empleado, item.idNomina, item.puesto, item.cuentaCliente, item.ventasConfirmadas, item.unidadesConfirmadas, item.montoConfirmado])
    case 'ranking_cuotas':
      return data.rankingCuotas.map((item) => [item.empleado, item.idNomina, item.puesto, item.cuentaCliente, item.cuotaEstado, item.cumplimiento, item.bonoEstimado, item.jornadasValidas, item.jornadasPendientes, item.retardos, item.ausenciasJustificadas, item.faltas])
    case 'gastos':
      return data.gastos.map((item) => [item.periodo, item.zona, item.tipo, item.registros, item.montoSolicitado, item.montoAprobado, item.montoReembolsado])
    case 'love':
      return data.love.map((item) => [item.periodo, item.dc, item.pdv, item.afiliaciones, item.validas, item.pendientes, item.duplicadas])
    case 'nomina':
      return data.nomina.map((item) => [item.periodo, item.empleado, item.idNomina, item.puesto, item.cuentaCliente, item.percepciones, item.deducciones, item.neto, item.jornadasValidas, item.jornadasPendientes, item.retardos, item.ausenciasJustificadas, item.faltas, item.movimientos])
    case 'calendario_operativo':
      return []
    case 'bitacora':
      return data.bitacora.map((item) => [item.fecha, item.tabla, item.accion, item.registroId, item.cuentaCliente, item.usuario, item.resumen])
  }
}

function buildSectionHeaders(section: ExportSectionKey) {
  switch (section) {
    case 'clientes':
      return ['cliente', 'identificador', 'jornadas_validas', 'jornadas_pendientes', 'ventas_confirmadas', 'monto_confirmado', 'cuotas_cumplidas', 'neto_nomina_estimado']
    case 'asistencias':
      return ['periodo', 'empleado', 'id_nomina', 'puesto', 'cuenta_cliente', 'pdv', 'jornadas_validas', 'jornadas_cerradas', 'jornadas_pendientes', 'retardos', 'ausencias_justificadas', 'faltas', 'total_jornadas']
    case 'ventas':
      return ['periodo', 'dc', 'id_nomina', 'puesto', 'cuenta_cliente', 'pdv', 'producto', 'ventas_confirmadas', 'unidades_confirmadas', 'monto_confirmado']
    case 'campanas':
      return ['periodo', 'campana', 'pdv', 'dc', 'estatus', 'avance_porcentaje', 'tareas_pendientes', 'evidencias_pendientes']
    case 'ranking_ventas':
      return ['empleado', 'id_nomina', 'puesto', 'cuenta_cliente', 'ventas_confirmadas', 'unidades_confirmadas', 'monto_confirmado']
    case 'ranking_cuotas':
      return ['empleado', 'id_nomina', 'puesto', 'cuenta_cliente', 'cuota_estado', 'cumplimiento', 'bono_estimado', 'jornadas_validas', 'jornadas_pendientes', 'retardos', 'ausencias_justificadas', 'faltas']
    case 'gastos':
      return ['periodo', 'zona', 'tipo', 'registros', 'monto_solicitado', 'monto_aprobado', 'monto_reembolsado']
    case 'love':
      return ['periodo', 'dc', 'pdv', 'afiliaciones', 'validas', 'pendientes', 'duplicadas']
    case 'nomina':
      return ['periodo', 'empleado', 'id_nomina', 'puesto', 'cuenta_cliente', 'percepciones', 'deducciones', 'neto', 'jornadas_validas', 'jornadas_pendientes', 'retardos', 'ausencias_justificadas', 'faltas', 'movimientos']
    case 'calendario_operativo':
      return []
    case 'bitacora':
      return ['fecha', 'tabla', 'accion', 'registro_id', 'cuenta_cliente', 'usuario', 'resumen']
  }
}

export function isExportSectionKey(value: string): value is ExportSectionKey {
  return ['clientes', 'asistencias', 'ventas', 'campanas', 'ranking_ventas', 'ranking_cuotas', 'gastos', 'love', 'nomina', 'calendario_operativo', 'bitacora'].includes(value)
}

export function isExportFormat(value: string): value is ExportFormat {
  return value === 'csv' || value === 'xlsx' || value === 'pdf'
}

async function collectOperationalCalendarExportPayload(
  supabase: SupabaseClient,
  periodo: string
): Promise<ReportExportPayload> {
  const calendar = await getMaterializedMonthlyCalendar({ month: periodo })
  const headers = buildOperationalCalendarHeaders(calendar.dias)

  if (calendar.empleados.length === 0) {
    return {
      filenameBase: `calendario-operativo-${periodo}`,
      headers,
      rows: [],
      sheetName: 'calendario',
      xlsx: {
        leadingRows: buildOperationalCalendarLeadingRows(periodo, calendar.dias),
        theme: 'operational_calendar',
        calendar: {
          staticColumnCount: CALENDAR_STATIC_HEADERS.length,
          dayColumnCount: calendar.dias.length,
          summaryColumnCount: 7,
          dayDates: calendar.dias,
        },
        columnWidths: buildOperationalCalendarColumnWidths(calendar.dias),
        footerRows: buildOperationalCalendarLegendRows(),
      },
      extraSheets: [buildOperationalCalendarSummarySheet({ periodo, rows: [], dayCount: calendar.dias.length })],
    }
  }

  const employeeIds = calendar.empleados.map((item) => item.empleadoId)
  const fechaInicio = startOfMonth(periodo)
  const fechaFin = endOfMonth(periodo)

  const [employeesResult, assignmentsResult, attendancesResult] = await Promise.all([
    supabase.from('empleado').select('id, id_nomina, nombre_completo, puesto, zona').in('id', employeeIds),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, cuenta_cliente_id, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, naturaleza, prioridad, estado_publicacion')
      .in('empleado_id', employeeIds)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${fechaInicio}`),
    supabase
      .from('asistencia')
      .select('empleado_id, fecha_operacion, estatus, check_in_utc')
      .in('empleado_id', employeeIds)
      .gte('fecha_operacion', fechaInicio)
      .lte('fecha_operacion', fechaFin),
  ])

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message)
  }
  if (attendancesResult.error) {
    throw new Error(attendancesResult.error.message)
  }

  const employees = (employeesResult.data ?? []) as ExportEmployeeRow[]
  const assignments = (assignmentsResult.data ?? []) as ExportAssignmentRow[]
  const attendances = (attendancesResult.data ?? []) as ExportAttendanceRow[]

  const referenceAssignmentByEmployee = new Map<string, ExportAssignmentRow | null>()
  const referencePdvIds = new Set<string>()
  const referenceCuentaIds = new Set<string>()

  for (const empleadoId of employeeIds) {
    const reference = chooseReferenceAssignment(assignments.filter((item) => item.empleado_id === empleadoId))
    referenceAssignmentByEmployee.set(empleadoId, reference)
    if (reference?.pdv_id) {
      referencePdvIds.add(reference.pdv_id)
    }
    if (reference?.cuenta_cliente_id) {
      referenceCuentaIds.add(reference.cuenta_cliente_id)
    }
  }

  const [pdvsResult, cuentasResult] = await Promise.all([
    referencePdvIds.size > 0
      ? supabase
          .from('pdv')
          .select('id, nombre, clave_btl, horario_entrada, horario_salida, cadena:cadena_id(id, nombre), ciudad:ciudad_id(id, nombre, estado)')
          .in('id', Array.from(referencePdvIds))
      : Promise.resolve({ data: [], error: null }),
    referenceCuentaIds.size > 0
      ? supabase.from('cuenta_cliente').select('id, nombre').in('id', Array.from(referenceCuentaIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (pdvsResult.error) {
    throw new Error(pdvsResult.error.message)
  }
  if (cuentasResult.error) {
    throw new Error(cuentasResult.error.message)
  }

  const employeeById = new Map(employees.map((item) => [item.id, item]))
  const attendanceByEmployeeDate = new Map(attendances.map((item) => [`${item.empleado_id}::${item.fecha_operacion}`, item]))
  const pdvById = new Map(((pdvsResult.data ?? []) as ExportPdvRow[]).map((item) => [item.id, item]))
  const cuentaById = new Map(((cuentasResult.data ?? []) as ExportCuentaClienteRow[]).map((item) => [item.id, item.nombre]))
  const today = getMexicoToday()

  const rows = calendar.empleados.map((employee) => {
    const employeeRecord = employeeById.get(employee.empleadoId)
    const employeeAssignments = assignments.filter((item) => item.empleado_id === employee.empleadoId)
    const referenceAssignment = referenceAssignmentByEmployee.get(employee.empleadoId) ?? null
    const referencePdv = referenceAssignment?.pdv_id ? pdvById.get(referenceAssignment.pdv_id) ?? null : null
    const codes: string[] = []
    const specialDays = {
      descanso: [] as string[],
      incapacidad: [] as string[],
      vacaciones: [] as string[],
      formacion: [] as string[],
      justificada: [] as string[],
      falta: [] as string[],
      cumpleanos: [] as string[],
      sinAsignacion: [] as string[],
    }

    const dayCells = employee.dias.map((day) => {
      const attendance = attendanceByEmployeeDate.get(`${employee.empleadoId}::${day.fecha}`) ?? null
      const code = buildCalendarCellCode({ day, referenceAssignment, attendance, today })
      codes.push(code)

      if (code === 'DES') {
        specialDays.descanso.push(day.fecha)
      } else if (code === 'INC') {
        specialDays.incapacidad.push(day.fecha)
      } else if (code === 'VAC') {
        specialDays.vacaciones.push(day.fecha)
      } else if (code === 'FOR') {
        specialDays.formacion.push(day.fecha)
      } else if (code === 'JUS') {
        specialDays.justificada.push(day.fecha)
      } else if (code === 'FAL') {
        specialDays.falta.push(day.fecha)
      } else if (code === 'SIN') {
        specialDays.sinAsignacion.push(day.fecha)
      }

      if (Boolean(day.flags?.cumpleanos)) {
        specialDays.cumpleanos.push(day.fecha)
      }

      return code
    })

    const firstDayWithSchedule = employee.dias.find((day) => day.horarioInicio || day.horarioFin)
    const horario = referenceAssignment?.horario_referencia
      ?? (referencePdv?.horario_entrada && referencePdv?.horario_salida
        ? `${referencePdv.horario_entrada} a ${referencePdv.horario_salida}`
        : firstDayWithSchedule
          ? `${firstDayWithSchedule.horarioInicio ?? ''}${firstDayWithSchedule.horarioFin ? ` a ${firstDayWithSchedule.horarioFin}` : ''}`.trim()
          : '')

    return [
      cuentaById.get(referenceAssignment?.cuenta_cliente_id ?? '') ?? 'Sin cuenta',
      referencePdv?.clave_btl ?? employee.dias.find((day) => day.pdvClaveBtl)?.pdvClaveBtl ?? '',
      referencePdv?.nombre ?? employee.dias.find((day) => day.pdvNombre)?.pdvNombre ?? '',
      employeeRecord?.nombre_completo ?? employee.nombreCompleto,
      deriveMonthlyDcFactor(employeeAssignments),
      employeeRecord?.puesto ?? 'DERMOCONSEJERO',
      employee.supervisorNombre ?? 'Sin supervisor',
      employee.coordinadorNombre ?? 'Sin coordinador',
      obtenerPrimero(referencePdv?.ciudad)?.nombre ?? '',
      obtenerPrimero(referencePdv?.ciudad)?.estado ?? '',
      horario,
      formatWeekdays(referenceAssignment?.dias_laborales ?? null),
      String(referenceAssignment?.dia_descanso ?? '').trim().toUpperCase(),
      buildObservationSummary(specialDays),
      ...dayCells,
      countCodes(codes, ['1', 'RET', 'PEND']),
      countCodes(codes, ['INC']),
      countCodes(codes, ['VAC']),
      countCodes(codes, ['FOR']),
      countCodes(codes, ['JUS']),
      countCodes(codes, ['FAL']),
      countCodes(codes, ['SIN']),
    ]
  })
  const staticWidth = CALENDAR_STATIC_HEADERS.length
  const monthTitleStartColumn = staticWidth + 1
  const monthTitleEndColumn = staticWidth + Math.max(calendar.dias.length, 1)

  return {
    filenameBase: `calendario-operativo-${periodo}`,
    headers,
    rows,
    sheetName: 'calendario',
    xlsx: {
      leadingRows: buildOperationalCalendarLeadingRows(periodo, calendar.dias),
      merges: calendar.dias.length > 0
        ? [`${toColumnName(monthTitleStartColumn)}1:${toColumnName(monthTitleEndColumn)}1`]
        : [],
      freezeCell: `${toColumnName(staticWidth + 1)}4`,
      columnWidths: buildOperationalCalendarColumnWidths(calendar.dias),
      theme: 'operational_calendar',
      calendar: {
        staticColumnCount: CALENDAR_STATIC_HEADERS.length,
        dayColumnCount: calendar.dias.length,
        summaryColumnCount: 7,
        dayDates: calendar.dias,
      },
      footerRows: buildOperationalCalendarLegendRows(),
    },
    extraSheets: [buildOperationalCalendarSummarySheet({ periodo, rows, dayCount: calendar.dias.length })],
  }
}

export async function collectReportExportPayload(
  supabase: SupabaseClient,
  actor: ActorActual,
  section: ExportSectionKey,
  periodo: string
): Promise<ReportExportPayload> {
  if (section === 'calendario_operativo') {
    return collectOperationalCalendarExportPayload(supabase, periodo)
  }

  const firstPage = await obtenerPanelReportes(supabase, {
    actor,
    period: periodo,
    page: 1,
    pageSize: 100,
  })

  if (!firstPage.infraestructuraLista) {
    throw new Error(firstPage.mensajeInfraestructura ?? 'No fue posible preparar la exportacion.')
  }

  const rows = [...mapSectionRows(section, firstPage)]
  for (let page = 2; page <= firstPage.paginacion.totalPages; page += 1) {
    const chunk = await obtenerPanelReportes(supabase, {
      actor,
      period: periodo,
      page,
      pageSize: 100,
    })
    rows.push(...mapSectionRows(section, chunk))
  }

  return {
    filenameBase: `${section}-${firstPage.filtros.periodo}`,
    headers: buildSectionHeaders(section),
    rows,
  }
}







