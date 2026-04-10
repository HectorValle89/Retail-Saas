export interface RutaActionState {
  ok: boolean
  message: string | null
  savedRouteId?: string | null
  savedPdvMonthlyQuotas?: Record<string, number> | null
}

export const ESTADO_RUTA_INICIAL: RutaActionState = {
  ok: false,
  message: null,
  savedRouteId: null,
  savedPdvMonthlyQuotas: null,
}
