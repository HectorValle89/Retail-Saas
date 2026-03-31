import { Sidebar } from './sidebar'
import { requerirActorActivo } from '@/lib/auth/session'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const actor = await requerirActorActivo()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar actor={actor} />
      <main className="min-h-screen lg:ml-72">{children}</main>
    </div>
  )
}
