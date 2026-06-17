import { NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { obtenerPropuestasMecanicas } from '@/features/reportes/services/mecanicasReportService';

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

    // Obtener cuenta_cliente_id de forma robusta e infalible desde el actor validado
    const cuentaClienteId = actor.cuentaClienteId;

    if (!cuentaClienteId) {
      return NextResponse.json(
        { error: 'Usuario no tiene cuenta cliente asignada' },
        { status: 400 }
      );
    }

    const uniformes = await obtenerPropuestasMecanicas(cuentaClienteId);

    return NextResponse.json({ ok: true, data: uniformes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
