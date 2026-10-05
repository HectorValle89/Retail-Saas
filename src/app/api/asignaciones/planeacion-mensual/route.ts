import { NextRequest, NextResponse } from 'next/server';
import { obtenerActorActual } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  obtenerPlaneacionMensualResumen,
  type PlaneacionMensualReadRpcClient,
} from '@/features/asignaciones/services/planeacionMensualReadService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const ALLOWED_ROLES = new Set(['ADMINISTRADOR', 'COORDINADOR']);
const ALLOWED_STATES = new Set(['DC', 'VACANTE', 'ACTIVO', 'PAUSADO', 'INACTIVO']);

function parseUuidList(value: string | null): string[] | null {
  if (!value) return [];
  const entries = [
    ...new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ];
  if (entries.length > 100 || entries.some((entry) => !UUID_PATTERN.test(entry))) {
    return null;
  }
  return entries;
}

function isValidMonth(value: string): boolean {
  if (!MONTH_PATTERN.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
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

  try {
    const params = request.nextUrl.searchParams;
    const cuentaClienteId = params.get('cuentaClienteId') ?? actor.cuentaClienteId;
    const month = params.get('mes');

    if (!cuentaClienteId || !UUID_PATTERN.test(cuentaClienteId)) {
      return NextResponse.json({ error: 'La cuenta es obligatoria.' }, { status: 400 });
    }
    if (actor.cuentaClienteId && actor.cuentaClienteId !== cuentaClienteId) {
      return NextResponse.json(
        { error: 'La cuenta queda fuera del alcance del usuario.' },
        { status: 403 }
      );
    }
    if (!month || !isValidMonth(month)) {
      return NextResponse.json({ error: 'El mes debe tener formato YYYY-MM.' }, { status: 400 });
    }

    const estados = [...new Set((params.get('estados') ?? '').split(',').filter(Boolean))];
    if (estados.length > 10 || estados.some((estado) => !ALLOWED_STATES.has(estado))) {
      return NextResponse.json({ error: 'El filtro de estado no es válido.' }, { status: 400 });
    }

    const busqueda = params.get('busqueda')?.trim() || null;
    if (busqueda && busqueda.length > 120) {
      return NextResponse.json({ error: 'La búsqueda excede 120 caracteres.' }, { status: 400 });
    }

    const cadenaIds = parseUuidList(params.get('cadenaIds'));
    const supervisorIds = parseUuidList(params.get('supervisorIds'));
    if (!cadenaIds || !supervisorIds) {
      return NextResponse.json(
        { error: 'La lista de filtros contiene identificadores inválidos.' },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const data = await obtenerPlaneacionMensualResumen(
      service as unknown as PlaneacionMensualReadRpcClient,
      cuentaClienteId,
      `${month}-01`,
      {
        busqueda,
        cadenaIds,
        supervisorIds,
        estados,
      }
    );

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No fue posible consultar la planeación mensual.',
      },
      { status: 500 }
    );
  }
}
