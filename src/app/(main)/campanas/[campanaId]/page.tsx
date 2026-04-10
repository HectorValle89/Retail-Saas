import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { CampanaPublishAction } from '@/features/campanas/components/CampanaPublishAction'
import { CampanaEditorCard, CampaignDetailCard } from '@/features/campanas/components/CampanasPanel'
import { obtenerPanelCampanas } from '@/features/campanas/services/campanaService'

export const metadata = {
  title: 'Detalle de campana | Field Force Platform',
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

export default async function CampanaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ campanaId: string }>
  searchParams: Promise<{ editar?: string }>
}) {
  const actor = await requerirPuestosActivos([...CAMPANA_ROLES])
  const accountScope = await readRequestAccountScope()
  const [{ campanaId }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const data = await obtenerPanelCampanas(actor, {
    scopeAccountId: accountScope.accountId,
  })

  if (!data.infraestructuraLista) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
        <header className="mb-8 rounded-[32px] border border-[var(--module-border)] bg-[linear-gradient(135deg,rgba(249,115,22,0.14),rgba(255,237,213,0.86),rgba(255,255,255,0.98))] px-6 py-7 shadow-[0_28px_64px_rgba(249,115,22,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-700">
                Ficha de campaña
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                Campaña no disponible
              </h1>
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

        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      </div>
    )
  }

  const campaign = data.campanas.find((item) => item.id === campanaId) ?? null

  if (!campaign) {
    notFound()
  }

  const canEditCampaign =
    data.puedeGestionar && campaign.estado !== 'CERRADA' && campaign.estado !== 'CANCELADA'
  const isEditing = canEditCampaign && resolvedSearchParams.editar === '1'

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-8 rounded-[32px] border border-[var(--module-border)] bg-[linear-gradient(135deg,rgba(249,115,22,0.14),rgba(255,237,213,0.86),rgba(255,255,255,0.98))] px-6 py-7 shadow-[0_28px_64px_rgba(249,115,22,0.14)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-700">
              Ficha de campaña
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              {campaign.nombre}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              La consulta se abre en una superficie dedicada. Si la campaña es editable, la edición vive aquí mismo y
              ya no dentro de la pantalla de creación.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/campanas"
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--module-text)] transition hover:bg-[var(--module-soft-bg)]"
            >
              Volver a operación
            </Link>
            {canEditCampaign ? (
              <Link
                href={isEditing ? `/campanas/${campaign.id}` : `/campanas/${campaign.id}?editar=1`}
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[var(--module-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--module-hover)]"
              >
                {isEditing ? 'Cerrar edición' : 'Editar campaña'}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {data.puedeGestionar && campaign.estado === 'BORRADOR' ? (
        <div className="mb-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-slate-950">Publicación desde operación</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                El borrador ya está aislado en su ficha. Si quedó listo, publícalo desde aquí sin regresar al flujo de
                creación.
              </p>
            </div>
            <CampanaPublishAction campaignId={campaign.id} align="right" />
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        <CampaignDetailCard
          campaign={campaign}
          canManage={data.puedeGestionar}
          canExecuteFieldTasks={actor.puesto === 'DERMOCONSEJERO'}
        />
        {isEditing ? <CampanaEditorCard data={data} campaign={campaign} /> : null}
      </div>
    </div>
  )
}
