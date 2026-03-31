export interface MensajeActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_MENSAJE_INICIAL: MensajeActionState = {
  ok: false,
  message: null,
}
