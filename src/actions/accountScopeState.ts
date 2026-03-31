export interface AccountScopeActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_ACCOUNT_SCOPE_INICIAL: AccountScopeActionState = {
  ok: false,
  message: null,
}
