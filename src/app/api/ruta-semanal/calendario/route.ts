import { NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { obtenerCalendarioMensualRutaParaActor } from '@/features/rutas/services/rutaCalendarioMensualService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RUTA_CALENDARIO_ROLES = ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'] as const;

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([...RUTA_CALENDARIO_ROLES]);
    const requestUrl = new URL(request.url);
    const month = requestUrl.searchParams.get('month');
    const supervisorEmpleadoId = requestUrl.searchParams.get('supervisorId');
    const data = await obtenerCalendarioMensualRutaParaActor(actor, {
      monthIso: month,
      supervisorEmpleadoId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el calendario mensual de rutas.',
      },
      { status: 500 }
    );
  }
}
