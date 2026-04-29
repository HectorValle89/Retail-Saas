import { obtenerClienteAdmin } from '@/lib/auth/admin'

export const PROVISIONAL_EMAIL_DOMAIN = '@provisional.fieldforce.invalid'

export type AuthIdentityUsuarioRow = {
  id: string
  auth_user_id: string | null
  empleado_id?: string | null
  username?: string | null
  correo_electronico?: string | null
  estado_cuenta?: string | null
}

type AuthIdentityMetadata = Record<string, unknown> | null

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

export function isProvisionalAuthEmail(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().toLowerCase().endsWith(PROVISIONAL_EMAIL_DOMAIN)
}

function normalizeAuthMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  return { ...(metadata as Record<string, unknown>) }
}

function buildCleanActiveMetadata(metadata: AuthIdentityMetadata, canonicalEmail: string) {
  const current = normalizeAuthMetadata(metadata)

  return {
    ...current,
    pending_email: null,
    provisional_email: false,
    allow_username_login: false,
    email_verified: true,
    first_access_password: false,
    confirmed_email: canonicalEmail,
    activated_at:
      typeof current.activated_at === 'string' && current.activated_at.trim()
        ? current.activated_at
        : new Date().toISOString(),
  }
}

export async function reconcileActiveAccountAccessIdentity(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  usuario: AuthIdentityUsuarioRow
) {
  const canonicalEmail = normalizeEmail(usuario.correo_electronico)

  if (!usuario.auth_user_id || !canonicalEmail || usuario.estado_cuenta !== 'ACTIVA') {
    return {
      canonicalEmail,
      authEmail: canonicalEmail,
      updatedAuth: false,
    }
  }

  const { data: authData, error: authError } = await service.auth.admin.getUserById(usuario.auth_user_id)

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'No fue posible leer la cuenta de autenticacion.')
  }

  const authEmail = normalizeEmail(authData.user.email)
  const cleanedMetadata = buildCleanActiveMetadata(authData.user.user_metadata, canonicalEmail)
  const currentMetadata = normalizeAuthMetadata(authData.user.user_metadata)

  const shouldUpdateEmail = authEmail !== canonicalEmail
  const shouldUpdateMetadata =
    currentMetadata.pending_email !== null ||
    currentMetadata.provisional_email !== false ||
    currentMetadata.allow_username_login !== false ||
    currentMetadata.email_verified !== true ||
    currentMetadata.first_access_password !== false ||
    currentMetadata.confirmed_email !== canonicalEmail

  if (shouldUpdateEmail || shouldUpdateMetadata) {
    const { error: updateError } = await service.auth.admin.updateUserById(usuario.auth_user_id, {
      ...(shouldUpdateEmail ? { email: canonicalEmail, email_confirm: true } : {}),
      user_metadata: cleanedMetadata,
    })

    if (updateError) {
      throw new Error(updateError.message)
    }
  }

  return {
    canonicalEmail,
    authEmail: shouldUpdateEmail ? canonicalEmail : authEmail,
    updatedAuth: shouldUpdateEmail || shouldUpdateMetadata,
  }
}
