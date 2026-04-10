export const runtime = 'edge';
import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { MaterialesPanel } from '@/features/materiales/components/MaterialesPanel'
import { obtenerPanelMateriales } from '@/features/materiales/services/materialService'

export const metadata = {
  title: 'Logistica promocional | Beteele One',
}

export default async function MaterialesPage() {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelMateriales(supabase, actor)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Logistica promocional
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Promocionales y materiales</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Controla la dispersion mensual por PDV, confirma recepciones en tienda y da trazabilidad a cada
          entrega promocional hasta su saldo final.
        </p>
      </header>

      <MaterialesPanel data={data} />
    </div>
  )
}

