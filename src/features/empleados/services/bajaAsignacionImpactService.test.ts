import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  enqueueAndProcessMaterializedAssignmentsMock,
  resolveMaterializationImpactRangeMock,
} = vi.hoisted(() => ({
  enqueueAndProcessMaterializedAssignmentsMock: vi.fn(async () => []),
  resolveMaterializationImpactRangeMock: vi.fn((fechaInicio: string, fechaFin: string) => ({
    fechaInicio,
    fechaFin,
  })),
}))

vi.mock('@/features/asignaciones/services/asignacionMaterializationService', () => ({
  enqueueAndProcessMaterializedAssignments: enqueueAndProcessMaterializedAssignmentsMock,
  resolveMaterializationImpactRange: resolveMaterializationImpactRangeMock,
}))

vi.mock('@/lib/tenant/singleTenant', () => ({
  getSingleTenantAccountId: () => 'cuenta-default',
}))

import { procesarImpactoBajaEnAsignaciones } from './bajaAsignacionImpactService'

type TableRows = Record<string, Array<Record<string, unknown>>>

function createMockClient(initialTables: Partial<TableRows>) {
  const tables: TableRows = {
    asignacion: [...(initialTables.asignacion ?? [])],
    vacante_operativa_futura: [...(initialTables.vacante_operativa_futura ?? [])],
    asignacion_baja_historial: [...(initialTables.asignacion_baja_historial ?? [])],
    pdv_cobertura_operativa: [...(initialTables.pdv_cobertura_operativa ?? [])],
  }
  const idCounters = new Map<string, number>()

  const nextId = (table: string) => {
    const current = (idCounters.get(table) ?? 0) + 1
    idCounters.set(table, current)

    if (table === 'vacante_operativa_futura') {
      return `vacante-${current}`
    }

    if (table === 'asignacion_baja_historial') {
      return `historial-${current}`
    }

    return `${table}-${current}`
  }

  const matchesFilters = (
    row: Record<string, unknown>,
    filters: Array<{ op: 'eq'; column: string; value: unknown }>
  ) =>
    filters.every((filter) => {
      if (filter.op === 'eq') {
        return row[filter.column] === filter.value
      }

      return true
    })

  return {
    from(table: string) {
      const filters: Array<{ op: 'eq'; column: string; value: unknown }> = []

      const selectChain = {
        eq(column: string, value: unknown) {
          filters.push({ op: 'eq', column, value })
          return selectChain
        },
        order(column: string, options?: { ascending?: boolean }) {
          const ascending = options?.ascending !== false
          const rows = [...(tables[table] ?? [])].filter((row) => matchesFilters(row, filters))
          rows.sort((left, right) => {
            const leftValue = String(left[column] ?? '')
            const rightValue = String(right[column] ?? '')
            return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
          })

          return Promise.resolve({
            data: rows,
            error: null,
          })
        },
        maybeSingle() {
          const row = [...(tables[table] ?? [])].find((candidate) => matchesFilters(candidate, filters)) ?? null
          return Promise.resolve({ data: row, error: null })
        },
        single() {
          const row = [...(tables[table] ?? [])].find((candidate) => matchesFilters(candidate, filters)) ?? null
          return Promise.resolve({ data: row, error: row ? null : { message: 'Row not found' } })
        },
        then(resolve: (value: { data: unknown; error: { message: string } | null }) => void) {
          const rows = [...(tables[table] ?? [])].filter((candidate) => matchesFilters(candidate, filters))
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }

      return {
        select() {
          return selectChain
        },
        update(payload: Record<string, unknown>) {
          const updateChain = {
            eq(column: string, value: unknown) {
              filters.push({ op: 'eq', column, value })
              return updateChain
            },
            then(resolve: (value: { data: unknown; error: { message: string } | null }) => void) {
              const rows = tables[table] ?? []
              for (const row of rows) {
                if (matchesFilters(row, filters)) {
                  Object.assign(row, payload)
                }
              }

              return Promise.resolve({ data: null, error: null }).then(resolve)
            },
          }

          return updateChain
        },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          const rows = Array.isArray(payload) ? payload : [payload]
          const inserted = rows.map((row) => {
            const normalized = {
              ...row,
              id: String(row.id ?? nextId(table)),
              created_at: String(row.created_at ?? '2026-04-22T00:00:00.000Z'),
              updated_at: String(row.updated_at ?? '2026-04-22T00:00:00.000Z'),
            }
            tables[table].push(normalized)
            return normalized
          })

          const insertChain = {
            select() {
              return insertChain
            },
            single() {
              return Promise.resolve({
                data: inserted[0] ?? null,
                error: inserted.length > 0 ? null : { message: 'Insert failed' },
              })
            },
            then(resolve: (value: { data: unknown; error: { message: string } | null }) => void) {
              return Promise.resolve({ data: inserted, error: null }).then(resolve)
            },
          }

          return insertChain
        },
        upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          const rows = Array.isArray(payload) ? payload : [payload]
          for (const row of rows) {
            const rowId = String(row.pdv_id ?? row.id ?? nextId(table))
            const currentRows = tables[table]
            const existingIndex = currentRows.findIndex((item) => String(item.pdv_id ?? item.id ?? '') === rowId)
            const normalized = {
              ...row,
              id: existingIndex >= 0 ? String(currentRows[existingIndex].id ?? rowId) : rowId,
              updated_at: '2026-04-22T00:00:00.000Z',
            }
            if (existingIndex >= 0) {
              currentRows[existingIndex] = {
                ...currentRows[existingIndex],
                ...normalized,
              }
            } else {
              currentRows.push(normalized)
            }
          }

          return Promise.resolve({ error: null })
        },
      }
    },
    table<T extends Record<string, unknown>>(name: string) {
      return (tables[name] ?? []) as T[]
    },
  }
}

function buildAssignment(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'asg-base',
    cuenta_cliente_id: 'cuenta-1',
    empleado_id: 'emp-1',
    pdv_id: 'pdv-1',
    supervisor_empleado_id: null,
    fecha_inicio: '2026-04-01',
    fecha_fin: null,
    tipo: 'FIJA',
    naturaleza: 'BASE',
    asignacion_base_id: null,
    asignacion_origen_id: null,
    motivo_movimiento: null,
    observaciones: null,
    metadata: {},
    estado_publicacion: 'PUBLICADA',
    ...overrides,
  }
}

describe('bajaAsignacionImpactService', () => {
  beforeEach(() => {
    enqueueAndProcessMaterializedAssignmentsMock.mockClear()
    resolveMaterializationImpactRangeMock.mockClear()
  })

  it('detecta la vacante actual y la futura, cancela el movimiento y deja historial', async () => {
    const client = createMockClient({
      asignacion: [
        buildAssignment({
          id: 'asg-current',
          pdv_id: 'pdv-actual',
          fecha_inicio: '2026-04-01',
        }),
        buildAssignment({
          id: 'asg-future',
          pdv_id: 'pdv-futuro',
          fecha_inicio: '2026-05-01',
          naturaleza: 'COBERTURA_TEMPORAL',
          tipo: 'COBERTURA',
          asignacion_base_id: 'asg-current',
          asignacion_origen_id: 'asg-current',
          motivo_movimiento: 'Cambio de PDV mayo',
        }),
      ],
    })

    const result = await procesarImpactoBajaEnAsignaciones(client as never, {
      empleadoId: 'emp-1',
      fechaBajaEfectiva: '2026-04-22',
      usuarioActorId: 'user-1',
      motivoBaja: 'Renuncia',
      observacionesNomina: 'Cierre institucional',
    })

    expect(result.vacanteActual).not.toBeNull()
    expect(result.vacantesFuturas).toHaveLength(1)
    expect(result.movimientosCancelados).toHaveLength(1)
    expect(result.vacanteActual).toMatchObject({
      pdvId: 'pdv-actual',
      tipoVacante: 'VACANTE_ACTUAL_POR_BAJA',
      estadoSeguimiento: 'NUEVA',
    })
    expect(result.vacantesFuturas[0]).toMatchObject({
      pdvId: 'pdv-futuro',
      tipoVacante: 'VACANTE_FUTURA_POR_MOVIMIENTO_CANCELADO',
      estadoSeguimiento: 'NUEVA',
    })

    const updatedAssignments = client.table<Record<string, unknown>>('asignacion')
    expect(updatedAssignments.find((item) => item.id === 'asg-current')?.fecha_fin).toBe('2026-04-21')
    expect(updatedAssignments.find((item) => item.id === 'asg-future')?.estado_publicacion).toBe('BORRADOR')

    expect(client.table('vacante_operativa_futura')).toHaveLength(2)
    expect(client.table('asignacion_baja_historial')).toHaveLength(2)
    expect(client.table<Record<string, unknown>>('pdv_cobertura_operativa')[0]).toMatchObject({
      pdv_id: 'pdv-actual',
      estado_operativo: 'VACANTE',
    })

    expect(enqueueAndProcessMaterializedAssignmentsMock).toHaveBeenCalledTimes(1)
  })

  it('no crea vacante futura si no habia movimiento programado', async () => {
    const client = createMockClient({
      asignacion: [
        buildAssignment({
          id: 'asg-current',
          pdv_id: 'pdv-actual',
          fecha_inicio: '2026-04-01',
        }),
      ],
    })

    const result = await procesarImpactoBajaEnAsignaciones(client as never, {
      empleadoId: 'emp-1',
      fechaBajaEfectiva: '2026-04-22',
      usuarioActorId: 'user-1',
      motivoBaja: 'Renuncia',
      observacionesNomina: null,
    })

    expect(result.vacanteActual?.pdvId).toBe('pdv-actual')
    expect(result.vacantesFuturas).toEqual([])
    expect(result.movimientosCancelados).toEqual([])
    expect(client.table('vacante_operativa_futura')).toHaveLength(1)
  })

  it('no toca borradores previos al cancelar movimientos futuros', async () => {
    const client = createMockClient({
      asignacion: [
        buildAssignment({
          id: 'asg-current',
          pdv_id: 'pdv-actual',
          fecha_inicio: '2026-04-01',
        }),
        buildAssignment({
          id: 'asg-future',
          pdv_id: 'pdv-futuro',
          fecha_inicio: '2026-05-01',
          estado_publicacion: 'PUBLICADA',
          naturaleza: 'COBERTURA_TEMPORAL',
        }),
        buildAssignment({
          id: 'asg-draft',
          pdv_id: 'pdv-draft',
          fecha_inicio: '2026-05-03',
          estado_publicacion: 'BORRADOR',
          observaciones: 'Mantener borrador',
        }),
      ],
    })

    await procesarImpactoBajaEnAsignaciones(client as never, {
      empleadoId: 'emp-1',
      fechaBajaEfectiva: '2026-04-22',
      usuarioActorId: 'user-1',
      motivoBaja: 'Renuncia',
      observacionesNomina: null,
    })

    const draftRow = client.table<Record<string, unknown>>('asignacion').find((item) => item.id === 'asg-draft')
    expect(draftRow).toMatchObject({
      estado_publicacion: 'BORRADOR',
      observaciones: 'Mantener borrador',
    })
  })

  it('registra el historial con accion aplicada y vacante vinculada', async () => {
    const client = createMockClient({
      asignacion: [
        buildAssignment({
          id: 'asg-current',
          pdv_id: 'pdv-actual',
          fecha_inicio: '2026-04-01',
        }),
        buildAssignment({
          id: 'asg-future',
          pdv_id: 'pdv-futuro',
          fecha_inicio: '2026-05-01',
          naturaleza: 'COBERTURA_TEMPORAL',
          tipo: 'COBERTURA',
          motivo_movimiento: 'Cambio ya publicado',
        }),
      ],
    })

    await procesarImpactoBajaEnAsignaciones(client as never, {
      empleadoId: 'emp-1',
      fechaBajaEfectiva: '2026-04-22',
      usuarioActorId: 'user-77',
      motivoBaja: 'Renuncia',
      observacionesNomina: 'PDF validado',
    })

    const historyRows = client.table<Record<string, unknown>>('asignacion_baja_historial')
    expect(historyRows).toHaveLength(2)
    expect(historyRows[0]).toMatchObject({
      accion_aplicada: 'VACANTE_ACTUAL_GENERADA',
      usuario_actor_id: 'user-77',
    })
    expect(historyRows[1]).toMatchObject({
      accion_aplicada: 'MOVIMIENTO_CANCELADO',
      usuario_actor_id: 'user-77',
    })
    expect(historyRows.every((item) => Boolean(item.vacante_operativa_futura_id))).toBe(true)
  })
})
