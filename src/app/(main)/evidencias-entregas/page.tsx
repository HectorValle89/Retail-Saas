import { requerirActorActivo } from '@/lib/auth/session';
import { ReportesEvidenciasEntregasPanel } from '@/features/reportes/components/ReportesEvidenciasEntregasPanel';

export const metadata = {
  title: 'Entregas y Evidencias | Beteele One',
};

export default async function EvidenciasEntregasPage() {
  const actor = await requerirActorActivo();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-24 sm:px-6 lg:px-10 lg:pt-8">
      <ReportesEvidenciasEntregasPanel actor={actor} />
    </div>
  );
}
