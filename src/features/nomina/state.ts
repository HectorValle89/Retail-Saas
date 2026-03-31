export interface NominaActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_NOMINA_INICIAL: NominaActionState = {
  ok: false,
  message: null,
}

export const ESTADO_PERIODO_NOMINA_INICIAL = ESTADO_NOMINA_INICIAL
