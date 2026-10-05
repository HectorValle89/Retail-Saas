import { NextResponse } from 'next/server';
import { obtenerActorActual } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  buildPlaneacionCuotaTemplateWorkbook,
  getPlaneacionCuotaTemplateFilename,
} from '@/features/asignaciones/lib/planeacionCuotaTemplate';
import { loadPlaneacionCuotaPdvScope } from '@/features/asignaciones/services/planeacionCuotaService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;

export async function GET(request: Request) {
  const actor = await obtenerActorActual();
  if (
    !actor ||
    actor.estadoCuenta !== 'ACTIVA' ||
    !['ADMINISTRADOR', 'COORDINADOR'].includes(actor.puesto)
  ) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const cuentaClienteId = url.searchParams.get('cuentaClienteId')?.trim() ?? '';
  const mes = url.searchParams.get('mes')?.trim() ?? '';
  if (!UUID_PATTERN.test(cuentaClienteId) || !MONTH_PATTERN.test(mes)) {
    return NextResponse.json({ error: 'Cuenta o mes inválidos.' }, { status: 400 });
  }
  if (actor.cuentaClienteId && actor.cuentaClienteId !== cuentaClienteId) {
    return NextResponse.json({ error: 'Fuera del alcance del usuario.' }, { status: 403 });
  }

  try {
    const service = createServiceClient();
    const scope = await loadPlaneacionCuotaPdvScope(service, cuentaClienteId, mes);
    const bytes = await buildPlaneacionCuotaTemplateWorkbook({
      mes,
      pdvs: scope.map((pdv) => ({
        claveBtl: pdv.claveBtl,
        cadenaNombre: pdv.cadenaNombre,
        pdvNombre: pdv.pdvNombre,
        cuotaMensualActual: null,
      })),
    });

    const body = bytes.slice().buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${getPlaneacionCuotaTemplateFilename(mes)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No fue posible generar la plantilla de cuotas.',
      },
      { status: 500 }
    );
  }
}
