import { expect, test, vi } from 'vitest'

const {
  sendOperationalPushNotificationMock,
  sendWorkflowTransitionEmailMock,
} = vi.hoisted(() => ({
  sendOperationalPushNotificationMock: vi.fn().mockResolvedValue(undefined),
  sendWorkflowTransitionEmailMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push/pushFanout', () => ({
  sendOperationalPushNotification: sendOperationalPushNotificationMock,
}))

vi.mock('@/lib/notifications/workflowTransitionEmail', () => ({
  sendWorkflowTransitionEmail: sendWorkflowTransitionEmailMock,
}))

import { sendWorkflowNotification } from './workflowFanout'

test('envia correo y push deduplicando destinatarios', async () => {
  await sendWorkflowNotification(
    [
      { email: 'coord@empresa.com', name: 'Coord Uno', empleadoId: 'emp-1' },
      { email: 'coord@empresa.com', name: 'Coord Uno Duplicado', empleadoId: 'emp-1' },
      { email: 'admin@empresa.com', name: 'Admin Uno', empleadoId: 'emp-2' },
    ],
    {
      workflow: 'ruta_enviada_coordinacion',
      title: 'Nueva ruta semanal',
      body: 'La ruta semanal fue enviada.',
      ctaLabel: 'Revisar ruta',
      ctaUrl: 'https://beteele-one.com/ruta-semanal',
      pushTitle: 'Ruta semanal enviada',
      pushBody: 'La ruta semanal fue enviada.',
      pushPath: '/ruta-semanal',
      pushTag: 'ruta-semanal-enviada',
      data: { rutaId: 'ruta-1' },
    }
  )

  expect(sendWorkflowTransitionEmailMock).toHaveBeenCalledTimes(1)
  expect(sendWorkflowTransitionEmailMock).toHaveBeenCalledWith({
    recipients: [
      { email: 'coord@empresa.com', name: 'Coord Uno' },
      { email: 'admin@empresa.com', name: 'Admin Uno' },
    ],
    subject: 'Nueva ruta semanal',
    body: 'La ruta semanal fue enviada.',
    ctaLabel: 'Revisar ruta',
    ctaUrl: 'https://beteele-one.com/ruta-semanal',
  })

  expect(sendOperationalPushNotificationMock).toHaveBeenCalledTimes(1)
  expect(sendOperationalPushNotificationMock).toHaveBeenCalledWith({
    employeeIds: ['emp-1', 'emp-2'],
    title: 'Ruta semanal enviada',
    body: 'La ruta semanal fue enviada.',
    path: '/ruta-semanal',
    tag: 'ruta-semanal-enviada',
    data: {
      workflow: 'ruta_enviada_coordinacion',
      rutaId: 'ruta-1',
    },
  })
})
