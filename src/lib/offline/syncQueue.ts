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
  OfflineQueueSummary,
  OfflineSyncQueueItem,
  OfflineVentaPayload,
} from './types'

export const OFFLINE_QUEUE_EVENT = 'retail:offline-queue-changed'

function emitQueueChanged() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT))
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

async function updateQueueItem(item: OfflineSyncQueueItem) {
  await putRecord('sync_queue', {
    ...item,
    updated_at: new Date().toISOString(),
  })
}

async function markQueueFailure(item: OfflineSyncQueueItem, message: string) {
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

async function markQueueSuccess(item: OfflineSyncQueueItem) {
  await deleteRecord('sync_queue', item.id)
  await markDraftSyncState(item.local_store, item.local_record_id, {
    sync_status: 'synced',
    synced_at: new Date().toISOString(),
    last_error: null,
  })
}

async function pushQueueItem(item: OfflineSyncQueueItem) {
  const supabase = createClient()

  if (item.entity === 'asistencia') {
    const { error } = await supabase.from('asistencia').upsert(item.payload, { onConflict: 'id' })

    if (error) {
      throw error
    }

    return
  }

  if (item.entity === 'venta') {
    const { error } = await supabase.from('venta').upsert(item.payload, { onConflict: 'id' })

    if (error) {
      throw error
    }
  }
}

export async function processSyncQueue() {
  if (typeof window === 'undefined') {
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

  if (!navigator.onLine) {
    return {
      processed: 0,
      summary: await getOfflineQueueSummary(),
    }
  }

  const queueItems = await getSortedQueueItems()
  let processed = 0

  for (const item of queueItems) {
    await updateQueueItem({
      ...item,
      status: 'processing',
      last_error: null,
    })

    try {
      await pushQueueItem(item)
      await markQueueSuccess(item)
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible sincronizar el elemento.'

      if (item.conflict_strategy === 'server_wins' && message.includes('duplicate key')) {
        await markQueueSuccess(item)
      } else {
        await markQueueFailure(item, message)
      }
    }
  }

  emitQueueChanged()

  return {
    processed,
    summary: await getOfflineQueueSummary(),
  }
}
