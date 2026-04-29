import { Suspense } from 'react'
import { requerirActorActivo, type ActorActual } from '@/lib/auth/session'
import {
  DashboardInsightsPanel,
  DashboardInsightsSkeleton,
  DashboardPanel,
} from '@/features/dashboard/components/DashboardPanel'
import {
  obtenerInsightsDashboard,
  obtenerPanelDashboard,
  type DashboardPanelOptions,
} from '@/features/dashboard/services/dashboardService'

import { Card } from '@/components/ui/card'

export const metadata = {
  title: 'Dashboard | Beteele One',
}

interface DashboardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

async function DashboardInsightsSection({
  actor,
  periodo,
  estado,
  zona,
  supervisorId,
}: {
  actor: ActorActual
  periodo?: string
  estado?: string
  zona?: string
  supervisorId?: string
}) {
  const data = await obtenerInsightsDashboard(actor, {
    period: periodo,
    estado,
    zona,
    supervisorId,
    only: ['live'], // Solicitamos solo lo necesario para insights
  })

  return <DashboardInsightsPanel actor={actor} data={data} />
}


async function DashboardCoreSection({
  actor,
  options,
}: {
  actor: ActorActual
  options: DashboardPanelOptions
}) {
  // Solo cargamos KPIs y datos básicos para el render inicial rápido
  const data = await obtenerPanelDashboard(actor, { ...options, only: ['stats', 'external'] })
  return <DashboardPanel actor={actor} data={data} />
}

async function DashboardOperationsSection({
  actor,
  options,
}: {
  actor: ActorActual
  options: DashboardPanelOptions
}) {
  // Cargamos datos operativos (mapa, alertas, board diario)
  const data = await obtenerPanelDashboard(actor, { ...options, only: ['live', 'operations'] })
  return <DashboardPanel actor={actor} data={data} isWidgetMode />
}

async function DashboardReachSection({
  actor,
  options,
}: {
  actor: ActorActual
  options: DashboardPanelOptions
}) {
  // Cargamos el alcance de visitas (el más pesado)
  const data = await obtenerPanelDashboard(actor, { ...options, only: ['reach'] })
  return <DashboardPanel actor={actor} data={data} isWidgetMode />
}


function DashboardPanelSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="h-48 animate-pulse bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-24 animate-pulse bg-slate-50" />
        ))}
      </div>
      <Card className="h-96 animate-pulse bg-slate-50" />
    </div>
  )
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const actor = await requerirActorActivo()
  const usesRoleDashboard =
    actor.puesto === 'DERMOCONSEJERO' ||
    actor.puesto === 'SUPERVISOR' ||
    actor.puesto === 'RECLUTAMIENTO' ||
    actor.puesto === 'NOMINA'
  const params = (await searchParams) ?? {}
  const periodo = pickString(params.periodo)
  const estado = pickString(params.estado)
  const zona = pickString(params.zona)
  const supervisorId = pickString(params.supervisorId)
  const reachSupervisorId = pickString(params.reachSupervisorId)
  const reachWeekStart = pickString(params.reachWeekStart)
  const reachChain = pickString(params.reachChain)
  const reachStoreType = pickString(params.reachStoreType)
  const options = {
    period: periodo,
    estado,
    zona,
    supervisorId,
    reachSupervisorId,
    reachWeekStart,
    reachChain,
    reachStoreType,
    includeDermoSecondaryData: actor.puesto !== 'DERMOCONSEJERO',
    includeSupervisorSecondaryData: false,
  }

  return (
    <div
      className={
        usesRoleDashboard
          ? 'mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10'
          : 'mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10'
      }
    >
      <Suspense fallback={<DashboardPanelSkeleton />}>
        <DashboardCoreSection actor={actor} options={options} />
      </Suspense>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-50" />}>
        <DashboardOperationsSection actor={actor} options={options} />
      </Suspense>

      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-slate-50" />}>
        <DashboardReachSection actor={actor} options={options} />
      </Suspense>

      {!usesRoleDashboard && (
        <div className="mt-6">
          <Suspense fallback={<DashboardInsightsSkeleton />}>
            <DashboardInsightsSection
              actor={actor}
              periodo={periodo}
              estado={estado}
              zona={zona}
              supervisorId={supervisorId}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
