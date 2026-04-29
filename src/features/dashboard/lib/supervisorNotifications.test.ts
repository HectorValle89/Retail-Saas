import { describe, expect, it } from 'vitest'
import {
  markSupervisorNotificationAsRead,
  mergeSupervisorNotificationsSummary,
} from './supervisorNotifications'

describe('mergeSupervisorNotificationsSummary', () => {
  it('keeps the existing items when the refresh payload only contains counts', () => {
    const merged = mergeSupervisorNotificationsSummary(
      {
        unreadCount: 2,
        items: [
          {
            id: 'n-1',
            titulo: 'Aviso 1',
            cuerpo: 'Detalle 1',
            createdAt: '2026-04-18T10:00:00.000Z',
            estado: 'PENDIENTE',
            tipo: 'MENSAJE',
            remitente: 'Sistema',
          },
        ],
      },
      {
        unreadCount: 1,
        items: [],
      }
    )

    expect(merged).toEqual({
      unreadCount: 1,
      items: [
        {
          id: 'n-1',
          titulo: 'Aviso 1',
          cuerpo: 'Detalle 1',
          createdAt: '2026-04-18T10:00:00.000Z',
          estado: 'PENDIENTE',
          tipo: 'MENSAJE',
          remitente: 'Sistema',
        },
      ],
    })
  })
})

describe('markSupervisorNotificationAsRead', () => {
  it('marks the matching notification as read and decrements unread count once', () => {
    const updated = markSupervisorNotificationAsRead(
      {
        unreadCount: 2,
        items: [
          {
            id: 'n-1',
            titulo: 'Aviso 1',
            cuerpo: 'Detalle 1',
            createdAt: '2026-04-18T10:00:00.000Z',
            estado: 'PENDIENTE',
            tipo: 'MENSAJE',
            remitente: 'Sistema',
          },
          {
            id: 'n-2',
            titulo: 'Aviso 2',
            cuerpo: 'Detalle 2',
            createdAt: '2026-04-18T11:00:00.000Z',
            estado: 'LEIDO',
            tipo: 'MENSAJE',
            remitente: 'Sistema',
          },
        ],
      },
      'n-1'
    )

    expect(updated).toEqual({
      unreadCount: 1,
      items: [
        {
          id: 'n-1',
          titulo: 'Aviso 1',
          cuerpo: 'Detalle 1',
          createdAt: '2026-04-18T10:00:00.000Z',
          estado: 'LEIDO',
          tipo: 'MENSAJE',
          remitente: 'Sistema',
        },
        {
          id: 'n-2',
          titulo: 'Aviso 2',
          cuerpo: 'Detalle 2',
          createdAt: '2026-04-18T11:00:00.000Z',
          estado: 'LEIDO',
          tipo: 'MENSAJE',
          remitente: 'Sistema',
        },
      ],
    })
  })
})
