import { describe, expect, it } from 'vitest'
import {
  getCurrentOrFutureRoutes,
  getCoordinatorInitialWeekStart,
  getApprovedRouteForWeek,
  getEditableRouteForWeek,
  getPlanningRouteForWeek,
  isApprovedOperationalRoute,
  isEditablePlanningRoute,
} from './routeWorkspace'

const baseRoute = {
  id: 'route-1',
  cuentaClienteId: 'cliente-1',
  supervisorEmpleadoId: 'supervisor-1',
  supervisor: 'Supervisor',
  supervisorZona: null,
  semanaInicio: '2026-04-20',
  semanaFin: '2026-04-26',
  estatus: 'PUBLICADA' as const,
  notas: null,
  approvalState: 'APROBADA' as const,
  approvalNote: null,
  approvalReviewedAt: null,
  minimumVisitsPerPdv: null,
  expectedMonthlyVisits: null,
  pdvMonthlyQuotas: {},
  monthlyVisitsCompleted: 0,
  changeRequestState: 'NINGUNO' as const,
  changeRequestNote: null,
  changeRequestResolutionNote: null,
  changeRequestType: 'CAMBIO_DIA' as const,
  changeRequestTargetScope: 'VISITA' as const,
  changeRequestTargetVisitId: null,
  changeRequestTargetPdvId: null,
  changeRequestTargetDayNumber: null,
  changeRequestTargetDayLabel: null,
  changeRequestProposedVisits: [],
  changeRequestedAt: null,
  createdAt: '2026-04-20T00:00:00Z',
  updatedAt: '2026-04-20T00:00:00Z',
  totalVisitas: 4,
  visitasCompletadas: 0,
  editableDayNumbers: [1, 2],
  hasEditableFutureDays: true,
  visitas: [],
  agendaEventosCount: 0,
  pendientesReposicionCount: 0,
}

describe('routeWorkspace', () => {
  it('marca como aprobada una ruta publicada con approval aprobado', () => {
    expect(isApprovedOperationalRoute(baseRoute)).toBe(true)
    expect(isEditablePlanningRoute(baseRoute)).toBe(false)
  })

  it('excluye la ruta aprobada del lienzo editable de planeacion', () => {
    const routes = [
      baseRoute,
      {
        ...baseRoute,
        id: 'route-2',
        approvalState: 'PENDIENTE_COORDINACION' as const,
        estatus: 'BORRADOR' as const,
        totalVisitas: 2,
      },
    ]

    expect(getApprovedRouteForWeek(routes, '2026-04-20')?.id).toBe('route-1')
    expect(getEditableRouteForWeek(routes, '2026-04-20')?.id).toBe('route-2')
  })

  it('no propone una ruta aprobada como editable cuando esa semana ya quedo publicada', () => {
    const routes = [
      baseRoute,
      {
        ...baseRoute,
        id: 'route-3',
        semanaInicio: '2026-04-27',
        approvalState: 'APROBADA' as const,
        estatus: 'CERRADA' as const,
      },
    ]

    expect(getEditableRouteForWeek(routes, '2026-04-20')).toBeNull()
    expect(getEditableRouteForWeek(routes, '2026-04-27')).toBeNull()
  })

  it('prefiere la ruta semanal mas completa cuando conviven una aprobada y un borrador parcial', () => {
    const routes = [
      {
        ...baseRoute,
        id: 'route-full-week',
        approvalState: 'APROBADA' as const,
        estatus: 'PUBLICADA' as const,
        totalVisitas: 7,
        updatedAt: '2026-04-28T10:00:00Z',
      },
      {
        ...baseRoute,
        id: 'route-partial-draft',
        approvalState: 'PENDIENTE_COORDINACION' as const,
        estatus: 'BORRADOR' as const,
        totalVisitas: 1,
        updatedAt: '2026-04-28T12:00:00Z',
      },
    ]

    expect(getPlanningRouteForWeek(routes, '2026-04-20')?.id).toBe('route-full-week')
  })

  it('recorta rutas a la semana actual o futuras', () => {
    const routes = [
      {
        ...baseRoute,
        id: 'route-past',
        semanaInicio: '2026-04-13',
        semanaFin: '2026-04-19',
      },
      baseRoute,
      {
        ...baseRoute,
        id: 'route-future',
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
    ]

    expect(getCurrentOrFutureRoutes(routes, '2026-04-20').map((route) => route.id)).toEqual([
      'route-1',
      'route-future',
    ])
  })

  it('usa siempre la semana actual (fallback) como inicial para coordinacion', () => {
    const routes = [
      {
        ...baseRoute,
        id: 'route-past-pending',
        semanaInicio: '2026-04-13',
        semanaFin: '2026-04-19',
        approvalState: 'PENDIENTE_COORDINACION' as const,
        estatus: 'BORRADOR' as const,
        totalVisitas: 25,
      },
      {
        ...baseRoute,
        id: 'route-current-empty',
        semanaInicio: '2026-04-20',
        semanaFin: '2026-04-26',
        approvalState: 'PENDIENTE_COORDINACION' as const,
        estatus: 'BORRADOR' as const,
        totalVisitas: 0,
      },
      {
        ...baseRoute,
        id: 'route-future-pending',
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
        approvalState: 'PENDIENTE_COORDINACION' as const,
        estatus: 'BORRADOR' as const,
        totalVisitas: 12,
      },
    ]

    expect(getCoordinatorInitialWeekStart(routes, '2026-04-20')).toBe('2026-04-20')
  })
})
