import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))

import {
  buildSupervisorRouteSnapshotFromRpcPayload,
  resolveDermoconsejoCheckInAssignmentContext,
} from './dashboardService'

describe('buildSupervisorRouteSnapshotFromRpcPayload', () => {
  it('normalizes the rpc payload into a supervisor route snapshot', () => {
    const snapshot = buildSupervisorRouteSnapshotFromRpcPayload(
      {
        totalRutas: '12',
        totalVisitas: 8,
        visitasCompletadas: '5',
        pendientesReposicion: '3',
        currentWeekStart: '2026-04-13',
        nextWeekStart: '2026-04-20',
        nextWeekEnd: '2026-04-26',
        hasCurrentWeekRoute: 1,
        hasNextWeekRoute: 'true',
      },
      {
        currentWeekIso: '2026-04-13',
        nextWeekStart: '2026-04-20',
        nextWeekEnd: '2026-04-26',
      }
    )

    expect(snapshot).toEqual({
      totalRutas: 12,
      totalVisitas: 8,
      visitasCompletadas: 5,
      pendientesReposicion: 3,
      currentWeekStart: '2026-04-13',
      nextWeekStart: '2026-04-20',
      nextWeekEnd: '2026-04-26',
      hasCurrentWeekRoute: true,
      hasNextWeekRoute: true,
    })
  })

  it('falls back to the provided dates when the payload is incomplete', () => {
    const snapshot = buildSupervisorRouteSnapshotFromRpcPayload(null, {
      currentWeekIso: '2026-04-13',
      nextWeekStart: '2026-04-20',
      nextWeekEnd: '2026-04-26',
    })

    expect(snapshot).toEqual({
      totalRutas: 0,
      totalVisitas: 0,
      visitasCompletadas: 0,
      pendientesReposicion: 0,
      currentWeekStart: '2026-04-13',
      nextWeekStart: '2026-04-20',
      nextWeekEnd: '2026-04-26',
      hasCurrentWeekRoute: false,
      hasNextWeekRoute: false,
    })
  })
})

describe('resolveDermoconsejoCheckInAssignmentContext', () => {
  it('prefers the effective assignment when available', () => {
    expect(
      resolveDermoconsejoCheckInAssignmentContext(
        {
          id: 'assignment-effective',
          cuenta_cliente_id: 'cliente-1',
          pdv_id: 'pdv-1',
          horario_referencia: '8x5',
        },
        {
          id: 'assignment-primary',
          cuenta_cliente_id: 'cliente-2',
          pdv_id: 'pdv-2',
          horario_referencia: '9x6',
        }
      )
    ).toEqual({
      assignmentId: 'assignment-effective',
      assignmentSchedule: '8x5',
      cuentaClienteId: 'cliente-1',
      pdvId: 'pdv-1',
    })
  })

  it('falls back to the primary assignment when the effective one is absent', () => {
    expect(
      resolveDermoconsejoCheckInAssignmentContext(null, {
        id: 'assignment-primary',
        cuenta_cliente_id: 'cliente-2',
        pdv_id: 'pdv-2',
        horario_referencia: '9x6',
      })
    ).toEqual({
      assignmentId: 'assignment-primary',
      assignmentSchedule: '9x6',
      cuentaClienteId: 'cliente-2',
      pdvId: 'pdv-2',
    })
  })

  it('returns a null context when no assignment is available', () => {
    expect(resolveDermoconsejoCheckInAssignmentContext(null, null)).toEqual({
      assignmentId: null,
      assignmentSchedule: null,
      cuentaClienteId: null,
      pdvId: null,
    })
  })
})
