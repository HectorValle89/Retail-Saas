import { createClient } from '@/lib/supabase/server'
import { requerirOperadorNomina } from '@/lib/auth/session'
import { NominaPanel } from '@/features/nomina/components/NominaPanel'
import { obtenerPanelNomina } from '@/features/nomina/services/nominaService'

export const metadata = {
  title: 'Nomina | Beteele One',
}

interface NominaPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function NominaPage({ searchParams }: NominaPageProps) {
  await requerirOperadorNomina()
  const supabase = await createClient()
  const data = await obtenerPanelNomina(supabase)
  const params = (await searchParams) ?? {}
  const initialInbox = pickString(params.inbox) ?? 'ALL'

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Nomina
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Nomina</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Bandeja IMSS y cierre financiero por periodo.
        </p>
      </header>

      <NominaPanel data={data} initialInbox={initialInbox} />
    </div>
  )
}
