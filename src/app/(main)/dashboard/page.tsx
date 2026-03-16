import { requerirActorActivo } from '@/lib/auth/session'
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel'
import { obtenerPanelDashboard } from '@/features/dashboard/services/dashboardService'

export const metadata = {
  title: 'Dashboard | Field Force Platform',
}

export default async function DashboardPage() {
  const actor = await requerirActorActivo()
  const data = await obtenerPanelDashboard(actor)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <DashboardPanel actor={actor} data={data} />
    </div>
  )
}
