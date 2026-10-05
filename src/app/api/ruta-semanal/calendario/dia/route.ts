import { NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { obtenerDetalleRutaCalendarioDiaParaActor } from '@/features/rutas/services/rutaCalendarioMensualService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RUTA_CALENDARIO_ROLES = ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'] as const;

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([...RUTA_CALENDARIO_ROLES]);
    const requestUrl = new URL(request.url);
    const fecha = requestUrl.searchParams.get('fecha') ?? '';
    const supervisorEmpleadoId = requestUrl.searchParams.get('supervisorId') ?? '';
    const detail = await obtenerDetalleRutaCalendarioDiaParaActor(actor, {
      fecha,
      supervisorEmpleadoId,
    });

    return NextResponse.json({ detail });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el detalle diario de la ruta.',
      },
      { status: 500 }
    );
  }
}
