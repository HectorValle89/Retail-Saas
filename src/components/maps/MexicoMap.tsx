'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { Card } from '@/components/ui/card';
export type { MexicoMapPoint, MexicoMapTone } from './LeafletMexicoMap';

const LeafletMexicoMap = dynamic(
  () => import('./LeafletMexicoMap').then((module) => module.LeafletMexicoMap),
  {
    ssr: false,
    loading: () => (
      <Card className="flex h-[320px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Cargando mapa de Mexico...
      </Card>
    ),
  }
);

export type MexicoMapProps = ComponentProps<typeof LeafletMexicoMap>;

export function MexicoMap(props: MexicoMapProps) {
  return <LeafletMexicoMap {...props} />;
}
