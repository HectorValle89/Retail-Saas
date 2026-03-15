'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { OfflineSyncState } from '@/hooks/useOfflineSync'

interface OfflineStatusCardProps {
  title?: string
  description?: string
  offline: OfflineSyncState
  compact?: boolean
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Sin sincronizacion reciente'
  }

  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function OfflineStatusCard({
  title = 'Cola offline',
  description = 'Estado local de borradores y sincronizacion para trabajo de campo.',
  offline,
  compact = false,
}: OfflineStatusCardProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                offline.isOnline
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {offline.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          {!offline.isSupported && (
            <p className="mt-2 text-sm text-amber-700">
              IndexedDB no esta disponible en este navegador. La captura local no quedara persistida.
            </p>
          )}
          {offline.lastError && (
            <p className="mt-2 text-sm text-rose-700">{offline.lastError}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void offline.refreshSummary()}
            disabled={!offline.isSupported}
          >
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={() => void offline.syncNow()}
            isLoading={offline.isSyncing}
            disabled={!offline.isSupported || !offline.isOnline}
          >
            Sincronizar ahora
          </Button>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-4'}`}>
        <Metric label="Pendientes" value={String(offline.summary.pending)} />
        <Metric label="Fallidos" value={String(offline.summary.failed)} />
        <Metric label="Asistencias local" value={String(offline.summary.asistenciaDrafts)} />
        <Metric label="Ventas local" value={String(offline.summary.ventaDrafts)} />
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-400">
        Ultima sincronizacion: {formatTimestamp(offline.lastSyncedAt)}
      </p>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}
