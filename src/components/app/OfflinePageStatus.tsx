'use client'

import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export function OfflinePageStatus() {
  const offline = useOfflineSync()

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <CardMetric label="Pendientes" value={String(offline.summary.pending)} />
        <CardMetric label="Fallidos" value={String(offline.summary.failed)} />
        <CardMetric label="Sincronizados" value={String(offline.summary.syncedDrafts)} />
        <CardMetric
          label="Estado"
          value={offline.isOnline ? 'Online' : 'Offline'}
          highlighted
        />
      </div>

      <OfflineStatusCard
        offline={offline}
        title="Estado del dispositivo"
        description="Revision rapida de la cola local, sincronizacion y borradores operativos."
        compact
      />
    </>
  )
}

function CardMetric({
  label,
  value,
  highlighted,
}: {
  label: string
  value: string
  highlighted?: boolean
}) {
  return (
    <Card
      className={`px-4 py-3 text-sm uppercase tracking-[0.18em] ${
        highlighted
          ? 'border border-emerald-400 bg-emerald-500/10 text-emerald-300'
          : 'border border-slate-800 bg-slate-900'
      }`}
    >
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </Card>
  )
}
