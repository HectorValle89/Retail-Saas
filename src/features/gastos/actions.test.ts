import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  requerirPuestosActivosMock,
  createServiceClientMock,
  storeOptimizedEvidenceMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requerirPuestosActivosMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  storeOptimizedEvidenceMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirPuestosActivos: requerirPuestosActivosMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/files/evidenceStorage', () => ({
  storeOptimizedEvidence: storeOptimizedEvidenceMock,
}))

import { ESTADO_GASTO_INICIAL, actualizarEstatusGasto, registrarGastoOperativo } from './actions'

describe('gastos actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-1',
      empleadoId: 'emp-1',
      puesto: 'COORDINADOR',
      nombreCompleto: 'Coordinacion Uno',
    })
  })

  it('registra un gasto de formacion con comprobante optimizado', async () => {
    const inserts = [] as Array<{ table: string; payload: Record<string, unknown> }>
    const service = {
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'cuenta-1', activa: true }, error: null })
                },
              }
            },
          }
        }

        if (table === 'gasto') {
          return {
            insert(payload: Record<string, unknown>) {
              inserts.push({ table, payload })
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'gasto-1' }, error: null })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              inserts.push({ table, payload })
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
      storage: {
        createBucket() {
          return Promise.resolve({ error: null })
        },
      },
    }

    createServiceClientMock.mockReturnValue(service)
    storeOptimizedEvidenceMock.mockResolvedValue({
      archivo: { url: 'bucket/comprobante.jpg', hash: 'hash-1' },
      miniatura: null,
      optimization: {
        optimizationKind: 'image',
        originalBytes: 1000,
        optimizedBytes: 800,
        targetMet: true,
        notes: [],
        officialAssetKind: 'optimized',
      },
    })

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('empleado_id', 'emp-1')
    formData.set('supervisor_empleado_id', 'emp-2')
    formData.set('pdv_id', 'pdv-1')
    formData.set('formacion_evento_id', 'evento-1')
    formData.set('tipo', 'FORMACION')
    formData.set('monto', '350')
    formData.set('fecha_gasto', '2026-03-19')
    formData.set('comprobante', new File(['ok'], 'gasto.jpg', { type: 'image/jpeg' }))

    const result = await registrarGastoOperativo(ESTADO_GASTO_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(inserts[0]).toMatchObject({
      table: 'gasto',
      payload: {
        tipo: 'FORMACION',
        formacion_evento_id: 'evento-1',
        comprobante_url: 'bucket/comprobante.jpg',
      },
    })
    expect(inserts[0]?.payload.metadata).toMatchObject({
      approval_stage: 'PENDIENTE_SUPERVISOR',
      tiene_comprobante: true,
    })
  })

  it('reembolsa un gasto aprobado y genera su entrada en ledger', async () => {
    const updates = [] as Array<Record<string, unknown>>
    const ledgerInserts = [] as Array<Record<string, unknown>>
    const auditInserts = [] as Array<Record<string, unknown>>

    const service = {
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'cuenta-1', activa: true }, error: null })
                },
              }
            },
          }
        }

        if (table === 'gasto') {
          return {
            select() {
              return this
            },
            eq(column: string) {
              if (column === 'id') {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data: {
                            id: 'gasto-1',
                            cuenta_cliente_id: 'cuenta-1',
                            empleado_id: 'emp-1',
                            supervisor_empleado_id: 'emp-2',
                            monto: 350,
                            moneda: 'MXN',
                            estatus: 'APROBADO',
                            metadata: { approval_stage: 'APROBADO' },
                          },
                          error: null,
                        })
                      },
                    }
                  },
                }
              }

              throw new Error(`Unexpected eq on ${table}.${column}`)
            },
            update(payload: Record<string, unknown>) {
              updates.push(payload)
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({ error: null })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'nomina_ledger') {
          return {
            select() {
              return this
            },
            eq(column: string) {
              if (column === 'referencia_tabla') {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({ data: null, error: null })
                      },
                    }
                  },
                }
              }

              if (column === 'estado') {
                return {
                  order() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data: { id: 'periodo-1', clave: '2026-03-Q2' },
                          error: null,
                        })
                      },
                    }
                  },
                }
              }

              throw new Error(`Unexpected eq on ${table}.${column}`)
            },
            insert(payload: Record<string, unknown>) {
              ledgerInserts.push(payload)
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'ledger-1' }, error: null })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'nomina_periodo') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                order() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'periodo-1', clave: '2026-03-Q2' }, error: null })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              auditInserts.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
      storage: {
        createBucket() {
          return Promise.resolve({ error: null })
        },
      },
    }

    createServiceClientMock.mockReturnValue(service)
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'admin-1',
      empleadoId: 'emp-admin',
      puesto: 'ADMINISTRADOR',
      nombreCompleto: 'Admin Uno',
    })

    const formData = new FormData()
    formData.set('gasto_id', 'gasto-1')
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('estatus', 'REEMBOLSADO')

    await actualizarEstatusGasto(formData)

    expect(ledgerInserts[0]).toMatchObject({
      periodo_id: 'periodo-1',
      referencia_tabla: 'gasto',
      referencia_id: 'gasto-1',
      concepto: 'REEMBOLSO_GASTO',
      monto: 350,
    })
    expect(updates[0]).toMatchObject({
      estatus: 'REEMBOLSADO',
    })
    expect(updates[0]?.metadata).toMatchObject({
      approval_stage: 'REEMBOLSADO',
      reembolso_ledger_id: 'ledger-1',
    })
    expect(auditInserts[0]).toMatchObject({
      tabla: 'gasto',
      payload: {
        reembolso_ledger_id: 'ledger-1',
      },
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/nomina')
  })
})