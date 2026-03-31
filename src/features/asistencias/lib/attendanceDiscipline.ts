import {
  DIA_LABORAL_CODES,
  normalizeDiaLaboralCode,
  parseDiasLaborales,
  type DiaLaboralCode,
} from '@/features/asignaciones/lib/assignmentPlanning'
import { resolveEffectiveAssignmentForEmployeeDate } from '@/features/asignaciones/services/asignacionResolverService'

const MX_TIME_ZONE = 'America/Mexico_City'
const MAX_ADMINISTRATIVE_ABSENCE_BLOCK = 3

export type AttendanceDisciplineStatus =
  | 'ASISTENCIA'
  | 'RETARDO'
  | 'FALTA'
  | 'AUSENCIA_JUSTIFICADA'
  | 'PENDIENTE_VALIDACION'

export interface AttendanceDisciplineAssignment {
  id: string
  empleadoId: string
  pdvId?: string | null
  cuentaClienteId: string | null
  supervisorEmpleadoId: string | null
  fechaInicio: string
  fechaFin: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  diasLaborales: string | null
  diaDescanso: string | null
  horarioReferencia: string | null
  naturaleza?: 'BASE' | 'COBERTURA_TEMPORAL' | 'COBERTURA_PERMANENTE' | 'MOVIMIENTO' | null
  prioridad?: number | null
}

export interface AttendanceDisciplineAttendance {
  id: string
  empleadoId: string
  cuentaClienteId: string | null
  fechaOperacion: string
  checkInUtc: string | null
  checkOutUtc: string | null
  estatus: 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
}

export interface AttendanceDisciplineSolicitud {
  id: string
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  tipo: string
  estatus: string
  metadata: Record<string, unknown>
}

export interface AttendanceDisciplineFormation {
  id: string
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  nombre: string | null
  tipo: string | null
  estatus: string
}

export interface AttendanceDisciplineEmployeeSalary {
  empleadoId: string
  sueldoBaseMensual: number | null
}

export interface AttendanceDisciplineRecord {
  assignmentId: string
  empleadoId: string
  cuentaClienteId: string | null
  supervisorEmpleadoId: string | null
  fecha: string
  tipoAsignacion: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  estado: AttendanceDisciplineStatus
  attendanceId: string | null
  solicitudId: string | null
  minutosRetardo: number | null
  horarioEsperado: string | null
}

export interface AttendanceDisciplineAdministrativeAbsence {
  empleadoId: string
  cuentaClienteId: string | null
  fecha: string
  retardosAcumulados: number
}

export interface AttendanceDisciplineSummary {
  empleadoId: string
  cuentaClienteId: string | null
  retardos: number
  faltas: number
  ausenciasJustificadas: number
  pendientesValidacion: number
  faltasAdministrativas: number
  deduccionSugerida: number
}

export interface AttendanceDisciplineResult {
  records: AttendanceDisciplineRecord[]
  administrativeAbsences: AttendanceDisciplineAdministrativeAbsence[]
  summaries: AttendanceDisciplineSummary[]
}

function normalizeDate(value: string) {
  return value.slice(0, 10)
}

function getDayCode(value: string): DiaLaboralCode {
  const date = new Date(`${value}T12:00:00Z`)
  const day = date.getUTCDay()
  return DIA_LABORAL_CODES[day === 0 ? 6 : day - 1]
}

function buildCompositeKey(empleadoId: string, cuentaClienteId: string | null) {
  return `${empleadoId}::${cuentaClienteId ?? 'sin-cuenta'}`
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

function overlapsRange(startA: string, endA: string | null, startB: string, endB: string) {
  const normalizedEndA = endA ?? '9999-12-31'
  return startA <= endB && startB <= normalizedEndA
}

function isWorkday(assignment: AttendanceDisciplineAssignment, date: string) {
  const dayCode = getDayCode(date)
  const descanso = normalizeDiaLaboralCode(assignment.diaDescanso)
  if (descanso && descanso === dayCode) {
    return false
  }

  const parsed = parseDiasLaborales(assignment.diasLaborales)
  if (parsed.dias.length === 0) {
    return true
  }

  return parsed.dias.includes(dayCode)
}

function parseScheduledStartMinutes(horario: string | null) {
  const normalized = String(horario ?? '').trim()
  if (!normalized) {
    return null
  }

  const match = normalized.match(/(\d{1,2}):(\d{2})/)
  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  return hours * 60 + minutes
}

function extractLocalMinutes(isoValue: string | null) {
  if (!isoValue) {
    return null
  }

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: MX_TIME_ZONE,
  })
  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? NaN)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? NaN)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }

  return hour * 60 + minute
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function isApprovedJustification(solicitud: AttendanceDisciplineSolicitud) {
  if (!['REGISTRADA_RH', 'REGISTRADA'].includes(solicitud.estatus)) {
    return false
  }

  const metadata = normalizeMetadata(solicitud.metadata)
  return Boolean(metadata.justifica_asistencia)
}

function isOperationalFormation(formation: AttendanceDisciplineFormation) {
  return ['PROGRAMADA', 'EN_CURSO'].includes(formation.estatus)
}

function getAssignmentPriority(assignment: AttendanceDisciplineAssignment) {
  if (Number.isFinite(assignment.prioridad)) {
    return Number(assignment.prioridad)
  }

  if (assignment.naturaleza === 'COBERTURA_TEMPORAL' || assignment.naturaleza === 'MOVIMIENTO') {
    return 200
  }

  if (assignment.naturaleza === 'COBERTURA_PERMANENTE') {
    return 150
  }

  return 100
}

function getAssignmentTypeWeight(tipo: AttendanceDisciplineAssignment['tipo']) {
  if (tipo === 'COBERTURA') {
    return 3
  }

  if (tipo === 'ROTATIVA') {
    return 2
  }

  return 1
}

function normalizeResolvedAssignmentType(value: string | null | undefined): 'FIJA' | 'ROTATIVA' | 'COBERTURA' {
  if (value === 'ROTATIVA' || value === 'COBERTURA') {
    return value
  }

  return 'FIJA'
}

export function deriveAttendanceDiscipline({
  assignments,
  attendances,
  solicitudes,
  formaciones = [],
  toleranceMinutes,
  payrollDeductionDays,
  salaries,
  periodStart,
  periodEnd,
}: {
  assignments: AttendanceDisciplineAssignment[]
  attendances: AttendanceDisciplineAttendance[]
  solicitudes: AttendanceDisciplineSolicitud[]
  formaciones?: AttendanceDisciplineFormation[]
  toleranceMinutes: number
  payrollDeductionDays: number
  salaries: AttendanceDisciplineEmployeeSalary[]
  periodStart: string
  periodEnd: string
}): AttendanceDisciplineResult {
  const relevantAssignments = assignments.filter((assignment) =>
    overlapsRange(assignment.fechaInicio, assignment.fechaFin, periodStart, periodEnd)
  )

  const attendanceMap = new Map<string, AttendanceDisciplineAttendance>()
  for (const attendance of attendances) {
    attendanceMap.set(
      `${attendance.empleadoId}::${attendance.cuentaClienteId ?? 'sin-cuenta'}::${normalizeDate(attendance.fechaOperacion)}`,
      attendance
    )
  }

  const requestsForResolver = solicitudes.map((solicitud) => ({
    id: solicitud.id,
    empleadoId: solicitud.empleadoId,
    fechaInicio: solicitud.fechaInicio,
    fechaFin: solicitud.fechaFin,
    tipo: solicitud.tipo,
    estatus: solicitud.estatus,
    metadata: solicitud.metadata,
  }))

  const formationsForResolver = formaciones.map((formacion) => ({
    id: formacion.id,
    fechaInicio: formacion.fechaInicio,
    fechaFin: formacion.fechaFin,
    estado: formacion.estatus,
    nombre: formacion.nombre,
    tipo: formacion.tipo,
    metadata: {},
    participantes: null,
  }))

  const salaryMap = new Map(salaries.map((item) => [item.empleadoId, item.sueldoBaseMensual ?? 0]))
  const records: AttendanceDisciplineRecord[] = []
  const scheduledDayKeys = new Set<string>()
  const employeeContexts = new Map<string, { puesto: null; pdvIds: Set<string> }>()
  const assignmentsForResolver = relevantAssignments.map((assignment) => ({
    id: assignment.id,
    empleado_id: assignment.empleadoId,
    cuenta_cliente_id: assignment.cuentaClienteId,
    supervisor_empleado_id: assignment.supervisorEmpleadoId,
    pdv_id: assignment.pdvId,
    fecha_inicio: assignment.fechaInicio,
    fecha_fin: assignment.fechaFin,
    tipo: assignment.tipo,
    dias_laborales: assignment.diasLaborales,
    dia_descanso: assignment.diaDescanso,
    horario_referencia: assignment.horarioReferencia,
    naturaleza: assignment.naturaleza,
    prioridad: assignment.prioridad,
  }))

  const attendanceByEmployeeDate = new Map<string, AttendanceDisciplineAttendance>()
  for (const attendance of attendances) {
    attendanceByEmployeeDate.set(
      `${attendance.empleadoId}::${normalizeDate(attendance.fechaOperacion)}`,
      attendance
    )
  }

  for (const assignment of relevantAssignments) {
    const effectiveStart = assignment.fechaInicio < periodStart ? periodStart : assignment.fechaInicio
    const effectiveEnd = (assignment.fechaFin ?? periodEnd) > periodEnd ? periodEnd : (assignment.fechaFin ?? periodEnd)

    const context = employeeContexts.get(assignment.empleadoId) ?? { puesto: null, pdvIds: new Set<string>() }
    if (assignment.pdvId) {
      context.pdvIds.add(assignment.pdvId)
    }
    employeeContexts.set(assignment.empleadoId, context)

    for (const date of listDatesInclusive(effectiveStart, effectiveEnd)) {
      if (!isWorkday(assignment, date)) {
        continue
      }

      scheduledDayKeys.add(`${assignment.empleadoId}::${date}`)
    }
  }

  for (const scheduledKey of scheduledDayKeys) {
    const [empleadoId, date] = scheduledKey.split('::')
    if (!empleadoId || !date) {
      continue
    }

    const context = employeeContexts.get(empleadoId)
    if (!context) {
      continue
    }

    const resolved = resolveEffectiveAssignmentForEmployeeDate(
      {
        empleadoId,
        puesto: context.puesto,
        pdvIds: Array.from(context.pdvIds),
      },
      date,
      assignmentsForResolver,
      requestsForResolver,
      formationsForResolver
    )

    if (resolved.estadoOperativo === 'SIN_ASIGNACION') {
      continue
    }

    const attendance =
      attendanceMap.get(`${empleadoId}::${resolved.cuentaClienteId ?? 'sin-cuenta'}::${date}`) ??
      attendanceByEmployeeDate.get(`${empleadoId}::${date}`) ??
      null
    const scheduledStart = parseScheduledStartMinutes(resolved.assignment?.horario_referencia ?? null)
    const actualStart = extractLocalMinutes(attendance?.checkInUtc ?? null)
    const latenessMinutes =
      scheduledStart !== null && actualStart !== null ? Math.max(0, actualStart - scheduledStart) : null

    let estado: AttendanceDisciplineStatus = 'FALTA'

    if (
      resolved.estadoOperativo === 'FORMACION' ||
      resolved.estadoOperativo === 'INCAPACIDAD' ||
      resolved.estadoOperativo === 'VACACIONES' ||
      resolved.estadoOperativo === 'FALTA_JUSTIFICADA'
    ) {
      estado = 'AUSENCIA_JUSTIFICADA'
    } else if (attendance?.estatus === 'VALIDA' || attendance?.estatus === 'CERRADA') {
      estado = latenessMinutes !== null && latenessMinutes > toleranceMinutes ? 'RETARDO' : 'ASISTENCIA'
    } else if (attendance?.estatus === 'PENDIENTE_VALIDACION') {
      estado = 'PENDIENTE_VALIDACION'
    }

    records.push({
      assignmentId: resolved.assignment?.id ?? resolved.referenciaId ?? `${empleadoId}:${date}`,
      empleadoId,
      cuentaClienteId: resolved.cuentaClienteId,
      supervisorEmpleadoId: resolved.supervisorEmpleadoId,
      fecha: date,
      tipoAsignacion: normalizeResolvedAssignmentType(resolved.assignment?.tipo),
      estado,
      attendanceId: attendance?.id ?? null,
      solicitudId: resolved.request?.id ?? resolved.formation?.id ?? null,
      minutosRetardo: estado === 'RETARDO' ? latenessMinutes : null,
      horarioEsperado: resolved.assignment?.horario_referencia ?? null,
    })
  }
  records.sort((left, right) => {
    const composite = buildCompositeKey(left.empleadoId, left.cuentaClienteId).localeCompare(
      buildCompositeKey(right.empleadoId, right.cuentaClienteId)
    )
    if (composite !== 0) {
      return composite
    }

    return left.fecha.localeCompare(right.fecha)
  })

  const administrativeAbsences: AttendanceDisciplineAdministrativeAbsence[] = []
  const retardosByEmployee = new Map<string, AttendanceDisciplineRecord[]>()

  for (const record of records) {
    if (record.estado !== 'RETARDO') {
      continue
    }

    const key = buildCompositeKey(record.empleadoId, record.cuentaClienteId)
    const bucket = retardosByEmployee.get(key) ?? []
    bucket.push(record)
    retardosByEmployee.set(key, bucket)
  }

  for (const [key, retardos] of retardosByEmployee.entries()) {
    const [empleadoId, cuentaClienteValue] = key.split('::')
    for (let index = MAX_ADMINISTRATIVE_ABSENCE_BLOCK - 1; index < retardos.length; index += MAX_ADMINISTRATIVE_ABSENCE_BLOCK) {
      administrativeAbsences.push({
        empleadoId,
        cuentaClienteId: cuentaClienteValue === 'sin-cuenta' ? null : cuentaClienteValue,
        fecha: retardos[index].fecha,
        retardosAcumulados: index + 1,
      })
    }
  }

  const administrativeAbsenceMap = new Map<string, number>()
  for (const absence of administrativeAbsences) {
    const key = buildCompositeKey(absence.empleadoId, absence.cuentaClienteId)
    administrativeAbsenceMap.set(key, (administrativeAbsenceMap.get(key) ?? 0) + 1)
  }

  const summaryMap = new Map<string, AttendanceDisciplineSummary>()
  for (const record of records) {
    const key = buildCompositeKey(record.empleadoId, record.cuentaClienteId)
    const current = summaryMap.get(key) ?? {
      empleadoId: record.empleadoId,
      cuentaClienteId: record.cuentaClienteId,
      retardos: 0,
      faltas: 0,
      ausenciasJustificadas: 0,
      pendientesValidacion: 0,
      faltasAdministrativas: 0,
      deduccionSugerida: 0,
    }

    if (record.estado === 'RETARDO') {
      current.retardos += 1
    } else if (record.estado === 'FALTA') {
      current.faltas += 1
    } else if (record.estado === 'AUSENCIA_JUSTIFICADA') {
      current.ausenciasJustificadas += 1
    } else if (record.estado === 'PENDIENTE_VALIDACION') {
      current.pendientesValidacion += 1
    }

    summaryMap.set(key, current)
  }

  for (const [key, summary] of summaryMap.entries()) {
    const faltasAdministrativas = administrativeAbsenceMap.get(key) ?? 0
    summary.faltasAdministrativas = faltasAdministrativas
    const sueldoMensual = salaryMap.get(summary.empleadoId) ?? 0
    const sueldoDiario = sueldoMensual > 0 ? sueldoMensual / 30 : 0
    const totalPenaltyDays = (summary.faltas + summary.faltasAdministrativas) * payrollDeductionDays
    summary.deduccionSugerida = Number((sueldoDiario * totalPenaltyDays).toFixed(2))
  }

  return {
    records,
    administrativeAbsences,
    summaries: Array.from(summaryMap.values()).sort((left, right) => {
      if (right.faltas !== left.faltas) {
        return right.faltas - left.faltas
      }

      if (right.faltasAdministrativas !== left.faltasAdministrativas) {
        return right.faltasAdministrativas - left.faltasAdministrativas
      }

      return right.retardos - left.retardos
    }),
  }
}
