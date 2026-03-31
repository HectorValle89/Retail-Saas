'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'

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
  '/forgot-password',
  '/check-email',
  '/update-password',
  '/activacion',
  '/primer-acceso',
])

export function AppRuntime() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    let cancelled = false

    const clearDevelopmentPwaState = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const hadRegistrations = registrations.length > 0

      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const cacheKeys = await caches.keys()
        await Promise.all(
          cacheKeys
            .filter((key) => key.startsWith('retail-'))
            .map((key) => caches.delete(key))
        )
      }

      if (!cancelled && hadRegistrations) {
        router.refresh()
      }
    }

    void clearDevelopmentPwaState()

    return () => {
      cancelled = true
    }
  }, [router])

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
