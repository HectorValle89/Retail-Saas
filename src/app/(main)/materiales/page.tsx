import { requerirActorActivo } from '@/lib/auth/session';
import { MaterialesPanel } from '@/features/materiales/components/MaterialesPanel';
import {
  obtenerPanelMateriales,
  obtenerPanelMaterialesOverview,
} from '@/features/materiales/services/materialService';

export const metadata = {
  title: 'Inventarios y logistica | Beteele One',
};

export default async function MaterialesPage() {
  const actor = await requerirActorActivo();
  const data = ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'].includes(actor.puesto)
    ? await obtenerPanelMaterialesOverview(actor)
    : await obtenerPanelMateriales(actor);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Inventarios y logistica
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Control de inventarios</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Gestiona stock por SKU, lote y caducidad. Planifica dispersiones mensuales a PDV, confirma
          recepciones y da trazabilidad completa a cada movimiento de material.
        </p>
      </header>

      <MaterialesPanel actor={actor} data={data} />
    </div>
  );
}
