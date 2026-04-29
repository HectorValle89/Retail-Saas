import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { sendWorkflowTransitionEmail } from '@/lib/notifications/workflowTransitionEmail'
import type { WorkflowNotificationRecipient } from './types'
import type { WorkflowNotificationEnvelope } from './workflowCatalog'

function normalizeRecipients(recipients: WorkflowNotificationRecipient[]) {
  const emailRecipients = new Map<string, { email: string; name: string }>()
  const employeeIds = new Set<string>()

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase()
    if (email && !emailRecipients.has(email)) {
      emailRecipients.set(email, {
        email,
        name: recipient.name.trim() || email,
      })
    }

    if (recipient.empleadoId?.trim()) {
      employeeIds.add(recipient.empleadoId.trim())
    }
  }

  return {
    emailRecipients: Array.from(emailRecipients.values()),
    employeeIds: Array.from(employeeIds),
  }
}

export async function sendWorkflowNotification(
  recipients: WorkflowNotificationRecipient[],
  envelope: WorkflowNotificationEnvelope
) {
  const normalized = normalizeRecipients(recipients)

  await Promise.allSettled([
    normalized.emailRecipients.length > 0
      ? sendWorkflowTransitionEmail({
          recipients: normalized.emailRecipients,
          subject: envelope.title,
          body: envelope.body,
          ctaLabel: envelope.ctaLabel,
          ctaUrl: envelope.ctaUrl,
        })
      : Promise.resolve(),
    normalized.employeeIds.length > 0 && envelope.pushPath
      ? sendOperationalPushNotification({
          employeeIds: normalized.employeeIds,
          title: envelope.pushTitle ?? envelope.title,
          body: envelope.pushBody ?? envelope.body,
          path: envelope.pushPath,
          tag: envelope.pushTag ?? envelope.workflow,
          data: {
            workflow: envelope.workflow,
            ...(envelope.data ?? {}),
          },
        })
      : Promise.resolve(),
  ])
}
