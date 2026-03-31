import { getWeekDayLabel } from './weeklyRoute'

export type RutaAgendaImpactMode = 'SUMA' | 'SOBREPONE_PARCIAL' | 'REEMPLAZA_TOTAL'
export type RutaAgendaApprovalState = 'NO_REQUIERE' | 'PENDIENTE_COORDINACION' | 'APROBADO' | 'RECHAZADO'
export type RutaAgendaExecutionState = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO'
export type RutaAgendaEventType =
  | 'VISITA_ADICIONAL'
  | 'OFICINA'
  | 'FIRMA_CONTRATO'
  | 'FORMACION'
  | 'ENTREGA_NUEVA_DC'
  | 'PRESENTACION_GERENTE'
  | 'VISITA_EMERGENCIA'
  | 'OTRO'
export type RutaReposicionClasificacion = 'JUSTIFICADA' | 'INJUSTIFICADA'
export type RutaReposicionEstado = 'PENDIENTE' | 'REPROGRAMADA' | 'DESCARTADA' | 'EJECUTADA'

export interface RutaAgendaCheckpointMetadata {
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

export interface RutaAgendaEventMetadata {
  displacedVisitIds: string[]
  checkIn: RutaAgendaCheckpointMetadata
  checkOut: RutaAgendaCheckpointMetadata
  approvalNote: string | null
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

function normalizeApprovalState(value: unknown): RutaAgendaApprovalState {
  if (
    value === 'NO_REQUIERE' ||
    value === 'PENDIENTE_COORDINACION' ||
    value === 'APROBADO' ||
    value === 'RECHAZADO'
  ) {
    return value
  }

  return 'NO_REQUIERE'
}

export function normalizeAgendaImpactMode(value: unknown): RutaAgendaImpactMode {
  if (value === 'SUMA' || value === 'SOBREPONE_PARCIAL' || value === 'REEMPLAZA_TOTAL') {
    return value
  }

  return 'SUMA'
}

export function normalizeAgendaExecutionState(value: unknown): RutaAgendaExecutionState {
  if (value === 'PENDIENTE' || value === 'EN_CURSO' || value === 'COMPLETADO' || value === 'CANCELADO') {
    return value
  }

  return 'PENDIENTE'
}

export function normalizeAgendaEventType(value: unknown): RutaAgendaEventType {
  if (
    value === 'VISITA_ADICIONAL' ||
    value === 'OFICINA' ||
    value === 'FIRMA_CONTRATO' ||
    value === 'FORMACION' ||
    value === 'ENTREGA_NUEVA_DC' ||
    value === 'PRESENTACION_GERENTE' ||
    value === 'VISITA_EMERGENCIA' ||
    value === 'OTRO'
  ) {
    return value
  }

  return 'OTRO'
}

export function normalizeReposicionClasificacion(value: unknown): RutaReposicionClasificacion {
  return value === 'JUSTIFICADA' ? 'JUSTIFICADA' : 'INJUSTIFICADA'
}

export function normalizeReposicionEstado(value: unknown): RutaReposicionEstado {
  if (value === 'PENDIENTE' || value === 'REPROGRAMADA' || value === 'DESCARTADA' || value === 'EJECUTADA') {
    return value
  }

  return 'PENDIENTE'
}

function parseCheckpoint(value: unknown): RutaAgendaCheckpointMetadata {
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

function normalizeDisplacedVisitIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item))
}

export function parseRutaAgendaEventMetadata(metadata: unknown): RutaAgendaEventMetadata {
  const source = isRecord(metadata) ? metadata : {}

  return {
    displacedVisitIds: normalizeDisplacedVisitIds(source.displacedVisitIds),
    checkIn: parseCheckpoint(source.checkIn),
    checkOut: parseCheckpoint(source.checkOut),
    approvalNote: normalizeString(source.approvalNote),
  }
}

export function serializeRutaAgendaEventMetadata(metadata: RutaAgendaEventMetadata) {
  return {
    displacedVisitIds: metadata.displacedVisitIds,
    checkIn: metadata.checkIn,
    checkOut: metadata.checkOut,
    approvalNote: metadata.approvalNote,
  }
}

export function agendaEventNeedsCoordination(mode: RutaAgendaImpactMode) {
  return mode === 'SOBREPONE_PARCIAL' || mode === 'REEMPLAZA_TOTAL'
}

export function getAgendaImpactLabel(mode: RutaAgendaImpactMode) {
  if (mode === 'REEMPLAZA_TOTAL') return 'Reemplaza toda la ruta del dia'
  if (mode === 'SOBREPONE_PARCIAL') return 'Sobrepone parte de la ruta'
  return 'Se suma a la agenda'
}

export function getAgendaTypeLabel(type: RutaAgendaEventType) {
  switch (type) {
    case 'VISITA_ADICIONAL':
      return 'Visita adicional'
    case 'OFICINA':
      return 'Oficina'
    case 'FIRMA_CONTRATO':
      return 'Firma de contrato'
    case 'FORMACION':
      return 'Formacion'
    case 'ENTREGA_NUEVA_DC':
      return 'Entrega de nueva DC'
    case 'PRESENTACION_GERENTE':
      return 'Presentacion con gerente'
    case 'VISITA_EMERGENCIA':
      return 'Visita de emergencia'
    default:
      return 'Evento extraordinario'
  }
}

export function formatAgendaDateLabel(date: string) {
  const weekday = new Date(`${date}T12:00:00`).getUTCDay()
  return getWeekDayLabel(weekday === 0 ? 7 : weekday)
}

export function isApprovedAgendaEvent(state: RutaAgendaApprovalState) {
  return state === 'NO_REQUIERE' || state === 'APROBADO'
}
