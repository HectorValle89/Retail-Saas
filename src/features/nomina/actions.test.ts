import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  requerirOperadorNominaMock,
  createClientMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requerirOperadorNominaMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirOperadorNomina: requerirOperadorNominaMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import {
  actualizarEstadoPeriodoNomina,
  crearPeriodoNomina,
  registrarMovimientoManualNomina,
  guardarDefinicionCuotaNomina,
} from './actions'
import { ESTADO_NOMINA_INICIAL } from './state'

describe('nomina actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirOperadorNominaMock.mockResolvedValue({
      usuarioId: 'user-1',
      puesto: 'NOMINA',
      nombreCompleto: 'Nomina Uno',
    })
  })

  it('genera un periodo en borrador con estimacion de colaboradoras incluidas', async () => {
    const periodos: Array<Record<string, unknown>> = []
    const supabase = {
      from(table: string) {
        if (table === 'nomina_periodo') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null })
            },
            insert(payload: Record<string, unknown>) {
              periodos.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'asistencia') {
          return {
            select() {
              return this
            },
            gte() {
              return this
            },
            lte() {
              return Promise.resolve({
                data: [{ empleado_id: 'emp-1' }, { empleado_id: 'emp-2' }],
                error: null,
              })
            },
          }
        }

        if (table === 'venta') {
          return {
            select() {
              return this
            },
            gte() {
              return this
            },
            lte() {
              return Promise.resolve({
                data: [{ empleado_id: 'emp-2' }, { empleado_id: 'emp-3' }],
                error: null,
              })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createClientMock.mockResolvedValue(supabase)

    const formData = new FormData()
    formData.set('clave', '2026-03-Q2')
    formData.set('fecha_inicio', '2026-03-16')
    formData.set('fecha_fin', '2026-03-31')
    formData.set('observaciones', 'Segunda quincena')

    const result = await crearPeriodoNomina(ESTADO_NOMINA_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.message).toContain('3 colaboradoras incluidas')
    expect(periodos).toHaveLength(1)
    expect(periodos[0]).toMatchObject({
      clave: '2026-03-Q2',
      estado: 'BORRADOR',
      fecha_inicio: '2026-03-16',
      fecha_fin: '2026-03-31',
    })
    expect(periodos[0].metadata).toMatchObject({ empleados_incluidos: 3 })
  })

  it('aprueba un periodo en borrador antes de dispersarlo', async () => {
    const updates: Array<Record<string, unknown>> = []
    const supabase = {
      from(table: string) {
        if (table !== 'nomina_periodo') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select() {
            return this
          },
          eq(column: string, value: string) {
            if (column === 'id' && value === 'periodo-1') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'periodo-1',
                      clave: '2026-03-Q1',
                      estado: 'BORRADOR',
                      metadata: {},
                    },
                    error: null,
                  })
                },
              }
            }

            if (column === 'estado' && value === 'BORRADOR') {
              return {
                neq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: null, error: null })
                    },
                  }
                },
              }
            }

            throw new Error(`Unexpected eq ${column}=${value}`)
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload)
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)

    const formData = new FormData()
    formData.set('periodo_id', 'periodo-1')
    formData.set('estado_destino', 'APROBADO')

    const result = await actualizarEstadoPeriodoNomina(ESTADO_NOMINA_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.message).toContain('aprobado correctamente')
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ estado: 'APROBADO' })
    expect(updates[0].fecha_cierre).toEqual(expect.any(String))
    expect(updates[0].metadata).toMatchObject({ aprobado_por_usuario_id: 'user-1' })
  })

  it('guarda una definicion de cuota con metas de ventas, LOVE y visitas', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const supabase = {
      from(table: string) {
        if (table === 'nomina_periodo') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'periodo-1',
                      clave: '2026-03-Q1',
                      estado: 'BORRADOR',
                    },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'cuota_empleado_periodo') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null })
            },
            insert(payload: Record<string, unknown>) {
              inserts.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createClientMock.mockResolvedValue(supabase)

    const formData = new FormData()
    formData.set('periodo_id', 'periodo-1')
    formData.set('empleado_id', 'emp-1')
    formData.set('cuenta_cliente_id', 'c1')
    formData.set('cadena_id', 'cadena-1')
    formData.set('objetivo_monto', '1500')
    formData.set('objetivo_unidades', '3')
    formData.set('love_objetivo', '2')
    formData.set('visitas_objetivo', '1')
    formData.set('factor_cuota', '1.15')
    formData.set('bono_estimado', '250')

    const result = await guardarDefinicionCuotaNomina(ESTADO_NOMINA_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      periodo_id: 'periodo-1',
      empleado_id: 'emp-1',
      cuenta_cliente_id: 'c1',
      cadena_id: 'cadena-1',
      objetivo_monto: 1500,
      objetivo_unidades: 3,
      factor_cuota: 1.15,
      bono_estimado: 250,
      cumplimiento_porcentaje: 0,
      estado: 'RIESGO',
    })
    expect(inserts[0].metadata).toMatchObject({
      love_objetivo: 2,
      visitas_objetivo: 1,
      definida_por_usuario_id: 'user-1',
    })
  })

  it('registra un ajuste manual de ledger con autor y motivo', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const supabase = {
      from(table: string) {
        if (table === 'nomina_periodo') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'periodo-1',
                      clave: '2026-03-Q1',
                      estado: 'BORRADOR',
                    },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'nomina_ledger') {
          return {
            insert(payload: Record<string, unknown>) {
              inserts.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createClientMock.mockResolvedValue(supabase)

    const formData = new FormData()
    formData.set('periodo_id', 'periodo-1')
    formData.set('empleado_id', 'emp-1')
    formData.set('tipo_movimiento', 'AJUSTE')
    formData.set('concepto', 'AJUSTE_MANUAL')
    formData.set('motivo', 'Correccion por diferencia')
    formData.set('monto', '150.50')
    formData.set('notas', 'Validado por administracion')

    const result = await registrarMovimientoManualNomina(ESTADO_NOMINA_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      periodo_id: 'periodo-1',
      empleado_id: 'emp-1',
      tipo_movimiento: 'AJUSTE',
      concepto: 'AJUSTE_MANUAL',
      monto: 150.5,
    })
    expect(String(inserts[0].notas)).toContain('Autor: Nomina Uno')
    expect(inserts[0].metadata).toMatchObject({
      autor_usuario_id: 'user-1',
      motivo: 'Correccion por diferencia',
    })
  })
})
