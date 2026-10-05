import { NextRequest, NextResponse } from 'next/server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;
type CellValue = string | number | boolean | null;

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

function formatDateTimeParts(value: string) {
  const date = new Date(value);
  const dateParts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    fecha: `${getPart(dateParts, 'day')}/${getPart(dateParts, 'month')}/${getPart(dateParts, 'year')}`,
    hora: `${getPart(timeParts, 'hour')}:${getPart(timeParts, 'minute')}`,
  };
}

async function buildWorkbookBytes(headers: string[], rows: CellValue[][]) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = headers.map((header, index) => ({
    wch: Math.max(12, header.length + 2),
  }));
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(rows.length, 1), c: headers.length - 1 },
    }),
  };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Entregas_Uniformes');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA']);
    const range = buildMonthRange(request.nextUrl.searchParams.get('periodo'));

    if (!range) {
      return NextResponse.json(
        { message: 'Periodo invalido para exportar Excel.' },
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
        supervisor:supervisor_empleado_id(nombre, primer_apellido, segundo_apellido),
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

    const headers = [
      'Fecha',
      'Hora',
      'Cadena',
      'Clave BTL',
      'Punto de Venta (Sucursal)',
      'Supervisor que Entregó',
      'Persona que Recibió',
      'Puesto',
      'Foto Acuse Firmado',
      'Foto Persona Recibiendo',
      'Observaciones',
    ];

    const rows: CellValue[][] = (records ?? []).map((rec: any) => {
      const { fecha, hora } = formatDateTimeParts(rec.created_at);
      const pdv = rec.pdv ?? {};
      const cadena = pdv.cadena?.nombre ?? 'General';
      const supervisor = rec.supervisor
        ? `${rec.supervisor.nombre} ${rec.supervisor.primer_apellido} ${rec.supervisor.segundo_apellido ?? ''}`.trim()
        : 'Desconocido';

      const checklist = rec.metadata?.checklist ?? {};
      const receptor = checklist.persona_recibio_nombre ?? 'Desconocido';
      const puesto = checklist.persona_recibio_puesto ?? 'DERMOCONSEJERA';

      // Resolver las fotos del array JSON con búsqueda robusta
      const fotosArray = Array.isArray(rec.fotos) ? rec.fotos : [];
      const findByLabel = (pattern: RegExp) => fotosArray.find((f: any) => pattern.test(f.label ?? ''));

      let fotoAcuseObj = findByLabel(/acuse/i) ?? null;
      let fotoPersonaObj = findByLabel(/persona|recib|quien/i) ?? null;

      if (!fotoAcuseObj && !fotoPersonaObj && fotosArray.length >= 2) {
        fotoAcuseObj = fotosArray[0];
        fotoPersonaObj = fotosArray[1];
      } else if (!fotoAcuseObj && fotosArray.length >= 1) {
        fotoAcuseObj = fotosArray.find((f: any) => f !== fotoPersonaObj) ?? fotosArray[0];
      } else if (!fotoPersonaObj && fotosArray.length >= 2) {
        fotoPersonaObj = fotosArray.find((f: any) => f !== fotoAcuseObj) ?? fotosArray[1];
      }

      if (fotoAcuseObj && fotoPersonaObj && fotoAcuseObj === fotoPersonaObj && fotosArray.length >= 2) {
        fotoAcuseObj = fotosArray[0];
        fotoPersonaObj = fotosArray[1];
      }

      const resolvePhotoUrl = (foto: any) => {
        if (!foto) return '';
        const r2Key = foto.originalKey || foto.objectKey || foto.key;
        if (r2Key) return `/api/storage/r2?key=${encodeURIComponent(r2Key)}`;
        return foto.url ?? '';
      };

      const fotoAcuse = resolvePhotoUrl(fotoAcuseObj);
      const fotoPersona = resolvePhotoUrl(fotoPersonaObj);

      // Completar dominio del R2 en caso de ser relativo
      const getAbsoluteUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('/api/')) {
          const origin = request.nextUrl.origin;
          return `${origin}${url}`;
        }
        return url;
      };

      return [
        fecha,
        hora,
        cadena,
        pdv.clave_btl ?? '',
        pdv.nombre ?? '',
        supervisor,
        receptor,
        puesto === 'SUPERVISOR' ? 'Supervisor' : 'Dermoconsejera',
        getAbsoluteUrl(fotoAcuse),
        getAbsoluteUrl(fotoPersona),
        rec.observaciones ?? '',
      ];
    });

    const buffer = await buildWorkbookBytes(headers, rows);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Evidencias_Entrega_Uniformes_${range.period}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error al generar Excel de uniformes:', error);
    return NextResponse.json(
      { message: 'Error interno al generar el archivo Excel.' },
      { status: 500 }
    );
  }
}
