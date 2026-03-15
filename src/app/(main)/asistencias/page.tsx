import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsistenciasPanel } from '@/features/asistencias/components/AsistenciasPanel'
import { obtenerPanelAsistencias } from '@/features/asistencias/services/asistenciaService'

export const metadata = {
  title: 'Asistencias | Field Force Platform',
}

export default async function AsistenciasPage() {
  await requerirActorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelAsistencias(supabase)

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
