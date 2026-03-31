export type EmpleadoWorkflowStage =
  | 'PENDIENTE_COORDINACION'
  | 'SELECCION_APROBADA'
  | 'PENDIENTE_IMSS_NOMINA'
  | 'EN_FLUJO_IMSS'
  | 'PENDIENTE_VALIDACION_FINAL'
  | 'PENDIENTE_ACCESO_ADMIN'
  | 'RECLUTAMIENTO_CORRECCION_ALTA'
  | 'ALTA_CANCELADA'
  | 'PENDIENTE_BAJA_IMSS'
  | 'RECLUTAMIENTO_CORRECCION_BAJA'
  | 'BAJA_IMSS_CERRADA'

export type EmployeeMovementType = 'ALTA' | 'BAJA'

export type RecruitingInboxLaneKey =
  | 'altas-nuevas'
  | 'en-revision'
  | 'devueltas-por-nomina'
  | 'cancelados'
  | 'bajas-solicitadas'
  | 'bajas-devueltas'

export type PayrollInboxLaneKey =
  | 'altas-imss'
  | 'altas-en-proceso'
  | 'altas-observadas'
  | 'bajas-pendientes'
  | 'devueltas-a-reclutamiento'
  | 'cerradas'

export interface WorkflowInboxEmployee {
  id: string
  nombreCompleto: string
  nss: string | null
  curp: string | null
  puesto: string
  zona: string | null
  supervisor: string | null
  fechaAlta: string | null
  fechaBaja: string | null
  expedienteEstado: string
  expedienteObservaciones: string | null
  imssEstado: string
  imssObservaciones: string | null
  workflowStage: string | null
  documentosCount: number
  documentos: readonly unknown[]
  adminAccessPending: boolean
  estadoCuenta: string | null
  workflowCancelReason?: string | null
  workflowCancelAt?: string | null
  workflowCancelFromStage?: string | null
}

export interface EmployeeInboxItem<TEmployee extends WorkflowInboxEmployee = WorkflowInboxEmployee> {
  id: string
  movementType: EmployeeMovementType
  stage: EmpleadoWorkflowStage | null
  statusLabel: string
  submittedAt: string | null
  employeeSummary: {
    nombreCompleto: string
    nss: string | null
    curp: string | null
    puesto: string
    zona: string | null
    supervisor: string | null
  }
  lastObservation: string | null
  documentsSummary: string
  cta: string
  employee: TEmployee
}

export interface InboxLane<TKey extends string, TEmployee extends WorkflowInboxEmployee = WorkflowInboxEmployee> {
  key: TKey
  label: string
  description: string
  items: Array<EmployeeInboxItem<TEmployee>>
}

export type EmployeeRecruitingInboxData<TEmployee extends WorkflowInboxEmployee = WorkflowInboxEmployee> = Array<InboxLane<RecruitingInboxLaneKey, TEmployee>>
export type EmployeePayrollInboxData<TEmployee extends WorkflowInboxEmployee = WorkflowInboxEmployee> = Array<InboxLane<PayrollInboxLaneKey, TEmployee>>

const RECRUITING_LANES: Record<RecruitingInboxLaneKey, { label: string; description: string }> = {
  'altas-nuevas': {
    label: 'Altas nuevas',
    description: 'Expedientes listos para enviar o ya enviados a Nomina.',
  },
  'en-revision': {
    label: 'En revision',
    description: 'Expedientes observados internamente antes del envio.',
  },
  'devueltas-por-nomina': {
    label: 'Devueltas por Nomina',
    description: 'Altas devueltas para corregir datos o soportes.',
  },
  cancelados: {
    label: 'Cancelados',
    description: 'Candidatos que declinaron o cuyo alta se detuvo antes del cierre final.',
  },
  'bajas-solicitadas': {
    label: 'Bajas solicitadas',
    description: 'Bajas enviadas a Nomina y pendientes de cierre institucional.',
  },
  'bajas-devueltas': {
    label: 'Bajas devueltas',
    description: 'Solicitudes de baja devueltas para correccion.',
  },
}

const PAYROLL_LANES: Record<PayrollInboxLaneKey, { label: string; description: string }> = {
  'altas-imss': {
    label: 'Altas IMSS pendientes',
    description: 'Expedientes listos para iniciar o completar alta IMSS.',
  },
  'altas-en-proceso': {
    label: 'Altas en proceso',
    description: 'Altas IMSS abiertas y todavia sin cierre.',
  },
  'altas-observadas': {
    label: 'Altas con error',
    description: 'Altas con incidencias o soportes incompletos.',
  },
  'bajas-pendientes': {
    label: 'Bajas pendientes',
    description: 'Bajas recibidas por Nomina para cierre institucional.',
  },
  'devueltas-a-reclutamiento': {
    label: 'Devueltas a Reclutamiento',
    description: 'Movimientos observados por Nomina y devueltos.',
  },
  cerradas: {
    label: 'Cerradas',
    description: 'Movimientos ya cerrados o listos para Administracion.',
  },
}

function buildItem<TEmployee extends WorkflowInboxEmployee>(employee: TEmployee): EmployeeInboxItem<TEmployee> {
  const movementType: EmployeeMovementType =
    employee.workflowStage === 'PENDIENTE_BAJA_IMSS' ||
    employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA' ||
    employee.workflowStage === 'BAJA_IMSS_CERRADA'
      ? 'BAJA'
      : 'ALTA'

  const submittedAt =
    movementType === 'BAJA'
      ? employee.fechaBaja ?? employee.fechaAlta
      : employee.fechaAlta

  const lastObservation = employee.imssObservaciones ?? employee.expedienteObservaciones ?? null
  const effectiveLastObservation = lastObservation ?? employee.workflowCancelReason ?? null

  const statusLabel =
    movementType === 'BAJA'
      ? employee.workflowStage === 'BAJA_IMSS_CERRADA'
        ? 'Baja cerrada'
        : employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA'
          ? 'Baja observada'
          : 'Baja pendiente'
      : employee.workflowStage === 'ALTA_CANCELADA'
        ? 'Alta cancelada'
      : employee.workflowStage === 'PENDIENTE_COORDINACION'
        ? 'Pendiente coordinacion'
      : employee.workflowStage === 'PENDIENTE_VALIDACION_FINAL'
        ? 'Pendiente validacion final'
      : employee.workflowStage === 'SELECCION_APROBADA'
        ? 'Seleccion aprobada'
      : employee.workflowStage === 'PENDIENTE_ACCESO_ADMIN'
        ? 'Alta IMSS cerrada'
        : employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
          ? 'Alta observada'
          : employee.imssEstado === 'ERROR'
            ? 'Alta con error'
            : employee.imssEstado === 'EN_PROCESO'
              ? 'Alta en proceso'
              : 'Alta pendiente'

  const documentsSummary =
    employee.documentosCount === 1 ? '1 documento' : `${employee.documentosCount} documentos`

  return {
    id: employee.id,
    movementType,
    stage: normalizeWorkflowStage(employee.workflowStage),
    statusLabel,
    submittedAt,
    employeeSummary: {
      nombreCompleto: employee.nombreCompleto,
      nss: employee.nss,
      curp: employee.curp,
      puesto: employee.puesto,
      zona: employee.zona,
      supervisor: employee.supervisor,
    },
    lastObservation: effectiveLastObservation,
    documentsSummary,
    cta: movementType === 'BAJA' ? 'Abrir baja' : 'Abrir alta',
    employee,
  }
}

function buildRecruitingLane<TEmployee extends WorkflowInboxEmployee>(
  key: RecruitingInboxLaneKey,
  items: TEmployee[]
): InboxLane<RecruitingInboxLaneKey, TEmployee> {
  return {
    key,
    label: RECRUITING_LANES[key].label,
    description: RECRUITING_LANES[key].description,
    items: items.map(buildItem),
  }
}

function buildPayrollLane<TEmployee extends WorkflowInboxEmployee>(
  key: PayrollInboxLaneKey,
  items: TEmployee[]
): InboxLane<PayrollInboxLaneKey, TEmployee> {
  return {
    key,
    label: PAYROLL_LANES[key].label,
    description: PAYROLL_LANES[key].description,
    items: items.map(buildItem),
  }
}

export function normalizeWorkflowStage(value: string | null | undefined): EmpleadoWorkflowStage | null {
  switch (value) {
    case 'PENDIENTE_COORDINACION':
    case 'PENDIENTE_IMSS_NOMINA':
    case 'EN_FLUJO_IMSS':
    case 'SELECCION_APROBADA':
    case 'PENDIENTE_VALIDACION_FINAL':
    case 'PENDIENTE_ACCESO_ADMIN':
    case 'RECLUTAMIENTO_CORRECCION_ALTA':
    case 'ALTA_CANCELADA':
    case 'PENDIENTE_BAJA_IMSS':
    case 'RECLUTAMIENTO_CORRECCION_BAJA':
    case 'BAJA_IMSS_CERRADA':
      return value
    default:
      return null
  }
}

export function normalizeRecruitingInboxKey(value: string | null | undefined): RecruitingInboxLaneKey | 'ALL' {
  switch (value) {
    case 'altas-nuevas':
    case 'en-revision':
    case 'devueltas-por-nomina':
    case 'cancelados':
    case 'bajas-solicitadas':
    case 'bajas-devueltas':
      return value
    default:
      return 'ALL'
  }
}

export function normalizePayrollInboxKey(value: string | null | undefined): PayrollInboxLaneKey | 'ALL' {
  switch (value) {
    case 'altas-imss':
    case 'altas-en-proceso':
    case 'altas-observadas':
    case 'bajas-pendientes':
    case 'devueltas-a-reclutamiento':
    case 'cerradas':
      return value
    default:
      return 'ALL'
  }
}

export function buildRecruitingInbox(
  employees: WorkflowInboxEmployee[]
): EmployeeRecruitingInboxData
export function buildRecruitingInbox<TEmployee extends WorkflowInboxEmployee>(
  employees: TEmployee[]
): EmployeeRecruitingInboxData<TEmployee>
export function buildRecruitingInbox<TEmployee extends WorkflowInboxEmployee>(
  employees: TEmployee[]
): EmployeeRecruitingInboxData<TEmployee> {
  const altasNuevas = employees.filter(
    (employee) =>
      employee.workflowStage === 'PENDIENTE_COORDINACION' ||
      employee.workflowStage === 'SELECCION_APROBADA' ||
      employee.workflowStage === 'PENDIENTE_IMSS_NOMINA' ||
      (employee.expedienteEstado === 'EN_REVISION' && !employee.workflowStage)
  )
  const enRevision = employees.filter(
    (employee) =>
      employee.workflowStage === 'PENDIENTE_VALIDACION_FINAL' ||
      (employee.expedienteEstado === 'EN_REVISION' &&
        employee.workflowStage !== 'RECLUTAMIENTO_CORRECCION_ALTA')
  )
  const devueltas = employees.filter(
    (employee) => employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
  )
  const cancelados = employees.filter(
    (employee) => employee.workflowStage === 'ALTA_CANCELADA'
  )
  const bajasSolicitadas = employees.filter(
    (employee) => employee.workflowStage === 'PENDIENTE_BAJA_IMSS'
  )
  const bajasDevueltas = employees.filter(
    (employee) => employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA'
  )

  return [
    buildRecruitingLane('altas-nuevas', altasNuevas),
    buildRecruitingLane('en-revision', enRevision),
    buildRecruitingLane('devueltas-por-nomina', devueltas),
    buildRecruitingLane('cancelados', cancelados),
    buildRecruitingLane('bajas-solicitadas', bajasSolicitadas),
    buildRecruitingLane('bajas-devueltas', bajasDevueltas),
  ]
}

export function buildPayrollInbox(
  employees: WorkflowInboxEmployee[]
): EmployeePayrollInboxData
export function buildPayrollInbox<TEmployee extends WorkflowInboxEmployee>(
  employees: TEmployee[]
): EmployeePayrollInboxData<TEmployee>
export function buildPayrollInbox<TEmployee extends WorkflowInboxEmployee>(
  employees: TEmployee[]
): EmployeePayrollInboxData<TEmployee> {
  const altasPendientes = employees.filter(
    (employee) => employee.workflowStage === 'PENDIENTE_IMSS_NOMINA'
  )
  const altasEnProceso = employees.filter(
    (employee) => employee.workflowStage === 'EN_FLUJO_IMSS'
  )
  const altasObservadas = employees.filter(
    (employee) => employee.imssEstado === 'ERROR'
  )
  const bajasPendientes = employees.filter(
    (employee) => employee.workflowStage === 'PENDIENTE_BAJA_IMSS'
  )
  const devueltas = employees.filter(
    (employee) =>
      employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA' ||
      employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA'
  )
  const cerradas = employees.filter(
    (employee) =>
      employee.workflowStage === 'PENDIENTE_VALIDACION_FINAL' ||
      employee.workflowStage === 'PENDIENTE_ACCESO_ADMIN' ||
      employee.workflowStage === 'BAJA_IMSS_CERRADA'
  )

  return [
    buildPayrollLane('altas-imss', altasPendientes),
    buildPayrollLane('altas-en-proceso', altasEnProceso),
    buildPayrollLane('altas-observadas', altasObservadas),
    buildPayrollLane('bajas-pendientes', bajasPendientes),
    buildPayrollLane('devueltas-a-reclutamiento', devueltas),
    buildPayrollLane('cerradas', cerradas),
  ]
}
