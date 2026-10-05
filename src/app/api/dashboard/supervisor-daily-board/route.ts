import { NextRequest, NextResponse } from 'next/server';
import { requerirActorActivo } from '@/lib/auth/session';
import { obtenerSupervisorDailyBoardPorFecha } from '@/features/dashboard/services/dashboardService';

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirActorActivo();

    if (actor.puesto !== 'SUPERVISOR' && actor.puesto !== 'ADMINISTRADOR') {
      return NextResponse.json(
        { message: 'Solo supervisores o administradores pueden consultar el tablero de asistencia diaria.' },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const fecha = searchParams.get('fecha')?.trim() || undefined;

    const data = await obtenerSupervisorDailyBoardPorFecha(actor, fecha);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar las asistencias del día seleccionado.',
      },
      { status: 500 }
    );
  }
}
