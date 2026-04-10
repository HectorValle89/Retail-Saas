export const runtime = 'edge';
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { FormacionesPanel } from '@/features/formaciones/components/FormacionesPanel'
import { obtenerPanelFormaciones } from '@/features/formaciones/services/formacionService'

export const metadata = {
  title: 'Formaciones | Field Force Platform',
}

const FORMACION_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'] as const

export default async function FormacionesPage() {
  const actor = await requerirPuestosActivos([...FORMACION_ROLES])
  const accountScope = await readRequestAccountScope()
  const data = await obtenerPanelFormaciones(actor, {
    scopeAccountId: accountScope.accountId,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
          Talento y formaciÃ³n
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Formaciones</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Planea formaciones operativas con alcance por PDV, confirmaciÃ³n previa del supervisor, coordenadas completas y recordatorios automÃ¡ticos a DCs y supervisiÃ³n.
        </p>
      </header>

      <FormacionesPanel data={data} />
    </div>
  )
}

