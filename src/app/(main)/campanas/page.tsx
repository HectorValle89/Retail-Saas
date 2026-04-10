export const runtime = 'edge';
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { CampanasOverviewPanel } from '@/features/campanas/components/CampanasOverviewPanel'
import { obtenerInicioCampanas } from '@/features/campanas/services/campanaService'

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
  const data = await obtenerInicioCampanas(actor, {
    scopeAccountId: accountScope.accountId,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-8 rounded-[32px] border border-[var(--module-border)] bg-[linear-gradient(135deg,rgba(249,115,22,0.14),rgba(255,237,213,0.85),rgba(255,255,255,0.98))] px-6 py-7 shadow-[0_28px_64px_rgba(249,115,22,0.14)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-700">
          Operacion comercial
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">Campanas</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          El home del mÃ³dulo ahora prioriza operaciÃ³n y KPIs. La creaciÃ³n y la ediciÃ³n viven en superficies
          dedicadas para que el aterrizaje sea mÃ¡s ligero y no cargue el editor antes de tiempo.
        </p>
      </header>

      <CampanasOverviewPanel data={data} />
    </div>
  )
}

