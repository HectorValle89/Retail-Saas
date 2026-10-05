import { NextRequest, NextResponse } from 'next/server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';
import type {
  MaterialCatalogo,
  MaterialEntregaUltimaMilla,
  MaterialEntregaUltimaMillaDetalle,
} from '@/types/database';

const MAX_DELIVERIES = 5000;
const MAX_DELIVERY_DETAILS = 80000;

type CellValue = string | number | boolean | null;

type LastMileDeliveryRow = Pick<
  MaterialEntregaUltimaMilla,
  | 'id'
  | 'cuenta_cliente_id'
  | 'distribucion_id'
  | 'pdv_id'
  | 'estado'
  | 'pdv_snapshot'
  | 'dermoconsejero_snapshot'
  | 'capturado_en'
  | 'sincronizado_en'
>;

type LastMileDetailRow = Pick<
  MaterialEntregaUltimaMillaDetalle,
  | 'entrega_id'
  | 'distribucion_detalle_id'
  | 'material_catalogo_id'
  | 'cantidad_teorica'
  | 'cantidad_real_recibida'
>;

type CatalogRow = Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>;

type MatrixRow = {
  btlCve: string;
  receptor: string;
  fecha: string;
  hora: string;
  itemQuantities: Map<string, number>;
};

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

function pickSnapshotString(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function normalizeItemName(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

async function buildWorkbookBytes(headers: string[], rows: CellValue[][]) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = headers.map((header, index) => ({
    wch:
      index < 4 ? Math.max(14, header.length + 2) : Math.min(48, Math.max(16, header.length + 2)),
  }));
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(rows.length, 1), c: headers.length - 1 },
    }),
  };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispersion');

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
    const tipoDispersion = pickString(request.nextUrl.searchParams.get('tipoDispersion')) || 'MENSUAL';

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
    let deliveriesQuery = service
      .from('material_entrega_ultima_milla')
      .select(
        `
        id,
        cuenta_cliente_id,
        distribucion_id,
        pdv_id,
        estado,
        pdv_snapshot,
        dermoconsejero_snapshot,
        capturado_en,
        sincronizado_en,
        material_distribucion_mensual!inner(mes_operacion, tipo_dispersion)
      `
      )
      .eq('material_distribucion_mensual.mes_operacion', `${range.period}-01`)
      .eq('material_distribucion_mensual.tipo_dispersion', tipoDispersion)
      .neq('estado', 'CANCELADA')
      .order('capturado_en', { ascending: true })
      .limit(MAX_DELIVERIES);

    if (effectiveAccountId) {
      deliveriesQuery = deliveriesQuery.eq('cuenta_cliente_id', effectiveAccountId);
    }

    const { data: deliveriesData, error: deliveriesError } = await deliveriesQuery;

    if (deliveriesError) {
      return NextResponse.json(
        {
          message: `No fue posible consultar las entregas de ultima milla: ${deliveriesError.message}`,
        },
        { status: 500 }
      );
    }

    let deliveries = (deliveriesData ?? []) as LastMileDeliveryRow[];

    if (deliveries.length === 0) {
      // Query supervisor_evidencia for ULTIMA_MILLA deliveries
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
        console.error('Error fetching supervisor_evidencia for Excel fallback:', queryError);
        return NextResponse.json(
          { message: 'Error al consultar las evidencias de ultima milla.' },
          { status: 500 }
        );
      }

      const headers = [
        'BTL CVE',
        'PUNTO DE VENTA',
        'CADENA',
        'RECEPTOR',
        'FECHA',
        'HORA',
        'ESTADO',
        'FOTOS ENVIADAS',
        'OBSERVACIONES',
        'URL ACUSE',
        'URL FOTO ENTREGA',
      ];

      const rows = (rawEvidences ?? []).map((row: any) => {
        const pdv = row.pdv || {};
        const metadata = row.metadata || {};
        const checklist = metadata.checklist || {};
        const fotosRaw = Array.isArray(row.fotos) ? row.fotos : [];

        const acuseUrl = fotosRaw.find((f: any) => f.label?.includes('Acuse') || f.label?.includes('1'))?.url || '';
        const entregaUrl = fotosRaw.find((f: any) => f.label?.includes('entrega') || f.label?.includes('2'))?.url || '';
        const finalAcuseUrl = acuseUrl || (fotosRaw[0]?.url ?? '');
        const finalEntregaUrl = entregaUrl || (fotosRaw[1]?.url ?? '');

        const { fecha, hora } = formatDateTimeParts(row.created_at);

        return [
          pdv.clave_btl || '',
          pdv.nombre || metadata.pdv_label || 'Punto de Venta',
          pdv.cadena?.nombre || 'General',
          checklist.nombre_receptor || metadata.receptor_label || 'Sin receptor',
          fecha,
          hora,
          'Entrega realizada',
          fotosRaw.length,
          row.observaciones || '',
          finalAcuseUrl,
          finalEntregaUrl,
        ];
      });

      const workbookBytes = await buildWorkbookBytes(headers, rows);

      return new Response(new Uint8Array(workbookBytes), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="dispersion-entregada-${range.period}.xlsx"`,
          'Cache-Control': 'private, no-store, max-age=0',
        },
      });
    }

    if (range.period === '2026-05') {
      const specificIds =
        tipoDispersion === 'EXCLUSIVA_CANJES'
          ? [
              'c888c138-09f2-45e9-92ad-a6b43f2087b4', // Polanco - Isabel Lucero (June 1st)
              'fb09636c-77fd-47cc-a5c4-71132c7c52cd'  // Santa Fe - Fernanda Estefania (June 1st)
            ]
          : tipoDispersion === 'MENSUAL'
          ? [
              '2e155b14-0411-434a-8af8-bc94a8ed6f20', // Polanco - Olga Elizabeth (June 3rd)
              'd92bbe5d-70b6-41fd-b499-1a09f3e2583d', // Santa Fe - María del Rocío (June 3rd)
              '3d39f460-9391-4801-bc22-883540b81c8d', // Polanco - Isabel Lucero (June 8th)
              '7db735e0-b058-4bae-a6c6-bea67a5dd954'  // Santa Fe - Fernanda Estefania (June 3rd)
            ]
          : [];

      if (specificIds.length > 0) {
        const { data: extraData, error: extraError } = await service
          .from('material_entrega_ultima_milla')
          .select(
            `
            id,
            cuenta_cliente_id,
            distribucion_id,
            pdv_id,
            estado,
            pdv_snapshot,
            dermoconsejero_snapshot,
            capturado_en,
            sincronizado_en
          `
          )
          .in('id', specificIds)
          .neq('estado', 'CANCELADA');

        if (!extraError && extraData) {
          for (const extraItem of extraData) {
            if (!deliveries.some((d) => d.id === extraItem.id)) {
              deliveries.push(extraItem as LastMileDeliveryRow);
            }
          }
        }
      }
    }

    const deliveryIds = deliveries.map((item) => item.id);

    const { data: deliveryDetailsData, error: deliveryDetailsError } =
      deliveryIds.length > 0
        ? await service
            .from('material_entrega_ultima_milla_detalle')
            .select(
              `
              entrega_id,
              distribucion_detalle_id,
              material_catalogo_id,
              cantidad_teorica,
              cantidad_real_recibida
            `
            )
            .in('entrega_id', deliveryIds)
            .limit(MAX_DELIVERY_DETAILS)
        : { data: [], error: null };

    if (deliveryDetailsError) {
      return NextResponse.json(
        {
          message: `No fue posible consultar el detalle entregado: ${deliveryDetailsError.message}`,
        },
        { status: 500 }
      );
    }

    const deliveryDetails = (deliveryDetailsData ?? []) as LastMileDetailRow[];
    const materialCatalogIds = [
      ...new Set(deliveryDetails.map((item) => item.material_catalogo_id)),
    ];

    const { data: catalogData, error: catalogError } =
      materialCatalogIds.length > 0
        ? await service
            .from('material_catalogo')
            .select('id, nombre, tipo')
            .in('id', materialCatalogIds)
            .limit(materialCatalogIds.length)
        : { data: [], error: null };

    if (catalogError) {
      return NextResponse.json(
        { message: `No fue posible consultar el catalogo de items: ${catalogError.message}` },
        { status: 500 }
      );
    }

    const catalogById = new Map<string, CatalogRow>();
    for (const item of (catalogData ?? []) as CatalogRow[]) {
      catalogById.set(item.id, item);
    }

    const itemNamesByCatalogId = new Map<string, string>();
    for (const detail of deliveryDetails) {
      const catalog = catalogById.get(detail.material_catalogo_id);
      const itemName = normalizeItemName(catalog?.nombre, detail.material_catalogo_id);
      itemNamesByCatalogId.set(detail.material_catalogo_id, itemName);
    }

    const orderedItemIds = [...itemNamesByCatalogId.entries()]
      .sort(([, left], [, right]) => left.localeCompare(right, 'es-MX'))
      .map(([id]) => id);

    const detailsByDelivery = new Map<string, LastMileDetailRow[]>();
    for (const detail of deliveryDetails) {
      const current = detailsByDelivery.get(detail.entrega_id) ?? [];
      current.push(detail);
      detailsByDelivery.set(detail.entrega_id, current);
    }

    const matrixRows: MatrixRow[] = deliveries.map((delivery) => {
      const { fecha, hora } = formatDateTimeParts(
        delivery.sincronizado_en ?? delivery.capturado_en
      );
      const itemQuantities = new Map<string, number>();

      for (const detail of detailsByDelivery.get(delivery.id) ?? []) {
        const deliveredQuantity = detail.cantidad_real_recibida ?? detail.cantidad_teorica;
        itemQuantities.set(
          detail.material_catalogo_id,
          (itemQuantities.get(detail.material_catalogo_id) ?? 0) + deliveredQuantity
        );
      }

      return {
        btlCve:
          pickSnapshotString(delivery.pdv_snapshot, 'clave_btl') ??
          pickSnapshotString(delivery.pdv_snapshot, 'id_btl') ??
          delivery.pdv_id,
        receptor:
          pickSnapshotString(delivery.dermoconsejero_snapshot, 'nombre') ??
          pickSnapshotString(delivery.dermoconsejero_snapshot, 'nombre_completo') ??
          'Sin receptor',
        fecha,
        hora,
        itemQuantities,
      };
    });

    const headers = [
      'BTL CVE',
      'RECEPTOR',
      'FECHA',
      'HORA',
      ...orderedItemIds.map((id) => itemNamesByCatalogId.get(id) ?? id),
    ];

    const rows: CellValue[][] = matrixRows.map((row) => [
      row.btlCve,
      row.receptor,
      row.fecha,
      row.hora,
      ...orderedItemIds.map((id) => row.itemQuantities.get(id) ?? 0),
    ]);

    const workbookBytes = await buildWorkbookBytes(headers, rows);

    return new Response(new Uint8Array(workbookBytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="dispersion-entregada-${range.period}.xlsx"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: 'No fue posible generar el Excel de dispersiones.' },
      { status: 500 }
    );
  }
}
