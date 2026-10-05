import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { obtenerSupervisorEvidenciasParaReporte } from '@/features/reportes/services/presentacionService';
import type { TipoEvidencia } from '@/features/evidencias/types';

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'CLIENTE']);

    const searchParams = request.nextUrl.searchParams;
    const tipoEvidencia = searchParams.get('tipoEvidencia') as TipoEvidencia | '';
    const fechaInicio = searchParams.get('fechaInicio') || undefined;
    const fechaFin = searchParams.get('fechaFin') || undefined;
    const pdvId = searchParams.get('pdvId') || undefined;
    const supervisorId = searchParams.get('supervisorId') || undefined;

    // Enforce account client restriction if user is tied to one (e.g. CLIENTE or restricted coordinator)
    let cuentaClienteId = searchParams.get('cuentaClienteId') || undefined;
    if (actor.cuentaClienteId) {
      cuentaClienteId = actor.cuentaClienteId;
    }

    const service = createServiceClient();
    const data = await obtenerSupervisorEvidenciasParaReporte(service, {
      tipoEvidencia,
      fechaInicio,
      fechaFin,
      pdvId,
      supervisorId,
      cuentaClienteId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error('Error en API presentaciones-data:', error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Error interno de servidor.' },
      { status: 500 }
    );
  }
}
