export interface ConfiguracionAdminActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_CONFIGURACION_ADMIN_INICIAL: ConfiguracionAdminActionState = {
  ok: false,
  message: null,
}
