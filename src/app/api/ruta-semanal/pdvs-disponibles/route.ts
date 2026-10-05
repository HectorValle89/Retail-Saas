import { NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { getWeekStartIso } from '@/features/rutas/lib/weeklyRoute';
import {
  obtenerCatalogoPdvsRutaSupervisorSemanaParaActor,
  obtenerWorkspaceRutaSupervisorMesParaActor,
} from '@/features/rutas/services/rutaSemanalCatalogoService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos(['SUPERVISOR']);
    const requestUrl = new URL(request.url);
    const month = requestUrl.searchParams.get('mes');
    const rawWeekStart = requestUrl.searchParams.get('semanaInicio');

    if (month) {
      const parsedMonth = new Date(`${month}-01T12:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}$/.test(month) ||
        Number.isNaN(parsedMonth.getTime()) ||
        parsedMonth.toISOString().slice(0, 7) !== month
      ) {
        return NextResponse.json(
          { message: 'El mes de planeación no es válido.' },
          { status: 400 }
        );
      }
      const workspace = await obtenerWorkspaceRutaSupervisorMesParaActor(actor, month);
      return NextResponse.json(workspace);
    }

    if (!rawWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart)) {
      return NextResponse.json(
        { message: 'La semana de planeación no es válida.' },
        { status: 400 }
      );
    }

    const weekStart = getWeekStartIso(rawWeekStart);
    const pdvs = await obtenerCatalogoPdvsRutaSupervisorSemanaParaActor(actor, weekStart);

    return NextResponse.json({ weekStart, pdvs });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible resolver los PDVs vigentes para la semana.',
      },
      { status: 500 }
    );
  }
}
