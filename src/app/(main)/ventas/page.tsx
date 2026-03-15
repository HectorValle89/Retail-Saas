import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { VentasPanel } from '@/features/ventas/components/VentasPanel'
import { obtenerPanelVentas } from '@/features/ventas/services/ventaService'

export const metadata = {
  title: 'Ventas | Field Force Platform',
}

export default async function VentasPage() {
  await requerirActorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelVentas(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Ejecucion diaria
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Ventas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Registro comercial diario ligado a jornada activa, confirmación de cierre y base para cuotas y bonos.
        </p>
      </header>

      <VentasPanel data={data} />
    </div>
  )
}
