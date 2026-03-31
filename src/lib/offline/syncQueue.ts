'use client'

import { createClient } from '@/lib/supabase/client'
import {
  deleteRecord,
  getOfflineQueueSummary,
  getSortedQueueItems,
  markDraftSyncState,
  putRecord,
} from './offlineDb'
import type {
  OfflineAsistenciaPayload,
  OfflineConflictStrategy,
  OfflineDraftRecord,
  OfflineEntity,
  OfflineLovePayload,
  OfflineQueueSummary,
  OfflineSyncQueueItem,
  OfflineVentaPayload,
} from './types'

export const OFFLINE_QUEUE_EVENT = 'retail:offline-queue-changed'
export const OFFLINE_SYNC_TAG = 'retail-offline-sync'

interface SyncManagerLike {
  register: (tag: string) => Promise<void>
}

interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  sync?: SyncManagerLike
}

export interface SyncQueueRuntime {
  isBrowser: boolean
  isOnline: boolean
  getSummary: () => Promise<OfflineQueueSummary>
  getQueueItems: () => Promise<OfflineSyncQueueItem<unknown>[]>
  updateQueueItem: (item: OfflineSyncQueueItem<unknown>) => Promise<void>
  markQueueFailure: (item: OfflineSyncQueueItem<unknown>, message: string) => Promise<void>
  markQueueSuccess: (item: OfflineSyncQueueItem<unknown>) => Promise<void>
  pushQueueItem: (item: OfflineSyncQueueItem<unknown>) => Promise<void>
  refreshDashboardKpis: (item: OfflineSyncQueueItem<unknown>) => Promise<void>
  emitQueueChanged: () => void
}

function emitQueueChanged() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT))
}

async function registerBackgroundSync() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationWithSync
    if (!registration.sync) {
      return
    }

    await registration.sync.register(OFFLINE_SYNC_TAG)
  } catch {
    // The runtime already falls back to foreground sync via online/visibility listeners.
  }
}

export function sortQueueItemsChronologically<TPayload>(
  items: OfflineSyncQueueItem<TPayload>[]
): OfflineSyncQueueItem<TPayload>[] {
  return [...items].sort((left, right) => left.created_at.localeCompare(right.created_at))
}

function createDraftRecord<TPayload>(
  entity: OfflineEntity,
  payload: TPayload & { id: string }
): OfflineDraftRecord<TPayload> {
  return {
    id: payload.id,
    entity,
    payload,
    sync_status: 'pending',
    queued_at: new Date().toISOString(),
    synced_at: null,
    last_error: null,
  }
}

function createQueueItem<TPayload>(
  entity: OfflineEntity,
  localStore: 'asistencia_local' | 'venta_local' | 'love_local',
  payload: TPayload & { id: string },
  conflictStrategy: OfflineConflictStrategy
): OfflineSyncQueueItem<TPayload> {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    entity,
    operation: 'upsert',
    local_store: localStore,
    local_record_id: payload.id,
    payload,
    status: 'pending',
    conflict_strategy: conflictStrategy,
    attempt_count: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
  }
}

async function enqueueDraft<TPayload>(
  entity: OfflineEntity,
  localStore: 'asistencia_local' | 'venta_local' | 'love_local',
  payload: TPayload & { id: string },
  conflictStrategy: OfflineConflictStrategy
) {
  await putRecord(localStore, createDraftRecord(entity, payload))
  await putRecord('sync_queue', createQueueItem(entity, localStore, payload, conflictStrategy))
  await registerBackgroundSync()
  emitQueueChanged()
}

export async function queueOfflineAsistencia(
  payload: OfflineAsistenciaPayload,
  conflictStrategy: OfflineConflictStrategy = 'client_wins'
) {
  await enqueueDraft('asistencia', 'asistencia_local', payload, conflictStrategy)
  return getOfflineQueueSummary()
}

export async function queueOfflineVenta(
  payload: OfflineVentaPayload,
  conflictStrategy: OfflineConflictStrategy = 'client_wins'
) {
  await enqueueDraft('venta', 'venta_local', payload, conflictStrategy)
  return getOfflineQueueSummary()
}

export async function queueOfflineLoveIsdin(
  payload: OfflineLovePayload,
  conflictStrategy: OfflineConflictStrategy = 'client_wins'
) {
  await enqueueDraft('love_is', 'love_local', payload, conflictStrategy)
  return getOfflineQueueSummary()
}

function buildAsistenciaSyncFormData(payload: OfflineAsistenciaPayload) {
  const formData = new FormData()
  const { offline_selfie_check_in, offline_selfie_check_out, ...record } = payload

  formData.append('payload', JSON.stringify(record))

  if (offline_selfie_check_in?.file) {
    formData.append('selfie_check_in_file', offline_selfie_check_in.file, offline_selfie_check_in.fileName)
  }

  if (offline_selfie_check_out?.file) {
    formData.append('selfie_check_out_file', offline_selfie_check_out.file, offline_selfie_check_out.fileName)
  }

  return formData
}

async function pushOfflineAsistencia(payload: OfflineAsistenciaPayload) {
  const response = await fetch('/api/asistencias/sync', {
    method: 'POST',
    body: buildAsistenciaSyncFormData(payload),
  })

  if (!response.ok) {
    let message = 'No fue posible sincronizar la asistencia.'

    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) {
        message = data.error
      }
    } catch {
      // noop
    }

    throw new Error(message)
  }
}

async function pushOfflineLove(payload: OfflineLovePayload) {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))

  const response = await fetch('/api/love-isdin/sync', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    let message = 'No fue posible sincronizar la afiliacion LOVE ISDIN.'

    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) {
        message = data.error
      }
    } catch {
      // noop
    }

    throw new Error(message)
  }
}

async function updateQueueItem<TPayload>(item: OfflineSyncQueueItem<TPayload>) {
  await putRecord('sync_queue', {
    ...item,
    updated_at: new Date().toISOString(),
  })
}

async function markQueueFailure(item: OfflineSyncQueueItem<unknown>, message: string) {
  await updateQueueItem({
    ...item,
    status: 'failed',
    last_error: message,
    attempt_count: item.attempt_count + 1,
  })

  await markDraftSyncState(item.local_store, item.local_record_id, {
    sync_status: 'failed',
    synced_at: null,
    last_error: message,
  })
}

async function markQueueSuccess(item: OfflineSyncQueueItem<unknown>) {
  await deleteRecord('sync_queue', item.id)
  await markDraftSyncState(item.local_store, item.local_record_id, {
    sync_status: 'synced',
    synced_at: new Date().toISOString(),
    last_error: null,
  })
}

async function pushQueueItem(item: OfflineSyncQueueItem<unknown>) {
  if (item.entity === 'asistencia') {
    await pushOfflineAsistencia(item.payload as OfflineAsistenciaPayload)
    return
  }

  if (item.entity === 'venta') {
    const response = await fetch('/api/ventas/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item.payload),
    })

    if (!response.ok) {
      let message = 'No fue posible sincronizar la venta.'

      try {
        const data = (await response.json()) as { error?: string }
        if (data.error) {
          message = data.error
        }
      } catch {
        // noop
      }

      throw new Error(message)
    }

    return
  }

  if (item.entity === 'love_is') {
    await pushOfflineLove(item.payload as OfflineLovePayload)
  }
}

function shouldRefreshDashboardKpis(item: OfflineSyncQueueItem<unknown>) {
  if (item.entity === 'venta' || item.entity === 'love_is') {
    return true
  }

  if (item.entity !== 'asistencia') {
    return false
  }

  const payload = item.payload as OfflineAsistenciaPayload
  return Boolean(payload.check_out_utc)
}

function toMexicoOperationDate(value: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(new Date(value))
}

function resolvePayloadMetadata(item: OfflineSyncQueueItem<unknown>) {
  const payload = item.payload as { metadata?: unknown }

  if (!payload.metadata || typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)) {
    return {}
  }

  return payload.metadata as Record<string, unknown>
}

export function resolveDashboardKpiRefreshDate(item: OfflineSyncQueueItem<unknown>) {
  if (!shouldRefreshDashboardKpis(item)) {
    return null
  }

  if (item.entity === 'love_is') {
    const payload = item.payload as OfflineLovePayload
    const metadata = resolvePayloadMetadata(item)
    const operationDate = typeof metadata.fecha_operativa === 'string' ? metadata.fecha_operativa.trim() : ''
    return operationDate || (payload.fecha_utc ? toMexicoOperationDate(payload.fecha_utc) : null)
  }

  if (item.entity === 'venta') {
    const payload = item.payload as OfflineVentaPayload
    const metadata = resolvePayloadMetadata(item)
    const operationDate = typeof metadata.fecha_operativa === 'string' ? metadata.fecha_operativa.trim() : ''
    return operationDate || (payload.fecha_utc ? toMexicoOperationDate(payload.fecha_utc) : null)
  }

  const payload = item.payload as OfflineAsistenciaPayload
  return payload.fecha_operacion ?? (payload.check_out_utc ? toMexicoOperationDate(payload.check_out_utc) : null)
}

async function refreshDashboardKpis(item: OfflineSyncQueueItem<unknown>) {
  const refreshDate = resolveDashboardKpiRefreshDate(item)

  if (!refreshDate) {
    return
  }

  const supabase = createClient()
  const rpcClient = supabase as unknown as {
    rpc: (fn: string, args?: Record<string, string>) => Promise<{ error: { message?: string } | null }>
  }
  const { error } = await rpcClient.rpc('refresh_dashboard_kpis_incremental', {
    p_fecha_inicio: refreshDate,
    p_fecha_fin: refreshDate,
  })

  if (error) {
    throw error
  }
}

function createDefaultRuntime(): SyncQueueRuntime {
  return {
    isBrowser: typeof window !== 'undefined',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    getSummary: getOfflineQueueSummary,
    getQueueItems: async () => sortQueueItemsChronologically(await getSortedQueueItems()),
    updateQueueItem,
    markQueueFailure,
    markQueueSuccess,
    pushQueueItem,
    refreshDashboardKpis,
    emitQueueChanged,
  }
}

export async function processSyncQueueWithRuntime(runtime: SyncQueueRuntime) {
  if (!runtime.isBrowser) {
    return {
      processed: 0,
      summary: {
        pending: 0,
        processing: 0,
        failed: 0,
        asistenciaDrafts: 0,
        ventaDrafts: 0,
        loveDrafts: 0,
        syncedDrafts: 0,
      } satisfies OfflineQueueSummary,
    }
  }

  if (!runtime.isOnline) {
    return {
      processed: 0,
      summary: await runtime.getSummary(),
    }
  }

  const queueItems = sortQueueItemsChronologically(await runtime.getQueueItems())
  let processed = 0

  for (const item of queueItems) {
    await runtime.updateQueueItem({
      ...item,
      status: 'processing',
      last_error: null,
    })

    try {
      await runtime.pushQueueItem(item)
      await runtime.refreshDashboardKpis(item)
      await runtime.markQueueSuccess(item)
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible sincronizar el elemento.'

      if (item.conflict_strategy === 'server_wins' && message.includes('duplicate key')) {
        await runtime.markQueueSuccess(item)
      } else {
        await runtime.markQueueFailure(item, message)
      }
    }
  }

  runtime.emitQueueChanged()

  return {
    processed,
    summary: await runtime.getSummary(),
  }
}

export async function processSyncQueue() {
  return processSyncQueueWithRuntime(createDefaultRuntime())
}