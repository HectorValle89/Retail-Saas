import type { DashboardDermoconsejoNotificationItem, DashboardDermoconsejoNotificationsSummary } from '@/features/dashboard/services/dashboardService'

export function mergeSupervisorNotificationsSummary(
  current: DashboardDermoconsejoNotificationsSummary,
  incoming: DashboardDermoconsejoNotificationsSummary
): DashboardDermoconsejoNotificationsSummary {
  if (incoming.items.length > 0) {
    return incoming
  }

  if (current.items.length > 0) {
    return {
      unreadCount: incoming.unreadCount,
      items: current.items,
    }
  }

  return incoming
}

export function markSupervisorNotificationAsRead(
  summary: DashboardDermoconsejoNotificationsSummary,
  receptorId: string
): DashboardDermoconsejoNotificationsSummary {
  let foundPending = false

  const items = summary.items.map((item) => {
    if (item.id !== receptorId) {
      return item
    }

    if (item.estado === 'PENDIENTE') {
      foundPending = true
    }

    return {
      ...item,
      estado: 'LEIDO' as DashboardDermoconsejoNotificationItem['estado'],
    }
  })

  return {
    unreadCount: foundPending ? Math.max(0, summary.unreadCount - 1) : summary.unreadCount,
    items,
  }
}
