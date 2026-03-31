export type RutaApprovalState = 'PENDIENTE_COORDINACION' | 'APROBADA' | 'CAMBIOS_SOLICITADOS'

export type RutaChangeRequestState = 'NINGUNO' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
export type RutaChangeRequestTargetScope = 'VISITA' | 'DIA'
export type RutaChangeRequestType = 'CAMBIO_DIA' | 'CANCELACION_DIA' | 'CAMBIO_TIENDA'

export interface RutaChangeRequestProposedVisit {
  pdvId: string
  order: number
}

export interface RutaChangeRequestMetadata {
  status: RutaChangeRequestState
  note: string | null
  resolutionNote: string | null
  requestType: RutaChangeRequestType
  targetScope: RutaChangeRequestTargetScope
  targetVisitId: string | null
  targetPdvId: string | null
  targetDayNumber: number | null
  targetDayLabel: string | null
  proposedVisits: RutaChangeRequestProposedVisit[]
  requestedAt: string | null
  requestedByUsuarioId: string | null
  resolvedAt: string | null
  resolvedByUsuarioId: string | null
  previousApprovalState: RutaApprovalState | null
  previousRouteStatus: string | null
}

export interface RutaApprovalMetadata {
  state: RutaApprovalState
  note: string | null
  reviewedAt: string | null
  reviewedByUsuarioId: string | null
}

export interface RutaSemanalWorkflowMetadata {
  expectedMonthlyVisits: number | null
  minimumVisitsPerPdv: number | null
  pdvMonthlyQuotas: Record<string, number>
  approval: RutaApprovalMetadata
  changeRequest: RutaChangeRequestMetadata
}

export interface RutaVisitaCheckpointMetadata {
  at: string | null
  latitud: number | null
  longitud: number | null
  distanciaMetros: number | null
  gpsState: string | null
  selfieUrl: string | null
  selfieHash: string | null
  evidenciaUrl: string | null
  evidenciaHash: string | null
  comments: string | null
}

export interface RutaVisitaWorkflowMetadata {
  checkIn: RutaVisitaCheckpointMetadata
  checkOut: RutaVisitaCheckpointMetadata
  checklistComments: Record<string, string>
  loveIsdinRecordsCount: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeApprovalState(value: unknown): RutaApprovalState {
  if (
    value === 'PENDIENTE_COORDINACION' ||
    value === 'APROBADA' ||
    value === 'CAMBIOS_SOLICITADOS'
  ) {
    return value
  }

  return 'PENDIENTE_COORDINACION'
}

function normalizePdvMonthlyQuotas(value: unknown) {
  if (!isRecord(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .map(([pdvId, quotaValue]) => {
      const normalizedPdvId = normalizeString(pdvId)
      const normalizedQuota = normalizeNumber(quotaValue)

      if (!normalizedPdvId || normalizedQuota === null) {
        return null
      }

      return [normalizedPdvId, Math.max(0, Math.round(normalizedQuota))] as const
    })
    .filter((entry): entry is readonly [string, number] => Boolean(entry))

  return Object.fromEntries(entries)
}

function normalizeChangeRequestState(value: unknown): RutaChangeRequestState {
  if (
    value === 'NINGUNO' ||
    value === 'PENDIENTE' ||
    value === 'APROBADO' ||
    value === 'RECHAZADO'
  ) {
    return value
  }

  return 'NINGUNO'
}

function normalizeChangeRequestTargetScope(value: unknown): RutaChangeRequestTargetScope {
  if (value === 'DIA' || value === 'VISITA') {
    return value
  }

  return 'VISITA'
}

function normalizeChangeRequestType(value: unknown): RutaChangeRequestType {
  if (value === 'CAMBIO_DIA' || value === 'CANCELACION_DIA' || value === 'CAMBIO_TIENDA') {
    return value
  }

  return 'CAMBIO_DIA'
}

function normalizeProposedVisits(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized = value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const pdvId = normalizeString(item.pdvId)
      const order = normalizeNumber(item.order)

      if (!pdvId || order === null || !Number.isInteger(order) || order <= 0) {
        return null
      }

      return {
        pdvId,
        order,
      } satisfies RutaChangeRequestProposedVisit
    })
    .filter((item): item is RutaChangeRequestProposedVisit => Boolean(item))
    .sort((left, right) => left.order - right.order)

  const seen = new Set<string>()
  return normalized.filter((item) => {
    if (seen.has(item.pdvId)) {
      return false
    }

    seen.add(item.pdvId)
    return true
  })
}

function parseCheckpoint(value: unknown): RutaVisitaCheckpointMetadata {
  const source = isRecord(value) ? value : {}

  return {
    at: normalizeString(source.at),
    latitud: normalizeNumber(source.latitud),
    longitud: normalizeNumber(source.longitud),
    distanciaMetros: normalizeNumber(source.distanciaMetros),
    gpsState: normalizeString(source.gpsState),
    selfieUrl: normalizeString(source.selfieUrl),
    selfieHash: normalizeString(source.selfieHash),
    evidenciaUrl: normalizeString(source.evidenciaUrl),
    evidenciaHash: normalizeString(source.evidenciaHash),
    comments: normalizeString(source.comments),
  }
}

export function parseRutaSemanalWorkflowMetadata(
  metadata: unknown
): RutaSemanalWorkflowMetadata {
  const source = isRecord(metadata) ? metadata : {}
  const approval = isRecord(source.approval) ? source.approval : {}
  const changeRequest = isRecord(source.changeRequest) ? source.changeRequest : {}

  return {
    expectedMonthlyVisits: normalizeNumber(source.expectedMonthlyVisits),
    minimumVisitsPerPdv: normalizeNumber(source.minimumVisitsPerPdv),
    pdvMonthlyQuotas: normalizePdvMonthlyQuotas(source.pdvMonthlyQuotas),
    approval: {
      state: normalizeApprovalState(approval.state),
      note: normalizeString(approval.note),
      reviewedAt: normalizeString(approval.reviewedAt),
      reviewedByUsuarioId: normalizeString(approval.reviewedByUsuarioId),
    },
    changeRequest: {
      status: normalizeChangeRequestState(changeRequest.status),
      note: normalizeString(changeRequest.note),
      resolutionNote: normalizeString(changeRequest.resolutionNote),
      requestType: normalizeChangeRequestType(changeRequest.requestType),
      targetScope: normalizeChangeRequestTargetScope(changeRequest.targetScope),
      targetVisitId: normalizeString(changeRequest.targetVisitId),
      targetPdvId: normalizeString(changeRequest.targetPdvId),
      targetDayNumber: normalizeNumber(changeRequest.targetDayNumber),
      targetDayLabel: normalizeString(changeRequest.targetDayLabel),
      proposedVisits: normalizeProposedVisits(changeRequest.proposedVisits),
      requestedAt: normalizeString(changeRequest.requestedAt),
      requestedByUsuarioId: normalizeString(changeRequest.requestedByUsuarioId),
      resolvedAt: normalizeString(changeRequest.resolvedAt),
      resolvedByUsuarioId: normalizeString(changeRequest.resolvedByUsuarioId),
      previousApprovalState: normalizeString(changeRequest.previousApprovalState) as RutaApprovalState | null,
      previousRouteStatus: normalizeString(changeRequest.previousRouteStatus),
    },
  }
}

export function serializeRutaSemanalWorkflowMetadata(
  metadata: RutaSemanalWorkflowMetadata
) {
  return {
    expectedMonthlyVisits: metadata.expectedMonthlyVisits,
    minimumVisitsPerPdv: metadata.minimumVisitsPerPdv,
    pdvMonthlyQuotas: metadata.pdvMonthlyQuotas,
    approval: metadata.approval,
    changeRequest: metadata.changeRequest,
  }
}

export function parseRutaVisitaWorkflowMetadata(metadata: unknown): RutaVisitaWorkflowMetadata {
  const source = isRecord(metadata) ? metadata : {}
  const checklistCommentsSource = isRecord(source.checklistComments) ? source.checklistComments : {}
  const checklistComments = Object.fromEntries(
    Object.entries(checklistCommentsSource)
      .map(([key, value]) => {
        const normalizedKey = normalizeString(key)
        const normalizedValue = normalizeString(value)
        return normalizedKey && normalizedValue ? [normalizedKey, normalizedValue] : null
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  )

  return {
    checkIn: parseCheckpoint(source.checkIn),
    checkOut: parseCheckpoint(source.checkOut),
    checklistComments,
    loveIsdinRecordsCount: normalizeNumber(source.loveIsdinRecordsCount),
  }
}

export function serializeRutaVisitaWorkflowMetadata(
  metadata: RutaVisitaWorkflowMetadata
) {
  return {
    checkIn: metadata.checkIn,
    checkOut: metadata.checkOut,
    checklistComments: metadata.checklistComments,
    loveIsdinRecordsCount: metadata.loveIsdinRecordsCount,
  }
}
