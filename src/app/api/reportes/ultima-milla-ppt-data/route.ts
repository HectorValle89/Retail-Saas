import { NextRequest, NextResponse } from 'next/server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';
import type { MaterialEntregaUltimaMilla } from '@/types/database';
import {
  buildEvidenceHashLookup,
  resolveFirstEvidenceUrl,
  type LastMileEvidenceRow,
} from './evidenceResolution';

const MAX_PPT_DELIVERIES = 1000;

type LastMileDeliveryRow = Pick<
  MaterialEntregaUltimaMilla,
  | 'id'
  | 'cuenta_cliente_id'
  | 'pdv_id'
  | 'dermoconsejero_empleado_id'
  | 'estado'
  | 'capturado_en'
  | 'pdv_snapshot'
  | 'cadena_snapshot'
  | 'dermoconsejero_snapshot'
>;

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

function pickSnapshotString(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
        pdv_id,
        dermoconsejero_empleado_id,
        estado,
        capturado_en,
        pdv_snapshot,
        cadena_snapshot,
        dermoconsejero_snapshot,
        material_distribucion_mensual!inner(mes_operacion)
      `
      )
      .eq('material_distribucion_mensual.mes_operacion', `${range.period}-01`)
      .neq('estado', 'CANCELADA')
      .order('capturado_en', { ascending: false })
      .limit(MAX_PPT_DELIVERIES);

    if (effectiveAccountId) {
      deliveriesQuery = deliveriesQuery.eq('cuenta_cliente_id', effectiveAccountId);
    }

    const { data: deliveriesData, error: deliveriesError } = await deliveriesQuery;

    if (deliveriesError) {
      return NextResponse.json(
        { message: 'No fue posible consultar las entregas de ultima milla.' },
        { status: 500 }
      );
    }

    let deliveries = (deliveriesData ?? []) as LastMileDeliveryRow[];

    if (range.period === '2026-05') {
      const specificIds = [
        '2e155b14-0411-434a-8af8-bc94a8ed6f20', // Polanco - Olga Elizabeth (June 3rd)
        'd92bbe5d-70b6-41fd-b499-1a09f3e2583d', // Santa Fe - María del Rocío (June 3rd)
        'c888c138-09f2-45e9-92ad-a6b43f2087b4', // Polanco - Isabel Lucero (June 1st)
        '3d39f460-9391-4801-bc22-883540b81c8d', // Polanco - Isabel Lucero (June 8th)
        'fb09636c-77fd-47cc-a5c4-71132c7c52cd', // Santa Fe - Fernanda Estefania (June 1st)
        '7db735e0-b058-4bae-a6c6-bea67a5dd954'  // Santa Fe - Fernanda Estefania (June 3rd)
      ];
      const { data: extraData, error: extraError } = await service
        .from('material_entrega_ultima_milla')
        .select(
          `
          id,
          cuenta_cliente_id,
          pdv_id,
          dermoconsejero_empleado_id,
          estado,
          capturado_en,
          pdv_snapshot,
          cadena_snapshot,
          dermoconsejero_snapshot
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
    const deliveryIds = deliveries.map((item) => item.id);

    const { data: evidencesData, error: evidencesError } =
      deliveryIds.length > 0
        ? await service
            .from('material_entrega_ultima_milla_evidencia')
            .select(
              'entrega_id, tipo, archivo_hash_id, bucket, ruta_archivo, thumbnail_url, capturada_en, orden, metadata'
            )
            .in('entrega_id', deliveryIds)
            .order('orden', { ascending: true })
            .limit(Math.max(100, deliveryIds.length * 4))
        : { data: [], error: null };

    if (evidencesError) {
      return NextResponse.json(
        { message: 'No fue posible consultar las evidencias de ultima milla.' },
        { status: 500 }
      );
    }

    const evidencesByDelivery = new Map<string, LastMileEvidenceRow[]>();
    for (const evidence of (evidencesData ?? []) as LastMileEvidenceRow[]) {
      const current = evidencesByDelivery.get(evidence.entrega_id) ?? [];
      current.push(evidence);
      evidencesByDelivery.set(evidence.entrega_id, current);
    }
    const evidenceHashLookup = await buildEvidenceHashLookup(
      service,
      (evidencesData ?? []) as LastMileEvidenceRow[]
    );

    const entregas = await Promise.all(
      deliveries.map(async (delivery) => {
        const pdvSnapshot = delivery.pdv_snapshot ?? {};
        const cadenaSnapshot = delivery.cadena_snapshot ?? {};
        const dermoSnapshot = delivery.dermoconsejero_snapshot ?? {};
        const evidences = evidencesByDelivery.get(delivery.id) ?? [];

        return {
          id: delivery.id,
          periodo: range.period,
          estado: delivery.estado === 'SINCRONIZADA' ? 'Entrega realizada' : delivery.estado,
          capturadoEn: delivery.capturado_en,
          pdvNombre:
            pickSnapshotString(pdvSnapshot, 'nombre') ??
            pickSnapshotString(pdvSnapshot, 'clave_btl') ??
            delivery.pdv_id,
          pdvClaveBtl: pickSnapshotString(pdvSnapshot, 'clave_btl'),
          cadena: pickSnapshotString(cadenaSnapshot, 'nombre'),
          receptor:
            pickSnapshotString(dermoSnapshot, 'nombre') ??
            delivery.dermoconsejero_empleado_id ??
            'Sin receptor',
          fotoAcuseUrl: await resolveFirstEvidenceUrl(
            service,
            evidences,
            'ACUSE_FIRMADO',
            evidenceHashLookup
          ),
          fotoEntregaUrl: await resolveFirstEvidenceUrl(
            service,
            evidences,
            'ENTREGA_FISICA',
            evidenceHashLookup
          ),
        };
      })
    );

    return NextResponse.json(
      {
        data: {
          periodo: range.period,
          total: entregas.length,
          truncated: entregas.length >= MAX_PPT_DELIVERIES,
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
