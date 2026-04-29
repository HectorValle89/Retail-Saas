import { 
  type RecruitingAltaPipelineStageKey, 
  type RecruitingBajaPipelineStageKey 
} from '../types'

export interface RecruitingPipelineEmployeeLike {
  workflowStage: string | null
  imssEstado: string
  expedienteEstado: string
  adminAccessPending: boolean
  recruitmentSource?: string | null
  candidateProfileSource?: string | null
  onboarding: {
    accesosExternosStatus: string | null
    expedienteCompletoRecibido: boolean
    contratoStatus: string | null
  }
}

const RECRUITING_ORIGIN_SOURCES = new Set(['modulo_empleados_reclutamiento', 'recruit_employees_module'])

const ALTA_STAGE_ALIASES: Record<RecruitingAltaPipelineStageKey, string[]> = {
  NUEVOS: ['NUEVOS', 'PENDIENTE_COORDINACION'],
  EXPEDIENTE: ['EXPEDIENTE', 'SELECCION_APROBADA'],
  EN_GESTION: ['EN_GESTION', 'PENDIENTE_IMSS_NOMINA', 'EN_FLUJO_IMSS'],
  ONBOARDING: ['ONBOARDING', 'PENDIENTE_VALIDACION_FINAL', 'PENDIENTE_ACCESO_ADMIN'],
  CANCELADOS: ['CANCELADOS', 'ALTA_CANCELADA', 'RECLUTAMIENTO_CORRECCION_ALTA'],
}

function normalizeStage(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized || null
}

function matchesAnyStage(stage: string | null, aliases: string[]) {
  if (!stage) {
    return false
  }

  return aliases.some((alias) => alias === stage)
}

function resolveConfiguredAltaStage(value: string | null | undefined): RecruitingAltaPipelineStageKey | null {
  const stage = normalizeStage(value)

  if (!stage) {
    return null
  }

  for (const [key, aliases] of Object.entries(ALTA_STAGE_ALIASES) as Array<
    [RecruitingAltaPipelineStageKey, string[]]
  >) {
    if (matchesAnyStage(stage, aliases)) {
      return key
    }
  }

  return null
}

export function isRecruitingOriginEmployee(
  empleado: Pick<RecruitingPipelineEmployeeLike, 'recruitmentSource' | 'candidateProfileSource'>
) {
  const recruitmentSource = empleado.recruitmentSource?.trim().toLowerCase() || null

  return recruitmentSource !== null && RECRUITING_ORIGIN_SOURCES.has(recruitmentSource)
}

export function resolveRecruitingAltaPipelineStage(
  empleado: RecruitingPipelineEmployeeLike
): RecruitingAltaPipelineStageKey | null {
  if (!isRecruitingOriginEmployee(empleado)) {
    return null
  }

  const configuredStage = resolveConfiguredAltaStage(empleado.workflowStage)
  if (configuredStage) {
    return configuredStage
  }

  const workflowStage = normalizeStage(empleado.workflowStage)

  if (workflowStage === 'ALTA_IMSS_CERRADA') {
    return null
  }

  if (workflowStage === 'PENDIENTE_BAJA_IMSS' || workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA') {
    return null
  }

  if (!empleado.onboarding.expedienteCompletoRecibido || empleado.expedienteEstado !== 'VALIDADO') {
    return 'NUEVOS'
  }

  if (empleado.imssEstado === 'ALTA_IMSS' || empleado.imssEstado === 'EN_PROCESO') {
    return 'ONBOARDING'
  }

  if (empleado.imssEstado === 'PENDIENTE_DOCUMENTOS' || empleado.imssEstado === 'NO_INICIADO') {
    return 'EXPEDIENTE'
  }

  if (empleado.adminAccessPending) {
    return 'ONBOARDING'
  }

  if (empleado.onboarding.accesosExternosStatus !== 'CONFIRMADO') {
    return 'EN_GESTION'
  }

  if (empleado.onboarding.contratoStatus !== 'FIRMADO') {
    return 'ONBOARDING'
  }

  return 'EXPEDIENTE'
}

export function isRecruitingAltaPipelineEmployee(empleado: RecruitingPipelineEmployeeLike) {
  return resolveRecruitingAltaPipelineStage(empleado) !== null
}

export function resolveRecruitingBajaPipelineStage(
  empleado: Pick<RecruitingPipelineEmployeeLike, 'workflowStage' | 'recruitmentSource' | 'candidateProfileSource'>
): RecruitingBajaPipelineStageKey | null {
  if (!isRecruitingOriginEmployee(empleado)) {
    return null
  }

  const workflowStage = normalizeStage(empleado.workflowStage)

  if (workflowStage === 'PENDIENTE_BAJA_IMSS') {
    return 'BAJAS_SOLICITADAS'
  }

  if (workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA') {
    return 'BAJAS_DEVUELTAS'
  }

  return null
}

export function isRecruitingBajaPipelineEmployee(
  empleado: Pick<RecruitingPipelineEmployeeLike, 'workflowStage' | 'recruitmentSource' | 'candidateProfileSource'>
) {
  return resolveRecruitingBajaPipelineStage(empleado) !== null
}

export function isRecruitingCancelledOrReturnedStage(value: string | null | undefined) {
  const stage = normalizeStage(value)
  return stage === 'ALTA_CANCELADA' || stage === 'RECLUTAMIENTO_CORRECCION_ALTA' || stage === 'CANCELADOS'
}
