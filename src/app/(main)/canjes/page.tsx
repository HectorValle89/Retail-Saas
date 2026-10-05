import { requerirPuestosActivos } from '@/lib/auth/session';
import { CanjesPanel } from '@/features/canjes/components/CanjesPanel';

export const metadata = {
  title: 'Canjes | Field Force Platform',
  description: 'Gestión y exportación de canjes con ticket, sin ticket y fuera de jornada.',
};

export default async function CanjesPage() {
  await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <CanjesPanel />
    </div>
  );
}
