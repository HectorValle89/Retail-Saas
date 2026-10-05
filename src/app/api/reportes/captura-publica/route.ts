import { NextResponse } from 'next/server';
import { obtenerActorActual } from '@/lib/auth/session';
import { obtenerReporteCapturaPublica } from '@/features/reportes/services/capturaPublicaReporteService';

export async function GET(request: Request) {
  try {
    const actor = await obtenerActorActual();
    if (!actor?.cuentaClienteId) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') ?? '';
    const pageSize = Number(searchParams.get('pageSize') ?? '50');
    const page = Number(searchParams.get('page') ?? '1');
    const tipoFiltro = searchParams.get('tipo') ?? 'TODOS';

    if (!periodo) {
      return NextResponse.json(
        { message: 'Se requiere el parámetro periodo (YYYY-MM).' },
        { status: 400 }
      );
    }

    const data = await obtenerReporteCapturaPublica(
      actor.cuentaClienteId,
      periodo,
      pageSize,
      page,
      tipoFiltro,
      actor.puesto === 'SUPERVISOR' ? actor.empleadoId : undefined
    );

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[/api/reportes/captura-publica] Error:', err);
    return NextResponse.json({ message: 'Error interno al obtener el reporte.' }, { status: 500 });
  }
}
