import type { ReglaNegocio } from '@/types/database'

export type BusinessRuleRow = Pick<
  ReglaNegocio,
  'id' | 'codigo' | 'modulo' | 'descripcion' | 'severidad' | 'prioridad' | 'condicion' | 'accion' | 'activa'
>

export const SUPERVISOR_INHERITANCE_RULE_CODE =
  'JERARQUIA_SUPERVISOR_PDV_EMPLEADO_ASIGNACION'
export const SCHEDULE_PRIORITY_RULE_CODE = 'JERARQUIA_HORARIO_PRIORIDADES'
export const APPROVAL_FLOW_RULE_CODES = {
  VACACIONES: 'SOLICITUD_APROBACION_VACACIONES',
  INCAPACIDAD: 'SOLICITUD_APROBACION_INCAPACIDAD',
  PERMISO: 'SOLICITUD_APROBACION_PERMISO',
  CAMBIO_TIENDA: 'SOLICITUD_APROBACION_CAMBIO_TIENDA',
  CUMPLEANOS: 'SOLICITUD_APROBACION_CUMPLEANOS',
} as const

export type SupervisorResolutionSource = 'PDV' | 'EMPLEADO' | 'ASIGNACION'
export type ScheduleResolutionLevel =
  | 'ASIGNACION_EVENTO'
  | 'RUTA_SEGMENTO'
  | 'PDV_FECHA'
  | 'PDV_BASE'
  | 'CADENA_DIA'
  | 'CADENA_BASE'
  | 'GLOBAL'
export type SolicitudTipo = keyof typeof APPROVAL_FLOW_RULE_CODES
export type ApprovalActor = 'SUPERVISOR' | 'COORDINADOR' | 'NOMINA' | 'ADMINISTRADOR'

export interface SupervisorInheritanceRuleDefinition {
  id: string | null
  code: string
  description: string
  severity: ReglaNegocio['severidad']
  priority: number
  active: boolean
  sources: SupervisorResolutionSource[]
}

export interface SupervisorCandidate {
  source: SupervisorResolutionSource
  supervisorEmpleadoId: string | null
  active: boolean
}

export interface SupervisorResolutionResult {
  supervisorEmpleadoId: string | null
  source: SupervisorResolutionSource | null
  evaluatedSources: SupervisorResolutionSource[]
}

export interface ScheduleFallbackDefinition {
  label: string | null
  horaEntrada: string | null
  horaSalida: string | null
}

export interface SchedulePriorityRuleDefinition {
  id: string | null
  code: string
  description: string
  severity: ReglaNegocio['severidad']
  priority: number
  active: boolean
  levels: ScheduleResolutionLevel[]
  globalFallback: ScheduleFallbackDefinition | null
}

export interface ScheduleCandidate<T = unknown> {
  level: ScheduleResolutionLevel
  label: string
  payload: T | null
  available: boolean
}

export interface ScheduleResolutionResult<T = unknown> {
  candidate: ScheduleCandidate<T> | null
  evaluatedLevels: ScheduleResolutionLevel[]
}

export interface ApprovalStep {
  actor: ApprovalActor
  targetStatus: string
  slaHours: number | null
}

export interface ApprovalFlowDefinition {
  id: string | null
  code: string
  solicitudTipo: SolicitudTipo
  description: string
  severity: ReglaNegocio['severidad']
  priority: number
  active: boolean
  minNoticeDays: number | null
  steps: ApprovalStep[]
}

const DEFAULT_SUPERVISOR_SOURCES: SupervisorResolutionSource[] = [
  'PDV',
  'EMPLEADO',
  'ASIGNACION',
]
const DEFAULT_SCHEDULE_LEVELS: ScheduleResolutionLevel[] = [
  'ASIGNACION_EVENTO',
  'RUTA_SEGMENTO',
  'PDV_FECHA',
  'PDV_BASE',
  'CADENA_DIA',
  'CADENA_BASE',
  'GLOBAL',
]
const DEFAULT_SCHEDULE_FALLBACK: ScheduleFallbackDefinition = {
  label: 'Horario global agencia',
  horaEntrada: '11:00:00',
  horaSalida: '19:00:00',
}
const DEFAULT_APPROVAL_FLOWS: Record<SolicitudTipo, Omit<ApprovalFlowDefinition, 'id' | 'active'>> = {
  VACACIONES: {
    code: APPROVAL_FLOW_RULE_CODES.VACACIONES,
    solicitudTipo: 'VACACIONES',
    description: 'Vacaciones requieren aprobacion de SUPERVISOR y confirmacion final de COORDINADOR.',
    severity: 'ERROR',
    priority: 210,
    minNoticeDays: 30,
    steps: [
      { actor: 'SUPERVISOR', targetStatus: 'VALIDADA_SUP', slaHours: 24 },
      { actor: 'COORDINADOR', targetStatus: 'REGISTRADA', slaHours: 48 },
    ],
  },
  INCAPACIDAD: {
    code: APPROVAL_FLOW_RULE_CODES.INCAPACIDAD,
    solicitudTipo: 'INCAPACIDAD',
    description: 'Incapacidades pasan por validacion operativa de SUPERVISOR y formalizacion de NOMINA.',
    severity: 'ERROR',
    priority: 220,
    minNoticeDays: null,
    steps: [
      { actor: 'SUPERVISOR', targetStatus: 'VALIDADA_SUP', slaHours: 24 },
      { actor: 'NOMINA', targetStatus: 'REGISTRADA_RH', slaHours: 48 },
    ],
  },
  PERMISO: {
    code: APPROVAL_FLOW_RULE_CODES.PERMISO,
    solicitudTipo: 'PERMISO',
    description: 'Permisos ordinarios siguen flujo SUPERVISOR -> COORDINADOR para trazabilidad total.',
    severity: 'ERROR',
    priority: 230,
    minNoticeDays: 3,
    steps: [
      { actor: 'SUPERVISOR', targetStatus: 'VALIDADA_SUP', slaHours: 24 },
      { actor: 'COORDINADOR', targetStatus: 'REGISTRADA', slaHours: 48 },
    ],
  },
  CAMBIO_TIENDA: {
    code: APPROVAL_FLOW_RULE_CODES.CAMBIO_TIENDA,
    solicitudTipo: 'CAMBIO_TIENDA',
    description: 'Los cambios de tienda definitivos se elevan a COORDINADOR tras revision del SUPERVISOR.',
    severity: 'ERROR',
    priority: 240,
    minNoticeDays: 0,
    steps: [
      { actor: 'SUPERVISOR', targetStatus: 'VALIDADA_SUP', slaHours: 24 },
      { actor: 'COORDINADOR', targetStatus: 'APROBADA_FINAL', slaHours: 48 },
    ],
  },
  CUMPLEANOS: {
    code: APPROVAL_FLOW_RULE_CODES.CUMPLEANOS,
    solicitudTipo: 'CUMPLEANOS',
    description: 'Los dias de cumpleanos quedan sujetos a aviso previo y aprobacion de COORDINADOR.',
    severity: 'ERROR',
    priority: 250,
    minNoticeDays: 30,
    steps: [
      { actor: 'SUPERVISOR', targetStatus: 'VALIDADA_SUP', slaHours: 24 },
      { actor: 'COORDINADOR', targetStatus: 'REGISTRADA', slaHours: 48 },
    ],
  },
}

function asObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asStringArray<T extends string>(value: unknown, allowed: readonly T[]) {
  if (!Array.isArray(value)) {
    return []
  }

  const allowedSet = new Set<string>(allowed)

  return value.reduce<T[]>((acc, item) => {
    const normalized = asString(item)?.toUpperCase() ?? null
    if (normalized && allowedSet.has(normalized)) {
      acc.push(normalized as T)
    }

    return acc
  }, [])
}

function inferSolicitudTipo(rule: BusinessRuleRow): SolicitudTipo | null {
  const fromCondition = asString(asObject(rule.condicion).tipo_solicitud)?.toUpperCase() ?? null
  if (fromCondition && fromCondition in APPROVAL_FLOW_RULE_CODES) {
    return fromCondition as SolicitudTipo
  }

  const found = Object.entries(APPROVAL_FLOW_RULE_CODES).find(([, code]) => code === rule.codigo)
  return found ? (found[0] as SolicitudTipo) : null
}

export function readSupervisorInheritanceRule(
  rule: BusinessRuleRow | null | undefined
): SupervisorInheritanceRuleDefinition {
  const condition = asObject(rule?.condicion)
  const sources = asStringArray(condition.sources, ['PDV', 'EMPLEADO', 'ASIGNACION'])

  return {
    id: rule?.id ?? null,
    code: rule?.codigo ?? SUPERVISOR_INHERITANCE_RULE_CODE,
    description:
      rule?.descripcion ??
      'Hereda supervisor en orden PDV -> EMPLEADO -> ASIGNACION para contexto operativo y trazabilidad.',
    severity: rule?.severidad ?? 'ERROR',
    priority: rule?.prioridad ?? 110,
    active: rule?.activa ?? true,
    sources: sources.length > 0 ? sources : DEFAULT_SUPERVISOR_SOURCES,
  }
}

export function resolveSupervisorInheritance(
  candidates: SupervisorCandidate[],
  rule: BusinessRuleRow | SupervisorInheritanceRuleDefinition | null | undefined
): SupervisorResolutionResult {
  const definition = rule && 'sources' in rule
    ? (rule as SupervisorInheritanceRuleDefinition)
    : readSupervisorInheritanceRule(rule as BusinessRuleRow | null | undefined)
  const candidateMap = new Map(candidates.map((item) => [item.source, item]))

  for (const source of definition.sources) {
    const candidate = candidateMap.get(source)
    if (candidate?.active && candidate.supervisorEmpleadoId) {
      return {
        supervisorEmpleadoId: candidate.supervisorEmpleadoId,
        source,
        evaluatedSources: definition.sources,
      }
    }
  }

  return {
    supervisorEmpleadoId: null,
    source: null,
    evaluatedSources: definition.sources,
  }
}

export function readSchedulePriorityRule(
  rule: BusinessRuleRow | null | undefined
): SchedulePriorityRuleDefinition {
  const condition = asObject(rule?.condicion)
  const action = asObject(rule?.accion)
  const levels = asStringArray(condition.levels, [
    'ASIGNACION_EVENTO',
    'RUTA_SEGMENTO',
    'PDV_FECHA',
    'PDV_BASE',
    'CADENA_DIA',
    'CADENA_BASE',
    'GLOBAL',
  ])
  const fallback = asObject(action.global_fallback)
  const fallbackLabel = asString(fallback.label)
  const fallbackEntry =
    fallbackLabel || asString(fallback.hora_entrada) || asString(fallback.hora_salida)
      ? {
          label: fallbackLabel,
          horaEntrada: asString(fallback.hora_entrada),
          horaSalida: asString(fallback.hora_salida),
        }
      : DEFAULT_SCHEDULE_FALLBACK

  return {
    id: rule?.id ?? null,
    code: rule?.codigo ?? SCHEDULE_PRIORITY_RULE_CODE,
    description:
      rule?.descripcion ??
      'Resuelve horario esperado por prioridad operacional: PDV, cadena y fallback global.',
    severity: rule?.severidad ?? 'ALERTA',
    priority: rule?.prioridad ?? 120,
    active: rule?.activa ?? true,
    levels: levels.length > 0 ? levels : DEFAULT_SCHEDULE_LEVELS,
    globalFallback: fallbackEntry,
  }
}

export function resolveScheduleHierarchy<T>(
  candidates: ScheduleCandidate<T>[],
  rule: BusinessRuleRow | SchedulePriorityRuleDefinition | null | undefined
): ScheduleResolutionResult<T> {
  const definition = rule && 'levels' in rule
    ? (rule as SchedulePriorityRuleDefinition)
    : readSchedulePriorityRule(rule as BusinessRuleRow | null | undefined)
  const candidateMap = new Map(candidates.map((item) => [item.level, item]))

  for (const level of definition.levels) {
    const candidate = candidateMap.get(level)
    if (candidate?.available) {
      return {
        candidate,
        evaluatedLevels: definition.levels,
      }
    }
  }

  return {
    candidate: null,
    evaluatedLevels: definition.levels,
  }
}

function normalizeApprovalSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const step = asObject(item)
      const actor = asString(step.actor)?.toUpperCase() ?? null
      const targetStatus = asString(step.target_status)
      const slaHours = asNumber(step.sla_hours)

      if (
        !actor ||
        !['SUPERVISOR', 'COORDINADOR', 'NOMINA', 'ADMINISTRADOR'].includes(actor) ||
        !targetStatus
      ) {
        return null
      }

      return {
        actor: actor as ApprovalActor,
        targetStatus,
        slaHours,
      }
    })
    .filter((item): item is ApprovalStep => Boolean(item))
}

export function readApprovalFlowRule(
  rule: BusinessRuleRow | null | undefined,
  solicitudTipoFallback?: SolicitudTipo
): ApprovalFlowDefinition {
  const solicitudTipo = solicitudTipoFallback ?? (rule ? inferSolicitudTipo(rule) : null) ?? 'PERMISO'
  const condition = asObject(rule?.condicion)
  const action = asObject(rule?.accion)
  const defaults = DEFAULT_APPROVAL_FLOWS[solicitudTipo]
  const steps = normalizeApprovalSteps(action.steps)

  return {
    id: rule?.id ?? null,
    code: rule?.codigo ?? defaults.code,
    solicitudTipo,
    description: rule?.descripcion ?? defaults.description,
    severity: rule?.severidad ?? defaults.severity,
    priority: rule?.prioridad ?? defaults.priority,
    active: rule?.activa ?? true,
    minNoticeDays: asNumber(condition.min_notice_days) ?? defaults.minNoticeDays,
    steps: steps.length > 0 ? steps : defaults.steps,
  }
}

export function buildApprovalFlowDefinitions(
  rules: BusinessRuleRow[]
): ApprovalFlowDefinition[] {
  return (Object.keys(APPROVAL_FLOW_RULE_CODES) as SolicitudTipo[])
    .map((solicitudTipo) => {
      const rule = rules.find((item) => inferSolicitudTipo(item) === solicitudTipo) ?? null
      return readApprovalFlowRule(rule, solicitudTipo)
    })
    .sort((left, right) => left.priority - right.priority)
}

export function resolveApprovalFlow(
  solicitudTipo: SolicitudTipo,
  rules: BusinessRuleRow[]
): ApprovalFlowDefinition {
  const rule = rules.find((item) => inferSolicitudTipo(item) === solicitudTipo) ?? null
  return readApprovalFlowRule(rule, solicitudTipo)
}

export const SUPERVISOR_SOURCE_OPTIONS = [
  { value: 'PDV', label: 'PDV' },
  { value: 'EMPLEADO', label: 'Empleado' },
  { value: 'ASIGNACION', label: 'Asignacion actual' },
] as const

export const SCHEDULE_LEVEL_OPTIONS = [
  { value: 'ASIGNACION_EVENTO', label: 'Asignacion o evento puntual' },
  { value: 'RUTA_SEGMENTO', label: 'Segmento de ruta' },
  { value: 'PDV_FECHA', label: 'Excepcion de PDV por fecha' },
  { value: 'PDV_BASE', label: 'Horario base del PDV' },
  { value: 'CADENA_DIA', label: 'Horario por cadena y dia' },
  { value: 'CADENA_BASE', label: 'Horario base de cadena' },
  { value: 'GLOBAL', label: 'Horario global agencia' },
] as const

export const SOLICITUD_TIPO_OPTIONS = (
  Object.keys(APPROVAL_FLOW_RULE_CODES) as SolicitudTipo[]
).map((value) => ({
  value,
  label: value.replace(/_/g, ' '),
}))

export const APPROVAL_ACTOR_OPTIONS = [
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'COORDINADOR', label: 'Coordinador' },
  { value: 'NOMINA', label: 'Nomina' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
] as const
