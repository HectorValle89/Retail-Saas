export const SINGLE_TENANT_MODE = true
export const SINGLE_TENANT_ACCOUNT_IDENTIFIER = 'isdin_mexico'
export const SINGLE_TENANT_ACCOUNT_NAME = 'ISDIN'
export const SINGLE_TENANT_ACCOUNT_ID = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'

type AccountOptionLike = {
  id: string
  label?: string | null
  nombre?: string | null
  identificador?: string | null
}

function normalizeAccountText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

export function isSingleTenantUiEnabled() {
  return SINGLE_TENANT_MODE
}

export function isSingleTenantBackendEnabled() {
  return SINGLE_TENANT_MODE
}

export function getSingleTenantAccountLabel() {
  return SINGLE_TENANT_ACCOUNT_NAME
}

export function getSingleTenantAccountId() {
  return SINGLE_TENANT_ACCOUNT_ID
}

export function resolveSingleTenantAccountOption<T extends AccountOptionLike>(options: T[]) {
  return (
    options.find((item) => normalizeAccountText(item.identificador) === SINGLE_TENANT_ACCOUNT_IDENTIFIER) ??
    options.find((item) => normalizeAccountText(item.nombre) === normalizeAccountText(SINGLE_TENANT_ACCOUNT_NAME)) ??
    options.find((item) => normalizeAccountText(item.label).includes('isdin')) ??
    options[0] ??
    null
  )
}
