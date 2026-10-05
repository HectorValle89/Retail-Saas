import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';
import type { SupabaseClient } from '@supabase/supabase-js';

type TypedSupabaseClient = SupabaseClient<any>;

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
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA']);
    const range = buildMonthRange(request.nextUrl.searchParams.get('periodo'));

    if (!range) {
      return NextResponse.json(
        { message: 'Periodo inválido para exportar PPTX.' },
        { status: 400 }
      );
    }

    const subtipo = request.nextUrl.searchParams.get('subtipo')?.toUpperCase().trim();
    if (!subtipo || !['LOVE_EXITOSO', 'LOVE_FALLIDO'].includes(subtipo)) {
      return NextResponse.json(
        { message: 'Subtipo de registro inválido o no especificado.' },
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
        { message: 'No tienes permiso para exportar evidencias de otra cuenta cliente.' },
        { status: 403 }
      );
    }

    const service = createServiceClient() as TypedSupabaseClient;

    const PAGE_CHUNK_SIZE = 1000;
    let records: any[] = [];
    let pageIndex = 0;

    while (true) {
      const fromOffset = pageIndex * PAGE_CHUNK_SIZE;
      const toOffset = fromOffset + PAGE_CHUNK_SIZE - 1;

      let query = service
        .from('captura_publica_registro')
        .select(
          `
          id,
          fecha_operativa,
          created_at,
          empleado_nombre_snapshot,
          pdv_nombre_snapshot,
          cantidad,
          foto_evidencia_url,
          observaciones,
          pdv:pdv_id(nombre, clave_btl, cadena:cadena_id(nombre))
        `
        )
        .eq('tipo_registro', 'LOVE_ISDIN')
        .eq('subtipo_registro', subtipo)
        .gte('fecha_operativa', range.startDate)
        .lt('fecha_operativa', range.endDateExclusive)
        .order('fecha_operativa', { ascending: false })
        .range(fromOffset, toOffset);

      if (effectiveAccountId) {
        query = query.eq('cuenta_cliente_id', effectiveAccountId);
      }

      const { data: pageData, error } = await query;

      if (error) {
        return NextResponse.json(
          { message: `No fue posible consultar los registros de Love ISDIN: ${error.message}` },
          { status: 500 }
        );
      }

      if (!pageData || pageData.length === 0) {
        break;
      }

      records = records.concat(pageData);

      if (pageData.length < PAGE_CHUNK_SIZE) {
        break;
      }

      pageIndex++;
    }

    const origin = request.nextUrl.origin;

    const registros = (records ?? []).map((rec: any) => {
      const pdv = rec.pdv ?? {};
      const cadena = pdv.cadena?.nombre ?? 'General';

      // Separar por comas si vienen múltiples fotos guardadas en el string
      const fotosArray = rec.foto_evidencia_url
        ? String(rec.foto_evidencia_url)
            .split(',')
            .map((url) => url.trim())
            .filter((url) => url.length > 0)
        : [];

      // Convertir rutas de Supabase Storage a URLs proxy accesibles por HTTP.
      // Las fotos se guardan como "operacion-evidencias/captura-publica/..." (bucket/route),
      // que no son URLs HTTP. Necesitamos pasarlas por el proxy imagen para que pptxgenjs pueda descargarlas.
      const toProxyUrl = (storagePath: string) => {
        if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
          return storagePath;
        }
        if (storagePath.startsWith('/api/')) {
          return storagePath;
        }
        const slashIdx = storagePath.indexOf('/');
        if (slashIdx > 0) {
          const bucket = storagePath.substring(0, slashIdx);
          const route = storagePath.substring(slashIdx + 1);
          return `/api/reportes/imagen-proxy?bucket=${encodeURIComponent(bucket)}&route=${encodeURIComponent(route)}`;
        }
        return storagePath;
      };

      const absoluteFotos = fotosArray.map((url) => toProxyUrl(url));

      return {
        id: rec.id,
        fechaOperativa: rec.fecha_operativa,
        capturadoEn: rec.created_at,
        pdvNombre: pdv.nombre ?? rec.pdv_nombre_snapshot ?? 'Sin sucursal',
        pdvClaveBtl: pdv.clave_btl ?? '',
        cadena: cadena,
        dermoNombre: rec.empleado_nombre_snapshot ?? 'Desconocida',
        cantidad: rec.cantidad ?? 0,
        observaciones: rec.observaciones ?? '',
        fotos: absoluteFotos,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        periodo: range.period,
        subtipo,
        total: registros.length,
        registros,
      },
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible preparar los datos para el PPTX de Love ISDIN.',
      },
      { status: 500 }
    );
  }
}
