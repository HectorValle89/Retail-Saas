import { createClient } from '@/lib/supabase/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { PdvsPanel } from '@/features/pdvs/components/PdvsPanel'
import { obtenerPanelPdvs } from '@/features/pdvs/services/pdvService'

export const metadata = {
  title: 'PDVs | Field Force Platform',
}

const PDV_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const

export default async function PdvsPage() {
  const actor = await requerirPuestosActivos([...PDV_ROLES])
  const supabase = await createClient()
  const data = await obtenerPanelPdvs(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Estructura maestra
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">PDVs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Catalogo maestro de puntos de venta, geocercas, horarios, supervisor heredado e historial operativo.
        </p>
      </header>

      <PdvsPanel data={data} canEdit={actor.puesto === 'ADMINISTRADOR'} actorPuesto={actor.puesto} />
    </div>
  )
}
