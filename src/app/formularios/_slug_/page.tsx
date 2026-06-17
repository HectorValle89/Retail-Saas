import type { Metadata } from 'next';
import { obtenerMecanicasPublicasData } from '@/features/captura-publica/services/mecanicasService';
import { MecanicasPropuestaForm } from '@/features/captura-publica/components/MecanicasPropuestaForm';
import { getCapturaPublicaDefaultDate } from '@/features/captura-publica/services/capturaPublicaService';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const data = await obtenerMecanicasPublicasData(resolvedParams.slug);

  return {
    title:
      data.ok && data.cuentaClienteNombre
        ? `Levantamiento de Uniformes — ${data.cuentaClienteNombre}`
        : 'Levantamiento de Uniformes de Campo',
    description:
      'Portal público para el equipo de supervisores para confirmar sus necesidades de uniformes.',
  };
}

export default async function MecanicasPublicasPage({ params }: PageProps) {
  const resolvedParams = await params;
  const data = await obtenerMecanicasPublicasData(resolvedParams.slug);
  const defaultDate = getCapturaPublicaDefaultDate();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      <MecanicasPropuestaForm slug={resolvedParams.slug} data={data} />
    </main>
  );
}
