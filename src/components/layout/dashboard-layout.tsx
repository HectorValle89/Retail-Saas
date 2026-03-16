import { Sidebar } from './sidebar'
import { obtenerAccountScopeData } from '@/features/clientes/services/accountScopeService'
import { requerirActorActivo } from '@/lib/auth/session'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const actor = await requerirActorActivo()
  const accountScope = await obtenerAccountScopeData(actor)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar actor={actor} accountScope={accountScope} />
      <main className="min-h-screen lg:ml-72">{children}</main>
    </div>
  )
}
