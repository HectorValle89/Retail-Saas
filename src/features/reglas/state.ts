export interface ReglaAdminActionState {
  ok: boolean
  message: string | null
}
export const ESTADO_REGLA_ADMIN_INICIAL: ReglaAdminActionState = {
  ok: false,
  message: null,
}