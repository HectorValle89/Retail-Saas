import type { AssignmentIssue } from './lib/assignmentValidation'

export interface ActualizarEstadoAsignacionState {
  ok: boolean
  message: string | null
  issues: AssignmentIssue[]
}

export const ESTADO_ASIGNACION_INICIAL: ActualizarEstadoAsignacionState = {
  ok: false,
  message: null,
  issues: [],
}

export interface ImportarCatalogoAsignacionesState {
  ok: boolean
  message: string | null
  conflicts: AssignmentImportConflict[]
  summary: AssignmentImportSummary | null
}

export const ESTADO_IMPORTACION_ASIGNACIONES_INICIAL: ImportarCatalogoAsignacionesState = {
  ok: false,
  message: null,
  conflicts: [],
  summary: null,
}

export interface PublicarCatalogoAsignacionesState {
  ok: boolean
  message: string | null
  conflicts: AssignmentImportConflict[]
  publishedRows: number
  materializedEmployees: number
  materializedWindowLabel: string | null
}

export const ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL: PublicarCatalogoAsignacionesState = {
  ok: false,
  message: null,
  conflicts: [],
  publishedRows: 0,
  materializedEmployees: 0,
  materializedWindowLabel: null,
}

export interface AssignmentImportConflict {
  rowNumber: number | null
  claveBtl: string | null
  referenciaDc: string | null
  tipo: string | null
  severity: AssignmentIssue['severity']
  code: string
  label: string
  message: string
  source: 'PARSER' | 'RESOLUCION' | 'VALIDACION'
}

export interface AssignmentImportSummary {
  parsedRows: number
  skippedRows: number
  insertedRows: number
  updatedRows: number
  unresolvedPdvs: number
  unresolvedEmployees: number
  conflictCount: number
  alertCount: number
  noticeCount: number
}
