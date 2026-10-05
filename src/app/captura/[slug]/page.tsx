import { CapturaPublicaForm } from '@/features/captura-publica/components/CapturaPublicaForm';
import {
  getCapturaPublicaDefaultDate,
  obtenerCapturaPublicaData,
} from '@/features/captura-publica/services/capturaPublicaService';

export const metadata = {
  title: 'BETEELE - ONE | Portal de Campo',
  description: 'Portal de captura operativa en campo para registro de ventas, canjes y desabasto.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface CapturaPublicaPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CapturaPublicaPage({ params }: CapturaPublicaPageProps) {
  const { slug } = await params;
  const data = await obtenerCapturaPublicaData(slug);

  return (
    <main className="min-h-screen bg-slate-50">
      <CapturaPublicaForm slug={slug} data={data} defaultDate={getCapturaPublicaDefaultDate()} />
    </main>
  );
}
