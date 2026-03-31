'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AUTH_CONTEXT_POLL_INTERVAL_MS,
  getAuthSessionContextStatus,
} from '@/lib/auth/sessionContext'
import { isSupabaseAuthNetworkError } from '@/lib/supabase/authClientErrors'

export function AuthSessionMonitor() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let checking = false

    const sincronizarContexto = async () => {
      if (checking) {
        return
      }

      checking = true

      try {
        const [
          {
            data: { session },
          },
          {
            data: { user },
          },
        ] = await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()])

        if (!session?.access_token || !user) {
          return
        }

        const status = getAuthSessionContextStatus({
          accessToken: session.access_token,
          appMetadata: user.app_metadata,
        })

        if (!status.isStale) {
          return
        }

        if (status.exceededGraceWindow) {
          await supabase.auth.signOut()
          router.replace('/login')
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
          router.replace('/login')
          return
        }

        router.refresh()
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
      }
    }

    void sincronizarContexto()

    const intervalId = window.setInterval(() => {
      void sincronizarContexto()
    }, AUTH_CONTEXT_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sincronizarContexto()
      }
    }

    const handleWindowFocus = () => {
      void sincronizarContexto()
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
