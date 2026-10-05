import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requerirActorActivo } from '@/lib/auth/session';
import { AsignacionesHub } from '@/features/asignaciones/components/AsignacionesHub';
import { PlaneacionMensualPanel } from '@/features/asignaciones/components/PlaneacionMensualPanel';
import { getMaterializedDateRangeCalendar } from '@/features/asignaciones/services/asignacionMaterializationService';
import {
  obtenerPlaneacionMensualResumen,
  type PlaneacionMensualReadRpcClient,
} from '@/features/asignaciones/services/planeacionMensualReadService';
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Asignaciones | Field Force Platform',
};

interface AsignacionesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDate(value: string | undefined, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim()) ? String(value).trim() : fallback;
}

function formatCurrentMonthStart() {
  return (
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .slice(0, 8) + '01'
  );
}

function formatCurrentMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function normalizeMonth(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return formatCurrentMonth();
  const month = Number(normalized.slice(5, 7));
  return month >= 1 && month <= 12 ? normalized : formatCurrentMonth();
}

function formatCurrentMonthEnd() {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const end = new Date(`${currentMonth}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

export default async function AsignacionesPage({ searchParams }: AsignacionesPageProps) {
  const actor = await requerirActorActivo();
  const params = (await searchParams) ?? {};

  if (actor.puesto === 'ADMINISTRADOR' || actor.puesto === 'COORDINADOR') {
    const month = normalizeMonth(pickString(params.mes));
    const cuentaClienteId = actor.cuentaClienteId ?? getSingleTenantAccountId();
    const service = createServiceClient();
    const summary = await obtenerPlaneacionMensualResumen(
      service as unknown as PlaneacionMensualReadRpcClient,
      cuentaClienteId,
      `${month}-01`
    );

    return (
      <div className="mx-auto max-w-[1920px] px-3 pb-10 pt-24 sm:px-5 lg:px-7 lg:pt-8">
        <PlaneacionMensualPanel summary={summary} cuentaClienteId={cuentaClienteId} puedeEditar />
      </div>
    );
  }

  const supabase = await createClient();
  const fechaInicio = normalizeDate(pickString(params.fecha_inicio), formatCurrentMonthStart());
  const fechaFin = normalizeDate(pickString(params.fecha_fin), formatCurrentMonthEnd());

  const calendar = await getMaterializedDateRangeCalendar(
    {
      fechaInicio,
      fechaFin,
    },
    supabase
  );

  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <AsignacionesHub calendar={calendar} fechaInicio={fechaInicio} fechaFin={fechaFin} />
    </div>
  );
}
