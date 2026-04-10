'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AUTH_CONTEXT_POLL_INTERVAL_MS,
  getAuthSessionContextStatus,
} from '@/lib/auth/sessionContext'
import { isSupabaseAuthNetworkError } from '@/lib/supabase/authClientErrors'

const AUTH_CONTEXT_FOCUS_CHECK_DEBOUNCE_MS = 15 * 1000

function pageCanSyncSession() {
  if (typeof document === 'undefined') {
    return true
  }

  return document.visibilityState === 'visible' && document.hasFocus()
}

export function AuthSessionMonitor() {
  const router = useRouter()
  const lastCheckAtRef = useRef(0)
  const pendingCheckRef = useRef(false)
  const pendingRefreshRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let checking = false

    const flushPendingRefresh = () => {
      if (!pendingRefreshRef.current || !pageCanSyncSession()) {
        return
      }

      pendingRefreshRef.current = false
      router.refresh()
    }

    const sincronizarContexto = async (force = false) => {
      if (checking) {
        pendingCheckRef.current = true
        return
      }

      if (!pageCanSyncSession()) {
        pendingCheckRef.current = true
        return
      }

      const now = Date.now()
      if (!force && now - lastCheckAtRef.current < AUTH_CONTEXT_FOCUS_CHECK_DEBOUNCE_MS) {
        return
      }

      checking = true
      lastCheckAtRef.current = now
      pendingCheckRef.current = false

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const user = session?.user ?? null

        if (!session?.access_token || !user) {
          return
        }

        const status = getAuthSessionContextStatus({
          accessToken: session.access_token,
          appMetadata: user.app_metadata,
        })

        if (!status.isStale) {
          flushPendingRefresh()
          return
        }

        if (status.exceededGraceWindow) {
          await supabase.auth.signOut()
          window.location.replace('/login')
          return
        }

        const refreshed = await supabase.auth.refreshSession()
        const refreshedSession = refreshed.data.session ?? null
        const refreshedUser = refreshedSession?.user ?? null

        const refreshedStatus = getAuthSessionContextStatus({
          accessToken: refreshedSession?.access_token,
          appMetadata: refreshedUser?.app_metadata,
        })

        if (refreshed.error || !refreshedSession || !refreshedUser || refreshedStatus.isStale) {
          await supabase.auth.signOut()
          window.location.replace('/login')
          return
        }

        if (pageCanSyncSession()) {
          router.refresh()
        } else {
          pendingRefreshRef.current = true
        }
      } catch (error) {
        if (isSupabaseAuthNetworkError(error)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('AuthSessionMonitor omitio una verificacion de sesion por fallo de red.', error)
          }
          return
        }

        console.error('AuthSessionMonitor encontro un error inesperado al validar la sesion.', error)
      } finally {
        checking = false

        if (pendingCheckRef.current && pageCanSyncSession()) {
          window.setTimeout(() => {
            void sincronizarContexto(true)
          }, 0)
        }
      }
    }

    void sincronizarContexto(true)

    const intervalId = window.setInterval(() => {
      void sincronizarContexto(false)
    }, AUTH_CONTEXT_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        flushPendingRefresh()
        void sincronizarContexto(true)
      }
    }

    const handleWindowFocus = () => {
      flushPendingRefresh()
      void sincronizarContexto(true)
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  return null
}