import { NextRequest, NextResponse } from 'next/server';
import { obtenerActorActual } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  generarExcelRutasAprobadas,
  obtenerVisitasAprobadasParaExportar,
} from '@/features/rutas/services/rutasExportService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_ROLES = new Set(['ADMINISTRADOR', 'COORDINADOR']);

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual();

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.has(actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const semanaInicio = searchParams.get('semanaInicio');
  const supervisorId = searchParams.get('supervisorId');
  const incluirTodas = searchParams.get('incluirTodas') === 'true';

  try {
    const supabase = createServiceClient();
    const visitas = await obtenerVisitasAprobadasParaExportar(supabase, actor, {
      semanaInicio,
      supervisorId,
      incluirTodas,
    });

    const { buffer, filename } = await generarExcelRutasAprobadas(visitas, { semanaInicio });

    return new Response(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No fue posible generar el reporte de rutas.',
      },
      { status: 500 }
    );
  }
}
