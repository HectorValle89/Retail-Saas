import 'server-only'

import { Resend } from 'resend'
import { readRuntimeEnv } from '@/lib/runtime/env'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const TRANSACTIONAL_EMAIL_OVERRIDE_TO = 'TRANSACTIONAL_EMAIL_OVERRIDE_TO'

interface TransactionalEmailRecipient {
  email: string
  name?: string
}

interface TransactionalEmailInput {
  to: TransactionalEmailRecipient
  subject: string
  text?: string
  html?: string
  attachments?: Record<string, string>
  headers?: Record<string, string>
  variables?: Record<string, string | number | boolean | null>
}

interface ResolvedTransactionalRecipient {
  email: string
  name: string
  originalEmail: string
  originalName: string
  routedToOverride: boolean
  overrideEmail: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

function normalizeRecipientName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim() ?? ''
  return normalized || fallback
}

function resolveTransactionalRecipient(input: TransactionalEmailInput): ResolvedTransactionalRecipient {
  const originalEmail = normalizeEmail(input.to.email)

  if (!originalEmail) {
    throw new Error('El destinatario del email transaccional no es valido.')
  }

  const originalName = normalizeRecipientName(input.to.name, originalEmail)
  const overrideEmail = normalizeEmail(readRuntimeEnv(TRANSACTIONAL_EMAIL_OVERRIDE_TO))

  if (overrideEmail && overrideEmail !== originalEmail) {
    return {
      email: overrideEmail,
      name: originalName,
      originalEmail,
      originalName,
      routedToOverride: true,
      overrideEmail,
    }
  }

  return {
    email: originalEmail,
    name: originalName,
    originalEmail,
    originalName,
    routedToOverride: false,
    overrideEmail: null,
  }
}

function mergeCustomHeaders(
  headers: Record<string, string> | undefined,
  extraHeaders: Array<{ name: string; value: string }>
) {
  const normalizedHeaders = new Map<string, string>()

  for (const [name, value] of Object.entries(headers ?? {})) {
    normalizedHeaders.set(name, value)
  }

  for (const header of extraHeaders) {
    normalizedHeaders.set(header.name, header.value)
  }

  return Array.from(normalizedHeaders.entries()).map(([name, value]) => ({ name, value }))
}

export function canSendTransactionalEmail() {
  const emailNotificationsEnabled = readRuntimeEnv('EMAIL_NOTIFICATIONS_ENABLED')
    ?.trim()
    .toLowerCase()

  if (!emailNotificationsEnabled || !ENABLED_VALUES.has(emailNotificationsEnabled)) {
    return false
  }

  return Boolean(readRuntimeEnv('RESEND_API_KEY')?.trim() && readRuntimeEnv('USUARIOS_FROM_EMAIL')?.trim())
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const fromEmail = readRuntimeEnv('USUARIOS_FROM_EMAIL')?.trim()
  const apiKey = readRuntimeEnv('RESEND_API_KEY')?.trim()
  const resolvedRecipient = resolveTransactionalRecipient(input)

  if (!apiKey || !fromEmail) {
    throw new Error('El canal de email con Resend no esta configurado (falta API Key o email origen).')
  }

  const resend = new Resend(apiKey)

  const messageHeaders = Object.fromEntries(
    mergeCustomHeaders(input.headers, []).map((header) => [header.name, header.value])
  )

  if (resolvedRecipient.routedToOverride) {
    Object.assign(
      messageHeaders,
      Object.fromEntries(
        mergeCustomHeaders(undefined, [
          { name: 'X-Original-Recipient', value: resolvedRecipient.originalEmail },
          { name: 'X-Original-Recipient-Name', value: resolvedRecipient.originalName },
          { name: 'X-Test-Recipient', value: resolvedRecipient.email },
        ]).map((header) => [header.name, header.value])
      )
    )
  }

  if (input.variables && Object.keys(input.variables).length > 0) {
    messageHeaders['X-Template-Variables'] = JSON.stringify(input.variables)
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [resolvedRecipient.email],
    subject: input.subject,
    text: input.text ?? '',
    html: input.html ?? '',
    headers: messageHeaders,
    attachments: input.attachments
      ? Object.entries(input.attachments).map(([filename, content]) => ({
          filename,
          content,
        }))
      : undefined,
  })

  if (error) {
    throw new Error(`Error de Resend: ${error.message}`)
  }
}
