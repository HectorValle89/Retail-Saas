import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ClientesPanel } from '@/features/clientes/components/ClientesPanel'
import { obtenerPanelClientes } from '@/features/clientes/services/clienteService'

export const metadata = {
  title: 'Clientes | Field Force Platform',
}

export default async function ClientesPage() {
  const actor = await requerirAdministradorActivo()
  const supabase = await createClient()
  const data = await obtenerPanelClientes(supabase, actor.cuentaClienteId)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Estructura maestra
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Clientes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Base multi-tenant de cuentas cliente, configuracion operativa e historial
          de asignacion de PDVs a cartera.
        </p>
      </header>

      <ClientesPanel data={data} />
    </div>
  )
}
