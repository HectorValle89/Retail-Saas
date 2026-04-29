import { ModuleThemeLayer } from '@/components/layout/ModuleThemeLayer'
import { Sidebar } from '@/components/layout/sidebar'
import { requerirActorActivo } from '@/lib/auth/session'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await requerirActorActivo()
  const usesFieldShell =
    actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR'

  return (
    <div className="min-h-screen bg-surface-subtle">
      {!usesFieldShell && <Sidebar actor={actor} />}
      <main className={usesFieldShell ? 'min-h-screen' : 'min-h-screen lg:ml-72'}>
        <ModuleThemeLayer>{children}</ModuleThemeLayer>
      </main>
    </div>
  )
}
