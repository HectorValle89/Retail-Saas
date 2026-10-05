import { requerirPuestosActivos } from '@/lib/auth/session';
import { RutaSemanalPanel } from '@/features/rutas/components/RutaSemanalPanel';
import { obtenerPanelRutaSemanalParaActor } from '@/features/rutas/services/rutaSemanalService';

export const metadata = {
  title: 'Operación de supervisores | Field Force Platform',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const OPERACION_ROLES = ['COORDINADOR', 'ADMINISTRADOR'] as const;
type SupervisorRouteTab = 'agenda' | 'planning' | 'history';
type WarRoomTab = 'quotas' | 'routes' | 'coverage' | 'reach' | 'ranking' | 'evidencias';

interface OperacionSupervisoresPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OperacionSupervisoresPage({
  searchParams,
}: OperacionSupervisoresPageProps) {
  const actor = await requerirPuestosActivos([...OPERACION_ROLES]);
  const params = (await searchParams) ?? {};
  const rawTab = pickString(params.tab);

  const initialTab: SupervisorRouteTab | WarRoomTab =
    rawTab === 'routes' ||
    rawTab === 'coverage' ||
    rawTab === 'quotas' ||
    rawTab === 'reach' ||
    rawTab === 'ranking' ||
    rawTab === 'evidencias'
      ? rawTab
      : 'routes';

  const data = await obtenerPanelRutaSemanalParaActor(actor, {
    surface: initialTab === 'quotas' ? 'quotas' : 'full',
  });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8 lg:pt-6">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-800">
            Operación de supervisión
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Operación de supervisores
          </h1>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">
          Dashboard consolidado de rutas, cuotas y cobertura
        </p>
      </header>

      <RutaSemanalPanel
        actor={actor}
        data={data}
        actorPuesto={actor.puesto}
        initialTab={initialTab}
      />
    </div>
  );
}
