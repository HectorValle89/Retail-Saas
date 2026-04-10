import { createClient } from '@/lib/supabase/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { GastosPanel } from '@/features/gastos/components/GastosPanel'
import { obtenerPanelGastos } from '@/features/gastos/services/gastoService'

export const metadata = {
  title: 'Gastos | Field Force Platform',
}

export default async function GastosPage() {
  await requerirPuestosActivos(['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'])
  const supabase = await createClient()
  const data = await obtenerPanelGastos(supabase)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control operativo
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Gastos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Registro y seguimiento de viaticos, transporte y gastos de operacion asociados a campo y formaciones.
        </p>
      </header>

      <GastosPanel data={data} />
    </div>
  )
}
