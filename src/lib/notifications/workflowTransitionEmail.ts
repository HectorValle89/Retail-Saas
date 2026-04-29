import 'server-only'

import { canSendTransactionalEmail, sendTransactionalEmail } from './transactionalEmail'
import { renderEmailShell } from './emailShell'

export interface WorkflowTransitionEmailRecipient {
  email: string
  name: string
}

export interface WorkflowTransitionEmailInput {
  recipients: WorkflowTransitionEmailRecipient[]
  subject: string
  body: string
  ctaLabel?: string
  ctaUrl?: string | null
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildEmailText(body: string, ctaLabel?: string, ctaUrl?: string | null) {
  const lines = [body]

  if (ctaUrl) {
    lines.push('', `${ctaLabel ?? 'Abrir en Beteele One'}: ${ctaUrl}`)
  }

  return lines.join('\n')
}

function buildEmailHtml(subject: string, body: string, ctaLabel?: string, ctaUrl?: string | null) {
  const contentHtml = `<p style="white-space: pre-wrap;">${escapeHtml(body)}</p>`
  return renderEmailShell(subject, contentHtml, ctaLabel, ctaUrl)
}

export async function sendWorkflowTransitionEmail(input: WorkflowTransitionEmailInput) {
  if (!canSendTransactionalEmail()) {
    return
  }

  const uniqueRecipients = Array.from(
    new Map(
      input.recipients
        .map((recipient) => ({
          email: recipient.email.trim().toLowerCase(),
          name: recipient.name.trim() || recipient.email.trim(),
        }))
        .filter((recipient) => Boolean(recipient.email))
        .map((recipient) => [recipient.email, recipient] as const)
    ).values()
  )

  if (uniqueRecipients.length === 0) {
    return
  }

  const text = buildEmailText(input.body, input.ctaLabel, input.ctaUrl)
  const html = buildEmailHtml(input.subject, input.body, input.ctaLabel, input.ctaUrl)

  await Promise.allSettled(
    uniqueRecipients.map((recipient) =>
      sendTransactionalEmail({
        to: {
          email: recipient.email,
          name: recipient.name,
        },
        subject: input.subject,
        text,
        html,
      })
    )
  )
}
