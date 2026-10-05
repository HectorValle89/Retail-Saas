'use server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SINGLE_TENANT_ACCOUNT_ID, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant';

import {
  filtrarYCalcularCanjes,
  type CanjesMetrics,
  type CanjeRecordItem,
  type CanjesDataResponse,
} from '../lib/canjesCalculation';

export type { CanjesMetrics, CanjeRecordItem, CanjesDataResponse };

export async function obtenerDatosCanjes(options: {
  fechaInicio: string;
  fechaFin: string;
  subtipoFilter?: string;
  cadenaFilter?: string;
  searchQuery?: string;
  page?: number;
  pageSize?: number;
}): Promise<CanjesDataResponse> {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);
    const service = createServiceClient();

    const effectiveAccountId =
      actor.cuentaClienteId ??
      (isSingleTenantBackendEnabled() ? SINGLE_TENANT_ACCOUNT_ID : null);

    const { fechaInicio, fechaFin } = options;

    // Obtener catálogo de cadenas activas para alimentar el selector
    const { data: cadenasData } = await service
      .from('cadena')
      .select('nombre')
      .eq('activa', true)
      .order('nombre', { ascending: true });

    const catalogoCadenas = (cadenasData ?? [])
      .map((c: any) => c.nombre)
      .filter((n: string | null): n is string => Boolean(n));

    const PAGE_CHUNK_SIZE = 1000;
    let all: any[] = [];
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
          subtipo_registro,
          empleado_nombre_snapshot,
          pdv_nombre_snapshot,
          material_nombre_snapshot,
          cantidad,
          foto_evidencia_url,
          observaciones,
          pdv:pdv_id(nombre, clave_btl, cadena:cadena_id(id, nombre))
        `
        )
        .eq('tipo_registro', 'CANJE')
        .gte('fecha_operativa', fechaInicio)
        .lte('fecha_operativa', fechaFin)
        .order('fecha_operativa', { ascending: false })
        .range(fromOffset, toOffset);

      if (effectiveAccountId) {
        query = query.eq('cuenta_cliente_id', effectiveAccountId);
      }

      const { data: pageData, error } = await query;

      if (error) {
        console.error('[CanjesService] Error consultando canjes:', error);
        return {
          ok: false,
          metrics: {
            conTicketCount: 0,
            conTicketPiezas: 0,
            sinTicketCount: 0,
            sinTicketPiezas: 0,
            fueraJornadaCount: 0,
            fueraJornadaPiezas: 0,
            totalCount: 0,
            totalPiezas: 0,
          },
          records: [],
          totalRecords: 0,
          cadenasDisponibles: catalogoCadenas,
          message: error.message,
        };
      }

      if (!pageData || pageData.length === 0) {
        break;
      }

      all = all.concat(pageData);

      if (pageData.length < PAGE_CHUNK_SIZE) {
        break;
      }

      pageIndex++;
    }

    const { metrics, records, totalRecords, cadenasDisponibles } = filtrarYCalcularCanjes(
      all,
      options,
      catalogoCadenas
    );

    return {
      ok: true,
      metrics,
      records,
      totalRecords,
      cadenasDisponibles,
    };
  } catch (err) {
    console.error('[CanjesService] Error general:', err);
    return {
      ok: false,
      metrics: {
        conTicketCount: 0,
        conTicketPiezas: 0,
        sinTicketCount: 0,
        sinTicketPiezas: 0,
        fueraJornadaCount: 0,
        fueraJornadaPiezas: 0,
        totalCount: 0,
        totalPiezas: 0,
      },
      records: [],
      totalRecords: 0,
      cadenasDisponibles: [],
      message: err instanceof Error ? err.message : 'Error desconocido.',
    };
  }
}
