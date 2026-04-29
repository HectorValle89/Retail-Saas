import {
  resolveRecruitingAltaPipelineStage,
  resolveRecruitingBajaPipelineStage,
} from './recruitingPipeline'

export type EmpleadoWorkflowStage =
  | 'NUEVOS'
  | 'EXPEDIENTE'
  | 'EN_GESTION'
  | 'ONBOARDING'
  | 'ALTA_CANCELADA'
  | 'PENDIENTE_COORDINACION'
  | 'SELECCION_APROBADA'
  | 'PENDIENTE_IMSS_NOMINA'
  | 'EN_FLUJO_IMSS'
  | 'PENDIENTE_VALIDACION_FINAL'
  | 'PENDIENTE_ACCESO_ADMIN'
  | 'ALTA_IMSS_CERRADA'
  | 'RECLUTAMIENTO_CORRECCION_ALTA'
  | 'PENDIENTE_BAJA_IMSS'
  | 'RECLUTAMIENTO_CORRECCION_BAJA'
  | 'BAJA_IMSS_CERRADA'

export type EmployeeMovementType = 'ALTA' | 'BAJA'

export type RecruitingInboxLaneKey =
  | 'cancelados-devueltos'

export type PayrollInboxLaneKey =
  | 'altas-imss'
  | 'bajas-pendientes'
  | 'bajas-devueltas'
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
  onboarding: {
    accesosExternosStatus: string | null
    expedienteCompletoRecibido: boolean
    contratoStatus: string | null
  }
  documentosCount: number
  documentos: readonly unknown[]
  adminAccessPending: boolean
  estadoCuenta: string | null
  recruitmentSource?: string | null
  candidateProfileSource?: string | null
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
  'cancelados-devueltos': {
    label: 'Cancelados / Devueltos',
    description: 'Altas detenidas o regresadas al flujo que pueden reactivarse con trazabilidad.',
  },
}

const PAYROLL_LANES: Record<PayrollInboxLaneKey, { label: string; description: string }> = {
  'altas-imss': {
    label: 'Altas IMSS pendientes',
    description: 'Altas enviadas desde Reclutamiento que Nomina debe revisar y cerrar.',
  },
  'bajas-pendientes': {
    label: 'Bajas pendientes',
    description: 'Bajas recibidas por Nomina para cierre institucional.',
  },
  'bajas-devueltas': {
    label: 'Bajas devueltas',
    description: 'Bajas regresadas a Reclutamiento por documentos incompletos o inconsistentes.',
  },
  'devueltas-a-reclutamiento': {
    label: 'Devueltas a Reclutamiento',
    description: 'Altas devueltas a Reclutamiento para correccion.',
  },
  cerradas: {
    label: 'Cerradas',
    description: 'Movimientos ya cerrados, finalizados o listos para Administracion.',
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
          ? 'Baja devuelta'
          : 'Baja pendiente'
      : employee.workflowStage === 'ALTA_CANCELADA'
        ? 'Alta cancelada'
        : employee.workflowStage === 'ONBOARDING' || employee.workflowStage === 'PENDIENTE_VALIDACION_FINAL'
          ? 'Onboarding'
          : employee.workflowStage === 'EN_GESTION' || employee.workflowStage === 'PENDIENTE_IMSS_NOMINA' || employee.workflowStage === 'EN_FLUJO_IMSS'
            ? 'En gestión'
        : employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
          ? 'Alta devuelta'
      : employee.workflowStage === 'PENDIENTE_ACCESO_ADMIN'
        ? 'Alta cerrada'
        : employee.workflowStage === 'ALTA_IMSS_CERRADA'
          ? 'Alta finalizada'
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
  switch (value?.trim().toUpperCase()) {
    case 'NUEVOS':
    case 'EXPEDIENTE':
    case 'EN_GESTION':
    case 'ONBOARDING':
    case 'ALTA_CANCELADA':
    case 'PENDIENTE_COORDINACION':
    case 'SELECCION_APROBADA':
    case 'PENDIENTE_IMSS_NOMINA':
    case 'EN_FLUJO_IMSS':
    case 'PENDIENTE_VALIDACION_FINAL':
    case 'PENDIENTE_ACCESO_ADMIN':
    case 'ALTA_IMSS_CERRADA':
    case 'RECLUTAMIENTO_CORRECCION_ALTA':
    case 'PENDIENTE_BAJA_IMSS':
    case 'RECLUTAMIENTO_CORRECCION_BAJA':
    case 'BAJA_IMSS_CERRADA':
      return value.trim().toUpperCase() as EmpleadoWorkflowStage
    default:
      return null
  }
}

export function normalizeRecruitingInboxKey(value: string | null | undefined): RecruitingInboxLaneKey | 'ALL' {
  switch (value) {
    case 'cancelados-devueltos':
    case 'cancelados':
    case 'devueltos':
      return 'cancelados-devueltos'
    default:
      return 'ALL'
  }
}

export function normalizePayrollInboxKey(value: string | null | undefined): PayrollInboxLaneKey | 'ALL' {
  switch (value) {
    case 'altas-imss':
    case 'bajas-pendientes':
    case 'bajas-devueltas':
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
  return [
    buildRecruitingLane(
      'cancelados-devueltos',
      employees.filter(
        (employee) =>
          resolveRecruitingAltaPipelineStage(employee) === 'CANCELADOS' ||
          resolveRecruitingBajaPipelineStage(employee) === 'BAJAS_DEVUELTAS'
      )
    ),
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
    (employee) =>
      employee.workflowStage === 'EN_GESTION' ||
      employee.workflowStage === 'PENDIENTE_IMSS_NOMINA' ||
      employee.workflowStage === 'EN_FLUJO_IMSS'
  )
  const bajasPendientes = employees.filter(
    (employee) => employee.workflowStage === 'PENDIENTE_BAJA_IMSS'
  )
  const altasDevueltas = employees.filter(
    (employee) => employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
  )
  const bajasDevueltas = employees.filter(
    (employee) => employee.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA'
  )
  const cerradas = employees.filter(
    (employee) =>
      employee.workflowStage === 'ONBOARDING' ||
      employee.workflowStage === 'PENDIENTE_VALIDACION_FINAL' ||
      employee.workflowStage === 'PENDIENTE_ACCESO_ADMIN' ||
      employee.workflowStage === 'ALTA_IMSS_CERRADA'
  )

  return [
    buildPayrollLane('altas-imss', altasPendientes),
    buildPayrollLane('bajas-pendientes', bajasPendientes),
    buildPayrollLane('bajas-devueltas', bajasDevueltas),
    buildPayrollLane('devueltas-a-reclutamiento', altasDevueltas),
    buildPayrollLane('cerradas', cerradas),
  ]
}
