import type { MaterialDistributionPreview } from './lib/materialDistributionImport'
import type { MaterialDistributionGeminiAnalysis } from './lib/materialDistributionGemini'

export interface MaterialActionState {
  ok: boolean
  message: string | null
}

export interface MaterialImportActionState extends MaterialActionState {
  loteId: string | null
  preview: MaterialDistributionPreview | null
  geminiAnalysis: MaterialDistributionGeminiAnalysis | null
  cuentaClienteId: string | null
}

export const ESTADO_MATERIAL_INICIAL: MaterialActionState = {
  ok: false,
  message: null,
}

export const ESTADO_MATERIAL_IMPORTACION_INICIAL: MaterialImportActionState = {
  ok: false,
  message: null,
  loteId: null,
  preview: null,
  geminiAnalysis: null,
  cuentaClienteId: null,
}
