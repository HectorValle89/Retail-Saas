export type RecruitingAltaPipelineStageKey =
  | 'NUEVOS'
  | 'EXPEDIENTE'
  | 'EN_GESTION'
  | 'ONBOARDING'
  | 'CANCELADOS'

export type RecruitingBajaPipelineStageKey =
  | 'BAJAS_SOLICITADAS'
  | 'BAJAS_DEVUELTAS'

export interface RecruitingCandidateContext {
  id: string
  nombreCompleto: string
  curp: string | null
  nss: string | null
  puesto: string
  zona: string | null
  supervisor: string | null
  submittedAt: string | null
  stageKey: RecruitingAltaPipelineStageKey
  documentationProgress: number
  hasImssAlta: boolean
  hasSignedContract: boolean
  hasCompleteExpediente: boolean
  adminAccessPending: boolean
  readyForAdmin: boolean
  coordinadorLabel: string
  cadena: string | null
  ciudad: string | null
  empleado: any // Avoid circular dependency with EmpleadoListadoItem if possible, but for now we'll use it
}

export interface RecruitingBajaCandidateContext {
  id: string
  nombreCompleto: string
  stageKey: RecruitingBajaPipelineStageKey
  coordinadorLabel: string
  cadena: string | null
  ciudad: string | null
  empleado: any
}
