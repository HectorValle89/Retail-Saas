import {
  buildWeekBucket,
  countWeeklyLaborDays,
  diasSeSolapan,
  normalizeDiaLaboralCode,
  parseDiasLaborales,
  rangesOverlap,
} from './assignmentPlanning'

export interface AsignacionValidable {
  id?: string | null
  cuenta_cliente_id: string | null
  empleado_id?: string | null
  pdv_id: string
  supervisor_empleado_id?: string | null
  tipo?: string | null
  fecha_inicio: string
  fecha_fin: string | null
  dias_laborales?: string | null
  dia_descanso?: string | null
  horario_referencia?: string | null
}

export interface SupervisorAsignacionRow {
  pdv_id: string
  activo: boolean
  fecha_fin: string | null
  empleado_id?: string | null
}

export type AssignmentIssueSeverity = 'ERROR' | 'ALERTA' | 'AVISO'

export interface AssignmentIssue {
  code: string
  severity: AssignmentIssueSeverity
  label: string
  message: string
}

export interface AssignmentComparableRow {
  id: string
  empleado_id: string
  pdv_id: string
  supervisor_empleado_id: string | null
  tipo: string
  fecha_inicio: string
  fecha_fin: string | null
  dias_laborales: string | null
}

export interface AssignmentValidationEmployee {
  id: string
  puesto: string | null
  estatus_laboral: string | null
  telefono: string | null
  correo_electronico: string | null
}

export interface AssignmentValidationPdv {
  id: string
  estatus: string | null
  radio_tolerancia_metros: number | null
  cadena_codigo: string | null
  factor_cuota_default: number | null
}

export interface AsignacionValidationContext {
  employee: AssignmentValidationEmployee | null
  pdv: AssignmentValidationPdv | null
  pdvsConGeocerca: Set<string>
  supervisoresPorPdv: Record<string, SupervisorAsignacionRow[]>
  comparableAssignments?: AssignmentComparableRow[]
  historicalAssignmentsForPdv?: AssignmentComparableRow[]
  horariosPorPdv?: Record<string, number>
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function createIssue(
  severity: AssignmentIssueSeverity,
  code: string,
  label: string,
  message: string
): AssignmentIssue {
  return { severity, code, label, message }
}

export function obtenerReferenciaValidacion(fechaInicio: string, today = getTodayIsoDate()) {
  return fechaInicio > today ? fechaInicio : today
}

export function tieneSupervisorVigente(
  supervisores: SupervisorAsignacionRow[] | undefined,
  referencia: string
) {
  return Boolean(
    supervisores?.some(
      (supervisor) => supervisor.activo && (!supervisor.fecha_fin || supervisor.fecha_fin >= referencia)
    )
  )
}

function hasOverlappingMandatoryAssignment(
  asignacion: AsignacionValidable,
  comparables: AssignmentComparableRow[]
) {
  const currentEmployeeId = asignacion.empleado_id ?? null

  if (!currentEmployeeId) {
    return false
  }

  const currentDias = parseDiasLaborales(asignacion.dias_laborales ?? null).dias

  return comparables.some((item) => {
    if (item.id === asignacion.id || item.empleado_id !== currentEmployeeId) {
      return false
    }

    if (!rangesOverlap(asignacion.fecha_inicio, asignacion.fecha_fin, item.fecha_inicio, item.fecha_fin)) {
      return false
    }

    const comparableDias = parseDiasLaborales(item.dias_laborales ?? null).dias
    return diasSeSolapan(currentDias, comparableDias)
  })
}

function hasRotativaOverload(
  asignacion: AsignacionValidable,
  comparables: AssignmentComparableRow[]
) {
  if (asignacion.tipo !== 'ROTATIVA' || !asignacion.empleado_id) {
    return false
  }

  const currentBucket = buildWeekBucket(asignacion.fecha_inicio)
  const pdvs = new Set<string>([asignacion.pdv_id])

  for (const comparable of comparables) {
    if (
      comparable.id === asignacion.id ||
      comparable.empleado_id !== asignacion.empleado_id ||
      comparable.tipo !== 'ROTATIVA'
    ) {
      continue
    }

    if (buildWeekBucket(comparable.fecha_inicio) !== currentBucket) {
      continue
    }

    pdvs.add(comparable.pdv_id)
  }

  return pdvs.size > 3
}

export function evaluarReglasAsignacion(
  asignacion: AsignacionValidable,
  context: AsignacionValidationContext
) {
  const issues: AssignmentIssue[] = []
  const referencia = obtenerReferenciaValidacion(asignacion.fecha_inicio)
  const pdv = context.pdv
  const employee = context.employee
  const comparables = context.comparableAssignments ?? []
  const historicalAssignments = context.historicalAssignmentsForPdv ?? []
  const diasLaborales = parseDiasLaborales(asignacion.dias_laborales ?? null)
  const diaDescanso = normalizeDiaLaboralCode(asignacion.dia_descanso ?? null)

  if (!pdv) {
    issues.push(
      createIssue(
        'ERROR',
        'PDV_INEXISTENTE',
        'PDV inexistente',
        'El PDV seleccionado no existe en el catalogo operativo.'
      )
    )
  }

  if (!employee) {
    issues.push(
      createIssue(
        'ERROR',
        'EMPLEADO_INEXISTENTE',
        'Empleado inexistente',
        'El empleado seleccionado no existe en el catalogo operativo.'
      )
    )
  }

  if (!asignacion.cuenta_cliente_id) {
    issues.push(
      createIssue(
        'ERROR',
        'SIN_CUENTA_CLIENTE',
        'Sin cuenta cliente',
        'La asignacion no tiene cuenta cliente operativa asociada.'
      )
    )
  }

  if (pdv && pdv.estatus !== 'ACTIVO') {
    issues.push(
      createIssue(
        'ERROR',
        'PDV_INACTIVO',
        'PDV inactivo',
        'El PDV seleccionado esta inactivo y no puede publicarse.'
      )
    )
  }

  if (employee?.estatus_laboral === 'BAJA') {
    issues.push(
      createIssue(
        'ERROR',
        'DC_DADO_DE_BAJA',
        'DC dado de baja',
        'El empleado tiene estatus de baja y no puede asignarse.'
      )
    )
  }

  if (employee && employee.puesto !== 'DERMOCONSEJERO') {
    issues.push(
      createIssue(
        'ERROR',
        'DC_SIN_ROL_DC',
        'DC sin rol DC',
        'La asignacion solo acepta empleados con puesto DERMOCONSEJERO.'
      )
    )
  }

  if (!context.pdvsConGeocerca.has(asignacion.pdv_id)) {
    issues.push(
      createIssue(
        'ERROR',
        'PDV_SIN_GEOCERCA',
        'PDV sin geocerca',
        'El PDV no tiene geocerca completa para operar check-in.'
      )
    )
  }

  if (!tieneSupervisorVigente(context.supervisoresPorPdv[asignacion.pdv_id], referencia)) {
    issues.push(
      createIssue(
        'ERROR',
        'PDV_SIN_SUPERVISOR',
        'PDV sin supervisor activo',
        'No existe un supervisor vigente para este PDV en la referencia operativa.'
      )
    )
  }

  if (diasLaborales.invalidTokens.length > 0 || diasLaborales.duplicates.length > 0) {
    issues.push(
      createIssue(
        'ERROR',
        'DIAS_LABORALES_INVALIDOS',
        'Dias laborales invalidos',
        'Los dias laborales contienen valores no reconocidos o repetidos.'
      )
    )
  }

  if (asignacion.dia_descanso && !diaDescanso) {
    issues.push(
      createIssue(
        'ERROR',
        'DESCANSOS_CONTRADICTORIOS',
        'Descansos contradictorios',
        'El dia de descanso no tiene un formato valido.'
      )
    )
  } else if (diaDescanso && diasLaborales.dias.includes(diaDescanso)) {
    issues.push(
      createIssue(
        'ERROR',
        'DESCANSOS_CONTRADICTORIOS',
        'Descansos contradictorios',
        'El dia de descanso tambien aparece como dia laboral.'
      )
    )
  }

  if (asignacion.fecha_fin && asignacion.fecha_fin < asignacion.fecha_inicio) {
    issues.push(
      createIssue(
        'ERROR',
        'VIGENCIA_INVALIDA',
        'Vigencia invalida',
        'La fecha fin no puede ser anterior a la fecha inicio.'
      )
    )
  }

  if (hasOverlappingMandatoryAssignment(asignacion, comparables)) {
    issues.push(
      createIssue(
        'ERROR',
        'DOBLE_ASIGNACION_OBLIGATORIA',
        'Doble asignacion obligatoria',
        'El empleado ya tiene otra asignacion en conflicto dentro del mismo rango.'
      )
    )
  }

  if (pdv && (!pdv.factor_cuota_default || pdv.factor_cuota_default <= 0)) {
    issues.push(
      createIssue(
        'ERROR',
        'CUOTA_INVALIDA',
        'Cuota invalida',
        'La cadena del PDV no tiene un factor de cuota valido para operar.'
      )
    )
  }

  if (employee && (!employee.telefono || !employee.correo_electronico)) {
    issues.push(
      createIssue(
        'ALERTA',
        'DC_SIN_CONTACTO',
        'DC sin contacto',
        'El empleado no tiene telefono y correo completos en su expediente.'
      )
    )
  }

  if (
    pdv?.radio_tolerancia_metros !== null &&
    pdv?.radio_tolerancia_metros !== undefined &&
    (pdv.radio_tolerancia_metros < 50 || pdv.radio_tolerancia_metros > 300)
  ) {
    issues.push(
      createIssue(
        'ALERTA',
        'GEOCERCA_FUERA_DE_RANGO',
        'Geocerca fuera de rango',
        'El radio configurado de geocerca esta fuera del rango operativo recomendado.'
      )
    )
  }

  if (hasRotativaOverload(asignacion, comparables)) {
    issues.push(
      createIssue(
        'ALERTA',
        'ROTATIVA_SOBRECARGADA',
        'Rotativa sobrecargada',
        'El DC supera tres PDVs rotativos en la misma semana.'
      )
    )
  }

  if (countWeeklyLaborDays(diasLaborales.dias) >= 7) {
    issues.push(
      createIssue(
        'ALERTA',
        'SIN_DESCANSO_SEMANAL',
        'Sin descanso semanal',
        'La combinacion de dias laborales deja a la asignacion sin descanso semanal.'
      )
    )
  }

  if (
    pdv?.cadena_codigo === 'SAN_PABLO' &&
    (context.horariosPorPdv?.[asignacion.pdv_id] ?? 0) === 0 &&
    !asignacion.horario_referencia
  ) {
    issues.push(
      createIssue(
        'ALERTA',
        'PDV_SIN_HORARIOS_SAN_PABLO',
        'PDV sin horarios San Pablo',
        'Este PDV de San Pablo no tiene horario semanal cargado ni turno de referencia.'
      )
    )
  }

  if (historicalAssignments.length === 0) {
    issues.push(
      createIssue(
        'AVISO',
        'PRIMERA_ASIGNACION_PDV',
        'Primera asignacion en PDV',
        'No existe historial previo de asignaciones para este PDV.'
      )
    )
  }

  const lastAssignment = historicalAssignments.find((item) => item.id !== asignacion.id) ?? null
  if (
    lastAssignment?.supervisor_empleado_id &&
    asignacion.supervisor_empleado_id &&
    lastAssignment.supervisor_empleado_id !== asignacion.supervisor_empleado_id
  ) {
    issues.push(
      createIssue(
        'AVISO',
        'CAMBIO_SUPERVISOR',
        'Cambio de supervisor',
        'La asignacion cambia el supervisor historico mas reciente del PDV.'
      )
    )
  }

  return issues
}

export function evaluarValidacionesAsignacion(
  asignacion: AsignacionValidable,
  context: AsignacionValidationContext
) {
  return evaluarReglasAsignacion(asignacion, context)
    .filter((issue) => issue.severity === 'ERROR')
    .map((issue) => issue.label)
}

export function resumirIssuesAsignacion(issues: AssignmentIssue[]) {
  return {
    errores: issues.filter((issue) => issue.severity === 'ERROR'),
    alertas: issues.filter((issue) => issue.severity === 'ALERTA'),
    avisos: issues.filter((issue) => issue.severity === 'AVISO'),
  }
}

export function requiereConfirmacionAlertas(issues: AssignmentIssue[]) {
  return resumirIssuesAsignacion(issues).alertas.length > 0
}
