'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { MetricCard } from '@/components/ui/metric-card'
import type { CampanaOverviewItem, CampanasOverviewData } from '../services/campanaService'
import { CampanaPublishAction } from './CampanaPublishAction'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`
}

function getCampaignDisplayStatus(campaign: CampanaOverviewItem) {
  if (campaign.estado === 'CERRADA') {
    return 'TERMINADA'
  }

  if (campaign.ventanaActiva) {
    return 'ACTIVA'
  }

  if (campaign.estado === 'ACTIVA' && campaign.fechaInicio > new Date().toISOString().slice(0, 10)) {
    return 'PROGRAMADA'
  }

  return campaign.estado
}

function getStatusTone(campaign: CampanaOverviewItem) {
  const displayStatus = getCampaignDisplayStatus(campaign)

  switch (displayStatus) {
    case 'ACTIVA':
      return 'bg-emerald-100 text-emerald-700'
    case 'PROGRAMADA':
      return 'bg-sky-100 text-sky-700'
    case 'BORRADOR':
      return 'bg-amber-100 text-amber-700'
    case 'TERMINADA':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="rounded-[28px] border border-dashed border-[var(--module-border)] bg-white/85 p-6">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </Card>
  )
}

function CampaignOverviewCard({
  campaign,
  canManage,
}: {
  campaign: CampanaOverviewItem
  canManage: boolean
}) {
  const detailHref = `/campanas/${campaign.id}`

  return (
    <Card className="rounded-[30px] border border-[var(--module-border)] bg-white/95 p-5 shadow-[0_20px_44px_rgba(249,115,22,0.10)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{campaign.nombre}</h3>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusTone(campaign)}`}>
              {getCampaignDisplayStatus(campaign)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {campaign.cuentaCliente ?? 'Sin cuenta'} · {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
          </p>
        </div>
        <Link
          href={detailHref}
          target="_blank"
          rel="noreferrer"
          prefetch={false}
          className="inline-flex min-h-10 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-2 text-sm font-semibold text-[var(--module-text)] transition hover:bg-white"
        >
          Abrir campaña
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniMetric label="PDVs" value={String(campaign.totalPdvs)} />
        <MiniMetric label="Cumplidos" value={String(campaign.pdvsCumplidos)} />
        <MiniMetric label="Avance" value={formatPercent(campaign.avancePromedio)} />
        <MiniMetric label="Pendientes" value={String(campaign.tareasPendientes)} />
      </div>

      {canManage && campaign.estado === 'BORRADOR' ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Borrador listo para revisión</p>
            <p className="mt-1 text-sm text-slate-600">
              La publicación se gestiona desde operación. La edición vive en la ficha individual.
            </p>
          </div>
          <CampanaPublishAction campaignId={campaign.id} align="right" />
        </div>
      ) : null}
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <MetricCard
      label={label}
      value={value}
      className="rounded-[22px] border-orange-100 bg-orange-50/65 px-4 py-3 shadow-none"
      labelClassName="text-[10px] text-orange-700/80"
      valueClassName="text-base sm:text-lg"
    />
  )
}

function CampaignSection({
  title,
  description,
  campaigns,
  canManage,
  emptyTitle,
  emptyBody,
}: {
  title: string
  description: string
  campaigns: CampanaOverviewItem[]
  canManage: boolean
  emptyTitle: string
  emptyBody: string
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {campaigns.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignOverviewCard key={campaign.id} campaign={campaign} canManage={canManage} />
          ))}
        </div>
      )}
    </section>
  )
}

export function CampanasOverviewPanel({ data }: { data: CampanasOverviewData }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const draftCampaigns = data.campanas.filter((campaign) => campaign.estado === 'BORRADOR')
  const scheduledCampaigns = data.campanas.filter(
    (campaign) => campaign.estado === 'ACTIVA' && !campaign.ventanaActiva && campaign.fechaInicio > todayIso
  )
  const activeCampaigns = data.campanas.filter(
    (campaign) => campaign.estado === 'ACTIVA' && campaign.ventanaActiva
  )
  const finishedCampaigns = data.campanas.filter((campaign) => campaign.estado === 'CERRADA')

  return (
    <div className="space-y-8">
      {!data.infraestructuraLista && data.mensajeInfraestructura ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      ) : null}

      {data.puedeGestionar ? (
        <Card className="overflow-hidden rounded-[32px] border border-[var(--module-border)] bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(255,237,213,0.92),rgba(255,255,255,0.98))] p-6 shadow-[0_26px_60px_rgba(249,115,22,0.16)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-700">Crear campaña</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Nueva campaña en borrador, sin precargar el editor
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                El formulario de alta vive en una ruta dedicada. Solo se carga cuando realmente lo abres, junto con
                los PDVs y catálogos necesarios para configurar el borrador.
              </p>
            </div>
            <Link
              href="/campanas/nueva"
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(249,115,22,0.25)] transition hover:bg-[var(--module-hover)]"
            >
              Abrir formulario
            </Link>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Borradores" value={String(draftCampaigns.length)} />
        <MetricCard label="Programadas" value={String(scheduledCampaigns.length)} />
        <MetricCard label="Activas" value={String(activeCampaigns.length)} />
        <MetricCard label="Terminadas" value={String(finishedCampaigns.length)} />
        <MetricCard label="PDVs objetivo" value={String(data.resumen.pdvsObjetivo)} />
        <MetricCard label="Avance" value={formatPercent(data.resumen.avancePromedio)} />
      </section>

      <CampaignSection
        title="Borradores y publicación"
        description="Aquí viven los borradores y desde aquí mismo se publican cuando ya están listos."
        campaigns={draftCampaigns}
        canManage={data.puedeGestionar}
        emptyTitle="Sin borradores operativos"
        emptyBody="Todavía no hay campañas en borrador para este alcance."
      />

      <CampaignSection
        title="Campañas activas"
        description="Campañas ya publicadas y vigentes para seguimiento operativo."
        campaigns={activeCampaigns}
        canManage={data.puedeGestionar}
        emptyTitle="Sin campañas activas"
        emptyBody="No hay campañas activas visibles en este momento."
      />

      <CampaignSection
        title="Programadas"
        description="Campañas publicadas que todavía no entran en ventana operativa."
        campaigns={scheduledCampaigns}
        canManage={data.puedeGestionar}
        emptyTitle="Sin campañas programadas"
        emptyBody="No hay campañas futuras publicadas por ahora."
      />

      <CampaignSection
        title="Histórico"
        description="Campañas terminadas para consulta y trazabilidad."
        campaigns={finishedCampaigns}
        canManage={data.puedeGestionar}
        emptyTitle="Sin campañas terminadas"
        emptyBody="Aún no hay histórico terminado visible para este módulo."
      />
    </div>
  )
}
