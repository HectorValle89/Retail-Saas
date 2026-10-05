import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import type { ActorActual } from '@/lib/auth/session';
import { formatIsoDateInTimezone } from '@/lib/geo/mexicoStateTimezone';

// Definición de Interfaces del Contrato de Datos

export interface ClienteDashboardFilters {
  periodo: string; // Formato YYYY-MM
  cadenaId?: string;
  pdvId?: string;
  supervisorId?: string; // Nuevo filtro
  fecha?: string; // Nuevo filtro de día específico
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
  tipo?: 'vacio' | 'incompleto' | 'cumplido';
  totalCapturas?: number;
  ventasOLove?: number;
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

export interface ClienteDashboardSupervisorProgress {
  id: string;
  nombre: string;
  totalProgramadas: number;
  totalCumplidas: number;
  porcentaje: number;
  completado100: boolean;
}

export interface ClienteDashboardData {
  resumen: ClienteDashboardKpiSummary;
  materiales: ClienteDashboardMaterialProgress[];
  tendencia: ClienteDashboardTrendDay[];
  alertas: ClienteDashboardAlertItem[];
  cumplidas?: ClienteDashboardAlertItem[];
  desabastos: ClienteDashboardDesabastoItem[];
  supervisoresProgress?: ClienteDashboardSupervisorProgress[];
  catalogos: {
    cadenas: ClienteDashboardCatalogOption[];
    tiendas: ClienteDashboardCatalogOption[];
    supervisores: ClienteDashboardCatalogOption[]; // Catálogo de supervisores
  };
  periodoSeleccionado: string;
  fechaSeleccionada?: string | null;
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
    // 2. Resolver Catálogos de Cadenas, Tiendas y Supervisores para el dropdown de filtrado
    const [cadenasResult, tiendasCatalogResult, supervisoresResult] = await Promise.all([
      supabase
        .from('cadena')
        .select('id, nombre')
        .order('nombre', { ascending: true }),
      supabase
        .from('cuenta_cliente_pdv')
        .select('pdv_id, pdv:pdv_id(id, nombre, estatus, clave_btl, cadena_id)')
        .eq('cuenta_cliente_id', accountId)
        .eq('activo', true),
      supabase
        .from('empleado')
        .select('id, nombre_completo')
        .eq('puesto', 'SUPERVISOR')
        .eq('estatus_laboral', 'ACTIVO')
        .order('nombre_completo', { ascending: true }),
    ]);

    const catalogCadenas: ClienteDashboardCatalogOption[] = (cadenasResult.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
    }));

    const catalogSupervisores: ClienteDashboardCatalogOption[] = (supervisoresResult.data ?? [])
      .filter((s) => {
        const name = (s.nombre_completo ?? '').trim().toLowerCase();
        return !name.startsWith('test ') && !name.startsWith('test_');
      })
      .map((s) => ({
        id: s.id,
        nombre: s.nombre_completo,
      }));

    const rawTiendas = (tiendasCatalogResult.data ?? [])
      .map((r: any) => {
        const pdv = Array.isArray(r.pdv) ? r.pdv[0] : r.pdv;
        return pdv ? { id: pdv.id, nombre: pdv.nombre, estatus: pdv.estatus, clave_btl: pdv.clave_btl, cadena_id: pdv.cadena_id } : null;
      })
      .filter((t): t is { id: string; nombre: string; estatus: string; clave_btl: string | null; cadena_id: string } => Boolean(t));

    const catalogTiendas: ClienteDashboardCatalogOption[] = rawTiendas
      .filter((t) => t.estatus === 'ACTIVO')
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    // 3. Obtener el subconjunto de Tiendas (PDVs) activos bajo el filtro seleccionado
    let activePdvs = rawTiendas.filter((t) => t.estatus === 'ACTIVO');

    if (filtros.cadenaId) {
      activePdvs = activePdvs.filter((t) => t.cadena_id === filtros.cadenaId);
    }
    if (filtros.pdvId) {
      activePdvs = activePdvs.filter((t) => t.id === filtros.pdvId);
    }

    // Filtro por Supervisor en tiendas asignadas y equipo
    let teamPdvIds: Set<string> | null = null;
    let supervisorEquipoIds: Set<string> | null = null;

    if (filtros.supervisorId) {
      // 1. Obtener PDVs y dermoconsejeras del equipo directo del supervisor
      const [supPdvsResult, supAsigsResult, teamEmployeesResult] = await Promise.all([
        supabase
          .from('supervisor_pdv')
          .select('pdv_id')
          .eq('empleado_id', filtros.supervisorId)
          .eq('activo', true),
        supabase
          .from('asignacion')
          .select('pdv_id, empleado_id')
          .eq('cuenta_cliente_id', accountId)
          .eq('supervisor_empleado_id', filtros.supervisorId)
          .eq('estado_publicacion', 'PUBLICADA')
          .lte('fecha_inicio', fechaFin)
          .or(`fecha_fin.is.null,fecha_fin.gte.${fechaInicio}`),
        supabase
          .from('empleado')
          .select('id')
          .eq('cuenta_cliente_id', accountId)
          .eq('supervisor_empleado_id', filtros.supervisorId)
          .eq('estatus_laboral', 'ACTIVO'),
      ]);

      const pdvIdsFromSup = (supPdvsResult.data ?? []).map((p) => p.pdv_id);
      const pdvIdsFromAsig = (supAsigsResult.data ?? []).map((a) => a.pdv_id);
      const allSupPdvIds = Array.from(new Set([...pdvIdsFromSup, ...pdvIdsFromAsig]));

      const directDermoIds = (supAsigsResult.data ?? []).map((a) => a.empleado_id);
      const directEmployeeIds = (teamEmployeesResult.data ?? []).map((e) => e.id);

      const uniqueTeamEmpIds = Array.from(new Set([...directDermoIds, ...directEmployeeIds]));
      supervisorEquipoIds = new Set(uniqueTeamEmpIds);
      teamPdvIds = new Set(allSupPdvIds);

      // Acotar las tiendas activas del dashboard a las de su equipo
      if (teamPdvIds.size > 0) {
        activePdvs = activePdvs.filter((p) => teamPdvIds!.has(p.id));
      }
    }

    if (activePdvs.length === 0) {
      return {
        ...buildEmptyDashboardData(periodo, refreshedAt),
        catalogos: {
          cadenas: catalogCadenas,
          tiendas: catalogTiendas,
          supervisores: catalogSupervisores,
        },
      };
    }

    const pdvs = activePdvs;
    const pdvIds = pdvs.map((p) => p.id);
    const pdvMap = new Map(pdvs.map((p) => [p.id, p]));

    // 4. Carga Paralela de Indicadores y Empleados
    const [inventarioResult, allEmployeesResult] = await Promise.all([
      // A. Inventario inicial de materiales de Canje (CARGA_INICIAL / RECEPCION_LOTE)
      supabase
        .from('material_inventario_movimiento')
        .select('material_catalogo_id, cantidad, tipo_movimiento, pdv_id, created_at, material_catalogo:material_catalogo_id(id, nombre)')
        .in('pdv_id', pdvIds)
        .in('tipo_movimiento', ['CARGA_INICIAL', 'RECEPCION_LOTE']),

      // B. Obtener todos los empleados (Dermoconsejeras y Supervisores) activos de la cuenta
      supabase
        .from('empleado')
        .select('id, nombre_completo, supervisor_empleado_id, puesto, estatus_laboral')
        .eq('estatus_laboral', 'ACTIVO'),
    ]);

    const inventarioMovs = inventarioResult.data ?? [];
    const employees = allEmployeesResult.data ?? [];

    // C. Bucle de Paginación de Capturas Públicas optimizado
    let capturas: any[] = [];
    if (!filtros.supervisorId || (supervisorEquipoIds && supervisorEquipoIds.size > 0)) {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const pageOffset = page * PAGE_SIZE;
        let query = supabase
          .from('captura_publica_registro')
          .select('id, fecha_operativa, tipo_registro, subtipo_registro, cantidad, pdv_id, pdv_nombre_snapshot, producto_nombre_snapshot, material_nombre_snapshot, empleado_id, observaciones, created_at, material_catalogo_id')
          .eq('cuenta_cliente_id', accountId)
          .gte('fecha_operativa', fechaInicio)
          .lte('fecha_operativa', fechaFin);

        if (supervisorEquipoIds && supervisorEquipoIds.size > 0) {
          query = query.in('empleado_id', Array.from(supervisorEquipoIds));
        } else if (pdvIds.length > 0) {
          query = query.in('pdv_id', pdvIds);
        }

        query = query.range(pageOffset, pageOffset + PAGE_SIZE - 1);

        const { data: pageData, error: pageErr } = await query;

        if (pageErr) {
          console.error('[clienteDashboardService] Error paginando capturas públicas:', pageErr.message);
          break;
        }
        if (!pageData || pageData.length === 0) break;
        capturas = capturas.concat(pageData);
        if (pageData.length < PAGE_SIZE) break;
        page++;
      }
    }
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    // Encontrar la fecha de carga inicial más reciente de cada PDV
    const pdvCorteGlobalMap = new Map<string, string>();
    const cargasIniciales = inventarioMovs.filter((m) => m.tipo_movimiento === 'CARGA_INICIAL');
    for (const mov of cargasIniciales) {
      const createdStr = new Date(mov.created_at || '').toISOString();
      const actual = pdvCorteGlobalMap.get(mov.pdv_id);
      if (!actual || createdStr > actual) {
        pdvCorteGlobalMap.set(mov.pdv_id, createdStr);
      }
    }

    // 5. Procesamiento de Canjes por Material Físico
    const materialMap = new Map<string, { id: string; nombre: string; inicial: number; entregados: number }>();

    // Inicializar materiales con sus saldos de inventario inicial
    for (const mov of inventarioMovs) {
      const pdvCorteGlobal = pdvCorteGlobalMap.get(mov.pdv_id);
      const createdStr = new Date(mov.created_at || '').toISOString();

      // Regla de reset de inventario: si el PDV tiene una Carga Inicial (Junio),
      // se ignora cualquier movimiento anterior (ej. recepciones heredadas de mayo).
      if (pdvCorteGlobal && createdStr < pdvCorteGlobal) {
        continue;
      }

      const mat = mov.material_catalogo as any;
      if (!mat) continue;

      const mId = mat.id;
      const mNombre = mat.nombre;
      const current = materialMap.get(mId) ?? { id: mId, nombre: mNombre, inicial: 0, entregados: 0 };
      current.inicial += mov.cantidad;
      materialMap.set(mId, current);
    }

    // Guardar las entregas acumuladas del mes para el stock restante físico correcto
    const entregadosMesMap = new Map<string, number>();
    for (const c of capturas.filter((c) => c.tipo_registro === 'CANJE')) {
      if (!c.material_catalogo_id) continue;
      entregadosMesMap.set(c.material_catalogo_id, (entregadosMesMap.get(c.material_catalogo_id) ?? 0) + (c.cantidad ?? 0));
    }

    // Filtrar capturas al día seleccionado si existe para los KPIs y el avance
    let capturasFiltradasDia = capturas;
    if (filtros.fecha) {
      capturasFiltradasDia = capturas.filter((c) => c.fecha_operativa === filtros.fecha);
    }

    // Acumular canjes reales desde las capturas (filtradas por fecha)
    const canjesFiltrados = capturasFiltradasDia.filter((c) => c.tipo_registro === 'CANJE');
    for (const c of canjesFiltrados) {
      if (!c.material_catalogo_id) continue;
      const mId = c.material_catalogo_id;
      const mNombre = c.material_nombre_snapshot || 'Material de Canje';
      const current = materialMap.get(mId) ?? { id: mId, nombre: mNombre, inicial: 0, entregados: 0 };
      current.entregados += c.cantidad ?? 0;
      materialMap.set(mId, current);
    }

    // Convertir mapa a arreglo y calcular saldos
    const materialesProgress: ClienteDashboardMaterialProgress[] = Array.from(materialMap.values()).map((m) => {
      const entregadosDelMes = entregadosMesMap.get(m.id) ?? 0;
      const stockActual = Math.max(0, m.inicial - entregadosDelMes);
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

    // 6. Procesamiento de KPI de Ventas, Love ISDIN y Desabasto (filtrado por fecha)
    let totalVentas = 0;
    let totalLoveIsdin = 0;
    let totalDesabastos = 0;
    const desabastosList: ClienteDashboardDesabastoItem[] = [];

    for (const c of capturasFiltradasDia) {
      if (c.tipo_registro === 'VENTA') {
        totalVentas += c.cantidad ?? 0;
      } else if (c.tipo_registro === 'LOVE_ISDIN') {
        if (c.subtipo_registro === 'LOVE_EXITOSO') {
          totalLoveIsdin += c.cantidad ?? 1;
        }
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
        if (c.subtipo_registro === 'LOVE_EXITOSO') {
          currentTrend.loveIsdin += c.cantidad ?? 1;
        }
      } else if (c.tipo_registro === 'DESABASTO') {
        currentTrend.desabasto++;
      }
    }
    const tendencia = Array.from(trendMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // 8. Alertas de Registro y Avance Diario por Supervisor
    const alertas: ClienteDashboardAlertItem[] = [];
    const fechaDia = filtros.fecha || getTodayIso();

    // Consultar las asignaciones resueltas de la fecha en tiendas filtradas
    let assignmentsTodayQuery = supabase
      .from('asignacion_diaria_resuelta')
      .select('empleado_id, pdv_id, supervisor_empleado_id, trabaja_en_tienda')
      .eq('fecha', fechaDia)
      .eq('trabaja_en_tienda', true)
      .eq('cuenta_cliente_id', accountId);

    if (filtros.supervisorId) {
      assignmentsTodayQuery = assignmentsTodayQuery.eq('supervisor_empleado_id', filtros.supervisorId);
      if (filtros.pdvId) {
        assignmentsTodayQuery = assignmentsTodayQuery.eq('pdv_id', filtros.pdvId);
      }
    } else if (pdvIds.length > 0) {
      assignmentsTodayQuery = assignmentsTodayQuery.in('pdv_id', pdvIds);
    }

    const { data: assignmentsToday } = await assignmentsTodayQuery;

    // Obtener el conteo de capturas registradas en la fecha por empleado
    let capturasCountByEmployee = new Map<string, { total: number; ventasOLove: number }>();
    const cumplidas: ClienteDashboardAlertItem[] = [];

    if (assignmentsToday && assignmentsToday.length > 0) {
      const capturasToday = await obtenerCapturasDiaCompleto(
        supabase,
        accountId,
        fechaDia,
        filtros.supervisorId ? undefined : pdvIds,
        supervisorEquipoIds && supervisorEquipoIds.size > 0 ? Array.from(supervisorEquipoIds) : undefined
      );

      for (const cap of capturasToday ?? []) {
        const empId = cap.empleado_id;
        const current = capturasCountByEmployee.get(empId) ?? { total: 0, ventasOLove: 0 };
        current.total++;
        if (cap.tipo_registro === 'VENTA' || cap.tipo_registro === 'LOVE_ISDIN') {
          current.ventasOLove++;
        }
        capturasCountByEmployee.set(empId, current);
      }

      // Identificar omisiones de captura (0 capturas) o registros incompletos (sin ventas ni love isdin)
      for (const asg of assignmentsToday) {
        const empId = asg.empleado_id;

        // Si hay un supervisor seleccionado, filtramos para que solo aparezcan alertas de su propio equipo
        if (filtros.supervisorId) {
          if (asg.supervisor_empleado_id && asg.supervisor_empleado_id !== filtros.supervisorId) {
            continue;
          }
          if (supervisorEquipoIds && !supervisorEquipoIds.has(empId)) {
            continue;
          }
        }

        const capInfo = capturasCountByEmployee.get(empId) ?? { total: 0, ventasOLove: 0 };
        const emp = employeeMap.get(empId);
        const pdv = pdvMap.get(asg.pdv_id);
        const supervisorIdResuelto = asg.supervisor_empleado_id || filtros.supervisorId || null;
        const supervisor = supervisorIdResuelto ? employeeMap.get(supervisorIdResuelto) : null;

        if (capInfo.total === 0 || capInfo.ventasOLove === 0) {
          const tipo = capInfo.total === 0 ? 'vacio' : 'incompleto';
          const motivo = tipo === 'vacio'
            ? 'Sin reportes enviados hoy'
            : 'Falta reporte de Ventas o Love ISDIN';

          alertas.push({
            id: `alert:${empId}:${asg.pdv_id}`,
            empleadoId: empId,
            empleadoNombre: emp?.nombre_completo ?? 'Dermoconsejera sin nombre',
            pdvId: asg.pdv_id,
            pdvNombre: pdv?.nombre ?? 'Tienda Desconocida',
            pdvClaveBtl: pdv?.clave_btl ?? null,
            supervisorId: supervisorIdResuelto,
            supervisorNombre: supervisor?.nombre_completo ?? 'Sin supervisor asignado',
            motivo,
            tipo,
            totalCapturas: capInfo.total,
            ventasOLove: capInfo.ventasOLove,
          });
        } else {
          cumplidas.push({
            id: `cumplido:${empId}:${asg.pdv_id}`,
            empleadoId: empId,
            empleadoNombre: emp?.nombre_completo ?? 'Dermoconsejera sin nombre',
            pdvId: asg.pdv_id,
            pdvNombre: pdv?.nombre ?? 'Tienda Desconocida',
            pdvClaveBtl: pdv?.clave_btl ?? null,
            supervisorId: supervisorIdResuelto,
            supervisorNombre: supervisor?.nombre_completo ?? 'Sin supervisor asignado',
            motivo: `Reporte enviado (${capInfo.ventasOLove} ventas/love)`,
            tipo: 'cumplido',
            totalCapturas: capInfo.total,
            ventasOLove: capInfo.ventasOLove,
          });
        }
      }
    }

    // 9. Calcular Avance de Cumplimiento Diario por Supervisor
    let globalAssignmentsQuery = supabase
      .from('asignacion_diaria_resuelta')
      .select('empleado_id, pdv_id, supervisor_empleado_id')
      .eq('fecha', fechaDia)
      .eq('trabaja_en_tienda', true)
      .eq('cuenta_cliente_id', accountId);

    if (filtros.supervisorId) {
      globalAssignmentsQuery = globalAssignmentsQuery.eq('supervisor_empleado_id', filtros.supervisorId);
      if (filtros.pdvId) {
        globalAssignmentsQuery = globalAssignmentsQuery.eq('pdv_id', filtros.pdvId);
      }
    } else if (pdvIds.length > 0) {
      globalAssignmentsQuery = globalAssignmentsQuery.in('pdv_id', pdvIds);
    }

    const [allAssignmentsRes, globalCapturas] = await Promise.all([
      globalAssignmentsQuery,
      obtenerCapturasDiaCompleto(
        supabase,
        accountId,
        fechaDia,
        filtros.supervisorId ? undefined : pdvIds,
        supervisorEquipoIds && supervisorEquipoIds.size > 0 ? Array.from(supervisorEquipoIds) : undefined
      ),
    ]);

    const globalAssignments = allAssignmentsRes.data ?? [];

    const globalCapturasCount = new Map<string, { total: number; ventasOLove: number }>();
    for (const cap of globalCapturas) {
      const empId = cap.empleado_id;
      const current = globalCapturasCount.get(empId) ?? { total: 0, ventasOLove: 0 };
      current.total++;
      if (cap.tipo_registro === 'VENTA' || cap.tipo_registro === 'LOVE_ISDIN') {
        current.ventasOLove++;
      }
      globalCapturasCount.set(empId, current);
    }

    const supProgressMap = new Map<string, { total: Set<string>; cumplidas: Set<string> }>();
    for (const asg of globalAssignments) {
      const supId = asg.supervisor_empleado_id || filtros.supervisorId || 'SIN_SUPERVISOR';
      const empId = asg.empleado_id;

      if (!supProgressMap.has(supId)) {
        supProgressMap.set(supId, { total: new Set(), cumplidas: new Set() });
      }
      const supData = supProgressMap.get(supId)!;
      supData.total.add(empId);

      const capInfo = globalCapturasCount.get(empId) ?? { total: 0, ventasOLove: 0 };
      // Solo cuenta como cumplida para el 100% de supervisión si reportó Ventas o registros Love ISDIN
      if (capInfo.ventasOLove > 0) {
        supData.cumplidas.add(empId);
      }
    }

    const supervisoresProgress: ClienteDashboardSupervisorProgress[] = [];
    for (const [supId, sets] of supProgressMap.entries()) {
      if (supId === 'SIN_SUPERVISOR') continue;
      if (filtros.supervisorId && supId !== filtros.supervisorId) continue;

      const supEmp = employeeMap.get(supId);
      if (!supEmp) continue;

      const totalProgramadas = sets.total.size;
      const totalCumplidas = sets.cumplidas.size;
      const porcentaje = totalProgramadas > 0 ? Math.round((totalCumplidas / totalProgramadas) * 100) : 0;

      supervisoresProgress.push({
        id: supId,
        nombre: supEmp.nombre_completo,
        totalProgramadas,
        totalCumplidas,
        porcentaje,
        completado100: totalProgramadas > 0 && totalCumplidas === totalProgramadas,
      });
    }

    supervisoresProgress.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    return {
      resumen,
      materiales: materialesProgress,
      tendencia,
      alertas,
      cumplidas,
      desabastos: desabastosList.sort((a, b) => b.fecha.localeCompare(a.fecha)),
      supervisoresProgress,
      catalogos: {
        cadenas: catalogCadenas,
        tiendas: catalogTiendas,
        supervisores: catalogSupervisores,
      },
      periodoSeleccionado: periodo,
      fechaSeleccionada: filtros.fecha || null,
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
    cumplidas: [],
    desabastos: [],
    supervisoresProgress: [],
    catalogos: {
      cadenas: [],
      tiendas: [],
      supervisores: [],
    },
    periodoSeleccionado: periodo,
    fechaSeleccionada: null,
    refreshedAt,
  };
}

async function obtenerCapturasDiaCompleto(
  supabase: any,
  accountId: string,
  fechaDia: string,
  pdvIds?: string[],
  empleadoIds?: string[]
): Promise<any[]> {
  let rows: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const pageOffset = page * PAGE_SIZE;
    let query = supabase
      .from('captura_publica_registro')
      .select('empleado_id, tipo_registro')
      .eq('fecha_operativa', fechaDia)
      .eq('cuenta_cliente_id', accountId);

    if (empleadoIds && empleadoIds.length > 0) {
      query = query.in('empleado_id', empleadoIds);
    } else if (pdvIds && pdvIds.length > 0) {
      query = query.in('pdv_id', pdvIds);
    }

    query = query.range(pageOffset, pageOffset + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      console.error('[clienteDashboardService] Error paginando capturas del día:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return rows;
}
