import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';

function pickString(value: string | null) {
  return value?.trim() || null;
}

function buildMonthRange(period: string | null) {
  const normalized = period?.trim() ?? '';
  const match = /^(\d{4})-(\d{2})$/.exec(normalized);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    startDateTime: start.toISOString(),
    endDateTimeExclusive: end.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA', 'CLIENTE']);
    const range = buildMonthRange(request.nextUrl.searchParams.get('periodo'));

    if (!range) {
      return NextResponse.json(
        { message: 'Periodo invalido para exportar PPTX.' },
        { status: 400 }
      );
    }

    const requestedAccountId = pickString(request.nextUrl.searchParams.get('cuentaClienteId'));
    const effectiveAccountId =
      actor.cuentaClienteId ??
      requestedAccountId ??
      (isSingleTenantBackendEnabled() ? SINGLE_TENANT_ACCOUNT_ID : null);

    if (
      actor.cuentaClienteId &&
      requestedAccountId &&
      actor.cuentaClienteId !== requestedAccountId
    ) {
      return NextResponse.json(
        { message: 'No tienes permiso para exportar entregas de otra cuenta cliente.' },
        { status: 403 }
      );
    }

    const service = createServiceClient();
    
    // Query directly from supervisor_evidencia for ULTIMA_MILLA deliveries
    let query = service
      .from('supervisor_evidencia')
      .select(`
        id,
        cuenta_cliente_id,
        pdv_id,
        fecha_operacion,
        observaciones,
        fotos,
        metadata,
        created_at,
        pdv:pdv_id(
          id,
          nombre,
          clave_btl,
          cadena:cadena_id(nombre)
        )
      `)
      .eq('tipo_evidencia', 'ULTIMA_MILLA')
      .gte('fecha_operacion', range.startDateTime.slice(0, 10))
      .lte('fecha_operacion', range.endDateTimeExclusive.slice(0, 10))
      .order('created_at', { ascending: false });

    if (effectiveAccountId) {
      query = query.eq('cuenta_cliente_id', effectiveAccountId);
    }

    const { data: rawEvidences, error: queryError } = await query;
    if (queryError) {
      console.error('Error al consultar supervisor_evidencia para última milla:', queryError);
      return NextResponse.json(
        { message: 'No fue posible consultar las evidencias de ultima milla.' },
        { status: 500 }
      );
    }

    const entregas = (rawEvidences ?? []).map((row: any) => {
      const pdv = row.pdv || {};
      const metadata = row.metadata || {};
      const checklist = metadata.checklist || {};
      const fotosRaw = Array.isArray(row.fotos) ? row.fotos : [];

      // Find acuse url and delivery url
      const acuseUrl = fotosRaw.find((f: any) => f.label?.includes('Acuse') || f.label?.includes('1'))?.url || '';
      const entregaUrl = fotosRaw.find((f: any) => f.label?.includes('entrega') || f.label?.includes('2'))?.url || '';

      return {
        id: row.id,
        periodo: range.period,
        estado: 'Entrega realizada',
        capturadoEn: row.created_at,
        pdvNombre: pdv.nombre || metadata.pdv_label || 'Punto de Venta',
        pdvClaveBtl: pdv.clave_btl || '',
        cadena: pdv.cadena?.nombre || 'General',
        receptor: checklist.nombre_receptor || metadata.receptor_label || 'Sin receptor',
        fotoAcuseUrl: acuseUrl || (fotosRaw[0]?.url ?? ''),
        fotoEntregaUrl: entregaUrl || (fotosRaw[1]?.url ?? ''),
      };
    });

    return NextResponse.json(
      {
        data: {
          periodo: range.period,
          total: entregas.length,
          truncated: false,
          entregas,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible preparar los datos para el PPTX de ultima milla.',
      },
      { status: 500 }
    );
  }
}
