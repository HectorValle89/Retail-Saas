import type { Puesto, Solicitud } from '@/types/database'

type SolicitudMetadata = Record<string, unknown>

const INCAPACIDAD_BASE_APPROVAL_PATH = ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'] as const

function normalizeMetadata(value: unknown): SolicitudMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as SolicitudMetadata
}

function hasIsoTimestamp(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

export function isSupervisorSelfRequestForIncapacidad(
  options?: { requesterPuesto?: Puesto | null; selfRequest?: boolean },
  metadata?: unknown
) {
  const payload = normalizeMetadata(metadata)
  return (
    (options?.requesterPuesto === 'SUPERVISOR' && options?.selfRequest === true) ||
    payload.solicitud_autogestion_supervisor === true
  )
}

export function getIncapacidadApprovalPath(options?: {
  requesterPuesto?: Puesto | null
  selfRequest?: boolean
  metadata?: unknown
}) {
  if (isSupervisorSelfRequestForIncapacidad(options, options?.metadata)) {
    return INCAPACIDAD_BASE_APPROVAL_PATH.filter((actor) => actor !== 'SUPERVISOR')
  }

  return [...INCAPACIDAD_BASE_APPROVAL_PATH]
}

export function hasIncapacidadSupervisorValidation(metadata: unknown) {
  const payload = normalizeMetadata(metadata)
  return hasIsoTimestamp(payload.validada_supervisor_en)
}

export function hasIncapacidadRecruitmentValidation(metadata: unknown) {
  const payload = normalizeMetadata(metadata)
  return hasIsoTimestamp(payload.reclutamiento_validada_en)
}

export function getIncapacidadNextActor(input: {
  estatus: Solicitud['estatus']
  metadata: unknown
  requesterPuesto?: Puesto | null
}) {
  const payload = normalizeMetadata(input.metadata)
  const selfRequest = isSupervisorSelfRequestForIncapacidad(
    {
      requesterPuesto: input.requesterPuesto,
      selfRequest: payload.solicitud_autogestion_supervisor === true,
    },
    input.metadata
  )
  const supervisorValidated = hasIncapacidadSupervisorValidation(payload)
  const recruitmentValidated = hasIncapacidadRecruitmentValidation(payload)

  if (input.estatus === 'BORRADOR') {
    return null
  }

  if (input.estatus === 'CORRECCION_SOLICITADA') {
    return typeof payload.actor_puesto === 'string' ? payload.actor_puesto.trim() || null : null
  }

  if (input.estatus === 'ENVIADA') {
    if (recruitmentValidated) {
      return 'NOMINA'
    }

    if (selfRequest || supervisorValidated) {
      return 'RECLUTAMIENTO'
    }

    return 'SUPERVISOR'
  }

  if (input.estatus === 'VALIDADA_SUP') {
    return recruitmentValidated ? 'NOMINA' : 'RECLUTAMIENTO'
  }

  return null
}
