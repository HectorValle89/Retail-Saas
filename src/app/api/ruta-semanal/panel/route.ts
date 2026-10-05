import { NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { obtenerPanelRutaSemanalParaActor } from '@/features/rutas/services/rutaSemanalService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RUTA_SEMANAL_ROLES = ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'] as const;

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([...RUTA_SEMANAL_ROLES]);
    const requestUrl = new URL(request.url);
    const cacheBuster = requestUrl.searchParams.get('refresh');
    const surface = requestUrl.searchParams.get('surface') === 'quotas' ? 'quotas' : 'full';
    const data = await obtenerPanelRutaSemanalParaActor(actor, {
      cacheBuster,
      surface,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de ruta mensual.',
      },
      { status: 500 }
    );
  }
}
