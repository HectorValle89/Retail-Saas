import type { AssignmentIssue } from './lib/assignmentValidation'

export interface ActualizarEstadoAsignacionState {
  ok: boolean
  message: string | null
  issues: AssignmentIssue[]
  redirectTo: string | null
}

export const ESTADO_ASIGNACION_INICIAL: ActualizarEstadoAsignacionState = {
  ok: false,
  message: null,
  issues: [],
  redirectTo: null,
}

export interface ImportarCatalogoAsignacionesState {
  ok: boolean
  message: string | null
  conflicts: AssignmentImportConflict[]
  summary: AssignmentImportSummary | null
  previewRows: AssignmentImportPreviewRow[]
  redirectTo: string | null
}

export const ESTADO_IMPORTACION_ASIGNACIONES_INICIAL: ImportarCatalogoAsignacionesState = {
  ok: false,
  message: null,
  conflicts: [],
  summary: null,
  previewRows: [],
  redirectTo: null,
}

export interface PublicarCatalogoAsignacionesState {
  ok: boolean
  message: string | null
  conflicts: AssignmentImportConflict[]
  publishedRows: number
  materializedEmployees: number
  materializedWindowLabel: string | null
  redirectTo: string | null
}

export const ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL: PublicarCatalogoAsignacionesState = {
  ok: false,
  message: null,
  conflicts: [],
  publishedRows: 0,
  materializedEmployees: 0,
  materializedWindowLabel: null,
  redirectTo: null,
}

export interface RestOverridePreviewSummary {
  mes: string
  asignacionId: string
  asignacionLabel: string
  modo: 'EXPLICITO' | 'REGLA_MENSUAL'
  reglaLabel: string | null
  fechasDescanso: string[]
  fechasTrabajo: string[]
  diasAfectados: number
}

export interface GuardarDescansoPermanenteState {
  ok: boolean
  message: string | null
  preview: RestOverridePreviewSummary | null
  overrideId: string | null
}

export const ESTADO_DESCANSO_PERMANENTE_INICIAL: GuardarDescansoPermanenteState = {
  ok: false,
  message: null,
  preview: null,
  overrideId: null,
}

export interface ActualizarVacanteOperativaFuturaState {
  ok: boolean
  message: string | null
}

export const ESTADO_ACTUALIZACION_VACANTE_OPERATIVA_INICIAL: ActualizarVacanteOperativaFuturaState = {
  ok: false,
  message: null,
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

export interface AssignmentImportPreviewRow {
  rowNumber: number
  estadoPublicacion: 'BORRADOR'
  accion: 'NUEVA' | 'ACTUALIZADA'
  claveBtl: string
  username: string | null
  idNomina: string | null
  nombreDc: string | null
  horarioReferencia: string | null
  diasLaborales: string | null
  diaDescanso: string | null
  fechaInicio: string
}
