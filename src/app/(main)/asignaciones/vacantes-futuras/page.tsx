import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesBackButton } from '@/features/asignaciones/components/AsignacionesBackButton'
import { VacantesFuturasPageClient } from '@/features/asignaciones/components/VacantesFuturasPageClient'
import { obtenerPanelAsignaciones } from '@/features/asignaciones/services/asignacionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Vacantes futuras | Field Force Platform',
}

interface VacantesFuturasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function VacantesFuturasPage({ searchParams }: VacantesFuturasPageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelAsignaciones(supabase, actor, {
    view: 'vacantes-futuras',
  })
  const selectedVacancyId = pickString(params.vacante_id)

  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <div className="mb-4">
          <AsignacionesBackButton />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Planeacion operativa</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Vacantes futuras</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Esta bandeja conserva la cobertura derivada de bajas y movimientos cancelados para resolver reasignaciones sin perder trazabilidad.
        </p>
      </header>

      <VacantesFuturasPageClient data={data.futureVacanciesView} selectedVacancyId={selectedVacancyId} />
    </div>
  )
}
