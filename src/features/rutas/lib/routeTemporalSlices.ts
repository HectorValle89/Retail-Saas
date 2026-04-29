import { getWeekDateIso } from './weeklyRoute'

type VisitDayLike = {
  diaSemana: number
}

type RouteWithVisitsLike<TVisit extends VisitDayLike = VisitDayLike> = {
  semanaInicio: string
  visitas: TVisit[]
}

type RouteTemporalSliceLike = {
  totalVisitas: number
  approvalState: string
  estatus: string
  hasEditableFutureDays: boolean
  semanaInicio: string
  semanaFin: string
}

export function getEditableDayNumbersForRoute<T extends RouteWithVisitsLike>(route: T, todayIso: string) {
  return Array.from(new Set(route.visitas.map((visit) => visit.diaSemana)))
    .filter((dayNumber) => getWeekDateIso(route.semanaInicio, dayNumber) >= todayIso)
    .sort((left, right) => left - right)
}

export function getMonthBoundsIso(referenceIso: string) {
  const [yearRaw, monthRaw] = referenceIso.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const monthStart = `${yearRaw}-${monthRaw}-01`
  const monthEndDate = new Date(Date.UTC(year, month, 0))
  const monthEnd = monthEndDate.toISOString().slice(0, 10)

  return { monthStart, monthEnd }
}

export function buildSupervisorRouteSlices<T extends RouteTemporalSliceLike>(routes: T[], todayIso: string) {
  const { monthStart, monthEnd } = getMonthBoundsIso(todayIso)

  const rutasCorrecciones = routes.filter(
    (route) =>
      route.totalVisitas > 0 &&
      route.approvalState === 'APROBADA' &&
      (route.estatus === 'PUBLICADA' || route.estatus === 'EN_PROGRESO') &&
      route.hasEditableFutureDays
  )

  const rutasHistoricasMesActual = routes.filter(
    (route) => route.totalVisitas > 0 && route.semanaInicio <= monthEnd && route.semanaFin >= monthStart
  )

  return {
    rutasCorrecciones,
    rutasHistoricasMesActual,
  }
}
