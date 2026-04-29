import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildVisiblePdvIds,
  collectRutaReferencePdvIds,
  resolveRutaPdvSnapshot,
} from './rutaSemanalPdvLookup'
import { serializeRutaSemanalWorkflowMetadata, type RutaSemanalWorkflowMetadata } from '../lib/routeWorkflow'

describe('buildVisiblePdvIds', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('usa la fecha operativa de Mexico para respetar cierres del mismo dia', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T02:30:00.000Z'))

    const actor = {
      cuentaClienteId: 'cc-1',
    } as { cuentaClienteId: string | null }

    const visible = buildVisiblePdvIds(actor as never, [
      { pdv_id: 'pdv-1', cuenta_cliente_id: 'cc-1', activo: true, fecha_fin: '2026-04-12' },
    ])

    expect(Array.from(visible ?? [])).toEqual(['pdv-1'])
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
