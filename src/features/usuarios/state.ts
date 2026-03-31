export interface UsuarioAdminActionState {
  ok: boolean
  message: string | null
  generatedUsername: string | null
  temporaryPassword: string | null
  temporaryEmail: string | null
}

export const ESTADO_USUARIO_ADMIN_INICIAL: UsuarioAdminActionState = {
  ok: false,
  message: null,
  generatedUsername: null,
  temporaryPassword: null,
  temporaryEmail: null,
}
