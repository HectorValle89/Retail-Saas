import { ModuleThemeLayer } from '@/components/layout/ModuleThemeLayer';
import { Sidebar } from '@/components/layout/sidebar';
import { requerirActorActivo } from '@/lib/auth/session';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requerirActorActivo();
  const usesFieldShell = actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR';

  return (
    <div className="min-h-screen bg-surface-subtle">
      {!usesFieldShell && <Sidebar actor={actor} />}
      <main className={`min-h-screen min-w-0 w-full ${usesFieldShell ? '' : 'lg:pl-[4.5rem]'}`}>
        <ModuleThemeLayer>{children}</ModuleThemeLayer>
      </main>
    </div>
  );
}
