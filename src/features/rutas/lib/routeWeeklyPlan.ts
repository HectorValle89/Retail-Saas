export type RouteWeeklyPlanExistingVisit = {
  diaSemana: number
  orden: number
  pdvId: string
  estatus: string
}

export type RouteWeeklyPlanDraftVisit = {
  day: number
  pdvId: string
  notes: string | null
}

export type RouteWeeklyPlanInsertVisit = RouteWeeklyPlanDraftVisit & {
  orden: number
}

export type RouteWeeklyPlanResult = {
  insertVisits: RouteWeeklyPlanInsertVisit[]
  skippedLockedVisits: RouteWeeklyPlanDraftVisit[]
}

function isEditableRouteVisitStatus(status: string) {
  return status === 'PLANIFICADA' || status === 'CANCELADA'
}

function buildRouteVisitKey(day: number, pdvId: string) {
  return `${day}:${pdvId}`
}

export function buildWeeklyRouteVisitSyncPlan(
  existingVisits: RouteWeeklyPlanExistingVisit[],
  plannedVisits: RouteWeeklyPlanDraftVisit[]
): RouteWeeklyPlanResult {
  const lockedKeys = new Set<string>()
  const occupiedOrdersByDay = new Map<number, Set<number>>()

  for (const visit of existingVisits) {
    if (isEditableRouteVisitStatus(visit.estatus)) {
      continue
    }

    lockedKeys.add(buildRouteVisitKey(visit.diaSemana, visit.pdvId))

    const dayOrders = occupiedOrdersByDay.get(visit.diaSemana) ?? new Set<number>()
    dayOrders.add(visit.orden)
    occupiedOrdersByDay.set(visit.diaSemana, dayOrders)
  }

  const insertVisits: RouteWeeklyPlanInsertVisit[] = []
  const skippedLockedVisits: RouteWeeklyPlanDraftVisit[] = []

  for (const visit of plannedVisits) {
    const visitKey = buildRouteVisitKey(visit.day, visit.pdvId)
    if (lockedKeys.has(visitKey)) {
      skippedLockedVisits.push(visit)
      continue
    }

    const dayOrders = occupiedOrdersByDay.get(visit.day) ?? new Set<number>()
    let order = 1

    while (dayOrders.has(order)) {
      order += 1
    }

    dayOrders.add(order)
    occupiedOrdersByDay.set(visit.day, dayOrders)

    insertVisits.push({
      ...visit,
      orden: order,
    })
  }

  return {
    insertVisits,
    skippedLockedVisits,
  }
}
