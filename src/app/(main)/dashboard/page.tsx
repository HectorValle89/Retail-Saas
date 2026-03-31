import { Suspense } from 'react'
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  DashboardInsightsPanel,
  DashboardInsightsSkeleton,
  DashboardPanel,
} from '@/features/dashboard/components/DashboardPanel'
import { DashboardRealtimeBridge } from '@/features/dashboard/components/DashboardRealtimeBridge'
import {
  obtenerInsightsDashboard,
  obtenerPanelDashboard,
} from '@/features/dashboard/services/dashboardService'
import { obtenerPanelRutaSemanal } from '@/features/rutas/services/rutaSemanalService'

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
  actor: Awaited<ReturnType<typeof requerirActorActivo>>
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
  })

  return <DashboardInsightsPanel data={data} />
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const actor = await requerirActorActivo()
  const usesRoleDashboard =
    actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR'
  const params = (await searchParams) ?? {}
  const periodo = pickString(params.periodo)
  const estado = pickString(params.estado)
  const zona = pickString(params.zona)
  const supervisorId = pickString(params.supervisorId)
  const data = await obtenerPanelDashboard(actor, {
    period: periodo,
    estado,
    zona,
    supervisorId,
  })
  const supervisorRouteData =
    actor.puesto === 'SUPERVISOR'
      ? await obtenerPanelRutaSemanal(await createClient(), actor)
      : null

  return (
    <div
      className={
        usesRoleDashboard
          ? 'mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10'
          : 'mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10'
      }
    >
      <DashboardRealtimeBridge
        cuentaClienteId={actor.cuentaClienteId}
        allowGlobalScope={actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId}
      />
      <DashboardPanel actor={actor} data={data} supervisorRouteData={supervisorRouteData} />
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
