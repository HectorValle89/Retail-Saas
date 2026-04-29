'use client'

import { useSyncExternalStore } from 'react'
import { getOfflineQueueSummary } from '@/lib/offline/offlineDb'
import { OFFLINE_QUEUE_EVENT, OFFLINE_SYNC_TAG, processSyncQueue } from '@/lib/offline/syncQueue'
import type { OfflineQueueSummary } from '@/lib/offline/types'
import { getAsignacionesDelta } from '@/features/asignaciones/actions/asignacionDeltaAction'
import { 
  getLastAsignacionSyncTimestamp, 
  saveAsignacionesLocal, 
  setLastAsignacionSyncTimestamp 
} from '@/lib/offline/asignacionIndexedDB'

const EMPTY_SUMMARY: OfflineQueueSummary = {
  pending: 0,
  processing: 0,
  failed: 0,
  asistenciaDrafts: 0,
  ventaDrafts: 0,
  loveDrafts: 0,
  syncedDrafts: 0,
}

type OfflineSyncSnapshot = {
  isSupported: boolean
  isOnline: boolean
  hasHydrated: boolean
  isSyncing: boolean
  summary: OfflineQueueSummary
  lastSyncedAt: string | null
  lastError: string | null
}

const EMPTY_SNAPSHOT: OfflineSyncSnapshot = {
  isSupported: true,
  isOnline: true,
  hasHydrated: false,
  isSyncing: false,
  summary: EMPTY_SUMMARY,
  lastSyncedAt: null,
  lastError: null,
}

let snapshot: OfflineSyncSnapshot = { ...EMPTY_SNAPSHOT }
let started = false
let browserListenersAttached = false
let syncInFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emitSnapshotChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setSnapshot(partial: Partial<OfflineSyncSnapshot>) {
  snapshot = {
    ...snapshot,
    ...partial,
  }
  emitSnapshotChange()
}

function getSnapshot() {
  return snapshot
}

export function shouldAutoSyncOfflineQueue(summary: OfflineQueueSummary) {
  return summary.pending > 0
}

async function notifyServiceWorkerSyncComplete(payload: {
  tag: string
  requestId: string
  ok: boolean
  error?: string
}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const controller = navigator.serviceWorker.controller
  if (controller) {
    controller.postMessage({
      type: 'OFFLINE_SYNC_COMPLETE',
      ...payload,
    })
    return
  }

  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage({
    type: 'OFFLINE_SYNC_COMPLETE',
    ...payload,
  })
}

async function refreshSummaryInternal() {
  try {
    const nextSummary = await getOfflineQueueSummary()
    setSnapshot({
      isSupported: true,
      lastError: null,
      summary: nextSummary,
    })
  } catch (error) {
    setSnapshot({
      isSupported: false,
      lastError: error instanceof Error ? error.message : 'No fue posible leer la cola offline.',
      summary: EMPTY_SUMMARY,
    })
  }
}

function shouldRunBackgroundSync() {
  return shouldAutoSyncOfflineQueue(snapshot.summary)
}

async function runSyncCycle() {
  if (typeof window === 'undefined') {
    return
  }

  if (!navigator.onLine) {
    setSnapshot({
      isOnline: false,
    })
    await refreshSummaryInternal()
    return
  }

  if (syncInFlight) {
    return syncInFlight
  }

  if (!shouldRunBackgroundSync()) {
    await refreshSummaryInternal()
    return
  }

  const syncTask = (async () => {
    setSnapshot({
      isOnline: true,
      isSupported: true,
      isSyncing: true,
    })

    try {
      const result = await processSyncQueue()
      setSnapshot({
        summary: result.summary,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      })
    } catch (error) {
      setSnapshot({
        lastError: error instanceof Error ? error.message : 'No fue posible sincronizar la cola.',
      })
      throw error
    } finally {
      setSnapshot({
        isSyncing: false,
      })
    }
  })()

  syncInFlight = syncTask

  try {
    await syncTask
  } finally {
    if (syncInFlight === syncTask) {
      syncInFlight = null
    }
  }
}

async function runAsignacionDeltaSync() {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return
  }

  try {
    const lastSync = await getLastAsignacionSyncTimestamp()
    const deltas = await getAsignacionesDelta(lastSync)

    if (deltas.length > 0) {
      await saveAsignacionesLocal(deltas)
      
      // El último refreshed_at del lote es nuestro nuevo cursor
      const newestTimestamp = deltas[deltas.length - 1].refreshed_at
      await setLastAsignacionSyncTimestamp(newestTimestamp)
      
      console.log(`[OfflineSync] Sincronizados ${deltas.length} cambios de asignación.`)
    }
  } catch (error) {
    // Es silencioso, solo loggeamos el error para debug
    console.error('[OfflineSync] Falló la sincronización diferencial de asignaciones:', error)
  }
}

function attachBrowserListeners() {
  if (browserListenersAttached || typeof window === 'undefined') {
    return
  }

  browserListenersAttached = true

  const handleQueueChange = () => {
    void (async () => {
      await refreshSummaryInternal()
      if (navigator.onLine && shouldRunBackgroundSync()) {
        await runSyncCycle()
      }
    })().catch((error) => {
      setSnapshot({
        lastError:
          error instanceof Error ? error.message : 'No fue posible actualizar la cola offline.',
      })
    })
  }

  const handleOnline = () => {
    setSnapshot({
      isOnline: true,
    })

    void runSyncCycle().catch((error) => {
      setSnapshot({
        lastError:
          error instanceof Error ? error.message : 'No fue posible sincronizar la cola.',
      })
    })

    // Disparamos sync de bajada (deltas) al volver online
    void runAsignacionDeltaSync()
  }

  const handleOffline = () => {
    setSnapshot({
      isOnline: false,
    })
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return
    }

    void (async () => {
      await refreshSummaryInternal()
      if (navigator.onLine && shouldRunBackgroundSync()) {
        await runSyncCycle()
      }
      // Al recuperar el foco, también checamos deltas
      if (navigator.onLine) {
        await runAsignacionDeltaSync()
      }
    })().catch((error) => {
      setSnapshot({
        lastError:
          error instanceof Error ? error.message : 'No fue posible actualizar la cola offline.',
      })
    })
  }

  const handleServiceWorkerMessage = (
    event: MessageEvent<{ type?: string; tag?: string; requestId?: string }>
  ) => {
    if (event.data?.type !== 'OFFLINE_SYNC_REQUEST' || event.data.tag !== OFFLINE_SYNC_TAG) {
      return
    }

    const requestId = event.data.requestId
    if (!requestId) {
      void runSyncCycle().catch((error) => {
        setSnapshot({
          lastError:
            error instanceof Error ? error.message : 'No fue posible sincronizar la cola offline.',
        })
      })
      return
    }

    void (async () => {
      try {
        await runSyncCycle()
        await notifyServiceWorkerSyncComplete({
          tag: OFFLINE_SYNC_TAG,
          requestId,
          ok: true,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No fue posible sincronizar la cola offline.'
        setSnapshot({
          lastError: message,
        })
        await notifyServiceWorkerSyncComplete({
          tag: OFFLINE_SYNC_TAG,
          requestId,
          ok: false,
          error: message,
        })
      }
    })()
  }

  window.addEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)
}

async function initializeBrowserRuntime() {
  setSnapshot({
    hasHydrated: true,
    isOnline: navigator.onLine,
  })

  attachBrowserListeners()
  await refreshSummaryInternal()

  if (navigator.onLine && shouldRunBackgroundSync()) {
    await runSyncCycle()
  }

  if (navigator.onLine) {
    await runAsignacionDeltaSync()
  }
}

function ensureStarted() {
  if (started) {
    return
  }

  started = true

  if (typeof window === 'undefined') {
    return
  }

  void initializeBrowserRuntime().catch((error) => {
    setSnapshot({
      lastError:
        error instanceof Error ? error.message : 'No fue posible inicializar la sincronizacion offline.',
    })
  })
}

export interface OfflineSyncState {
  isSupported: boolean
  isOnline: boolean
  hasHydrated: boolean
  isSyncing: boolean
  summary: OfflineQueueSummary
  lastSyncedAt: string | null
  lastError: string | null
  syncNow: () => Promise<void>
  refreshSummary: () => Promise<void>
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  ensureStarted()

  return () => {
    listeners.delete(listener)
  }
}

export function useOfflineSync(): OfflineSyncState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    ...state,
    syncNow: runSyncCycle,
    refreshSummary: refreshSummaryInternal,
  }
}
