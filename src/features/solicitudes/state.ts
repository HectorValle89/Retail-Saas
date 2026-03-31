export interface SolicitudActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_SOLICITUD_INICIAL: SolicitudActionState = {
  ok: false,
  message: null,
}
