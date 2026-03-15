'use client'

import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { getOfflineQueueSummary } from '@/lib/offline/offlineDb'
import { OFFLINE_QUEUE_EVENT, processSyncQueue } from '@/lib/offline/syncQueue'
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

export interface OfflineSyncState {
  isSupported: boolean
  isOnline: boolean
  isSyncing: boolean
  summary: OfflineQueueSummary
  lastSyncedAt: string | null
  lastError: string | null
  syncNow: () => Promise<void>
  refreshSummary: () => Promise<void>
}

export function useOfflineSync(): OfflineSyncState {
  const [isSupported, setIsSupported] = useState(true)
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
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

  const syncNow = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) {
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
      await refreshSummary()
      return
    }

    try {
      setIsSyncing(true)
      setIsSupported(true)
      const result = await processSyncQueue()
      startTransition(() => {
        setSummary(result.summary)
      })
      setLastSyncedAt(new Date().toISOString())
      setLastError(null)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'No fue posible sincronizar la cola.')
    } finally {
      setIsSyncing(false)
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

    window.addEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    refreshSummaryEvent()
    if (navigator.onLine) {
      syncNowEvent()
    }

    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return {
    isSupported,
    isOnline,
    isSyncing,
    summary,
    lastSyncedAt,
    lastError,
    syncNow,
    refreshSummary,
  }
}
