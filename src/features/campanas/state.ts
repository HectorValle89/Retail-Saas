export interface CampanaAdminActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_CAMPANA_ADMIN_INICIAL: CampanaAdminActionState = {
  ok: false,
  message: null,
}
