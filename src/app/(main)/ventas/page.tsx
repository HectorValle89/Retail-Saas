import { requerirActorActivo } from '@/lib/auth/session';
import { VentasPanel } from '@/features/ventas/components/VentasPanel';
import { obtenerPanelVentas } from '@/features/ventas/services/ventaService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Ventas | Field Force Platform',
};

interface VentasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const actor = await requerirActorActivo();
  const params = (await searchParams) ?? {};
  const page = parsePositiveInt(pickString(params.page), 1);
  const pageSize = parsePositiveInt(pickString(params.pageSize), 50);
  const currentMexicoMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const month = pickString(params.month) || currentMexicoMonth;
  const refresh = pickString(params.refresh);

  const data = await obtenerPanelVentas(actor, {
    page,
    pageSize,
    month,
    bypassCache: refresh === 'true',
  });

  const esVisualizadorReporte = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'].includes(actor.puesto);

  return (
    <div className="page-shell !pt-3 sm:!pt-6 !px-2.5 sm:!px-6 max-w-7xl">
      {!esVisualizadorReporte && (
        <header className="page-hero mb-6">
          <p className="page-hero-eyebrow">Ejecucion diaria</p>
          <h1 className="page-hero-title">Ventas</h1>
          <p className="page-hero-copy max-w-3xl">
            Registro comercial diario ligado a jornada activa, confirmación de cierre y base para
            cuotas y bonos.
          </p>
        </header>
      )}

      <VentasPanel actor={actor} data={data} showBackButton={esVisualizadorReporte} />
    </div>
  );
}
