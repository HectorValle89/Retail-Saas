export const runtime = 'edge';
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ReglasPanel } from '@/features/reglas/components/ReglasPanel'
import { obtenerPanelReglas } from '@/features/reglas/services/reglaService'

export const metadata = {
  title: 'Reglas | Field Force Platform',
}

export default async function ReglasPage() {
  await requerirAdministradorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelReglas(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control operacional
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Reglas de negocio</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Herencia de supervisor, prioridad de horarios y flujos de aprobacion
          centralizados para la operacion retail.
        </p>
      </header>

      <ReglasPanel data={data} />
    </div>
  )
}

