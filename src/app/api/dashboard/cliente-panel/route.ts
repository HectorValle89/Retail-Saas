import { NextRequest, NextResponse } from 'next/server';
import { requerirActorActivo } from '@/lib/auth/session';
import { obtenerDashboardCliente } from '@/features/dashboard/services/clienteDashboardService';

function pickString(value: string | null) {
  return value?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirActorActivo();
    const { searchParams } = request.nextUrl;

    const periodo = pickString(searchParams.get('periodo')) ?? '';
    const cadenaId = pickString(searchParams.get('cadenaId'));
    const pdvId = pickString(searchParams.get('pdvId'));

    const data = await obtenerDashboardCliente(actor, {
      periodo,
      cadenaId,
      pdvId,
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
