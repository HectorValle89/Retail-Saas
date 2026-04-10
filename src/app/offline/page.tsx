export const runtime = 'edge';
import Link from 'next/link'
import { OfflinePageStatus } from '@/components/app/OfflinePageStatus'
import { Card } from '@/components/ui/card'

const actionLinkClass =
  'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">PWA de operacion</p>
          <h1 className="mt-3 text-4xl font-semibold">Modo offline</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Esta pantalla queda como fallback de navegacion cuando la red cae. La app puede seguir
            guardando borradores de asistencias y ventas para sincronizarlos despues.
          </p>
        </div>

        <OfflinePageStatus />

        <div className="grid gap-4 sm:grid-cols-3">
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

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/dashboard" className={`${actionLinkClass} bg-white text-slate-950 hover:bg-slate-100`}>
            Ir al dashboard
          </Link>
          <Link
            href="/asistencias"
            className={`${actionLinkClass} border border-slate-700 text-slate-100 hover:bg-slate-900`}
          >
            Capturar asistencias
          </Link>
          <Link
            href="/ventas"
            className={`${actionLinkClass} border border-slate-700 text-slate-100 hover:bg-slate-900`}
          >
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

