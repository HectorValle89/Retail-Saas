import { describe, expect, it } from 'vitest'
import { resolveCheckInAssignmentForPersistence } from './assignmentPersistence'

function buildAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asig-1',
    empleado_id: 'emp-1',
    pdv_id: 'pdv-1',
    cuenta_cliente_id: 'cuenta-1',
    supervisor_empleado_id: 'sup-1',
    fecha_inicio: '2026-03-01',
    fecha_fin: null,
    dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB,DOM',
    dia_descanso: 'SIN',
    horario_referencia: '09:00-18:00',
    naturaleza: 'BASE',
    prioridad: 100,
    tipo: 'FIJA',
    estado_publicacion: 'PUBLICADA' as const,
    ...overrides,
  }
}

function createService({
  directAssignment,
  fallbackAssignments,
}: {
  directAssignment: Record<string, unknown> | null
  fallbackAssignments: Array<Record<string, unknown>>
}) {
  const selectCalls: Array<{ filters: Record<string, unknown>; mode: 'maybeSingle' | 'limit' }> = []

  return {
    from(table: string) {
      if (table !== 'asignacion') {
        throw new Error(`Unexpected table ${table}`)
      }

      const state = {
        filters: {} as Record<string, unknown>,
      }

      const chain = {
        select() {
          return chain
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value
          return chain
        },
        lte(column: string, value: unknown) {
          state.filters[column] = value
          return chain
        },
        or() {
          return chain
        },
        order() {
          return chain
        },
        limit() {
          selectCalls.push({ filters: { ...state.filters }, mode: 'limit' })
          return Promise.resolve({ data: fallbackAssignments, error: null })
        },
        maybeSingle() {
          selectCalls.push({ filters: { ...state.filters }, mode: 'maybeSingle' })
          return Promise.resolve({ data: directAssignment, error: null })
        },
      }

      return chain
    },
    selectCalls,
  }
}

describe('resolveCheckInAssignmentForPersistence', () => {
  it('usa la asignacion directa cuando sigue vigente', async () => {
    const service = createService({
      directAssignment: buildAssignmentRow(),
      fallbackAssignments: [],
    })

    await expect(
      resolveCheckInAssignmentForPersistence(service as never, {
        assignmentId: 'asig-1',
        empleadoId: 'emp-1',
        pdvId: 'pdv-1',
        fechaOperacion: '2026-03-18',
      })
    ).resolves.toMatchObject({
      id: 'asig-1',
      empleado_id: 'emp-1',
      pdv_id: 'pdv-1',
    })
  })

  it('reconstruye la asignacion desde el rango activo cuando la asignacion directa ya no existe', async () => {
    const service = createService({
      directAssignment: null,
      fallbackAssignments: [buildAssignmentRow()],
    })

    await expect(
      resolveCheckInAssignmentForPersistence(service as never, {
        assignmentId: 'asig-obsoleta',
        empleadoId: 'emp-1',
        pdvId: 'pdv-1',
        fechaOperacion: '2026-03-18',
      })
    ).resolves.toMatchObject({
      id: 'asig-1',
      empleado_id: 'emp-1',
      pdv_id: 'pdv-1',
    })
  })

  it('rechaza cuando no se puede resolver ninguna asignacion operativa', async () => {
    const service = createService({
      directAssignment: null,
      fallbackAssignments: [],
    })

    await expect(
      resolveCheckInAssignmentForPersistence(service as never, {
        assignmentId: 'asig-obsoleta',
        empleadoId: 'emp-1',
        pdvId: 'pdv-1',
        fechaOperacion: '2026-03-18',
      })
    ).rejects.toThrow('El check-in requiere una asignacion activa con PDV y horario de referencia.')
  })
})
