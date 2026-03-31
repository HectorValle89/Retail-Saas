import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsistenciasPanel } from '@/features/asistencias/components/AsistenciasPanel'
import { obtenerPanelAsistencias } from '@/features/asistencias/services/asistenciaService'

export const metadata = {
  title: 'Asistencias | Field Force Platform',
}

interface AsistenciasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export default async function AsistenciasPage({ searchParams }: AsistenciasPageProps) {
  await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelAsistencias(supabase, {
    page: parsePositiveInt(pickString(params.page), 1),
    pageSize: parsePositiveInt(pickString(params.pageSize), 50),
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Ejecucion diaria
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asistencias</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Jornada operativa con GPS, misión del día, validación biométrica y trazabilidad de check-in/check-out.
        </p>
      </header>

      <AsistenciasPanel data={data} />
    </div>
  )
}
