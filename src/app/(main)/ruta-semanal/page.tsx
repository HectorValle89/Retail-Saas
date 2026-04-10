import { createClient } from '@/lib/supabase/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { RutaSemanalPanel } from '@/features/rutas/components/RutaSemanalPanel'
import { obtenerPanelRutaSemanal } from '@/features/rutas/services/rutaSemanalService'

export const metadata = {
  title: 'Ruta semanal | Field Force Platform',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

const RUTA_SEMANAL_ROLES = ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'] as const
type SupervisorRouteTab = 'agenda' | 'planning' | 'history'
type WarRoomTab = 'routes' | 'coverage' | 'quotas' | 'reach'

interface RutaSemanalPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function RutaSemanalPage({ searchParams }: RutaSemanalPageProps) {
  const actor = await requerirPuestosActivos([...RUTA_SEMANAL_ROLES])
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const rawTab = pickString(params.tab)
  const initialTab: SupervisorRouteTab | WarRoomTab =
    actor.puesto === 'SUPERVISOR'
      ? rawTab === 'agenda' || rawTab === 'planning' || rawTab === 'history'
        ? rawTab
        : 'agenda'
      : rawTab === 'routes' || rawTab === 'coverage' || rawTab === 'quotas' || rawTab === 'reach'
        ? rawTab
        : 'quotas'
  const data = await obtenerPanelRutaSemanal(supabase, actor)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Planeacion operativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Ruta semanal</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Secuencia semanal de visitas de supervision a PDVs con validacion de asignaciones activas,
          mapa operativo y cierre de visita con selfie obligatoria.
        </p>
      </header>

      <RutaSemanalPanel data={data} actorPuesto={actor.puesto} initialTab={initialTab} />
    </div>
  )
}
