export interface FormacionAdminActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_FORMACION_ADMIN_INICIAL: FormacionAdminActionState = {
  ok: false,
  message: null,
}
