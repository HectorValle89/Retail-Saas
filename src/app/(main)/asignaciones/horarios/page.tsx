import Link from 'next/link'
import { requerirActorActivo } from '@/lib/auth/session'
import { Card } from '@/components/ui/card'
import { AsignacionesBackButton } from '@/features/asignaciones/components/AsignacionesBackButton'
import { HorariosModalContent } from '@/features/asignaciones/components/AsignacionesPanel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Horarios | Field Force Platform',
}

export default async function HorariosPage() {
  await requerirActorActivo()

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <div className="mb-4">
          <AsignacionesBackButton />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Planeacion operativa</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Horarios</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Importa la semana operativa de San Pablo y usa la asignación puntual cuando necesites resolver un horario distinto sin tocar la base estructural.
        </p>
      </header>

      <div className="space-y-6">
        <Card className="rounded-[28px] border border-slate-200 p-6 shadow-[0_18px_40px_rgba(148,163,184,0.10)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Importación semanal</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Este bloque carga horarios San Pablo para la operación semanal. Si necesitas una excepción puntual, puedes abrir una nueva asignación ya con el horario correcto.
              </p>
            </div>
            <Link href="/asignaciones/asignaciones?modal=manual" className="inline-flex min-h-11 items-center rounded-[16px] bg-[var(--module-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]">
              Nueva asignación puntual
            </Link>
          </div>
          <div className="mt-5">
            <HorariosModalContent />
          </div>
        </Card>
      </div>
    </div>
  )
}
