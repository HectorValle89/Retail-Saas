import { Sidebar } from '@/components/layout/sidebar'
import { obtenerAccountScopeData } from '@/features/clientes/services/accountScopeService'
import { requerirActorActivo } from '@/lib/auth/session'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await requerirActorActivo()
  const accountScope = await obtenerAccountScopeData(actor)

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar actor={actor} accountScope={accountScope} />
      <main className="min-h-screen lg:ml-72">{children}</main>
    </div>
  )
}
