import { describe, expect, it } from 'vitest'
import type { ActorActual } from '@/lib/auth/session'
import { obtenerInicioCampanas } from './campanaService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function applyFilters(
  rows: unknown[],
  eqFilters: Array<{ column: string; value: string }>,
  inFilters: Array<{ column: string; values: string[] }>,
  isFilters: Array<{ column: string; value: unknown }>
) {
  return rows.filter((row) => {
    const record = row as Record<string, unknown>
    const eqOk = eqFilters.every((filter) => String(record[filter.column] ?? '') === String(filter.value))
    const inOk = inFilters.every((filter) => filter.values.includes(String(record[filter.column] ?? '')))
    const isOk = isFilters.every((filter) => (record[filter.column] ?? null) === filter.value)
    return eqOk && inOk && isOk
  })
}

function createFakeCampaignServiceClient(results: Record<string, QueryResult>, calls?: string[]) {
  return {
    from(table: string) {
      calls?.push(table)
      const eqFilters: Array<{ column: string; value: string }> = []
      const inFilters: Array<{ column: string; values: string[] }> = []
      const isFilters: Array<{ column: string; value: unknown }> = []

      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: string) {
          eqFilters.push({ column, value })
          return builder
        },
        in(column: string, values: string[]) {
          inFilters.push({ column, values })
          return builder
        },
        is(column: string, value: unknown) {
          isFilters.push({ column, value })
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        update(payload: Record<string, unknown>) {
          return {
            in(column: string, values: string[]) {
              const result = results[table] ?? { data: [], error: null }

              if (!Array.isArray(result.data)) {
                return Promise.resolve({ data: null, error: result.error })
              }

              const updatedRows = result.data.map((row) => {
                const record = row as Record<string, unknown>
                return values.includes(String(record[column] ?? '')) ? { ...record, ...payload } : row
              })

              results[table] = {
                data: updatedRows,
                error: null,
              }

              return Promise.resolve({ data: updatedRows, error: null })
            },
          }
        },
        then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
          try {
            const result = results[table] ?? { data: [], error: null }
            if (result.error || !Array.isArray(result.data)) {
              return Promise.resolve(resolve(result))
            }

            return Promise.resolve(
              resolve({
                data: applyFilters(result.data, eqFilters, inFilters, isFilters),
                error: null,
              })
            )
          } catch (error) {
            if (reject) {
              return Promise.resolve(reject(error))
            }

            throw error
          }
        },
      }

      return builder
    },
  }
}

const actorAdmin: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'user-admin',
  empleadoId: 'emp-admin',
  cuentaClienteId: null,
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Uno',
  puesto: 'ADMINISTRADOR',
}

describe('obtenerInicioCampanas', () => {
  it('evita cargar PDVs y productos antes de abrir el editor', async () => {
    const calls: string[] = []
    const client = createFakeCampaignServiceClient(
      {
        campana: {
          data: [
            {
              id: 'cam-1',
              cuenta_cliente_id: 'c1',
              nombre: 'Borrador solar',
              fecha_inicio: '2026-04-10',
              fecha_fin: '2026-04-20',
              estado: 'BORRADOR',
              cuota_adicional: 1200,
              created_at: '2026-04-01T10:00:00.000Z',
            },
            {
              id: 'cam-2',
              cuenta_cliente_id: 'c1',
              nombre: 'Campana activa',
              fecha_inicio: '2026-03-20',
              fecha_fin: '2026-04-15',
              estado: 'ACTIVA',
              cuota_adicional: 800,
              created_at: '2026-03-20T10:00:00.000Z',
            },
          ],
          error: null,
        },
        campana_pdv: {
          data: [
            {
              id: 'cp-1',
              campana_id: 'cam-1',
              cuenta_cliente_id: 'c1',
              pdv_id: 'pdv-1',
              dc_empleado_id: 'dc-1',
              tareas_requeridas: ['POP', 'Foto'],
              tareas_cumplidas: ['POP'],
              estatus_cumplimiento: 'EN_PROGRESO',
              avance_porcentaje: 50,
            },
            {
              id: 'cp-2',
              campana_id: 'cam-2',
              cuenta_cliente_id: 'c1',
              pdv_id: 'pdv-2',
              dc_empleado_id: 'dc-2',
              tareas_requeridas: ['Foto'],
              tareas_cumplidas: ['Foto'],
              estatus_cumplimiento: 'CUMPLIDA',
              avance_porcentaje: 100,
            },
          ],
          error: null,
        },
        cuenta_cliente: {
          data: [{ id: 'c1', identificador: 'isdin_mexico', nombre: 'ISDIN Mexico', activa: true }],
          error: null,
        },
      },
      calls
    )

    const data = await obtenerInicioCampanas(actorAdmin, {
      scopeAccountId: 'c1',
      serviceClient: client as never,
    })

    expect(data.infraestructuraLista).toBe(true)
    expect(data.resumen).toMatchObject({
      totalCampanas: 2,
      activas: 1,
      pdvsObjetivo: 2,
      pdvsCumplidos: 1,
    })
    expect(data.campanas.find((item) => item.id === 'cam-1')).toMatchObject({
      totalPdvs: 1,
      tareasPendientes: 1,
      avancePromedio: 50,
    })
    expect(calls).toContain('campana')
    expect(calls).toContain('campana_pdv')
    expect(calls).toContain('cuenta_cliente')
    expect(calls).not.toContain('pdv')
    expect(calls).not.toContain('producto')
    expect(calls).not.toContain('campana_pdv_producto_meta')
  })
})
