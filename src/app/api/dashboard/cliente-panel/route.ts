import { NextRequest, NextResponse } from 'next/server';
import { requerirActorActivo, type ActorActual } from '@/lib/auth/session';
import { obtenerDashboardCliente } from '@/features/dashboard/services/clienteDashboardService';

function pickString(value: string | null) {
  return value?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  try {
    let actor: ActorActual;
    try {
      actor = await requerirActorActivo();
    } catch (authError) {
      const host = request.headers.get('host') ?? '';
      const referer = request.headers.get('referer') ?? '';
      const isPublicReportes =
        host.toLowerCase().startsWith('reportes.') ||
        referer.toLowerCase().includes('/reporte/');

      if (isPublicReportes) {
        actor = {
          authUserId: 'public-report-system',
          usuarioId: 'public-report-system',
          empleadoId: 'public-report-system',
          cuentaClienteId: '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba',
          puesto: 'CLIENTE',
          nombreCompleto: 'ISDIN México - Dashboard Ejecutivo',
          username: 'isdin_public_report',
          correoElectronico: 'public@isdin.com',
          correoVerificado: true,
          estadoCuenta: 'ACTIVA',
        };
      } else {
        throw authError;
      }
    }

    const { searchParams } = request.nextUrl;

    const periodo = pickString(searchParams.get('periodo')) ?? '';
    const cadenaId = pickString(searchParams.get('cadenaId'));
    const pdvId = pickString(searchParams.get('pdvId'));
    const reqSupervisorId = pickString(searchParams.get('supervisorId'));
    const supervisorId = actor.puesto === 'SUPERVISOR' ? actor.empleadoId : reqSupervisorId;
    const fecha = pickString(searchParams.get('fecha'));

    const data = await obtenerDashboardCliente(actor, {
      periodo,
      cadenaId,
      pdvId,
      supervisorId,
      fecha,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el panel del dashboard del cliente.',
      },
      { status: 500 }
    );
  }
}

