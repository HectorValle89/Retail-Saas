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

import {
  descartarPreviewMateriales,
  guardarMaterialCatalogo,
  registrarEntregaPromocional,
} from './actions'
import { ESTADO_MATERIAL_INICIAL } from './state'

describe('materiales actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-1',
      empleadoId: 'emp-1',
      puesto: 'DERMOCONSEJERO',
      nombreCompleto: 'DC Uno',
    })
  })

  it('guarda el catalogo promocional por cuenta', async () => {
    const inserts: Array<Record<string, unknown>> = []
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

        if (table === 'material_catalogo') {
          return {
            upsert(payload: Record<string, unknown>) {
              inserts.push(payload)
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'cat-1' }, error: null })
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
              inserts.push(payload)
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

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('nombre', 'Tester Fusion Water')
    formData.set('tipo', 'TESTER')
    formData.set('cantidad_default', '5')
    formData.set('requiere_evidencia_obligatoria', 'true')

    const result = await guardarMaterialCatalogo(ESTADO_MATERIAL_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/materiales')
    expect(inserts[0]).toMatchObject({
      cuenta_cliente_id: 'cuenta-1',
      nombre: 'Tester Fusion Water',
      tipo: 'TESTER',
      cantidad_default: 5,
      requiere_ticket_compra: false,
      requiere_evidencia_obligatoria: true,
    })
  })

  it('bloquea entrega promocional cuando excede el saldo disponible', async () => {
    const service = {
      from(table: string) {
        if (table === 'material_distribucion_detalle') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'det-1',
                      distribucion_id: 'dist-1',
                      material_catalogo_id: 'cat-1',
                      cantidad_recibida: 5,
                      cantidad_entregada: 4,
                      requiere_ticket_mes: false,
                      requiere_evidencia_entrega_mes: true,
                      requiere_evidencia_mercadeo: false,
                      es_regalo_dc: false,
                      excluir_de_registrar_entrega: false,
                      material_nombre_snapshot: 'Tester Fusion Water',
                      material_tipo_mes: 'TESTER',
                    },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'material_inventario_movimiento') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            limit() {
              return Promise.resolve({
                data: [{ cantidad_delta: 1 }],
                error: null,
              })
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

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('pdv_id', 'pdv-1')
    formData.set('distribucion_detalle_id', 'det-1')
    formData.set('material_catalogo_id', 'cat-1')
    formData.set('cantidad_entregada', '2')
    formData.set('evidencia_material', new File(['a'], 'material.jpg', { type: 'image/jpeg' }))
    formData.set('evidencia_pdv', new File(['b'], 'pdv.jpg', { type: 'image/jpeg' }))

    const result = await registrarEntregaPromocional(ESTADO_MATERIAL_INICIAL, formData)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Solo hay 1 pieza')
  })

  it('registra la entrega promocional y descuenta el saldo', async () => {
    const calls: Array<{ table: string; payload: Record<string, unknown> }> = []
    const service = {
      from(table: string) {
        if (table === 'material_distribucion_detalle') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'det-1',
                      distribucion_id: 'dist-1',
                      material_catalogo_id: 'cat-1',
                      cantidad_recibida: 5,
                      cantidad_entregada: 1,
                      requiere_ticket_mes: false,
                      requiere_evidencia_entrega_mes: true,
                      requiere_evidencia_mercadeo: false,
                      es_regalo_dc: false,
                      excluir_de_registrar_entrega: false,
                      material_nombre_snapshot: 'Tester Fusion Water',
                      material_tipo_mes: 'TESTER',
                    },
                    error: null,
                  })
                },
              }
            },
            update(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        }

        if (table === 'material_inventario_movimiento') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            limit() {
              return Promise.resolve({
                data: [{ cantidad_delta: 4 }],
                error: null,
              })
            },
            insert(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'material_entrega_promocional') {
          return {
            insert(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'ent-1' }, error: null })
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
              calls.push({ table, payload })
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
      archivo: { url: 'bucket/evidence.jpg', hash: 'hash-1' },
      miniatura: null,
    })

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('pdv_id', 'pdv-1')
    formData.set('distribucion_detalle_id', 'det-1')
    formData.set('material_catalogo_id', 'cat-1')
    formData.set('cantidad_entregada', '2')
    formData.set('evidencia_material', new File(['a'], 'material.jpg', { type: 'image/jpeg' }))
    formData.set('evidencia_pdv', new File(['b'], 'pdv.jpg', { type: 'image/jpeg' }))

    const result = await registrarEntregaPromocional(ESTADO_MATERIAL_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/materiales')
    expect(calls[0]).toMatchObject({
      table: 'material_entrega_promocional',
      payload: {
        cuenta_cliente_id: 'cuenta-1',
        pdv_id: 'pdv-1',
        cantidad_entregada: 2,
      },
    })
    expect(calls[1]).toMatchObject({
      table: 'material_inventario_movimiento',
      payload: {
        cuenta_cliente_id: 'cuenta-1',
        pdv_id: 'pdv-1',
        material_catalogo_id: 'cat-1',
        cantidad: 2,
        cantidad_delta: -2,
      },
    })
    expect(calls[2]).toMatchObject({
      table: 'material_distribucion_detalle',
      payload: {
        cantidad_entregada: 3,
      },
    })
  })

  it('acepta ticket sellado por camara cuando el material lo requiere', async () => {
    const calls: Array<{ table: string; payload: Record<string, unknown> }> = []
    const service = {
      from(table: string) {
        if (table === 'material_distribucion_detalle') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'det-2',
                      distribucion_id: 'dist-2',
                      material_catalogo_id: 'cat-2',
                      cantidad_recibida: 3,
                      cantidad_entregada: 0,
                      requiere_ticket_mes: true,
                      requiere_evidencia_entrega_mes: true,
                      requiere_evidencia_mercadeo: false,
                      es_regalo_dc: false,
                      excluir_de_registrar_entrega: false,
                      material_nombre_snapshot: 'Canje Promocional',
                      material_tipo_mes: 'CANJE_PROMOCIONAL',
                    },
                    error: null,
                  })
                },
              }
            },
            update(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        }

        if (table === 'material_inventario_movimiento') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            limit() {
              return Promise.resolve({
                data: [{ cantidad_delta: 3 }],
                error: null,
              })
            },
            insert(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'material_entrega_promocional') {
          return {
            insert(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'ent-2' }, error: null })
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
              calls.push({ table, payload })
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
      archivo: { url: 'bucket/evidence.jpg', hash: 'hash-1' },
      miniatura: null,
    })

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('pdv_id', 'pdv-1')
    formData.set('distribucion_detalle_id', 'det-2')
    formData.set('material_catalogo_id', 'cat-2')
    formData.set('cantidad_entregada', '1')
    formData.set('evidencia_material_data_url', 'data:image/jpeg;base64,YQ==')
    formData.set('evidencia_pdv_data_url', 'data:image/jpeg;base64,Yg==')
    formData.set('ticket_compra_data_url', 'data:image/jpeg;base64,Yw==')
    formData.set('evidencia_material_capturada_en', '2026-03-27T10:00:00.000Z')
    formData.set('evidencia_pdv_capturada_en', '2026-03-27T10:01:00.000Z')
    formData.set('ticket_compra_capturada_en', '2026-03-27T10:02:00.000Z')

    const result = await registrarEntregaPromocional(ESTADO_MATERIAL_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(storeOptimizedEvidenceMock).toHaveBeenCalledTimes(3)
    expect(calls[0]).toMatchObject({
      table: 'material_entrega_promocional',
      payload: {
        ticket_compra_url: 'bucket/evidence.jpg',
      },
    })
  })

  it('descarta el preview efimero del usuario actual', async () => {
    const calls: Array<{ table: string; payload: Record<string, unknown> }> = []
    const service = {
      from(table: string) {
        if (table === 'material_distribucion_lote') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'lot-1',
                  cuenta_cliente_id: 'cuenta-1',
                  estado: 'BORRADOR_PREVIEW',
                  created_by_usuario_id: 'user-1',
                },
                error: null,
              })
            },
            update(payload: Record<string, unknown>) {
              calls.push({ table, payload })
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              calls.push({ table, payload })
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

    const formData = new FormData()
    formData.set('lote_id', 'lot-1')

    const result = await descartarPreviewMateriales(ESTADO_MATERIAL_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/materiales')
    expect(calls[0]).toMatchObject({
      table: 'material_distribucion_lote',
      payload: {
        estado: 'CANCELADO',
      },
    })
  })
})
