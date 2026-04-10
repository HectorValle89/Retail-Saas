import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { CampanaEditorCard } from '@/features/campanas/components/CampanasPanel'
import { obtenerPanelCampanas } from '@/features/campanas/services/campanaService'

export const metadata = {
  title: 'Nueva campana | Field Force Platform',
}

export default async function NuevaCampanaPage() {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'VENTAS'])
  const accountScope = await readRequestAccountScope()
  const data = await obtenerPanelCampanas(actor, {
    scopeAccountId: accountScope.accountId,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-8 rounded-[32px] border border-[var(--module-border)] bg-[linear-gradient(135deg,rgba(249,115,22,0.14),rgba(255,237,213,0.86),rgba(255,255,255,0.98))] px-6 py-7 shadow-[0_28px_64px_rgba(249,115,22,0.14)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-700">
              Crear campaña
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Nuevo borrador
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Esta superficie solo existe para crear una campaña nueva. La publicación y la edición de campañas
              existentes se controlan desde operación y desde la ficha individual de cada campaña.
            </p>
          </div>
          <Link
            href="/campanas"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--module-text)] transition hover:bg-[var(--module-soft-bg)]"
          >
            Volver a operación
          </Link>
        </div>
      </header>
      {data.infraestructuraLista ? <CampanaEditorCard data={data} campaign={null} /> : null}
      {!data.infraestructuraLista && data.mensajeInfraestructura ? (
        <Card className="mt-6 border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      ) : null}
    </div>
  )
}
