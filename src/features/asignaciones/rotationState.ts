import type { AssignmentIssue } from './lib/assignmentValidation'

export interface PdvRotacionImportConflict {
  rowNumber: number | null
  claveBtl: string | null
  severity: AssignmentIssue['severity']
  code: string
  label: string
  message: string
  source: 'PARSER' | 'RESOLUCION' | 'VALIDACION'
}

export interface PdvRotacionImportSummary {
  parsedRows: number
  skippedRows: number
  importedRows: number
  rotativos: number
  fijos: number
  unresolvedPdvs: number
  missingOperablePdvs: number
  incompleteGroups: number
  conflictCount: number
}

export interface ImportarRotacionMaestraState {
  ok: boolean
  message: string | null
  conflicts: PdvRotacionImportConflict[]
  summary: PdvRotacionImportSummary | null
}

export const ESTADO_IMPORTACION_ROTACION_MAESTRA_INICIAL: ImportarRotacionMaestraState = {
  ok: false,
  message: null,
  conflicts: [],
  summary: null,
}