import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ReportesPanel } from '@/features/reportes/components/ReportesPanel'
import { obtenerPanelReportes } from '@/features/reportes/services/reporteService'

export const metadata = {
  title: 'Reportes | Field Force Platform',
}

export default async function ReportesPage() {
  await requerirAdministradorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelReportes(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control y gobierno
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Reportes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Salida analitica consolidada para asistencia, ventas, cuotas, nomina y bitacora administrativa.
        </p>
      </header>

      <ReportesPanel data={data} />
    </div>
  )
}