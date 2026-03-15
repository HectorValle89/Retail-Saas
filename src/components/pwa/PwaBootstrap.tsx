'use client'

import { useEffect, useState } from 'react'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaBootstrap() {
  const offline = useOfflineSync()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsInstalling(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) {
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

  if (!serviceWorkerReady && !installPrompt && !offline.summary.pending && !offline.summary.failed) {
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
            <h2 className="mt-2 text-base font-semibold text-slate-950">
              {offline.isOnline ? 'Operacion conectada' : 'Modo sin conexion'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {offline.isOnline
                ? 'La cola local puede sincronizar asistencias y ventas.'
                : 'Los nuevos registros se guardan localmente y esperan red.'}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              offline.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {offline.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <MiniMetric label="Pend." value={String(offline.summary.pending)} />
          <MiniMetric label="Error" value={String(offline.summary.failed)} />
          <MiniMetric label="Sync" value={String(offline.summary.syncedDrafts)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            size="sm"
            onClick={() => void offline.syncNow()}
            isLoading={offline.isSyncing}
            disabled={!offline.isOnline || !offline.isSupported}
          >
            Sincronizar
          </Button>
          {installPrompt && (
            <Button size="sm" variant="outline" onClick={handleInstall} isLoading={isInstalling}>
              Instalar app
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}
