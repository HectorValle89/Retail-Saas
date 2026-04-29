import { cookies } from 'next/headers'
import { obtenerClienteAdmin } from '@/lib/auth/admin'

export const ACCESS_FLOW_COOKIE = 'ff_access_flow_ticket'
export const ACCESS_FLOW_TICKET_MAX_AGE_SECONDS = 15 * 60
export const ACCESS_FLOW_OTP_MAX_ATTEMPTS = 5
export const ACCESS_FLOW_OTP_LENGTH = 6
export const ACCESS_FLOW_OTP_COOLDOWN_SECONDS = 60
export const ACCESS_FLOW_LINK_HOURS = 24
const ACCESS_FLOW_LINK_TOKEN_HASH_KEY = 'app_link_token_hash'
const ACCESS_FLOW_LINK_TOKEN_EXPIRES_AT_KEY = 'app_link_expires_at'

export type AuthFlowType = 'PRIMER_INGRESO' | 'RESET_PASSWORD' | 'CHANGE_EMAIL'

export type AuthFlowState =
  | 'AWAITING_EMAIL_CONFIRMATION'
  | 'EMAIL_CONFIRMED_PASSWORD_PENDING'
  | 'RESET_LINK_SENT'
  | 'RESET_PASSWORD_PENDING'
  | 'RELOGIN_REQUIRED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'

export type AuthActivationFlowRow = {
  id: string
  usuario_id: string
  auth_user_id: string | null
  tipo_flujo: AuthFlowType
  estado: AuthFlowState
  correo_anterior: string | null
  correo_pendiente: string | null
  correo_confirmado: string | null
  link_sent_at: string | null
  link_expires_at: string | null
  email_confirmed_at: string | null
  otp_code_hash: string | null
  otp_expires_at: string | null
  otp_sent_at: string | null
  otp_attempts: number
  activation_ticket_hash: string | null
  activation_ticket_expires_at: string | null
  password_set_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type UpsertAuthFlowInput = {
  usuarioId: string
  authUserId?: string | null
  tipoFlujo: AuthFlowType
  estado: AuthFlowState
  correoAnterior?: string | null
  correoPendiente?: string | null
  correoConfirmado?: string | null
  linkSentAt?: string | null
  linkExpiresAt?: string | null
  emailConfirmedAt?: string | null
  otpCodeHash?: string | null
  otpExpiresAt?: string | null
  otpSentAt?: string | null
  otpAttempts?: number
  activationTicketHash?: string | null
  activationTicketExpiresAt?: string | null
  passwordSetAt?: string | null
  completedAt?: string | null
  metadata?: Record<string, unknown>
}

export function isFlowActive(state: AuthFlowState) {
  return (
    state === 'AWAITING_EMAIL_CONFIRMATION' ||
    state === 'EMAIL_CONFIRMED_PASSWORD_PENDING' ||
    state === 'RESET_LINK_SENT' ||
    state === 'RESET_PASSWORD_PENDING' ||
    state === 'RELOGIN_REQUIRED'
  )
}

export function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

export function addHoursToIso(hours: number, from = new Date()) {
  const next = new Date(from.getTime() + hours * 60 * 60 * 1000)
  return next.toISOString()
}

export function addMinutesToIso(minutes: number, from = new Date()) {
  const next = new Date(from.getTime() + minutes * 60 * 1000)
  return next.toISOString()
}

async function sha256(value: string) {
  const payload = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashSecret(value: string) {
  return sha256(value.trim())
}

export function createOtpCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ACCESS_FLOW_OTP_LENGTH))
  return Array.from(bytes)
    .map((value) => String(value % 10))
    .join('')
}

export function createOpaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeFlowMetadata(metadata: Record<string, unknown> | null | undefined) {
  return metadata && typeof metadata === 'object' ? { ...metadata } : {}
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export async function cancelarFlujosActivos(
  usuarioId: string,
  tipoFlujo?: AuthFlowType
) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible cancelar los flujos activos.')
  }

  let query = service
    .from('auth_activation_flow')
    .update({
      estado: 'CANCELLED',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('usuario_id', usuarioId)
    .in('estado', [
      'AWAITING_EMAIL_CONFIRMATION',
      'EMAIL_CONFIRMED_PASSWORD_PENDING',
      'RESET_LINK_SENT',
      'RESET_PASSWORD_PENDING',
      'RELOGIN_REQUIRED',
    ])

  if (tipoFlujo) {
    query = query.eq('tipo_flujo', tipoFlujo)
  }

  const { error: updateError } = await query

  if (updateError) {
    throw updateError
  }
}

export async function upsertAuthFlow(input: UpsertAuthFlowInput) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible preparar el flujo de acceso.')
  }

  await cancelarFlujosActivos(input.usuarioId, input.tipoFlujo)

  const now = new Date().toISOString()
  const payload = {
    usuario_id: input.usuarioId,
    auth_user_id: input.authUserId ?? null,
    tipo_flujo: input.tipoFlujo,
    estado: input.estado,
    correo_anterior: normalizeEmail(input.correoAnterior) ?? null,
    correo_pendiente: normalizeEmail(input.correoPendiente) ?? null,
    correo_confirmado: normalizeEmail(input.correoConfirmado) ?? null,
    link_sent_at: input.linkSentAt ?? null,
    link_expires_at: input.linkExpiresAt ?? null,
    email_confirmed_at: input.emailConfirmedAt ?? null,
    otp_code_hash: input.otpCodeHash ?? null,
    otp_expires_at: input.otpExpiresAt ?? null,
    otp_sent_at: input.otpSentAt ?? null,
    otp_attempts: input.otpAttempts ?? 0,
    activation_ticket_hash: input.activationTicketHash ?? null,
    activation_ticket_expires_at: input.activationTicketExpiresAt ?? null,
    password_set_at: input.passwordSetAt ?? null,
    completed_at: input.completedAt ?? null,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  }

  const { data, error: insertError } = await service
    .from('auth_activation_flow')
    .insert(payload)
    .select('*')
    .single()

  if (insertError || !data) {
    throw insertError ?? new Error('No fue posible guardar el flujo de acceso.')
  }

  return data as AuthActivationFlowRow
}

export async function findActiveAuthFlowByUser(
  usuarioId: string,
  tipoFlujo?: AuthFlowType
) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible consultar el flujo de acceso.')
  }

  let query = service
    .from('auth_activation_flow')
    .select('*')
    .eq('usuario_id', usuarioId)
    .in('estado', [
      'AWAITING_EMAIL_CONFIRMATION',
      'EMAIL_CONFIRMED_PASSWORD_PENDING',
      'RESET_LINK_SENT',
      'RESET_PASSWORD_PENDING',
      'RELOGIN_REQUIRED',
    ])
    .order('created_at', { ascending: false })
    .limit(1)

  if (tipoFlujo) {
    query = query.eq('tipo_flujo', tipoFlujo)
  }

  const { data, error: selectError } = await query.maybeSingle()

  if (selectError) {
    throw selectError
  }

  return (data ?? null) as AuthActivationFlowRow | null
}

export async function findLatestAuthFlowByUser(
  usuarioId: string,
  tipoFlujo?: AuthFlowType
) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible consultar el flujo de acceso.')
  }

  let query = service
    .from('auth_activation_flow')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (tipoFlujo) {
    query = query.eq('tipo_flujo', tipoFlujo)
  }

  const { data, error: selectError } = await query.maybeSingle()

  if (selectError) {
    throw selectError
  }

  return (data ?? null) as AuthActivationFlowRow | null
}

export async function findAuthFlowById(flowId: string) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible consultar el flujo de acceso.')
  }

  const { data, error: selectError } = await service
    .from('auth_activation_flow')
    .select('*')
    .eq('id', flowId)
    .maybeSingle()

  if (selectError) {
    throw selectError
  }

  return (data ?? null) as AuthActivationFlowRow | null
}

export async function findLatestPasswordPendingFlowByEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    return null
  }

  const { service, error } = obtenerClienteAdmin()
  if (!service) {
    throw new Error(error ?? 'No fue posible consultar el flujo por correo.')
  }

  const { data, error: selectError } = await service
    .from('auth_activation_flow')
    .select('*')
    .eq('correo_confirmado', normalized)
    .eq('estado', 'EMAIL_CONFIRMED_PASSWORD_PENDING')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (selectError) {
    throw selectError
  }

  return (data ?? null) as AuthActivationFlowRow | null
}

export async function updateAuthFlow(
  flowId: string,
  patch: Partial<Omit<AuthActivationFlowRow, 'id' | 'usuario_id' | 'tipo_flujo' | 'created_at'>>
) {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible actualizar el flujo de acceso.')
  }

  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  }

  const { data, error: updateError } = await service
    .from('auth_activation_flow')
    .update(payload)
    .eq('id', flowId)
    .select('*')
    .single()

  if (updateError || !data) {
    throw updateError ?? new Error('No fue posible actualizar el flujo de acceso.')
  }

  return data as AuthActivationFlowRow
}

export async function markFlowExpired(flowId: string) {
  return updateAuthFlow(flowId, {
    estado: 'EXPIRED',
    completed_at: new Date().toISOString(),
  })
}

export async function markFlowCompleted(flowId: string) {
  return updateAuthFlow(flowId, {
    estado: 'COMPLETED',
    completed_at: new Date().toISOString(),
  })
}

export async function issueActivationOtp(flow: AuthActivationFlowRow) {
  const now = new Date()
  const resendAt = flow.otp_sent_at ? new Date(flow.otp_sent_at) : null

  if (resendAt) {
    const waitUntil = resendAt.getTime() + ACCESS_FLOW_OTP_COOLDOWN_SECONDS * 1000
    if (Date.now() < waitUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((waitUntil - Date.now()) / 1000))
      throw new Error(`Espera ${remainingSeconds} segundos antes de solicitar otro codigo.`)
    }
  }

  const code = createOtpCode()
  const hashedCode = await hashSecret(code)
  const updated = await updateAuthFlow(flow.id, {
    otp_code_hash: hashedCode,
    otp_sent_at: now.toISOString(),
    otp_expires_at: addMinutesToIso(15, now),
    otp_attempts: 0,
  })

  return { code, flow: updated }
}

export async function validateActivationOtp(flow: AuthActivationFlowRow, code: string) {
  if (!flow.otp_code_hash || !flow.otp_expires_at) {
    throw new Error('Todavia no existe un codigo activo para esta cuenta.')
  }

  if (new Date(flow.otp_expires_at).getTime() < Date.now()) {
    await markFlowExpired(flow.id)
    throw new Error('El codigo ya expiro. Solicita uno nuevo para continuar.')
  }

  if (flow.otp_attempts >= ACCESS_FLOW_OTP_MAX_ATTEMPTS) {
    await markFlowExpired(flow.id)
    throw new Error('Se agotaron los intentos permitidos. Solicita un nuevo codigo.')
  }

  const hashedCode = await hashSecret(code)

  if (hashedCode !== flow.otp_code_hash) {
    await updateAuthFlow(flow.id, {
      otp_attempts: flow.otp_attempts + 1,
    })
    throw new Error('El codigo no coincide. Verifica los 6 digitos e intenta nuevamente.')
  }

  const updated = await issueActivationTicket(flow, {
    otp_code_hash: null,
    otp_expires_at: null,
    otp_sent_at: null,
    otp_attempts: 0,
  })

  return updated
}

export async function issueActivationTicket(
  flow: AuthActivationFlowRow,
  patch?: Partial<Pick<AuthActivationFlowRow, 'otp_code_hash' | 'otp_expires_at' | 'otp_sent_at' | 'otp_attempts'>>
) {
  const ticket = createOpaqueToken()
  const ticketHash = await hashSecret(ticket)
  const updated = await updateAuthFlow(flow.id, {
    activation_ticket_hash: ticketHash,
    activation_ticket_expires_at: addMinutesToIso(ACCESS_FLOW_TICKET_MAX_AGE_SECONDS / 60),
    ...patch,
  })

  const cookieStore = await cookies()
  cookieStore.set(ACCESS_FLOW_COOKIE, ticket, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: ACCESS_FLOW_TICKET_MAX_AGE_SECONDS,
  })

  return updated
}

export async function issueFlowLinkToken(flow: AuthActivationFlowRow) {
  const now = new Date()
  const token = createOpaqueToken()
  const hashedToken = await hashSecret(token)
  const metadata = normalizeFlowMetadata(flow.metadata)
  const resendCount = readMetadataNumber(metadata, 'resend_count') ?? 0

  const updated = await updateAuthFlow(flow.id, {
    link_sent_at: now.toISOString(),
    link_expires_at: addHoursToIso(ACCESS_FLOW_LINK_HOURS, now),
    metadata: {
      ...metadata,
      resend_count: resendCount + 1,
      [ACCESS_FLOW_LINK_TOKEN_HASH_KEY]: hashedToken,
      [ACCESS_FLOW_LINK_TOKEN_EXPIRES_AT_KEY]: addHoursToIso(ACCESS_FLOW_LINK_HOURS, now),
    },
  })

  return { token, flow: updated }
}

export async function validateFlowLinkToken(flow: AuthActivationFlowRow, token: string) {
  const metadata = normalizeFlowMetadata(flow.metadata)
  const tokenHash = readMetadataString(metadata, ACCESS_FLOW_LINK_TOKEN_HASH_KEY)
  const tokenExpiresAt = readMetadataString(metadata, ACCESS_FLOW_LINK_TOKEN_EXPIRES_AT_KEY)

  if (!tokenHash || !tokenExpiresAt) {
    return { valid: false, expired: false }
  }

  if (new Date(tokenExpiresAt).getTime() < Date.now()) {
    return { valid: false, expired: true }
  }

  return {
    valid: (await hashSecret(token)) === tokenHash,
    expired: false,
  }
}

export function clearFlowLinkTokenMetadata(flow: AuthActivationFlowRow) {
  const metadata = normalizeFlowMetadata(flow.metadata)
  delete metadata[ACCESS_FLOW_LINK_TOKEN_HASH_KEY]
  delete metadata[ACCESS_FLOW_LINK_TOKEN_EXPIRES_AT_KEY]
  return metadata
}

export async function readActivationTicketValidity(flow: AuthActivationFlowRow) {
  const cookieStore = await cookies()
  const ticket = cookieStore.get(ACCESS_FLOW_COOKIE)?.value ?? null

  if (!ticket || !flow.activation_ticket_hash || !flow.activation_ticket_expires_at) {
    return false
  }

  if (new Date(flow.activation_ticket_expires_at).getTime() < Date.now()) {
    return false
  }

  return (await hashSecret(ticket)) === flow.activation_ticket_hash
}

export async function clearActivationTicket() {
  const cookieStore = await cookies()
  cookieStore.set(ACCESS_FLOW_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  })
}
