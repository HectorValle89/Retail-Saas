'use client'

import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getAuthSessionContextStatus } from '@/lib/auth/sessionContext'
import { isSupabaseAuthNetworkError } from '@/lib/supabase/authClientErrors'

export function AuthSessionMonitor() {
  useEffect(() => {
    const supabase = createClient()
    let active = true
    const windowWithIdleCallbacks = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const sincronizarContexto = async (session: Session | null) => {
      if (!active) {
        return
      }

      try {
        if (!session?.access_token || !session.user) {
          await supabase.auth.signOut()
          window.location.replace('/login')
          return
        }

        const status = getAuthSessionContextStatus({
          accessToken: session.access_token,
          appMetadata: session.user.app_metadata,
        })

        if (!status.isStale) {
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
      } catch (error) {
        if (isSupabaseAuthNetworkError(error)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('AuthSessionMonitor omitio una verificacion de sesion por fallo de red.', error)
          }
          return
        }

        console.error('AuthSessionMonitor encontro un error inesperado al validar la sesion.', error)
      }
    }

    const runInitialCheck = () => {
      void supabase.auth.getSession().then(({ data }) => {
        void sincronizarContexto(data.session ?? null)
      })
    }

    let timeoutId: number | null = null
    let idleCallbackId: number | null = null

    if (windowWithIdleCallbacks.requestIdleCallback) {
      idleCallbackId = windowWithIdleCallbacks.requestIdleCallback(() => {
        runInitialCheck()
      }, { timeout: 2500 })
    } else {
      timeoutId = window.setTimeout(runInitialCheck, 1500)
    }

    const { data: subscriptionData } = supabase.auth.onAuthStateChange((_event, session) => {
      void sincronizarContexto(session)
    })

    return () => {
      active = false
      if (idleCallbackId !== null) {
        windowWithIdleCallbacks.cancelIdleCallback?.(idleCallbackId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      subscriptionData.subscription.unsubscribe()
    }
  }, [])

  return null
}
