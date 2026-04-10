export interface GastoActionState {
  ok: boolean
  message: string | null
}
export const ESTADO_GASTO_INICIAL: GastoActionState = {
  ok: false,
  message: null,
}