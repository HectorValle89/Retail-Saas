'use client'

import { X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOfflineSync } from '@/hooks/useOfflineSync'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const PWA_INSTALL_DISMISSED_KEY = 'retail.pwa.install-dismissed'

export function PwaBootstrap() {
  const offline = useOfflineSync()
  const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMobileBrowser, setIsMobileBrowser] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || isLocalHost) {
      return
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        setServiceWorkerReady(true)
      })
      .catch(() => {
        setServiceWorkerReady(false)
      })
  }, [isLocalHost])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setIsDismissed(window.sessionStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1')

    const userAgent = window.navigator.userAgent.toLowerCase()
    const compactViewportQuery = window.matchMedia('(max-width: 767px)')
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)

    const syncViewportFlags = (matchesCompactViewport: boolean) => {
      setIsMobileBrowser(matchesCompactViewport || /android|iphone|ipad|ipod|mobile/.test(userAgent))
    }

    setIsStandalone(standalone)
    setIsIos(/iphone|ipad|ipod/.test(userAgent))
    syncViewportFlags(compactViewportQuery.matches)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsInstalling(false)
      setShowInstallHelp(false)
      setIsStandalone(true)
      window.sessionStorage.removeItem(PWA_INSTALL_DISMISSED_KEY)
      setIsDismissed(false)
    }

    const handleViewportChange = (event: MediaQueryListEvent) => {
      syncViewportFlags(event.matches)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    compactViewportQuery.addEventListener('change', handleViewportChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      compactViewportQuery.removeEventListener('change', handleViewportChange)
    }
  }, [isLocalHost])

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstallHelp(true)
      return
    }

    setIsInstalling(true)

    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
    } finally {
      setInstallPrompt(null)
      setIsInstalling(false)
    }
  }

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1')
    }
    setIsDismissed(true)
    setShowInstallHelp(false)
  }

  const installAssistAvailable =
    process.env.NODE_ENV === 'production' &&
    serviceWorkerReady &&
    !isStandalone &&
    (Boolean(installPrompt) || isMobileBrowser)

  if (!serviceWorkerReady || !installAssistAvailable || isDismissed) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3 lg:justify-end lg:px-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              PWA de campo
            </p>
            <h2 className="mt-2 text-base font-semibold text-slate-950">Instalar app</h2>
            <p className="mt-1 text-sm text-slate-600">
              {offline.isOnline
                ? 'La instalacion te da acceso rapido y la sincronizacion en campo sigue funcionando automaticamente.'
                : 'Puedes instalarla aun sin red. Cuando vuelva la conexion, la cola local intentara sincronizarse sola.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:text-slate-600"
            aria-label="Cerrar ayuda de instalacion"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            size="sm"
            onClick={() => void handleInstall()}
            isLoading={Boolean(installPrompt) && isInstalling}
          >
            Instalar app
          </Button>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Cerrar
          </Button>
        </div>

        {showInstallHelp && !installPrompt && (
          <p className="mt-3 text-xs text-slate-600">
            {isIos
              ? 'En iPhone abre Compartir y elige "Agregar a pantalla de inicio" para instalar la app.'
              : 'Si el navegador no muestra el prompt automatico, abre el menu del navegador y elige "Instalar app" o "Agregar a pantalla de inicio".'}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
          El detalle de sincronizacion offline sigue disponible dentro de los modulos operativos y en la pagina offline.
        </p>
      </div>
    </div>
  )
}
