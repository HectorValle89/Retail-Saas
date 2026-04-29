import { describe, expect, it } from 'vitest'
import { buildWeeklyRouteVisitSyncPlan } from './routeWeeklyPlan'

describe('buildWeeklyRouteVisitSyncPlan', () => {
  it('reconstruye solo las visitas editables y conserva las ya cerradas', () => {
    const result = buildWeeklyRouteVisitSyncPlan(
      [
        { diaSemana: 1, orden: 1, pdvId: 'pdv-completado', estatus: 'COMPLETADA' },
        { diaSemana: 2, orden: 1, pdvId: 'pdv-editable', estatus: 'PLANIFICADA' },
      ],
      [
        { day: 1, pdvId: 'pdv-completado', notes: null },
        { day: 1, pdvId: 'pdv-nuevo-1', notes: null },
        { day: 1, pdvId: 'pdv-nuevo-2', notes: null },
        { day: 2, pdvId: 'pdv-editable', notes: null },
      ]
    )

    expect(result.skippedLockedVisits).toEqual([{ day: 1, pdvId: 'pdv-completado', notes: null }])
    expect(result.insertVisits).toEqual([
      { day: 1, pdvId: 'pdv-nuevo-1', notes: null, orden: 2 },
      { day: 1, pdvId: 'pdv-nuevo-2', notes: null, orden: 3 },
      { day: 2, pdvId: 'pdv-editable', notes: null, orden: 1 },
    ])
  })
})
