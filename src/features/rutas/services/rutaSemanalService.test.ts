import { describe, expect, it } from 'vitest'
import {
  buildVisiblePdvIds,
  collectRutaReferencePdvIds,
  resolveRutaPdvSnapshot,
} from './rutaSemanalPdvLookup'
import { buildSupervisorRouteSlices, getEditableDayNumbersForRoute } from '../lib/routeTemporalSlices'
import { serializeRutaSemanalWorkflowMetadata, type RutaSemanalWorkflowMetadata } from '../lib/routeWorkflow'

describe('buildVisiblePdvIds', () => {
  it('resuelve solo los PDVs activos de la cuenta actual', () => {
    const actor = {
      cuentaClienteId: 'cc-1',
    } as { cuentaClienteId: string | null }

    const visible = buildVisiblePdvIds(actor as never, [
      { pdv_id: 'pdv-1', cuenta_cliente_id: 'cc-1', activo: true, fecha_fin: null },
      { pdv_id: 'pdv-2', cuenta_cliente_id: 'cc-1', activo: false, fecha_fin: null },
      { pdv_id: 'pdv-3', cuenta_cliente_id: 'cc-2', activo: true, fecha_fin: null },
      { pdv_id: 'pdv-4', cuenta_cliente_id: 'cc-1', activo: true, fecha_fin: '2026-04-20' },
    ])

    expect(Array.from(visible ?? [])).toEqual(['pdv-1'])
  })

  it('retorna null cuando no existe cuenta cliente operativa', () => {
    expect(buildVisiblePdvIds({ cuentaClienteId: null } as never, [])).toBeNull()
  })
})

describe('resolveRutaPdvSnapshot', () => {
  it('usa el PDV ligado a la ruta aunque el catalogo visible no lo tenga', () => {
    const linkedPdv = {
      id: 'pdv-9',
      clave_btl: 'BTL-009',
      nombre: 'Farmacia Centro',
      zona: 'Centro',
      direccion: 'Av. Principal 123',
      estatus: 'ACTIVO',
      formato: '400',
    }

    const fallbackPdv = {
      id: 'pdv-9',
      clave_btl: 'BTL-009',
      nombre: 'Farmacia Vieja',
      zona: 'Norte',
      direccion: 'Calle Secundaria 99',
      estatus: 'ACTIVO',
      formato: '400',
    }

    expect(resolveRutaPdvSnapshot(linkedPdv, fallbackPdv)).toMatchObject({
      id: 'pdv-9',
      nombre: 'Farmacia Centro',
      clave_btl: 'BTL-009',
      zona: 'Centro',
    })
  })
})

function buildWorkflowMetadata(
  changeRequestOverrides: Partial<RutaSemanalWorkflowMetadata['changeRequest']> = {}
) {
  return serializeRutaSemanalWorkflowMetadata({
    expectedMonthlyVisits: null,
    minimumVisitsPerPdv: null,
    pdvMonthlyQuotas: {},
    approval: {
      state: 'APROBADA',
      note: null,
      reviewedAt: null,
      reviewedByUsuarioId: null,
    },
    changeRequest: {
      status: 'PENDIENTE',
      note: null,
      resolutionNote: null,
      requestType: 'CAMBIO_TIENDA',
      targetScope: 'VISITA',
      targetVisitId: null,
      targetPdvId: null,
      targetDayNumber: 1,
      targetDayLabel: 'Lunes',
      proposedVisits: [],
      requestedAt: null,
      requestedByUsuarioId: null,
      resolvedAt: null,
      resolvedByUsuarioId: null,
      previousApprovalState: null,
      previousRouteStatus: null,
      ...changeRequestOverrides,
    },
  })
}

describe('collectRutaReferencePdvIds', () => {
  it('incluye targetPdvId y propuestas de cambio sin duplicados', () => {
    const routes = [
      {
        metadata: buildWorkflowMetadata({
          targetPdvId: 'pdv-1',
          proposedVisits: [
            { pdvId: 'pdv-1', order: 1 },
            { pdvId: 'pdv-2', order: 2 },
          ],
        }),
      },
      {
        metadata: buildWorkflowMetadata({
          targetPdvId: 'pdv-3',
          proposedVisits: [{ pdvId: 'pdv-4', order: 1 }],
        }),
      },
    ]

    expect(Array.from(collectRutaReferencePdvIds(routes))).toEqual(['pdv-1', 'pdv-2', 'pdv-3', 'pdv-4'])
  })
})

describe('getEditableDayNumbersForRoute', () => {
  it('solo deja dias con fecha operativa actual o futura', () => {
    const editableDays = getEditableDayNumbersForRoute(
      {
        semanaInicio: '2026-04-20',
        visitas: [
          { diaSemana: 1 },
          { diaSemana: 2 },
          { diaSemana: 4 },
          { diaSemana: 6 },
        ] as Array<{ diaSemana: number } & Record<string, unknown>>,
      },
      '2026-04-23'
    )

    expect(editableDays).toEqual([4, 6])
  })
})

describe('buildSupervisorRouteSlices', () => {
  it('manda a correcciones solo rutas publicadas o en progreso con dias editables', () => {
    const routes = [
      {
        id: 'route-current',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-20',
        semanaFin: '2026-04-26',
      },
      {
        id: 'route-past',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: false,
        semanaInicio: '2026-04-13',
        semanaFin: '2026-04-19',
      },
      {
        id: 'route-draft',
        totalVisitas: 4,
        approvalState: 'PENDIENTE_COORDINACION',
        estatus: 'BORRADOR',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
      {
        id: 'route-progress',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'EN_PROGRESO',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
    ]

    const slices = buildSupervisorRouteSlices(routes, '2026-04-23')

    expect(slices.rutasCorrecciones.map((route) => route.id)).toEqual(['route-current', 'route-progress'])
  })

  it('limita historicos a rutas que se traslapan con el mes actual', () => {
    const routes = [
      {
        id: 'route-april',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-20',
        semanaFin: '2026-04-26',
      },
      {
        id: 'route-overlap',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'EN_PROGRESO',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
      {
        id: 'route-may',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-05-04',
        semanaFin: '2026-05-10',
      },
    ]

    const slices = buildSupervisorRouteSlices(routes, '2026-04-23')

    expect(slices.rutasHistoricasMesActual.map((route) => route.id)).toEqual(['route-april', 'route-overlap'])
  })
})
