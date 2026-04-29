import type { RutaSemanalItem } from '../services/rutaSemanalService'

export function isApprovedOperationalRoute(route: RutaSemanalItem) {
  return (
    route.totalVisitas > 0 &&
    route.approvalState === 'APROBADA' &&
    (route.estatus === 'PUBLICADA' || route.estatus === 'EN_PROGRESO' || route.estatus === 'CERRADA')
  )
}

export function isEditablePlanningRoute(route: RutaSemanalItem) {
  return route.totalVisitas > 0 && route.approvalState !== 'APROBADA' && route.estatus !== 'CERRADA'
}

export function getApprovedRouteForWeek(routes: RutaSemanalItem[], weekStart: string) {
  return routes.find(
    (route) => route.semanaInicio === weekStart && isApprovedOperationalRoute(route)
  ) ?? null
}

export function getEditableRouteForWeek(routes: RutaSemanalItem[], weekStart: string) {
  return (
    routes.find((route) => route.semanaInicio === weekStart && isEditablePlanningRoute(route)) ?? null
  )
}

function getWeeklyRouteDisplayPriority(route: RutaSemanalItem) {
  if (isApprovedOperationalRoute(route)) {
    return 3
  }

  if (route.totalVisitas > 0 && route.approvalState === 'CAMBIOS_SOLICITADOS') {
    return 2
  }

  if (route.totalVisitas > 0 && route.approvalState === 'PENDIENTE_COORDINACION') {
    return 1
  }

  return 0
}

export function getPlanningRouteForWeek(routes: RutaSemanalItem[], weekStart: string) {
  const weekRoutes = routes.filter((route) => route.semanaInicio === weekStart && route.totalVisitas > 0)

  return (
    [...weekRoutes].sort((left, right) => {
      const priorityDelta = getWeeklyRouteDisplayPriority(right) - getWeeklyRouteDisplayPriority(left)
      if (priorityDelta !== 0) {
        return priorityDelta
      }

      if (right.totalVisitas !== left.totalVisitas) {
        return right.totalVisitas - left.totalVisitas
      }

      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt)
      }

      return left.id.localeCompare(right.id)
    })[0] ?? null
  )
}

export function getCurrentOrFutureRoutes(routes: RutaSemanalItem[], minimumWeekStart: string) {
  return routes.filter((route) => route.semanaInicio >= minimumWeekStart)
}

export function getCoordinatorInitialWeekStart(
  routes: RutaSemanalItem[],
  fallbackWeekStart: string
) {
  // El usuario solicitó que siempre se muestre la semana actual por defecto.
  return fallbackWeekStart
}
