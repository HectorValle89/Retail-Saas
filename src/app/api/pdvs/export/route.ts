import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  normalizePdvsPanelFilters,
  obtenerPanelPdvsParaActor,
} from '@/features/pdvs/services/pdvService';
import {
  generarCsvPdvsCobertura,
  generarExcelPdvsCobertura,
} from '@/features/pdvs/services/pdvExportService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PDV_EXPORT_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
  'LOVE_IS',
  'VENTAS',
  'CLIENTE',
] as const;

function pickString(value: string | null) {
  return value?.trim() || '';
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos([...PDV_EXPORT_ROLES]);
    const { searchParams } = request.nextUrl;
    const format = (searchParams.get('format') || 'xlsx').toLowerCase();

    const filters = normalizePdvsPanelFilters({
      month: pickString(searchParams.get('month')),
      search: pickString(searchParams.get('search')),
      cadenaId: pickString(searchParams.get('cadenaId') || searchParams.get('cadena')),
      ciudadId: pickString(searchParams.get('ciudadId') || searchParams.get('ciudad')),
      estado: pickString(searchParams.get('estado')),
      zona: pickString(searchParams.get('zona')),
      supervisorId: pickString(searchParams.get('supervisorId') || searchParams.get('supervisor')),
      estatus: pickString(searchParams.get('estatus')),
      publicacionEstado: pickString(searchParams.get('publicacion') || searchParams.get('publicacionEstado')),
    });

    const data = await obtenerPanelPdvsParaActor(actor, filters, createServiceClient());

    if (format === 'csv') {
      const { csv, filename } = generarCsvPdvsCobertura(data);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    const { buffer, filename } = await generarExcelPdvsCobertura(data);
    return new Response(Buffer.from(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible exportar PDVs.' },
      { status: 500 }
    );
  }
}
