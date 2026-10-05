import { NextRequest, NextResponse } from 'next/server';
import { obtenerActorActual } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  obtenerPlaneacionMensualDetalleDia,
  type PlaneacionMensualReadRpcClient,
} from '@/features/asignaciones/services/planeacionMensualReadService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_ROLES = new Set(['ADMINISTRADOR', 'COORDINADOR']);

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const actor = await obtenerActorActual();
  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(actor.puesto)) {
    return NextResponse.json(
      { error: 'Sin permisos para consultar la planeación.' },
      { status: 403 }
    );
  }

  const params = request.nextUrl.searchParams;
  const cuentaClienteId = params.get('cuentaClienteId') ?? actor.cuentaClienteId;
  const pdvId = params.get('pdvId');
  const fecha = params.get('fecha');

  if (!cuentaClienteId || !UUID_PATTERN.test(cuentaClienteId)) {
    return NextResponse.json({ error: 'La cuenta es obligatoria.' }, { status: 400 });
  }
  if (actor.cuentaClienteId && actor.cuentaClienteId !== cuentaClienteId) {
    return NextResponse.json(
      { error: 'La cuenta queda fuera del alcance del usuario.' },
      { status: 403 }
    );
  }
  if (!pdvId || !UUID_PATTERN.test(pdvId) || !fecha || !isValidIsoDate(fecha)) {
    return NextResponse.json({ error: 'PDV o fecha inválidos.' }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const data = await obtenerPlaneacionMensualDetalleDia(
      service as unknown as PlaneacionMensualReadRpcClient,
      cuentaClienteId,
      pdvId,
      fecha
    );

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No fue posible consultar el detalle diario.',
      },
      { status: 500 }
    );
  }
}
