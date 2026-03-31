'use client'

import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { getOfflineQueueSummary } from '@/lib/offline/offlineDb'
import { OFFLINE_QUEUE_EVENT, OFFLINE_SYNC_TAG, processSyncQueue } from '@/lib/offline/syncQueue'
import type { OfflineQueueSummary } from '@/lib/offline/types'

const EMPTY_SUMMARY: OfflineQueueSummary = {
  pending: 0,
  processing: 0,
  failed: 0,
  asistenciaDrafts: 0,
  ventaDrafts: 0,
  loveDrafts: 0,
  syncedDrafts: 0,
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

export function useOfflineSync(): OfflineSyncState {
  const [isSupported, setIsSupported] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [summary, setSummary] = useState<OfflineQueueSummary>(EMPTY_SUMMARY)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const refreshSummary = async () => {
    try {
      const nextSummary = await getOfflineQueueSummary()
      setIsSupported(true)
      setLastError(null)
      startTransition(() => {
        setSummary(nextSummary)
      })
    } catch (error) {
      setIsSupported(false)
      setLastError(error instanceof Error ? error.message : 'No fue posible leer la cola offline.')
      startTransition(() => {
        setSummary(EMPTY_SUMMARY)
      })
    }
  }

  const runSyncCycle = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) {
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
      await refreshSummary()
      return
    }

    setIsSyncing(true)
    setIsSupported(true)

    try {
      const result = await processSyncQueue()
      startTransition(() => {
        setSummary(result.summary)
      })
      setLastSyncedAt(new Date().toISOString())
      setLastError(null)
      return result
    } finally {
      setIsSyncing(false)
    }
  }

  const syncNow = async () => {
    try {
      await runSyncCycle()
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'No fue posible sincronizar la cola.')
    }
  }

  const refreshSummaryEvent = useEffectEvent(() => {
    void refreshSummary()
  })

  const syncNowEvent = useEffectEvent(() => {
    void syncNow()
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setHasHydrated(true)
    setIsOnline(navigator.onLine)

    const handleQueueChange = () => {
      refreshSummaryEvent()
    }

    const handleOnline = () => {
      setIsOnline(true)
      syncNowEvent()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSummaryEvent()
        if (navigator.onLine) {
          syncNowEvent()
        }
      }
    }

    const handleServiceWorkerMessage = (
      event: MessageEvent<{ type?: string; tag?: string; requestId?: string }>
    ) => {
      if (event.data?.type !== 'OFFLINE_SYNC_REQUEST' || event.data.tag !== OFFLINE_SYNC_TAG) {
        return
      }

      const requestId = event.data.requestId
      if (!requestId) {
        syncNowEvent()
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
          setLastError(
            error instanceof Error ? error.message : 'No fue posible sincronizar la cola offline.'
          )
          await notifyServiceWorkerSyncComplete({
            tag: OFFLINE_SYNC_TAG,
            requestId,
            ok: false,
            error:
              error instanceof Error ? error.message : 'No fue posible sincronizar la cola offline.',
          })
        }
      })()
    }

    window.addEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)

    refreshSummaryEvent()
    if (navigator.onLine) {
      syncNowEvent()
    }

    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [])

  return {
    isSupported,
    isOnline,
    hasHydrated,
    isSyncing,
    summary,
    lastSyncedAt,
    lastError,
    syncNow,
    refreshSummary,
  }
}
