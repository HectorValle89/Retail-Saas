import { buildNuevoCandidatoCoordinacionNotification as buildNuevoCandidatoCoordinacionWorkflowNotification } from '@/lib/notifications/workflows/workflowCatalog'

export function buildNuevoCandidatoCoordinacionNotification({
  empleadoId,
  nombreCompleto,
}: {
  empleadoId: string
  nombreCompleto: string
}): {
  puestosDestino: Array<'COORDINADOR'>
  workflow: string
  title: string
  body: string
  path: string
  tag: string
  auditAction: string
  pushTitle?: string
  pushBody?: string
  pushPath?: string
  pushTag?: string
  data?: Record<string, unknown>
} {
  const notification = buildNuevoCandidatoCoordinacionWorkflowNotification({ empleadoId, nombreCompleto })

  return {
    puestosDestino: ['COORDINADOR'],
    workflow: notification.workflow,
    title: notification.title,
    body: notification.body,
    path: notification.ctaUrl ?? '/empleados',
    tag: notification.pushTag ?? `empleado-nuevo-coordinacion-${empleadoId}`,
    auditAction: 'notificar_coordinacion_nuevo_candidato',
    pushTitle: notification.pushTitle,
    pushBody: notification.pushBody,
    pushPath: notification.pushPath,
    pushTag: notification.pushTag,
    data: notification.data,
  }
}
