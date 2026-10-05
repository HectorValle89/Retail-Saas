import { ClienteDashboardPanel } from '@/features/dashboard/components/ClienteDashboardPanel';
import { obtenerDashboardCliente } from '@/features/dashboard/services/clienteDashboardService';
import type { ActorActual } from '@/lib/auth/session';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Reporte de Avance Ejecutivo | Field Force Platform',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface PublicReportPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const ACCOUNT_MAPPING: Record<string, string> = {
  'isdin-mexico': '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba',
};

function pickString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PublicReportPage({ params, searchParams }: PublicReportPageProps) {
  const { slug } = await params;
  const resolvedSlug = slug.trim().toLowerCase();
  const accountId = ACCOUNT_MAPPING[resolvedSlug];

  if (!accountId) {
    notFound();
  }

  const sParams = (await searchParams) ?? {};
  const periodo = pickString(sParams.periodo);

  const mockActor: ActorActual = {
    authUserId: 'public-report-system',
    usuarioId: 'public-report-system',
    empleadoId: 'public-report-system',
    cuentaClienteId: accountId,
    puesto: 'CLIENTE',
    nombreCompleto: 'ISDIN México - Dashboard Ejecutivo',
    username: 'isdin_public_report',
    correoElectronico: 'public@isdin.com',
    correoVerificado: true,
    estadoCuenta: 'ACTIVA',
  };

  const data = await obtenerDashboardCliente(mockActor, {
    periodo: periodo ?? '',
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10">
        <ClienteDashboardPanel initialData={data} />
      </div>
    </main>
  );
}
