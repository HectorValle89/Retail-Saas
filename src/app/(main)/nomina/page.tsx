import { createClient } from '@/lib/supabase/server'
import { requerirOperadorNomina } from '@/lib/auth/session'
import { NominaPanel } from '@/features/nomina/components/NominaPanel'
import { obtenerPanelNomina } from '@/features/nomina/services/nominaService'

export const metadata = {
  title: 'Nomina | Field Force Platform',
}

export default async function NominaPage() {
  await requerirOperadorNomina()
  const supabase = await createClient()
  const data = await obtenerPanelNomina(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control financiero
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Nomina</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Pre-nomina operativa, cuotas comerciales por periodo y ledger de ajustes para cierre interno.
        </p>
      </header>

      <NominaPanel data={data} />
    </div>
  )
}
