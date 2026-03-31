export interface RutaActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_RUTA_INICIAL: RutaActionState = {
  ok: false,
  message: null,
}
