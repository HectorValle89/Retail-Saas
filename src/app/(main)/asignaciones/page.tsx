import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesPanel } from '@/features/asignaciones/components/AsignacionesPanel'
import { obtenerPanelAsignaciones } from '@/features/asignaciones/services/asignacionService'

export const metadata = {
  title: 'Asignaciones | Field Force Platform',
}

export default async function AsignacionesPage() {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelAsignaciones(supabase, actor)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Planeacion operativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asignaciones</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Planeacion mensual, validaciones de publicacion, coberturas y control de conflictos operativos.
        </p>
      </header>

      <AsignacionesPanel data={data} puedeGestionar={actor.puesto === 'ADMINISTRADOR'} />
    </div>
  )
}
