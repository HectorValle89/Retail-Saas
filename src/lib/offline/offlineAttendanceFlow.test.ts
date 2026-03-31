import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  stores,
  persistedAssistances,
  auditEvents,
  backgroundSyncTags,
  storeOptimizedEvidenceMock,
  validateAttendanceBiometricsMock,
  sendOperationalPushNotificationMock,
  obtenerActorActualMock,
  createServiceClientMock,
} = vi.hoisted(() => ({
  stores: {
    asistencia_local: new Map<string, Record<string, unknown>>(),
    venta_local: new Map<string, Record<string, unknown>>(),
    love_local: new Map<string, Record<string, unknown>>(),
    sync_queue: new Map<string, Record<string, unknown>>(),
  },
  persistedAssistances: new Map<string, Record<string, unknown>>(),
  auditEvents: [] as Array<Record<string, unknown>>,
  backgroundSyncTags: [] as string[],
  storeOptimizedEvidenceMock: vi.fn(),
  validateAttendanceBiometricsMock: vi.fn(),
  sendOperationalPushNotificationMock: vi.fn(),
  obtenerActorActualMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}))

function resetStoreState() {
  stores.asistencia_local.clear()
  stores.venta_local.clear()
  stores.love_local.clear()
  stores.sync_queue.clear()
  persistedAssistances.clear()
  auditEvents.length = 0
  backgroundSyncTags.length = 0
}

vi.mock('./offlineDb', () => ({
  putRecord: vi.fn(async (storeName: keyof typeof stores, value: Record<string, unknown>) => {
    stores[storeName].set(String(value.id), structuredClone(value))
    return value
  }),
  deleteRecord: vi.fn(async (storeName: keyof typeof stores, id: string) => {
    stores[storeName].delete(id)
  }),
  getSortedQueueItems: vi.fn(async () =>
    Array.from(stores.sync_queue.values()).sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at))
    )
  ),
  getOfflineQueueSummary: vi.fn(async () => {
    const queue = Array.from(stores.sync_queue.values())
    const drafts = [
      ...Array.from(stores.asistencia_local.values()),
      ...Array.from(stores.venta_local.values()),
      ...Array.from(stores.love_local.values()),
    ]

    return {
      pending: queue.filter((item) => item.status === 'pending').length,
      processing: queue.filter((item) => item.status === 'processing').length,
      failed: queue.filter((item) => item.status === 'failed').length,
      asistenciaDrafts: stores.asistencia_local.size,
      ventaDrafts: stores.venta_local.size,
      loveDrafts: stores.love_local.size,
      syncedDrafts: drafts.filter((item) => item.sync_status === 'synced').length,
    }
  }),
  markDraftSyncState: vi.fn(async (storeName: keyof typeof stores, id: string, state: Record<string, unknown>) => {
    const current = stores[storeName].get(id)
    if (!current) {
      return
    }

    stores[storeName].set(id, {
      ...current,
      ...state,
    })
  }),
}))

vi.mock('@/lib/auth/session', () => ({
  obtenerActorActual: obtenerActorActualMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/files/evidenceStorage', () => ({
  storeOptimizedEvidence: storeOptimizedEvidenceMock,
}))

vi.mock('@/lib/biometrics/attendanceBiometrics', () => ({
  resolveEmployeeBiometricContext: vi.fn(async () => ({
    supervisor_empleado_id: 'sup-1',
  })),
  validateAttendanceBiometrics: validateAttendanceBiometricsMock,
}))

vi.mock('@/lib/push/pushFanout', () => ({
  sendOperationalPushNotification: sendOperationalPushNotificationMock,
}))

import { POST } from '@/app/api/asistencias/sync/route'
import { getOfflineQueueSummary, getSortedQueueItems, markDraftSyncState, putRecord, deleteRecord } from './offlineDb'
import {
  OFFLINE_SYNC_TAG,
  processSyncQueueWithRuntime,
  queueOfflineAsistencia,
  type SyncQueueRuntime,
} from './syncQueue'
import type { OfflineAsistenciaPayload, OfflineQueueSummary, OfflineSyncQueueItem } from './types'

function createFakeService() {
  return {
    storage: {
      createBucket: vi.fn(async () => ({ error: null })),
    },
    from(table: string) {
      if (table === 'asistencia') {
        const state = {
          selectColumns: '',
          filters: new Map<string, unknown>(),
        }

        const chain = {
          select(columns: string) {
            state.selectColumns = columns
            return chain
          },
          eq(column: string, value: unknown) {
            state.filters.set(column, value)
            return chain
          },
          neq() {
            return chain
          },
          not() {
            return chain
          },
          order() {
            return chain
          },
          limit() {
            if (state.selectColumns.includes('mision_dia_id')) {
              return Promise.resolve({ data: [], error: null })
            }

            return Promise.resolve({ data: [], error: null })
          },
          maybeSingle() {
            const id = String(state.filters.get('id') ?? '')
            const current = id ? persistedAssistances.get(id) ?? null : null

            if (state.selectColumns.includes('metadata')) {
              return Promise.resolve({
                data: current ? { metadata: current.metadata ?? {} } : null,
                error: null,
              })
            }

            return Promise.resolve({ data: current, error: null })
          },
          upsert(payload: Record<string, unknown>) {
            persistedAssistances.set(String(payload.id), structuredClone(payload))
            return Promise.resolve({ error: null })
          },
        }

        return chain
      }

      if (table === 'mision_dia') {
        const result = {
          data: [
            {
              id: 'mission-1',
              codigo: 'MISION-001',
              instruccion: 'Levanta la mano derecha',
              orden: 1,
              peso: 10,
            },
          ],
          error: null,
        }

        const chain = {
          select() {
            return chain
          },
          eq() {
            return chain
          },
          order() {
            return chain
          },
          limit() {
            return Promise.resolve(result)
          },
          then(resolve: (value: typeof result) => void) {
            return Promise.resolve(result).then(resolve)
          },
        }

        return chain
      }

      if (table === 'audit_log') {
        return {
          insert(payload: Record<string, unknown>) {
            auditEvents.push(structuredClone(payload))
            return Promise.resolve({ error: null })
          },
        }
      }

      if (table === 'mensaje_interno' || table === 'mensaje_receptor' || table === 'venta' || table === 'campana_pdv' || table === 'campana') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          or() {
            return this
          },
          in() {
            return this
          },
          lte() {
            return this
          },
          gte() {
            return this
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
          insert() {
            return {
              select() {
                return this
              },
              maybeSingle() {
                return Promise.resolve({ data: { id: 'msg-1' }, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createOfflineSyncRuntime(): SyncQueueRuntime {
  return {
    isBrowser: true,
    isOnline: true,
    getSummary: () => getOfflineQueueSummary() as Promise<OfflineQueueSummary>,
    getQueueItems: () => getSortedQueueItems() as Promise<OfflineSyncQueueItem<unknown>[]>,
    updateQueueItem: async (item) => {
      await putRecord('sync_queue', item)
    },
    markQueueFailure: async (item, message) => {
      await putRecord('sync_queue', {
        ...item,
        status: 'failed',
        attempt_count: item.attempt_count + 1,
        last_error: message,
      })
      await markDraftSyncState(item.local_store, item.local_record_id, {
        sync_status: 'failed',
        synced_at: null,
        last_error: message,
      })
    },
    markQueueSuccess: async (item) => {
      await deleteRecord('sync_queue', item.id)
      await markDraftSyncState(item.local_store, item.local_record_id, {
        sync_status: 'synced',
        synced_at: new Date().toISOString(),
        last_error: null,
      })
    },
    pushQueueItem: async (item) => {
      if (item.entity !== 'asistencia') {
        throw new Error('Unexpected entity for offline asistencia integration test.')
      }

      const payload = item.payload as OfflineAsistenciaPayload
      const formData = new FormData()
      const { offline_selfie_check_in, offline_selfie_check_out, ...record } = payload
      formData.append('payload', JSON.stringify(record))

      if (offline_selfie_check_in?.file) {
        formData.append('selfie_check_in_file', offline_selfie_check_in.file, offline_selfie_check_in.fileName)
      }

      if (offline_selfie_check_out?.file) {
        formData.append('selfie_check_out_file', offline_selfie_check_out.file, offline_selfie_check_out.fileName)
      }

      const response = await POST(
        new Request('http://localhost/api/asistencias/sync', {
          method: 'POST',
          body: formData,
        })
      )

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? 'No fue posible sincronizar la asistencia.')
      }
    },
    refreshDashboardKpis: async () => {
      return
    },
    emitQueueChanged: () => {
      return
    },
  }
}

describe('offline asistencia integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        dispatchEvent: vi.fn(),
      },
    })

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          ready: Promise.resolve({
            sync: {
              register: vi.fn(async (tag: string) => {
                backgroundSyncTags.push(tag)
              }),
            },
          }),
        },
      },
    })

    if (typeof CustomEvent === 'undefined') {
      class TestCustomEvent<T = unknown> extends Event {
        detail?: T

        constructor(type: string, init?: CustomEventInit<T>) {
          super(type)
          this.detail = init?.detail
        }
      }

      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: TestCustomEvent,
      })
    }

    obtenerActorActualMock.mockResolvedValue({
      authUserId: 'auth-1',
      usuarioId: 'user-1',
      empleadoId: 'emp-1',
      cuentaClienteId: 'c1',
      username: 'dc1',
      correoElectronico: 'dc1@example.com',
      correoVerificado: true,
      estadoCuenta: 'ACTIVA',
      nombreCompleto: 'DC Uno',
      puesto: 'DERMOCONSEJERO',
    })

    createServiceClientMock.mockReturnValue(createFakeService())
    storeOptimizedEvidenceMock.mockResolvedValue({
      deduplicated: false,
      archivo: {
        url: 'operacion-evidencias/asistencias/c1/emp-1/check-in/selfie.jpg',
        hash: 'hash-selfie-check-in',
      },
      miniatura: {
        url: 'operacion-evidencias/asistencias/c1/emp-1/check-in/selfie-thumb.jpg',
        hash: 'hash-selfie-check-in-thumb',
      },
      optimization: {
        optimizationKind: 'image',
        originalBytes: 204800,
        optimizedBytes: 94208,
        targetMet: true,
        notes: [],
        officialAssetKind: 'optimized',
      },
    })
    validateAttendanceBiometricsMock.mockResolvedValue({
      status: 'VALIDA',
      provider: 'mock-biometric',
      threshold: 0.82,
      score: 0.97,
      reason: null,
      reference: {
        source: 'empleado_documento',
        bucket: 'expedientes',
        path: 'empleados/emp-1/ref.jpg',
        hash: 'hash-ref',
      },
    })
    sendOperationalPushNotificationMock.mockResolvedValue(undefined)
  })

  it('persiste una asistencia offline al sincronizar y limpia la cola local', async () => {
    const selfie = new File(['fake-selfie'], 'check-in.jpg', { type: 'image/jpeg' })
    const payload: OfflineAsistenciaPayload = {
      id: 'asis-offline-1',
      cuenta_cliente_id: 'c1',
      empleado_id: 'emp-1',
      supervisor_empleado_id: 'sup-1',
      pdv_id: 'pdv-1',
      pdv_nombre: 'PDV Centro',
      fecha_operacion: '2026-03-18',
      check_in_utc: '2026-03-18T14:00:00.000Z',
      latitud_check_in: 19.4326,
      longitud_check_in: -99.1332,
      distancia_check_in_metros: 24,
      estado_gps: 'DENTRO_GEOCERCA',
      origen: 'OFFLINE_SYNC',
      metadata: {
        selfie: {
          capture_source: 'native-getusermedia',
          timestamp_stamped: true,
        },
      },
      offline_selfie_check_in: {
        file: selfie,
        fileName: 'check-in.jpg',
        mimeType: 'image/jpeg',
        fileSize: selfie.size,
        capturedAt: '2026-03-18T14:00:00.000Z',
        localHash: 'local-hash-check-in',
      },
    }

    const initialSummary = await queueOfflineAsistencia(payload)

    expect(initialSummary).toMatchObject({
      pending: 1,
      failed: 0,
      asistenciaDrafts: 1,
      syncedDrafts: 0,
    })
    expect(backgroundSyncTags).toEqual([OFFLINE_SYNC_TAG])
    expect(stores.sync_queue.size).toBe(1)
    expect(stores.asistencia_local.size).toBe(1)

    const result = await processSyncQueueWithRuntime(createOfflineSyncRuntime())
    expect(result.processed).toBe(1)
    expect(result.summary).toMatchObject({
      pending: 0,
      failed: 0,
      asistenciaDrafts: 1,
      syncedDrafts: 1,
    })
    expect(stores.sync_queue.size).toBe(0)

    const syncedDraft = stores.asistencia_local.get('asis-offline-1')
    expect(syncedDraft).toMatchObject({
      sync_status: 'synced',
      last_error: null,
    })

    const persisted = persistedAssistances.get('asis-offline-1')
    expect(persisted).toMatchObject({
      id: 'asis-offline-1',
      cuenta_cliente_id: 'c1',
      empleado_id: 'emp-1',
      pdv_id: 'pdv-1',
      origen: 'OFFLINE_SYNC',
      mision_dia_id: 'mission-1',
      mision_codigo: 'MISION-001',
      biometria_estado: 'VALIDA',
      estatus: 'VALIDA',
      selfie_check_in_url: 'operacion-evidencias/asistencias/c1/emp-1/check-in/selfie.jpg',
      selfie_check_in_hash: 'hash-selfie-check-in',
    })
    expect(auditEvents).toHaveLength(0)
  })
})