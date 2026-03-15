'use client'

import Link from 'next/link'
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'

const actionLinkClass =
  'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

export default function OfflinePage() {
  const offline = useOfflineSync()

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          PWA de operacion
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Modo offline</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Esta pantalla queda como fallback de navegacion cuando la red cae. La app puede seguir
          guardando borradores de asistencias y ventas para sincronizarlos despues.
        </p>

        <div className="mt-8">
          <OfflineStatusCard
            offline={offline}
            title="Estado del dispositivo"
            description="Revision rapida de la cola local, sincronizacion y borradores operativos."
          />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <InfoCard
            title="1. Captura local"
            text="Desde Asistencias y Ventas puedes guardar borradores aunque no haya internet."
          />
          <InfoCard
            title="2. Cola persistente"
            text="Los registros se quedan en IndexedDB hasta que la red vuelva o forces una sincronizacion."
          />
          <InfoCard
            title="3. Reintento controlado"
            text="Si el backend rechaza un registro, la cola lo deja marcado como fallido para corregirlo."
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className={`${actionLinkClass} bg-white text-slate-950 hover:bg-slate-100`}>
            Ir al dashboard
          </Link>
          <Link href="/asistencias" className={`${actionLinkClass} border border-slate-700 text-slate-100 hover:bg-slate-900`}>
            Capturar asistencias
          </Link>
          <Link href="/ventas" className={`${actionLinkClass} border border-slate-700 text-slate-100 hover:bg-slate-900`}>
            Capturar ventas
          </Link>
        </div>
      </div>
    </main>
  )
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
    </Card>
  )
}
