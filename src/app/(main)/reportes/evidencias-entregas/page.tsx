import { redirect } from 'next/navigation';
import { requerirActorActivo } from '@/lib/auth/session';
import { ReportesEvidenciasEntregasPanel } from '@/features/reportes/components/ReportesEvidenciasEntregasPanel';

export const metadata = {
  title: 'Reportes de Evidencias y Entregas | Beteele One',
};

const ALLOWED_ROLES = ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'];

export default async function ReportesEvidenciasEntregasPage() {
  const actor = await requerirActorActivo();

  if (!ALLOWED_ROLES.includes(actor.puesto)) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <ReportesEvidenciasEntregasPanel actor={actor} />
    </div>
  );
}
