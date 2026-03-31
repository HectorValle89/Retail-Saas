import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { CampanasPanel } from '@/features/campanas/components/CampanasPanel'
import { obtenerPanelCampanas } from '@/features/campanas/services/campanaService'

export const metadata = {
  title: 'Campanas | Field Force Platform',
}

const CAMPANA_ROLES = [
  'ADMINISTRADOR',
  'VENTAS',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'DERMOCONSEJERO',
  'CLIENTE',
] as const

export default async function CampanasPage() {
  const actor = await requerirPuestosActivos([...CAMPANA_ROLES])
  const accountScope = await readRequestAccountScope()
  const data = await obtenerPanelCampanas(actor, {
    scopeAccountId: accountScope.accountId,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Operacion comercial
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Campanas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Campanas temporales por PDV con productos foco, tareas comerciales, evidencia requerida y reporte
          de cumplimiento por PDV y dermoconsejera.
        </p>
      </header>

      <CampanasPanel actor={actor} data={data} />
    </div>
  )
}