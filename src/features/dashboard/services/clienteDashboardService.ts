import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import type { ActorActual } from '@/lib/auth/session';
import { formatIsoDateInTimezone } from '@/lib/geo/mexicoStateTimezone';

// Definición de Interfaces del Contrato de Datos

export interface ClienteDashboardFilters {
  periodo: string; // Formato YYYY-MM
  cadenaId?: string;
  pdvId?: string;
}

export interface ClienteDashboardKpiSummary {
  totalInventarioInicialCanjes: number;
  totalCanjesEntregados: number;
  porcentajeAvanceCanjes: number;
  totalVentas: number;
  totalLoveIsdin: number;
  totalDesabastos: number;
}

export interface ClienteDashboardMaterialProgress {
  materialId: string;
  materialNombre: string;
  inventarioInicial: number;
  canjesEntregados: number;
  stockActual: number;
  porcentajeAvance: number;
}

export interface ClienteDashboardTrendDay {
  fecha: string; // YYYY-MM-DD
  diaLabel: string; // ej. "01", "02"
  ventas: number;
  canjes: number;
  loveIsdin: number;
  desabasto: number;
}

export interface ClienteDashboardAlertItem {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  pdvId: string;
  pdvNombre: string;
  pdvClaveBtl: string | null;
  supervisorId: string | null;
  supervisorNombre: string;
  motivo: string;
}

export interface ClienteDashboardDesabastoItem {
  id: string;
  fecha: string;
  pdvNombre: string;
  pdvClaveBtl: string | null;
  productoNombre: string;
  observaciones: string | null;
}

export interface ClienteDashboardCatalogOption {
  id: string;
  nombre: string;
}

export interface ClienteDashboardData {
  resumen: ClienteDashboardKpiSummary;
  materiales: ClienteDashboardMaterialProgress[];
  tendencia: ClienteDashboardTrendDay[];
  alertas: ClienteDashboardAlertItem[];
  desabastos: ClienteDashboardDesabastoItem[];
  catalogos: {
    cadenas: ClienteDashboardCatalogOption[];
    tiendas: ClienteDashboardCatalogOption[];
  };
  periodoSeleccionado: string;
  refreshedAt: string;
}

// Helper para fecha de hoy en huso de México
function getTodayIso() {
  return formatIsoDateInTimezone(new Date());
}

export async function obtenerDashboardCliente(
  actor: ActorActual,
  filtros: ClienteDashboardFilters
): Promise<ClienteDashboardData> {
  const accountId = actor.cuentaClienteId;
  const refreshedAt = new Date().toISOString();

  // 1. Validaciones de Inquilino y Fallback de Periodo
  if (!accountId) {
    return buildEmptyDashboardData(filtros.periodo, refreshedAt);
  }

  const supabase = createServiceClient();
  const periodo = filtros.periodo || getTodayIso().slice(0, 7);
  const [anio, mes] = periodo.split('-').map(Number);
  const fechaInicio = `${periodo}-01`;
  const lastDay = new Date(anio, mes, 0).getDate();
  const fechaFin = `${periodo}-${String(lastDay).padStart(2, '0')}`;

  try {
    // 2. Resolver Catálogos de Cadenas y Tiendas para el dropdown de filtrado
    const [cadenasResult, tiendasCatalogResult] = await Promise.all([
      supabase
        .from('cadena')
        .select('id, nombre')
        .order('nombre', { ascending: true }),
      supabase
        .from('pdv')
        .select('id, nombre, cadena_id')
        .eq('cuenta_cliente_id', accountId)
        .eq('estatus', 'ACTIVO')
        .order('nombre', { ascending: true }),
    ]);

    const catalogCadenas: ClienteDashboardCatalogOption[] = (cadenasResult.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
    }));

    const catalogTiendas: ClienteDashboardCatalogOption[] = (tiendasCatalogResult.data ?? []).map((t) => ({
      id: t.id,
      nombre: t.nombre,
    }));

    // 3. Obtener el subconjunto de Tiendas (PDVs) activos bajo el filtro seleccionado
    let pdvQuery = supabase
      .from('pdv')
      .select('id, nombre, clave_btl, cadena_id')
      .eq('cuenta_cliente_id', accountId)
      .eq('estatus', 'ACTIVO');

    if (filtros.cadenaId) {
      pdvQuery = pdvQuery.eq('cadena_id', filtros.cadenaId);
    }
    if (filtros.pdvId) {
      pdvQuery = pdvQuery.eq('id', filtros.pdvId);
    }

    const { data: pdvs, error: pdvsError } = await pdvQuery;
    if (pdvsError || !pdvs || pdvs.length === 0) {
      return {
        ...buildEmptyDashboardData(periodo, refreshedAt),
        catalogos: { cadenas: catalogCadenas, tiendas: catalogTiendas },
      };
    }

    const pdvIds = pdvs.map((p) => p.id);
    const pdvMap = new Map(pdvs.map((p) => [p.id, p]));

    // 4. Carga Paralela de Indicadores y Ledger de Inventario
    const [inventarioResult, capturasResult, allEmployeesResult] = await Promise.all([
      // A. Inventario inicial de materiales de Canje (CARGA_INICIAL / RECEPCION_LOTE)
      supabase
        .from('material_inventario_movimiento')
        .select('material_catalogo_id, cantidad, tipo_movimiento, pdv_id, material_catalogo:material_catalogo_id(id, nombre)')
        .in('pdv_id', pdvIds)
        .in('tipo_movimiento', ['CARGA_INICIAL', 'RECEPCION_LOTE']),
      
      // B. Registros de capturas públicas en el periodo (Ventas, Canjes, Desabastos, Love)
      supabase
        .from('captura_publica_registro')
        .select('id, fecha_operativa, tipo_registro, subtipo_registro, cantidad, pdv_id, pdv_nombre_snapshot, producto_nombre_snapshot, empleado_id, observaciones, created_at, material_catalogo_id')
        .eq('cuenta_cliente_id', accountId)
        .in('pdv_id', pdvIds)
        .gte('fecha_operativa', fechaInicio)
        .lte('fecha_operativa', fechaFin),

      // C. Obtener todos los empleados (Dermoconsejeras y Supervisores) activos de la cuenta
      supabase
        .from('empleado')
        .select('id, nombre_completo, supervisor_empleado_id')
        .eq('cuenta_cliente_id', actor.cuentaClienteId)
        .eq('estatus_laboral', 'ACTIVO'),
    ]);

    const inventarioMovs = inventarioResult.data ?? [];
    const capturas = capturasResult.data ?? [];
    const employees = allEmployeesResult.data ?? [];
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    // 5. Procesamiento de Canjes por Material Físico
    const materialMap = new Map<string, { id: string; nombre: string; inicial: number; entregados: number }>();

    // Inicializar materiales con sus saldos de inventario inicial
    for (const mov of inventarioMovs) {
      const mat = mov.material_catalogo as any;
      if (!mat) continue;

      const mId = mat.id;
      const mNombre = mat.nombre;
      const current = materialMap.get(mId) ?? { id: mId, nombre: mNombre, inicial: 0, entregados: 0 };
      current.inicial += mov.cantidad;
      materialMap.set(mId, current);
    }

    // Acumular canjes reales desde las capturas
    const canjesFiltrados = capturas.filter((c) => c.tipo_registro === 'CANJE');
    for (const c of canjesFiltrados) {
      if (!c.material_catalogo_id) continue;
      const mId = c.material_catalogo_id;
      const current = materialMap.get(mId) ?? { id: mId, nombre: 'Material de Canje', inicial: 0, entregados: 0 };
      current.entregados += c.cantidad ?? 0;
      materialMap.set(mId, current);
    }

    // Convertir mapa a arreglo y calcular saldos
    const materialesProgress: ClienteDashboardMaterialProgress[] = Array.from(materialMap.values()).map((m) => {
      const stockActual = Math.max(0, m.inicial - m.entregados);
      const porcentajeAvance = m.inicial > 0 ? Math.round((m.entregados / m.inicial) * 10000) / 100 : 0;
      return {
        materialId: m.id,
        materialNombre: m.nombre,
        inventarioInicial: m.inicial,
        canjesEntregados: m.entregados,
        stockActual,
        porcentajeAvance,
      };
    }).sort((a, b) => b.inventarioInicial - a.inventarioInicial);

    // Totales globales de Canjes
    let totalInventarioInicialCanjes = 0;
    let totalCanjesEntregados = 0;
    for (const m of materialesProgress) {
      totalInventarioInicialCanjes += m.inventarioInicial;
      totalCanjesEntregados += m.canjesEntregados;
    }
    const porcentajeAvanceCanjes = totalInventarioInicialCanjes > 0
      ? Math.round((totalCanjesEntregados / totalInventarioInicialCanjes) * 10000) / 100
      : 0;

    // 6. Procesamiento de KPI de Ventas, Love ISDIN y Desabasto
    let totalVentas = 0;
    let totalLoveIsdin = 0;
    let totalDesabastos = 0;
    const desabastosList: ClienteDashboardDesabastoItem[] = [];

    for (const c of capturas) {
      if (c.tipo_registro === 'VENTA') {
        totalVentas += c.cantidad ?? 0;
      } else if (c.tipo_registro === 'LOVE_ISDIN') {
        totalLoveIsdin += c.cantidad ?? 1;
      } else if (c.tipo_registro === 'DESABASTO') {
        totalDesabastos++;
        const pdvSnap = pdvMap.get(c.pdv_id);
        desabastosList.push({
          id: c.id,
          fecha: c.fecha_operativa,
          pdvNombre: c.pdv_nombre_snapshot,
          pdvClaveBtl: pdvSnap?.clave_btl ?? null,
          productoNombre: c.producto_nombre_snapshot ?? 'Producto Desconocido',
          observaciones: c.observaciones,
        });
      }
    }

    const resumen: ClienteDashboardKpiSummary = {
      totalInventarioInicialCanjes,
      totalCanjesEntregados,
      porcentajeAvanceCanjes,
      totalVentas,
      totalLoveIsdin,
      totalDesabastos,
    };

    // 7. Agrupación Histórica (Tendencia día a día)
    const trendMap = new Map<string, ClienteDashboardTrendDay>();
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${periodo}-${String(d).padStart(2, '0')}`;
      trendMap.set(dateStr, {
        fecha: dateStr,
        diaLabel: String(d).padStart(2, '0'),
        ventas: 0,
        canjes: 0,
        loveIsdin: 0,
        desabasto: 0,
      });
    }

    for (const c of capturas) {
      const currentTrend = trendMap.get(c.fecha_operativa);
      if (!currentTrend) continue;

      if (c.tipo_registro === 'VENTA') {
        currentTrend.ventas += c.cantidad ?? 0;
      } else if (c.tipo_registro === 'CANJE') {
        currentTrend.canjes += c.cantidad ?? 0;
      } else if (c.tipo_registro === 'LOVE_ISDIN') {
        currentTrend.loveIsdin += c.cantidad ?? 1;
      } else if (c.tipo_registro === 'DESABASTO') {
        currentTrend.desabasto++;
      }
    }
    const tendencia = Array.from(trendMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // 8. Alertas de Registro del Día de Hoy (Dermoconsejeras Programadas con Cero Capturas hoy)
    const alertas: ClienteDashboardAlertItem[] = [];
    const todayIso = getTodayIso();

    // Consultar las asignaciones resueltas de hoy en tiendas filtradas
    const { data: assignmentsToday } = await supabase
      .from('asignacion_diaria_resuelta')
      .select('empleado_id, pdv_id, supervisor_empleado_id, trabaja_en_tienda')
      .eq('fecha', todayIso)
      .eq('trabaja_en_tienda', true)
      .eq('cuenta_cliente_id', accountId)
      .in('pdv_id', pdvIds);

    if (assignmentsToday && assignmentsToday.length > 0) {
      // Obtener el conteo de capturas registradas hoy por empleado
      const { data: capturasToday } = await supabase
        .from('captura_publica_registro')
        .select('empleado_id')
        .eq('fecha_operativa', todayIso)
        .eq('cuenta_cliente_id', accountId)
        .in('pdv_id', pdvIds);

      const capturasCountByEmployee = new Map<string, number>();
      for (const cap of capturasToday ?? []) {
        const count = capturasCountByEmployee.get(cap.empleado_id) ?? 0;
        capturasCountByEmployee.set(cap.empleado_id, count + 1);
      }

      // Identificar omisiones de captura (dermoconsejeras programadas con 0 capturas registradas)
      for (const asg of assignmentsToday) {
        const empId = asg.empleado_id;
        const totalCap = capturasCountByEmployee.get(empId) ?? 0;

        if (totalCap === 0) {
          const emp = employeeMap.get(empId);
          const pdv = pdvMap.get(asg.pdv_id);
          const supervisor = asg.supervisor_empleado_id ? employeeMap.get(asg.supervisor_empleado_id) : null;

          alertas.push({
            id: `alert:${empId}:${asg.pdv_id}`,
            empleadoId: empId,
            empleadoNombre: emp?.nombre_completo ?? 'Dermoconsejera sin nombre',
            pdvId: asg.pdv_id,
            pdvNombre: pdv?.nombre ?? 'Tienda Desconocida',
            pdvClaveBtl: pdv?.clave_btl ?? null,
            supervisorId: asg.supervisor_empleado_id,
            supervisorNombre: supervisor?.nombre_completo ?? 'Sin supervisor asignado',
            motivo: 'Dermoconsejera asignada hoy en este punto de venta sin registros de actividad reportados en el portal.',
          });
        }
      }
    }

    return {
      resumen,
      materiales: materialesProgress,
      tendencia,
      alertas,
      desabastos: desabastosList.sort((a, b) => b.fecha.localeCompare(a.fecha)),
      catalogos: {
        cadenas: catalogCadenas,
        tiendas: catalogTiendas,
      },
      periodoSeleccionado: periodo,
      refreshedAt,
    };
  } catch (error) {
    console.error('[clienteDashboardService] Error consolidando dashboard de cliente:', error);
    return buildEmptyDashboardData(periodo, refreshedAt);
  }
}

function buildEmptyDashboardData(periodo: string, refreshedAt: string): ClienteDashboardData {
  return {
    resumen: {
      totalInventarioInicialCanjes: 0,
      totalCanjesEntregados: 0,
      porcentajeAvanceCanjes: 0,
      totalVentas: 0,
      totalLoveIsdin: 0,
      totalDesabastos: 0,
    },
    materiales: [],
    tendencia: [],
    alertas: [],
    desabastos: [],
    catalogos: {
      cadenas: [],
      tiendas: [],
    },
    periodoSeleccionado: periodo,
    refreshedAt,
  };
}
