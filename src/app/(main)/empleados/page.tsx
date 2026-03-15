import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { EmpleadosPanel } from '@/features/empleados/components/EmpleadosPanel'
import { obtenerPanelEmpleados } from '@/features/empleados/services/empleadoService'

export const metadata = {
  title: 'Empleados | Field Force Platform',
}

export default async function EmpleadosPage() {
  await requerirActorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelEmpleados(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Estructura maestra
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Empleados</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Fuente laboral de identidad para promotores, supervisores y areas staff.
        </p>
      </header>

      <EmpleadosPanel data={data} />
    </div>
  )
}
