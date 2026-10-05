import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { PdvsPanel } from '@/features/pdvs/components/PdvsPanel';
import {
  normalizePdvsPanelFilters,
  obtenerPanelPdvsParaActor,
} from '@/features/pdvs/services/pdvService';

export const metadata = {
  title: 'PDVs | Field Force Platform',
};

const PDV_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const;

type PdvsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function PdvsPage({ searchParams }: PdvsPageProps) {
  const actor = await requerirPuestosActivos([...PDV_ROLES]);
  const params = (await searchParams) ?? {};
  const filters = normalizePdvsPanelFilters({
    month: readSearchParam(params.month),
    search: readSearchParam(params.search),
    cadenaId: readSearchParam(params.cadena),
    ciudadId: readSearchParam(params.ciudad),
    estado: readSearchParam(params.estado),
    zona: readSearchParam(params.zona),
    supervisorId: readSearchParam(params.supervisor),
    estatus: readSearchParam(params.estatus),
    publicacionEstado: readSearchParam(params.publicacion),
  });
  const data = await obtenerPanelPdvsParaActor(actor, filters, createServiceClient());

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Estructura maestra
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">PDVs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Catalogo maestro de puntos de venta, geocercas, horarios, supervisor heredado e historial
          operativo.
        </p>
      </header>

      <PdvsPanel
        actor={actor}
        data={data}
        canEdit={actor.puesto === 'ADMINISTRADOR' || actor.puesto === 'COORDINADOR'}
        actorPuesto={actor.puesto}
      />
    </div>
  );
}
