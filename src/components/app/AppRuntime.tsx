'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import {
  recoverFromChunkLoadError,
  shouldRecoverFromChunkLoadError,
} from '@/lib/runtime/chunkRecovery'

const AuthSessionMonitor = dynamic(
  () => import('@/components/auth/AuthSessionMonitor').then((module) => module.AuthSessionMonitor),
  { ssr: false }
)
const PwaBootstrap = dynamic(
  () => import('@/components/pwa/PwaBootstrap').then((module) => module.PwaBootstrap),
  { ssr: false }
)

const PUBLIC_PATHS = new Set([
  '/',
  '/offline',
  '/login',
  '/logout',
  '/forgot-password',
  '/check-email',
  '/update-password',
  '/activacion',
  '/enlace-caducado',
  '/primer-acceso',
])

export function AppRuntime() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || PUBLIC_PATHS.has(pathname)) {
      return
    }

    const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

    if (process.env.NODE_ENV === 'production' && !isLocalHost) {
      return
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const clearDevelopmentPwaState = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()

      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const cacheKeys = await caches.keys()
        await Promise.all(
          cacheKeys
            .filter((key) => key.startsWith('retail-'))
            .map((key) => caches.delete(key))
        )
      }
    }

    void clearDevelopmentPwaState()

    return undefined
  }, [pathname])

  useEffect(() => {
    if (!pathname) {
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    const handleError = (event: ErrorEvent) => {
      const message = String(event?.message ?? '')
      if (!message || !shouldRecoverFromChunkLoadError(message)) {
        return
      }
      void recoverFromChunkLoadError()
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason as unknown
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : ''

      if (!message || !shouldRecoverFromChunkLoadError(message)) {
        return
      }
      void recoverFromChunkLoadError()
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [pathname])

  if (!pathname || PUBLIC_PATHS.has(pathname)) {
    return null
  }

  return (
    <>
      <AuthSessionMonitor />
      <PwaBootstrap />
    </>
  )
}
