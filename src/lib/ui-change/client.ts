'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type {
  UiChangeRoleTarget,
  UiChangeSurface,
  UiChangeVersionRow,
} from '@/lib/ui-change/types'

type UseUiChangeSubscriptionOptions = {
  module: string
  surfaces: UiChangeSurface[]
  scopeKeys: string[]
  roleTargets?: UiChangeRoleTarget[]
  enabled?: boolean
}

type UseVersionedRefetchOptions<T> = {
  initialData: T
  observedChange: UiChangeVersionRow | null
  fetcher: (signal: AbortSignal, change: UiChangeVersionRow) => Promise<T>
  debounceMs?: number
  refreshOnMount?: boolean
}

type UseScopedWidgetDataOptions<T> = UseUiChangeSubscriptionOptions & {
  initialData: T
  fetcher: (signal: AbortSignal, change: UiChangeVersionRow) => Promise<T>
  debounceMs?: number
  refreshOnMount?: boolean
}

type ListenerEntry = {
  id: number
  module: string
  surfaces: Set<UiChangeSurface>
  scopeKeys: Set<string>
  roleTargets?: Set<UiChangeRoleTarget>
  onChange: (change: UiChangeVersionRow) => void
  pendingChange: UiChangeVersionRow | null
}

const listeners = new Map<number, ListenerEntry>()
let listenerIdSequence = 0
let sharedChannel: RealtimeChannel | null = null
let sharedListenersAttached = false

function canRefreshNow() {
  if (typeof document === 'undefined') {
    return true
  }

  return document.visibilityState === 'visible' && document.hasFocus()
}

function normalizeKeyList(values: readonly string[]) {
  return Array.from(new Set(values)).sort().join('|')
}

function matchesUiChange(
  row: UiChangeVersionRow,
  {
    surfaces,
    scopeKeys,
    roleTargets,
  }: {
    surfaces: ReadonlySet<UiChangeSurface>
    scopeKeys: ReadonlySet<string>
    roleTargets?: ReadonlySet<UiChangeRoleTarget>
  }
) {
  const surfaceMatches = row.surface === 'all' || surfaces.has(row.surface)
  const scopeMatches = row.scope_key === 'global' || scopeKeys.has(row.scope_key)
  const roleMatches =
    !roleTargets ||
    roleTargets.size === 0 ||
    row.role_target === 'ALL' ||
    roleTargets.has(row.role_target)

  return surfaceMatches && scopeMatches && roleMatches
}

function buildUiChangeToken(row: UiChangeVersionRow) {
  return `${row.module}:${row.surface}:${row.scope_key}:${row.role_target}:${row.version}`
}

function flushPendingChanges() {
  if (!canRefreshNow()) {
    return
  }

  listeners.forEach((entry) => {
    if (!entry.pendingChange) {
      return
    }

    const nextChange = entry.pendingChange
    entry.pendingChange = null
    entry.onChange(nextChange)
  })
}

function ensureSharedChannel() {
  if (typeof window === 'undefined' || sharedChannel) {
    return sharedChannel
  }

  const supabase = createClient()
  sharedChannel = supabase.channel('ui-change:shared')

  sharedChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'ui_change_version',
    },
    (payload) => {
      const nextChange = payload.new as UiChangeVersionRow

      listeners.forEach((entry) => {
        if (
          entry.module !== nextChange.module ||
          !matchesUiChange(nextChange, {
            surfaces: entry.surfaces,
            scopeKeys: entry.scopeKeys,
            roleTargets: entry.roleTargets,
          })
        ) {
          return
        }

        if (!canRefreshNow()) {
          entry.pendingChange = nextChange
          return
        }

        entry.onChange(nextChange)
      })
    }
  )

  sharedChannel.subscribe()
  return sharedChannel
}

function attachSharedListeners() {
  if (sharedListenersAttached || typeof window === 'undefined') {
    return
  }

  window.addEventListener('focus', flushPendingChanges)
  document.addEventListener('visibilitychange', flushPendingChanges)
  sharedListenersAttached = true
}

function detachSharedListeners() {
  if (!sharedListenersAttached || typeof window === 'undefined') {
    return
  }

  window.removeEventListener('focus', flushPendingChanges)
  document.removeEventListener('visibilitychange', flushPendingChanges)
  sharedListenersAttached = false
}

function releaseSharedChannel() {
  if (!sharedChannel) {
    return
  }

  const supabase = createClient()
  void supabase.removeChannel(sharedChannel)
  sharedChannel = null
}

function registerUiChangeListener(
  module: string,
  surfaces: UiChangeSurface[],
  scopeKeys: string[],
  roleTargets: UiChangeRoleTarget[] | undefined,
  onChange: (change: UiChangeVersionRow) => void
) {
  const id = ++listenerIdSequence
  const entry: ListenerEntry = {
    id,
    module,
    surfaces: new Set(surfaces),
    scopeKeys: new Set(scopeKeys),
    roleTargets: roleTargets && roleTargets.length > 0 ? new Set(roleTargets) : undefined,
    onChange,
    pendingChange: null,
  }

  listeners.set(id, entry)
  attachSharedListeners()
  ensureSharedChannel()

  return () => {
    listeners.delete(id)

    if (listeners.size === 0) {
      detachSharedListeners()
      releaseSharedChannel()
    }
  }
}

export function useUiChangeSubscription({
  module,
  surfaces,
  scopeKeys,
  roleTargets,
  enabled = true,
}: UseUiChangeSubscriptionOptions) {
  const [latestChange, setLatestChange] = useState<UiChangeVersionRow | null>(null)
  const surfacesRef = useRef(surfaces)
  const scopeKeysRef = useRef(scopeKeys)
  const roleTargetsRef = useRef(roleTargets)
  const subscriptionKey = [
    module,
    normalizeKeyList(surfaces),
    normalizeKeyList(scopeKeys),
    normalizeKeyList(roleTargets ?? []),
    enabled ? '1' : '0',
  ].join('::')

  useEffect(() => {
    surfacesRef.current = surfaces
  }, [surfaces])

  useEffect(() => {
    scopeKeysRef.current = scopeKeys
  }, [scopeKeys])

  useEffect(() => {
    roleTargetsRef.current = roleTargets
  }, [roleTargets])

  useEffect(() => {
    if (!enabled || scopeKeysRef.current.length === 0) {
      return
    }

    return registerUiChangeListener(
      module,
      surfacesRef.current,
      scopeKeysRef.current,
      roleTargetsRef.current,
      (change) => {
        startTransition(() => {
          setLatestChange(change)
        })
      }
    )
  }, [enabled, module, subscriptionKey])

  return latestChange
}

export function useVersionedRefetch<T>({
  initialData,
  observedChange,
  fetcher,
  debounceMs = 500,
  refreshOnMount = false,
}: UseVersionedRefetchOptions<T>) {
  const [data, setData] = useState(initialData)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastHandledTokenRef = useRef<string | null>(null)
  const fetcherRef = useRef(fetcher)
  const refreshedOnMountRef = useRef(false)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  useEffect(() => {
    setData(initialData)
  }, [initialData])

  useEffect(() => {
    if (!refreshOnMount || refreshedOnMountRef.current) {
      return
    }

    refreshedOnMountRef.current = true

    const controller = new AbortController()
    let active = true

    setIsRefreshing(true)
    setError(null)

    startTransition(() => {
      void fetcherRef.current(controller.signal, {
        id: '__initial-refresh__',
        cuenta_cliente_id: null,
        module: '__initial__',
        surface: 'all',
        scope_key: 'global',
        role_target: 'ALL',
        empleado_id: null,
        supervisor_empleado_id: null,
        version: 0,
        last_event_type: 'initial-refresh',
        updated_at: new Date().toISOString(),
        metadata: {},
      } as UiChangeVersionRow)
        .then((nextData) => {
          if (!active) {
            return
          }

          setData(nextData)
        })
        .catch((nextError) => {
          if (!active || controller.signal.aborted) {
            return
          }

          setError(
            nextError instanceof Error ? nextError.message : 'No fue posible refrescar el widget.'
          )
        })
        .finally(() => {
          if (active) {
            setIsRefreshing(false)
          }
        })
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [refreshOnMount])

  useEffect(() => {
    if (!observedChange) {
      return
    }

    const token = buildUiChangeToken(observedChange)
    if (lastHandledTokenRef.current === token) {
      return
    }

    lastHandledTokenRef.current = token

    const controller = new AbortController()
    let active = true

    const timeoutId = window.setTimeout(() => {
      setIsRefreshing(true)
      setError(null)

      startTransition(() => {
        void fetcherRef.current(controller.signal, observedChange)
          .then((nextData) => {
            if (!active) {
              return
            }

            setData(nextData)
          })
          .catch((nextError) => {
            if (!active || controller.signal.aborted) {
              return
            }

            setError(nextError instanceof Error ? nextError.message : 'No fue posible refrescar el widget.')
          })
          .finally(() => {
            if (active) {
              setIsRefreshing(false)
            }
          })
      })
    }, debounceMs)

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [debounceMs, observedChange])

  return { data, isRefreshing, error }
}

export function useScopedWidgetData<T>({
  initialData,
  module,
  surfaces,
  scopeKeys,
  roleTargets,
  enabled = true,
  fetcher,
  debounceMs,
  refreshOnMount,
}: UseScopedWidgetDataOptions<T>) {
  const observedChange = useUiChangeSubscription({
    module,
    surfaces,
    scopeKeys,
    roleTargets,
    enabled,
  })

  const result = useVersionedRefetch({
    initialData,
    observedChange,
    fetcher,
    debounceMs,
    refreshOnMount,
  })

  return {
    ...result,
    observedChange,
  }
}
