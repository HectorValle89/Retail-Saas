import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  requerirPuestosActivosMock,
  createServiceClientMock,
  sendOperationalPushNotificationMock,
  storeOptimizedEvidenceMock,
  registerVentaWithServiceMock,
  registerLoveAffiliationWithServiceMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requerirPuestosActivosMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  sendOperationalPushNotificationMock: vi.fn(),
  storeOptimizedEvidenceMock: vi.fn(),
  registerVentaWithServiceMock: vi.fn(),
  registerLoveAffiliationWithServiceMock: vi.fn(),
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

vi.mock('@/lib/push/pushFanout', () => ({
  sendOperationalPushNotification: sendOperationalPushNotificationMock,
}))

vi.mock('@/lib/files/evidenceStorage', () => ({
  storeOptimizedEvidence: storeOptimizedEvidenceMock,
}))

vi.mock('@/lib/files/documentOptimization', () => ({
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES: 12 * 1024 * 1024,
  buildOperationalDocumentUploadLimitMessage: vi.fn(),
  exceedsOperationalDocumentUploadLimit: vi.fn(() => false),
}))

vi.mock('@/features/ventas/lib/ventaRegistration', () => ({
  registerVentaWithService: registerVentaWithServiceMock,
}))

vi.mock('@/features/love-isdin/lib/loveRegistration', () => ({
  registerLoveAffiliationWithService: registerLoveAffiliationWithServiceMock,
}))

import {
  registrarRegistroExtemporaneo,
  resolverRegistroExtemporaneo,
} from './extemporaneoActions'
import { ESTADO_SOLICITUD_INICIAL } from './state'

function createRegistroService() {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  const audits: Array<Record<string, unknown>> = []
  let duplicateCheckCount = 0

  const service = {
    storage: {
      createBucket() {
        return Promise.resolve({ error: null })
      },
    },
    from(table: string) {
      if (table === 'asignacion_diaria_resuelta') {
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
                fecha: '2026-03-30',
                empleado_id: 'emp-1',
                pdv_id: 'pdv-1',
                supervisor_empleado_id: 'sup-1',
                cuenta_cliente_id: 'cuenta-1',
                estado_operativo: 'ASIGNADA_PDV',
              },
              error: null,
            })
          },
        }
      }

      if (table === 'asistencia') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'att-1',
                  cuenta_cliente_id: 'cuenta-1',
                  empleado_id: 'emp-1',
                  pdv_id: 'pdv-1',
                  fecha_operacion: '2026-03-30',
                  check_in_utc: '2026-03-30T14:00:00.000Z',
                  estatus: 'VALIDA',
                },
              ],
              error: null,
            })
          },
        }
      }

      if (table === 'producto') {
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
                id: 'prod-1',
                sku: 'SKU-1',
                nombre: 'Producto Uno',
                nombre_corto: 'Prod Uno',
                activo: true,
              },
              error: null,
            })
          },
        }
      }

      if (table === 'empleado') {
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
                id: 'emp-1',
                nombre_completo: 'Dermo Uno',
              },
              error: null,
            })
          },
        }
      }

      if (table === 'registro_extemporaneo') {
        return {
          select(_columns?: string, options?: { count?: 'exact'; head?: boolean }) {
            if (options?.head) {
              return this
            }

            return this
          },
          eq() {
            return this
          },
          gte() {
            return this
          },
          lte() {
            return this
          },
          maybeSingle() {
            duplicateCheckCount += 1
            return Promise.resolve({
              data: duplicateCheckCount === 1 ? null : {
                id: 'reg-1',
                cuenta_cliente_id: 'cuenta-1',
                empleado_id: 'emp-1',
                supervisor_empleado_id: 'sup-1',
                pdv_id: 'pdv-1',
                asistencia_id: 'att-1',
                fecha_operativa: '2026-03-30',
                fecha_registro_utc: '2026-03-31T10:00:00.000Z',
                tipo_registro: 'VENTA',
                estatus: 'PENDIENTE_APROBACION',
                motivo: 'Sin señal en el cierre',
                motivo_rechazo: null,
                evidencia_url: null,
                evidencia_hash: null,
                evidencia_thumbnail_url: null,
                evidencia_thumbnail_hash: null,
                venta_payload: {
                  producto_id: 'prod-1',
                  producto_sku: 'SKU-1',
                  producto_nombre: 'Producto Uno',
                  producto_nombre_corto: 'Prod Uno',
                  total_unidades: 3,
                  total_monto: 0,
                },
                love_payload: {},
                venta_registro_id: null,
                love_registro_id: null,
                metadata: {
                  gap_dias_retraso: 1,
                },
              },
              error: null,
            })
          },
          insert(payload: Record<string, unknown>) {
            inserts.push(payload)
            return {
              select() {
                return this
              },
              maybeSingle() {
                return Promise.resolve({
                  data: { id: 'reg-1' },
                  error: null,
                })
              },
            }
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload)
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
          then(resolve: (value: { data: null; error: null; count: number }) => void) {
            return Promise.resolve({
              data: null,
              error: null,
              count: 1,
            }).then(resolve)
          },
        }
      }

      if (table === 'audit_log') {
        return {
          insert(payload: Record<string, unknown>) {
            audits.push(payload)
            return Promise.resolve({ error: null })
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }

  return { service, inserts, updates, audits }
}

describe('extemporaneo actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'))
    vi.clearAllMocks()
  })

  it('registra un registro extemporaneo pendiente de aprobacion', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-1',
      puesto: 'DERMOCONSEJERO',
      empleadoId: 'emp-1',
    })

    const { service, inserts, audits } = createRegistroService()
    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('empleado_id', 'emp-1')
    formData.set('tipo_registro', 'VENTA')
    formData.set('fecha_operativa', '2026-03-30')
    formData.set('motivo', 'Sin señal en el cierre')
    formData.set('producto_id', 'prod-1')
    formData.set('venta_total_unidades', '3')

    const result = await registrarRegistroExtemporaneo(ESTADO_SOLICITUD_INICIAL, formData)

    expect(result).toMatchObject({
      ok: true,
      message: 'Registro extemporaneo enviado a aprobacion.',
    })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      cuenta_cliente_id: 'cuenta-1',
      empleado_id: 'emp-1',
      supervisor_empleado_id: 'sup-1',
      tipo_registro: 'VENTA',
      estatus: 'PENDIENTE_APROBACION',
    })
    expect(audits).toHaveLength(1)
    expect(sendOperationalPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeIds: ['sup-1'],
        path: '/solicitudes',
      })
    )
  })

  it('aprueba un registro extemporaneo y consolida la venta', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-2',
      puesto: 'SUPERVISOR',
      empleadoId: 'sup-1',
    })

    registerVentaWithServiceMock.mockResolvedValue({
      id: 'venta-1',
      inserted: true,
      replacedExisting: false,
      context: {},
    })
    registerLoveAffiliationWithServiceMock.mockResolvedValue({
      id: 'love-1',
      inserted: true,
      context: {},
    })

    const { service, updates, audits } = createRegistroService()
    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('registro_extemporaneo_id', 'reg-1')
    formData.set('decision', 'APROBAR')

    const result = await resolverRegistroExtemporaneo(ESTADO_SOLICITUD_INICIAL, formData)

    expect(result).toMatchObject({
      ok: true,
      message: 'Registro extemporaneo aprobado y consolidado.',
    })
    expect(registerVentaWithServiceMock).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        cuentaClienteId: 'cuenta-1',
        asistenciaId: 'att-1',
        allowOutsideStandardWindow: true,
        origen: 'AJUSTE_ADMIN',
      })
    )
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      estatus: 'APROBADO',
      venta_registro_id: 'venta-1',
    })
    expect(audits).toHaveLength(1)
  })
})
