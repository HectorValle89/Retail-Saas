import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        { message: 'No tienes permiso para exportar evidencias de otra cuenta cliente.' },
        { status: 403 }
      );
    }

    const service = createServiceClient() as TypedSupabaseClient;

    let query = service
      .from('supervisor_evidencia')
      .select(
        `
        id,
        fecha_operacion,
        created_at,
        fotos,
        observaciones,
        metadata,
        pdv:pdv_id(nombre, clave_btl, cadena:cadena_id(nombre))
      `
      )
      .eq('tipo_evidencia', 'ENTREGA_UNIFORMES')
      .gte('fecha_operacion', range.startDate)
      .lt('fecha_operacion', range.endDateExclusive)
      .order('created_at', { ascending: false });

    if (effectiveAccountId) {
      query = query.eq('cuenta_cliente_id', effectiveAccountId);
    }

    const { data: records, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: `No fue posible consultar las evidencias: ${error.message}` },
        { status: 500 }
      );
    }

    const origin = request.nextUrl.origin;

    const entregas = (records ?? []).map((rec: any) => {
      const pdv = rec.pdv ?? {};
      const cadena = pdv.cadena?.nombre ?? 'General';

      const checklist = rec.metadata?.checklist ?? {};
      const receptor = checklist.persona_recibio_nombre ?? 'Desconocido';
      const puesto = checklist.persona_recibio_puesto ?? 'DERMOCONSEJERA';

      // Resolver las fotos del array JSON
      const fotosArray = Array.isArray(rec.fotos) ? rec.fotos : [];

      // Buscar por label con regex case-insensitive para tolerar variantes de escritura
      const findByLabel = (pattern: RegExp) => fotosArray.find((f: any) => pattern.test(f.label ?? ''));

      let fotoAcuse = findByLabel(/acuse/i) ?? null;
      let fotoPersona = findByLabel(/persona|recib|quien/i) ?? null;

      // Fallback por posición si la búsqueda por label no encontró ambas fotos
      if (!fotoAcuse && !fotoPersona && fotosArray.length >= 2) {
        fotoAcuse = fotosArray[0];
        fotoPersona = fotosArray[1];
      } else if (!fotoAcuse && fotosArray.length >= 1) {
        // Si solo encontramos la foto de persona por label, el acuse debe ser la otra
        fotoAcuse = fotosArray.find((f: any) => f !== fotoPersona) ?? fotosArray[0];
      } else if (!fotoPersona && fotosArray.length >= 2) {
        // Si solo encontramos el acuse por label, la persona debe ser la otra
        fotoPersona = fotosArray.find((f: any) => f !== fotoAcuse) ?? fotosArray[1];
      }

      // Evitar que ambas fotos apunten al mismo objeto cuando hay 2 fotos distintas
      if (fotoAcuse && fotoPersona && fotoAcuse === fotoPersona && fotosArray.length >= 2) {
        fotoAcuse = fotosArray[0];
        fotoPersona = fotosArray[1];
      }

      // Construir las URLs de proxy para el PPT (compatible con todos los métodos de subida)
      const buildProxyUrl = (foto: any) => {
        if (!foto) return null;
        // Soportar todos los nombres de campo posibles: originalKey, objectKey, key
        const r2Key = foto.originalKey || foto.objectKey || foto.key;
        if (r2Key) {
          return `/api/storage/r2?key=${encodeURIComponent(r2Key)}`;
        }
        // Fallback a la URL directa si existe
        return foto.url ?? null;
      };

      // Si son URLs relativas, asegurar que tengan el origen absoluto en la API para pptxgenjs
      const getAbsoluteUrl = (url: string | null) => {
        if (!url) return null;
        if (url.startsWith('/api/')) {
          return `${origin}${url}`;
        }
        return url;
      };

      return {
        id: rec.id,
        estado: 'COMPLETO',
        capturadoEn: rec.created_at,
        pdvNombre: pdv.nombre ?? 'Sin sucursal',
        pdvClaveBtl: pdv.clave_btl ?? '',
        cadena: cadena,
        receptor: `${receptor} (${puesto === 'SUPERVISOR' ? 'Supervisor' : 'DC'})`,
        fotoAcuseUrl: getAbsoluteUrl(buildProxyUrl(fotoAcuse)),
        fotoEntregaUrl: getAbsoluteUrl(buildProxyUrl(fotoPersona)),
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        periodo: range.period,
        total: entregas.length,
        entregas,
      },
    });
  } catch (error) {
    console.error('Error al obtener datos de uniformes para PPT:', error);
    return NextResponse.json(
      { message: 'Error interno al consultar datos de uniformes para el reporte PPT.' },
      { status: 500 }
    );
  }
}
