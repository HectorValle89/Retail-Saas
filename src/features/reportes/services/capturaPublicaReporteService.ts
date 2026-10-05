import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';

export interface CapturaPublicaReporteItem {
  id: string;
  fechaOperativa: string;
  tipoRegistro: string;
  subtipoRegistro: string | null;
  estatusRegistro: string;
  dc: string;
  pdv: string;
  pdvClave: string;
  empleadoClave: string;
  producto: string | null;
  material: string | null;
  cantidad: number | null;
  monto: number | null;

  observaciones: string | null;
  fotoEvidenciaUrl: string | null;
  createdAt: string;
}

export interface CapturaPublicaReporteResumen {
  totalRegistros: number;
  totalVentas: number;
  totalCanjes: number;
  totalDesabasto: number;
  totalLoveIsdin: number;
  loveExitosos: number;
  loveFallidos: number;
  canjesConTicket: number;
  canjesSinTicket: number;
  canjesFueraJornada: number;
}

export interface CapturaPublicaReporteData {
  items: CapturaPublicaReporteItem[];
  resumen: CapturaPublicaReporteResumen;
  total: number;
}

export async function obtenerReporteCapturaPublica(
  cuentaClienteId: string,
  periodo: string,
  pageSize = 50,
  page = 1,
  tipoFiltro?: string,
  supervisorEmpleadoId?: string
): Promise<CapturaPublicaReporteData> {
  const supabase = createServiceClient();

  // Derivar rango de fechas desde periodo YYYY-MM
  const [anio, mes] = periodo.split('-').map(Number);
  const fechaInicio = `${periodo}-01`;
  const lastDay = new Date(anio, mes, 0).getDate();
  const fechaFin = `${periodo}-${String(lastDay).padStart(2, '0')}`;

  const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;

  let rows: any[] = [];
  let totalCount = 0;

  if (pageSize === -1) {
    let pageNum = 1;
    const PAGE_SIZE = 1000;
    while (true) {
      const pageOffset = (pageNum - 1) * PAGE_SIZE;

      let selectFields = `id, fecha_operativa, tipo_registro, subtipo_registro, estatus,
           empleado_nombre_snapshot, pdv_nombre_snapshot,
           producto_nombre_snapshot, material_nombre_snapshot,
           cantidad, monto, observaciones, foto_evidencia_url, created_at,
           pdv:pdv_id(clave_btl),`;
      selectFields += `supervisor_empleado_id, empleado:empleado_id(id_nomina, usuario:usuario!usuario_empleado_id_fkey(username))`;

      let query = supabase
        .from('captura_publica_registro')
        .select(selectFields)
        .eq('cuenta_cliente_id', cuentaClienteId)
        .gte('fecha_operativa', fechaInicio)
        .lte('fecha_operativa', fechaFin)
        .order('fecha_operativa', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);

      if (tipoFiltro && tipoFiltro !== 'TODOS') {
        query = query.eq('tipo_registro', tipoFiltro);
      }

      if (supervisorEmpleadoId) {
        query = query.eq('supervisor_empleado_id', supervisorEmpleadoId);
      }

      const { data, error } = await query;
      if (error) {
        console.error(
          '[capturaPublicaReporteService] Error al obtener registros en paginación:',
          error.message
        );
        break;
      }
      if (!data || data.length === 0) break;
      rows = rows.concat(data);
      if (data.length < PAGE_SIZE) break;
      pageNum++;
    }
    totalCount = rows.length;
  } else {
    let selectFields = `id, fecha_operativa, tipo_registro, subtipo_registro, estatus,
         empleado_nombre_snapshot, pdv_nombre_snapshot,
         producto_nombre_snapshot, material_nombre_snapshot,
         cantidad, monto, observaciones, foto_evidencia_url, created_at,
         pdv:pdv_id(clave_btl),`;
    selectFields += `supervisor_empleado_id, empleado:empleado_id(id_nomina, usuario:usuario!usuario_empleado_id_fkey(username))`;

    let query = supabase
      .from('captura_publica_registro')
      .select(selectFields, { count: 'exact' })
      .eq('cuenta_cliente_id', cuentaClienteId)
      .gte('fecha_operativa', fechaInicio)
      .lte('fecha_operativa', fechaFin)
      .order('fecha_operativa', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (tipoFiltro && tipoFiltro !== 'TODOS') {
      query = query.eq('tipo_registro', tipoFiltro);
    }

    if (supervisorEmpleadoId) {
      query = query.eq('supervisor_empleado_id', supervisorEmpleadoId);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[capturaPublicaReporteService] Error al obtener registros:', error.message);
      return {
        items: [],
        resumen: emptyResumen(),
        total: 0,
      };
    }
    rows = data ?? [];
    totalCount = count ?? 0;
  }

  // Helper local para consultas de conteo de resumen
  function buildCountQuery(tipo?: string, subtipo?: string) {
    let query = supabase
      .from('captura_publica_registro')
      .select('id', { count: 'exact', head: true })
      .eq('cuenta_cliente_id', cuentaClienteId)
      .gte('fecha_operativa', fechaInicio)
      .lte('fecha_operativa', fechaFin);

    if (tipo) {
      query = query.eq('tipo_registro', tipo);
    }
    if (subtipo) {
      query = query.eq('subtipo_registro', subtipo);
    }
    if (supervisorEmpleadoId) {
      query = query.eq('supervisor_empleado_id', supervisorEmpleadoId);
    }
    return query;
  }

  // Calcular resumen usando consultas de conteo exacto en paralelo para evitar límites de PostgREST
  const [
    totalRes,
    ventasRes,
    sinVentasRes,
    canjesRes,
    canjesConTicketRes,
    canjesSinTicketRes,
    canjesFueraJornadaRes,
    desabastosRes,
    loveRes,
    loveExitososRes,
    loveFallidosRes,
  ] = await Promise.all([
    buildCountQuery(),
    buildCountQuery('VENTA'),
    buildCountQuery('VENTA', 'SIN_VENTAS'),
    buildCountQuery('CANJE'),
    buildCountQuery('CANJE', 'CANJE_CON_TICKET'),
    buildCountQuery('CANJE', 'CANJE_SIN_TICKET'),
    buildCountQuery('CANJE', 'CANJE_FUERA_JORNADA'),
    buildCountQuery('DESABASTO'),
    buildCountQuery('LOVE_ISDIN'),
    buildCountQuery('LOVE_ISDIN', 'LOVE_EXITOSO'),
    buildCountQuery('LOVE_ISDIN', 'LOVE_FALLIDO'),
  ]);

  const resumen: CapturaPublicaReporteResumen = {
    totalRegistros: totalRes.count ?? 0,
    totalVentas: (ventasRes.count ?? 0) - (sinVentasRes.count ?? 0),
    totalCanjes: canjesRes.count ?? 0,
    totalDesabasto: desabastosRes.count ?? 0,
    totalLoveIsdin: loveExitososRes.count ?? 0,
    loveExitosos: loveExitososRes.count ?? 0,
    loveFallidos: loveFallidosRes.count ?? 0,
    canjesConTicket: canjesConTicketRes.count ?? 0,
    canjesSinTicket: canjesSinTicketRes.count ?? 0,
    canjesFueraJornada: canjesFueraJornadaRes.count ?? 0,
  };

  const items: CapturaPublicaReporteItem[] = rows.map((r: any) => {
    const pdvRel = r.pdv;
    const empRel = r.empleado;
    const usrRel = Array.isArray(empRel?.usuario) ? empRel.usuario[0] : empRel?.usuario;

    return {
      id: r.id,
      fechaOperativa: r.fecha_operativa,
      tipoRegistro: r.tipo_registro,
      subtipoRegistro: r.subtipo_registro ?? null,
      estatusRegistro: r.estatus,
      dc: r.empleado_nombre_snapshot,
      pdv: r.pdv_nombre_snapshot,
      pdvClave: pdvRel?.clave_btl ?? '—',
      empleadoClave: usrRel?.username ?? empRel?.id_nomina ?? '—',
      producto: r.producto_nombre_snapshot ?? null,
      material: r.material_nombre_snapshot ?? null,
      cantidad: r.cantidad ?? null,
      monto: r.monto ?? null,

      observaciones: r.observaciones ?? null,
      fotoEvidenciaUrl: r.foto_evidencia_url ?? null,
      createdAt: r.created_at,
    };
  });

  return { items, resumen, total: totalCount };
}

function emptyResumen(): CapturaPublicaReporteResumen {
  return {
    totalRegistros: 0,
    totalVentas: 0,
    totalCanjes: 0,
    totalDesabasto: 0,
    totalLoveIsdin: 0,
    loveExitosos: 0,
    loveFallidos: 0,
    canjesConTicket: 0,
    canjesSinTicket: 0,
    canjesFueraJornada: 0,
  };
}