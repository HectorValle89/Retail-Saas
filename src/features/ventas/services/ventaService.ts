import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import { createServiceClient } from '@/lib/supabase/server';
import type {
  Asistencia,
  CuentaCliente,
  CuotaEmpleadoPeriodo,
  Producto,
  Puesto,
  Venta,
  Empleado,
  Pdv,
} from '@/types/database';
import {
  obtenerRegistrosExtemporaneosPanel,
  type RegistroExtemporaneoListadoItem,
  type RegistroExtemporaneoResumen,
} from '@/features/solicitudes/extemporaneoService';

type MaybeMany<T> = T | T[] | null;
type TypedSupabaseClient = ReturnType<typeof createServiceClient>;

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'from' in value &&
    typeof (value as { from?: unknown }).from === 'function'
  );
}

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>;

type EmpleadoRelacion = Pick<
  Empleado,
  | 'id'
  | 'id_nomina'
  | 'nombre_completo'
  | 'puesto'
  | 'supervisor_empleado_id'
  | 'zona'
  | 'estatus_laboral'
>;

type PdvRelacion = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id' | 'id_cadena'>;

interface AsistenciaRelacion {
  estatus: string;
  check_out_utc: string | null;
}

interface VentaQueryRow extends Pick<
  Venta,
  | 'id'
  | 'cuenta_cliente_id'
  | 'asistencia_id'
  | 'empleado_id'
  | 'pdv_id'
  | 'producto_id'
  | 'producto_sku'
  | 'producto_nombre'
  | 'producto_nombre_corto'
  | 'fecha_utc'
  | 'total_unidades'
  | 'total_monto'
  | 'confirmada'
  | 'observaciones'
> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
  asistencia: MaybeMany<AsistenciaRelacion>;
  empleado: MaybeMany<EmpleadoRelacion>;
  pdv: MaybeMany<PdvRelacion>;
}

interface JornadaContextoQueryRow extends Pick<
  Asistencia,
  | 'id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'pdv_id'
  | 'fecha_operacion'
  | 'empleado_nombre'
  | 'pdv_clave_btl'
  | 'pdv_nombre'
  | 'estatus'
  | 'check_out_utc'
> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
}

type NominaPeriodoVentaRow = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'BORRADOR' | 'ABIERTO' | 'APROBADO' | 'DISPERSADO';
};
type CuotaVentaRow = Pick<
  CuotaEmpleadoPeriodo,
  | 'id'
  | 'periodo_id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'objetivo_monto'
  | 'avance_monto'
  | 'cumplimiento_porcentaje'
  | 'estado'
>;
type VentaDiariaRow = Pick<
  Venta,
  'empleado_id' | 'cuenta_cliente_id' | 'total_monto' | 'confirmada' | 'fecha_utc'
>;

export interface VentaResumen {
  total: number;
  confirmadas: number;
  pendientesConfirmacion: number;
  unidades: number;
  monto: number;
}

export interface VentaListadoItem {
  id: string;
  cuentaClienteId: string;
  asistenciaId: string;
  empleadoId: string;
  pdvId: string;
  productoId: string | null;
  productoSku: string | null;
  cuentaCliente: string | null;
  producto: string;
  productoCorto: string | null;
  fechaUtc: string;
  totalUnidades: number;
  totalMonto: number;
  confirmada: boolean;
  jornadaEstatus: string | null;
  jornadaAbierta: boolean;
  observaciones: string | null;
}

export interface VentaJornadaContexto {
  id: string;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  empleadoId: string;
  empleado: string;
  pdvId: string;
  pdvClaveBtl: string;
  pdvNombre: string;
  fechaOperacion: string;
  estatus: string;
  abierta: boolean;
  cuotaDiaria: VentaCuotaDiariaIndicador | null;
}

export interface VentaCatalogoProductoItem {
  id: string;
  sku: string;
  nombre: string;
  nombreCorto: string;
  categoria: string;
  top30: boolean;
}

export interface VentaCuotaDiariaIndicador {
  periodoId: string;
  periodoInicio: string;
  periodoFin: string;
  objetivoDiarioMonto: number;
  avanceHoyMonto: number;
  cumplimientoHoyPct: number;
  cumplimientoPeriodoPct: number;
  cuotaEstado: CuotaVentaRow['estado'];
  semaforo: 'ROJO' | 'AMARILLO' | 'VERDE';
}

export interface VentaDatasetItem {
  fechaOperacion: string;
  weekBucket: string;
  pdvId: string;
  pdvLabel: string;
  pdvClaveBtl?: string;
  pdvIdCadena?: string | null;
  pdvNombre?: string;
  empleadoId: string;
  empleadoLabel: string;
  supervisorId: string | null;
  supervisorLabel: string;
  zona: string;
  cadena: string;
  totalUnidades: number;
  totalMonto: number;
  confirmada: boolean;
  total: number;
}

export interface SelectorOption {
  id: string;
  label: string;
}

export interface VentasPanelData {
  resumen: VentaResumen;
  ventas: VentaListadoItem[];
  jornadasContexto: VentaJornadaContexto[];
  catalogoProductos: VentaCatalogoProductoItem[];
  resumenExtemporaneo: RegistroExtemporaneoResumen;
  registrosExtemporaneos: RegistroExtemporaneoListadoItem[];
  paginacion: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  infraestructuraLista: boolean;
  mensajeInfraestructura?: string;
  dataset: VentaDatasetItem[];
  supervisores: SelectorOption[];
  pdvs: SelectorOption[];
  empleados: SelectorOption[];
}

interface ObtenerVentasOptions {
  page?: number;
  pageSize?: number;
  actorPuesto?: Puesto | null;
  actorEmpleadoId?: string | null;
  actor?: ActorActual | null;
  serviceClient?: TypedSupabaseClient;
  month?: string | null;
}

const VENTAS_PANEL_REVALIDATE_SECONDS = 60;

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
};

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 50;
  }

  return Math.min(50, Math.max(10, Math.floor(value)));
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

function resolveTrafficLight(cumplimiento: number): VentaCuotaDiariaIndicador['semaforo'] {
  if (cumplimiento >= 100) {
    return 'VERDE';
  }

  if (cumplimiento >= 70) {
    return 'AMARILLO';
  }

  return 'ROJO';
}

function getInclusiveDayCount(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
}

function buildQuotaKey(empleadoId: string, cuentaClienteId: string) {
  return `${empleadoId}::${cuentaClienteId}`;
}

function buildVentasCacheKey(actor: ActorActual, options?: ObtenerVentasOptions) {
  return [
    actor.cuentaClienteId ?? 'sin-cuenta',
    actor.empleadoId,
    actor.puesto,
    String(normalizePage(options?.page)),
    String(normalizePageSize(options?.pageSize)),
    options?.month ?? 'no-month',
  ].join(':');
}

function buildVentasCacheTags(actor: ActorActual) {
  return buildModuleCacheTags({
    module: 'ventas',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId ?? null,
    supervisorId: actor.puesto === 'SUPERVISOR' ? (actor.empleadoId ?? null) : null,
  });
}

function getMexicoDateIso(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

async function obtenerPanelVentasUncached(
  supabase: SupabaseClient,
  options?: ObtenerVentasOptions
): Promise<VentasPanelData> {
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const accountId = options?.actor?.cuentaClienteId ?? null;
  const actorPuesto = options?.actorPuesto ?? options?.actor?.puesto ?? null;
  const actorEmpleadoId = options?.actorEmpleadoId ?? options?.actor?.empleadoId ?? null;
  const esSupervisor = actorPuesto === 'SUPERVISOR';

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonth = options?.month || todayIso.slice(0, 7);

  const esVisualizadorReporte = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'].includes(actorPuesto ?? '');

  if (esVisualizadorReporte) {
    let query = supabase
      .from('vista_venta_diaria_agrupada')
      .select(`
        cuenta_cliente_id,
        empleado_id,
        empleado_nombre,
        supervisor_id,
        supervisor_nombre,
        pdv_id,
        pdv_clave_btl,
        pdv_nombre,
        pdv_zona,
        cadena_nombre,
        fecha_operacion,
        confirmada,
        total_unidades,
        total_monto,
        total_transacciones
      `)
      .eq('periodo_mes', currentMonth)
      .range(0, 4999);

    if (accountId) {
      query = query.eq('cuenta_cliente_id', accountId);
    }

    if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
      query = query.eq('supervisor_id', actorEmpleadoId);
    }

    const [yearStr, monthStr] = currentMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    const monthStartIso = `${currentMonth}-01`;
    const monthEndIso = `${currentMonth}-${lastDay}`;

    // Query active assignments for the supervisor/client in the current month
    let assignmentsQuery = supabase
      .from('asignacion')
      .select(`
        empleado_id,
        empleado:empleado_id(nombre_completo),
        pdv_id,
        pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id),
        supervisor_empleado_id
      `)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', monthEndIso)
      .or(`fecha_fin.is.null,fecha_fin.gte.${monthStartIso}`);

    if (accountId) {
      assignmentsQuery = assignmentsQuery.eq('cuenta_cliente_id', accountId);
    }
    if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
      assignmentsQuery = assignmentsQuery.eq('supervisor_empleado_id', actorEmpleadoId);
    }

    const { data: asgData, error: asgError } = await assignmentsQuery;
    if (asgError) {
      console.error('[ventaService] Error querying active assignments:', asgError.message);
    }

    // Query active employees to ensure we list all dermoconsejeras of the team
    let employeesQuery = supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, supervisor_empleado_id, usuario:usuario!usuario_empleado_id_fkey!inner(cuenta_cliente_id)')
      .eq('estatus_laboral', 'ACTIVO');

    if (accountId) {
      employeesQuery = employeesQuery.eq('usuario.cuenta_cliente_id', accountId);
    }

    const { data: empData, error: empError } = await employeesQuery;
    if (empError) {
      console.error('[ventaService] Error querying active employees:', empError.message);
    }

    // Query cadenas for mapping
    const { data: cadenasData } = await supabase
      .from('cadena')
      .select('id, nombre');
    const cadenaMap = new Map((cadenasData ?? []).map((c: any) => [c.id, c.nombre]));

    const supervisorMap = new Map<string, string>();
    const activeDermos: any[] = [];

    (empData ?? []).forEach((emp: any) => {
      if (emp.puesto === 'SUPERVISOR') {
        supervisorMap.set(emp.id, emp.nombre_completo);
      } else if (emp.puesto === 'DERMOCONSEJERO') {
        if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
          if (emp.supervisor_empleado_id === actorEmpleadoId) {
            activeDermos.push(emp);
          }
        } else {
          activeDermos.push(emp);
        }
      }
    });

    const { data: viewData, error: viewError } = await query;
    if (viewError) {
      console.error('[ventaService] Error querying vista_venta_diaria_agrupada:', viewError.message);
    }

    const dataset: VentaDatasetItem[] = (viewData ?? []).map((row: any) => {
      const dateStr = String(row.fecha_operacion);
      return {
        fechaOperacion: dateStr,
        weekBucket: getWeekStartIso(dateStr),
        pdvId: row.pdv_id,
        pdvLabel: `${row.pdv_clave_btl ?? 'SIN BTL'} - ${row.pdv_nombre}`,
        pdvClaveBtl: row.pdv_clave_btl ?? 'SIN BTL',
        pdvIdCadena: '',
        pdvNombre: row.pdv_nombre ?? 'PDV sin nombre',
        empleadoId: row.empleado_id,
        empleadoLabel: row.empleado_nombre ?? 'Sin dermoconsejera',
        supervisorId: row.supervisor_id,
        supervisorLabel: row.supervisor_nombre ?? 'Sin supervisor',
        zona: row.pdv_zona ?? 'Sin zona',
        cadena: row.cadena_nombre ?? 'Sin cadena',
        totalUnidades: row.total_unidades,
        totalMonto: Number(row.total_monto),
        confirmada: row.confirmada,
        total: row.total_transacciones,
      };
    });

    const salesCombinations = new Set(dataset.map((row) => `${row.empleadoId}||${row.pdvId}`));

    // 1. Merge active assignments that have 0 sales in the current month
    (asgData ?? []).forEach((asg: any) => {
      const key = `${asg.empleado_id}||${asg.pdv_id}`;
      if (!salesCombinations.has(key)) {
        dataset.push({
          fechaOperacion: '',
          weekBucket: '',
          pdvId: asg.pdv_id,
          pdvLabel: asg.pdv ? `${asg.pdv.clave_btl ?? 'SIN BTL'} - ${asg.pdv.nombre}` : 'PDV sin nombre',
          pdvClaveBtl: asg.pdv?.clave_btl ?? 'SIN BTL',
          pdvIdCadena: '',
          pdvNombre: asg.pdv?.nombre ?? 'PDV sin nombre',
          empleadoId: asg.empleado_id,
          empleadoLabel: asg.empleado?.nombre_completo ?? 'Sin dermoconsejera',
          supervisorId: asg.supervisor_empleado_id,
          supervisorLabel: supervisorMap.get(asg.supervisor_empleado_id) || 'Sin supervisor',
          zona: asg.pdv?.zona ?? 'Sin zona',
          cadena: asg.pdv?.cadena_id ? (cadenaMap.get(asg.pdv.cadena_id) ?? 'Sin cadena') : 'Sin cadena',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: true,
          total: 0,
        });
        salesCombinations.add(key);
      }
    });

    // 2. Merge any active employee who has no assignments at all
    const dermosInDataset = new Set(dataset.map((row) => row.empleadoId));
    activeDermos.forEach((emp) => {
      if (!dermosInDataset.has(emp.id)) {
        dataset.push({
          fechaOperacion: '',
          weekBucket: '',
          pdvId: '',
          pdvLabel: 'Sin tienda',
          pdvClaveBtl: '',
          pdvIdCadena: '',
          pdvNombre: 'Sin tienda',
          empleadoId: emp.id,
          empleadoLabel: emp.nombre_completo,
          supervisorId: emp.supervisor_empleado_id,
          supervisorLabel: supervisorMap.get(emp.supervisor_empleado_id) || 'Sin supervisor',
          zona: 'Sin zona',
          cadena: 'Sin cadena',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: true,
          total: 0,
        });
      }
    });

    const uniquePdvs = new Map<string, string>();
    const uniqueEmpleados = new Map<string, string>();
    const uniqueSupervisores = new Map<string, string>();

    dataset.forEach((row) => {
      if (row.pdvId) {
        uniquePdvs.set(row.pdvId, row.pdvLabel);
      }
      if (row.empleadoId) {
        uniqueEmpleados.set(row.empleadoId, row.empleadoLabel);
      }
      if (row.supervisorId && row.supervisorLabel) {
        uniqueSupervisores.set(row.supervisorId, row.supervisorLabel);
      }
    });

    const pdvsList = Array.from(uniquePdvs.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

    const empleadosList = Array.from(uniqueEmpleados.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

    const supervisoresList = Array.from(uniqueSupervisores.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

    let totalUnidades = 0;
    let totalMonto = 0;
    let totalTransacciones = 0;
    let totalConfirmadas = 0;

    dataset.forEach((row) => {
      totalUnidades += row.totalUnidades;
      totalMonto += row.totalMonto;
      totalTransacciones += row.total;
      if (row.confirmada) {
        totalConfirmadas += row.total;
      }
    });

    return {
      resumen: {
        total: totalTransacciones,
        confirmadas: totalConfirmadas,
        pendientesConfirmacion: totalTransacciones - totalConfirmadas,
        unidades: totalUnidades,
        monto: totalMonto,
      },
      ventas: [],
      jornadasContexto: [],
      catalogoProductos: [],
      resumenExtemporaneo: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registrosExtemporaneos: [],
      paginacion: {
        page,
        pageSize,
        totalItems: totalTransacciones,
        totalPages: 1,
      },
      infraestructuraLista: true,
      dataset,
      supervisores: supervisoresList,
      pdvs: pdvsList,
      empleados: empleadosList,
    };
  }

  // Mexico City timezone bounds
  const currentMonthStartUtc = `${currentMonth}-01T06:00:00.000Z`;
  const [yearStr, monthStr] = currentMonth.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthNum = month === 12 ? 1 : month + 1;
  const nextMonthStr = String(nextMonthNum).padStart(2, '0');
  const currentMonthEndUtc = `${nextMonthYear}-${nextMonthStr}-01T05:59:59.999Z`;

  let countQuery = supabase
    .from('venta')
    .select(
      esSupervisor && actorEmpleadoId
        ? 'id, empleado:empleado_id!inner(supervisor_empleado_id)'
        : 'id',
      { count: 'exact', head: true }
    )
    .gte('fecha_utc', currentMonthStartUtc)
    .lte('fecha_utc', currentMonthEndUtc);

  if (accountId) {
    countQuery = countQuery.eq('cuenta_cliente_id', accountId);
  }

  if (esSupervisor && actorEmpleadoId) {
    countQuery = countQuery.eq('empleado.supervisor_empleado_id', actorEmpleadoId);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    return {
      resumen: {
        total: 0,
        confirmadas: 0,
        pendientesConfirmacion: 0,
        unidades: 0,
        monto: 0,
      },
      ventas: [],
      jornadasContexto: [],
      catalogoProductos: [],
      resumenExtemporaneo: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registrosExtemporaneos: [],
      paginacion: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `venta` aun no esta disponible en Supabase. Ejecuta la migracion de ventas base.',
      dataset: [],
      supervisores: [],
      pdvs: [],
      empleados: [],
    };
  }

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let selectFieldsList = `
    id,
    cuenta_cliente_id,
    asistencia_id,
    empleado_id,
    pdv_id,
    producto_id,
    producto_sku,
    producto_nombre,
    producto_nombre_corto,
    fecha_utc,
    total_unidades,
    total_monto,
    confirmada,
    observaciones,
    cuenta_cliente:cuenta_cliente_id(nombre),
    asistencia:asistencia_id(estatus, check_out_utc)
  `;

  if (esSupervisor && actorEmpleadoId) {
    selectFieldsList += `, empleado:empleado_id!inner(supervisor_empleado_id)`;
  }

  let listQuery = supabase
    .from('venta')
    .select(selectFieldsList)
    .gte('fecha_utc', currentMonthStartUtc)
    .lte('fecha_utc', currentMonthEndUtc)
    .order('fecha_utc', { ascending: false })
    .range(from, to);

  if (accountId) {
    listQuery = listQuery.eq('cuenta_cliente_id', accountId);
  }

  if (esSupervisor && actorEmpleadoId) {
    listQuery = listQuery.eq('empleado.supervisor_empleado_id', actorEmpleadoId);
  }

  const { data, error } = await listQuery;

  if (error) {
    return {
      resumen: {
        total: 0,
        confirmadas: 0,
        pendientesConfirmacion: 0,
        unidades: 0,
        monto: 0,
      },
      ventas: [],
      jornadasContexto: [],
      catalogoProductos: [],
      resumenExtemporaneo: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registrosExtemporaneos: [],
      paginacion: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `venta` aun no esta disponible en Supabase. Ejecuta la migracion de ventas base.',
      dataset: [],
      supervisores: [],
      pdvs: [],
      empleados: [],
    };
  }

  const ventas = ((data ?? []) as unknown as VentaQueryRow[]).map((venta) => {
    const cuentaCliente = obtenerPrimero(venta.cuenta_cliente);
    const asistencia = obtenerPrimero(venta.asistencia);

    return {
      id: venta.id,
      cuentaClienteId: venta.cuenta_cliente_id,
      asistenciaId: venta.asistencia_id,
      empleadoId: venta.empleado_id,
      pdvId: venta.pdv_id,
      productoId: venta.producto_id,
      productoSku: venta.producto_sku,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      producto: venta.producto_nombre,
      productoCorto: venta.producto_nombre_corto,
      fechaUtc: venta.fecha_utc,
      totalUnidades: venta.total_unidades,
      totalMonto: venta.total_monto,
      confirmada: venta.confirmada,
      jornadaEstatus: asistencia?.estatus ?? null,
      jornadaAbierta: Boolean(asistencia && asistencia.check_out_utc === null),
      observaciones: venta.observaciones,
    };
  });

  const { data: productosData, error: productosError } = await supabase
    .from('producto')
    .select('id, sku, nombre, nombre_corto, categoria, top_30, activo')
    .eq('activo', true)
    .order('nombre_corto', { ascending: true })
    .limit(500);

  const catalogoProductos = productosError
    ? []
    : ((productosData ?? []) as Producto[]).map((item) => ({
        id: item.id,
        sku: item.sku,
        nombre: item.nombre,
        nombreCorto: item.nombre_corto,
        categoria: item.categoria,
        top30: item.top_30,
      }));

  let jornadasQuery = supabase
    .from('asistencia')
    .select(
      esSupervisor && actorEmpleadoId
        ? `
          id,
          cuenta_cliente_id,
          empleado_id,
          pdv_id,
          fecha_operacion,
          empleado_nombre,
          pdv_clave_btl,
          pdv_nombre,
          estatus,
          check_out_utc,
          cuenta_cliente:cuenta_cliente_id(nombre),
          empleado:empleado_id!inner(supervisor_empleado_id)
        `
        : `
          id,
          cuenta_cliente_id,
          empleado_id,
          pdv_id,
          fecha_operacion,
          empleado_nombre,
          pdv_clave_btl,
          pdv_nombre,
          estatus,
          check_out_utc,
          cuenta_cliente:cuenta_cliente_id(nombre)
        `
    )
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24);

  if (esSupervisor && actorEmpleadoId) {
    jornadasQuery = jornadasQuery.eq('empleado.supervisor_empleado_id', actorEmpleadoId);
  }

  const { data: jornadasData } = await jornadasQuery;

  const jornadasRaw = (jornadasData ?? []) as unknown as JornadaContextoQueryRow[];
  const employeeIds = Array.from(new Set(jornadasRaw.map((item) => item.empleado_id)));
  const today = getTodayIso();

  const activePeriodResult =
    employeeIds.length > 0
      ? await supabase
          .from('nomina_periodo')
          .select('id, fecha_inicio, fecha_fin, estado')
          .in('estado', ['BORRADOR', 'ABIERTO'])
          .lte('fecha_inicio', today)
          .gte('fecha_fin', today)
          .order('fecha_inicio', { ascending: false })
          .limit(1)
      : { data: [], error: null };

  const activePeriod = ((activePeriodResult.data ?? []) as NominaPeriodoVentaRow[])[0] ?? null;

  const [quotaResult, todaySalesResult] = await Promise.all([
    activePeriod && employeeIds.length > 0
      ? supabase
          .from('cuota_empleado_periodo')
          .select(
            'id, periodo_id, cuenta_cliente_id, empleado_id, objetivo_monto, avance_monto, cumplimiento_porcentaje, estado'
          )
          .eq('periodo_id', activePeriod.id)
          .in('empleado_id', employeeIds)
          .limit(Math.max(employeeIds.length, 1))
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length > 0
      ? supabase
          .from('venta')
          .select('empleado_id, cuenta_cliente_id, total_monto, confirmada, fecha_utc')
          .in('empleado_id', employeeIds)
          .eq('confirmada', true)
          .gte('fecha_utc', `${today}T00:00:00.000Z`)
          .lte('fecha_utc', `${today}T23:59:59.999Z`)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const quotasRaw = (quotaResult.data ?? []) as CuotaVentaRow[];
  const todaySalesRaw = (todaySalesResult.data ?? []) as VentaDiariaRow[];
  const todaySalesByEmployee = todaySalesRaw.reduce<Map<string, number>>((acc, item) => {
    const key = buildQuotaKey(item.empleado_id, item.cuenta_cliente_id);
    acc.set(key, (acc.get(key) ?? 0) + item.total_monto);
    return acc;
  }, new Map());
  const quotaByEmployee = new Map(
    quotasRaw.map(
      (item) => [buildQuotaKey(item.empleado_id, item.cuenta_cliente_id), item] as const
    )
  );

  const jornadasContexto = jornadasRaw.map((jornada) => {
    const cuota = quotaByEmployee.get(
      buildQuotaKey(jornada.empleado_id, jornada.cuenta_cliente_id)
    );
    const avanceHoyMonto =
      todaySalesByEmployee.get(buildQuotaKey(jornada.empleado_id, jornada.cuenta_cliente_id)) ?? 0;
    const totalDiasPeriodo = activePeriod
      ? getInclusiveDayCount(activePeriod.fecha_inicio, activePeriod.fecha_fin)
      : 1;
    const objetivoDiarioMonto = cuota ? roundToTwo(cuota.objetivo_monto / totalDiasPeriodo) : 0;
    const cumplimientoHoyPct =
      cuota && objetivoDiarioMonto > 0
        ? roundToTwo((avanceHoyMonto / objetivoDiarioMonto) * 100)
        : 0;

    return {
      id: jornada.id,
      cuentaClienteId: jornada.cuenta_cliente_id,
      cuentaCliente: obtenerPrimero(jornada.cuenta_cliente)?.nombre ?? null,
      empleadoId: jornada.empleado_id,
      empleado: jornada.empleado_nombre,
      pdvId: jornada.pdv_id,
      pdvClaveBtl: jornada.pdv_clave_btl,
      pdvNombre: jornada.pdv_nombre,
      fechaOperacion: jornada.fecha_operacion,
      estatus: jornada.estatus,
      abierta: jornada.check_out_utc === null,
      cuotaDiaria:
        cuota && activePeriod
          ? {
              periodoId: activePeriod.id,
              periodoInicio: activePeriod.fecha_inicio,
              periodoFin: activePeriod.fecha_fin,
              objetivoDiarioMonto,
              avanceHoyMonto: roundToTwo(avanceHoyMonto),
              cumplimientoHoyPct,
              cumplimientoPeriodoPct: roundToTwo(cuota.cumplimiento_porcentaje),
              cuotaEstado: cuota.estado,
              semaforo: resolveTrafficLight(cumplimientoHoyPct),
            }
          : null,
    };
  });

  let monthVentasRows: VentaQueryRow[] = [];
  let pageOffset = 0;
  const PAGE_SIZE = 1000;

  let selectFields = `
    id,
    cuenta_cliente_id,
    asistencia_id,
    empleado_id,
    pdv_id,
    producto_id,
    producto_sku,
    producto_nombre,
    producto_nombre_corto,
    fecha_utc,
    total_unidades,
    total_monto,
    confirmada,
    observaciones,
    cuenta_cliente:cuenta_cliente_id(nombre),
    pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)
  `;

  if (esSupervisor && actorEmpleadoId) {
    selectFields += `, empleado:empleado_id!inner(id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral)`;
  } else {
    selectFields += `, empleado:empleado_id(id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral)`;
  }

  while (true) {
    let query = supabase
      .from('venta')
      .select(selectFields)
      .gte('fecha_utc', currentMonthStartUtc)
      .lte('fecha_utc', currentMonthEndUtc)
      .order('fecha_utc', { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);

    if (accountId) {
      query = query.eq('cuenta_cliente_id', accountId);
    }

    if (esSupervisor && actorEmpleadoId) {
      query = query.eq('empleado.supervisor_empleado_id', actorEmpleadoId);
    }

    const { data: pageData, error: pageErr } = await query;
    if (pageErr) {
      console.error('[ventaService] Error paginando ventas del mes:', pageErr.message);
      break;
    }
    if (!pageData || pageData.length === 0) break;
    monthVentasRows = monthVentasRows.concat(pageData as unknown as VentaQueryRow[]);
    if (pageData.length < PAGE_SIZE) break;
    pageOffset += PAGE_SIZE;

    // Safety guard to avoid memory issue
    if (pageOffset >= 100000) break;
  }

  const supervisorIds = Array.from(
    new Set(
      monthVentasRows
        .map((r) => obtenerPrimero(r.empleado)?.supervisor_empleado_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const supervisorsResult =
    supervisorIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('empleado')
          .select('id, nombre_completo')
          .in('id', supervisorIds)
          .limit(Math.max(supervisorIds.length, 1));

  const supervisorById = new Map(
    ((supervisorsResult.data ?? []) as any[]).map((s) => [s.id, s.nombre_completo] as const)
  );

  const cadenaIds = Array.from(
    new Set(
      monthVentasRows
        .map((r) => obtenerPrimero(r.pdv)?.cadena_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const cadenaResult =
    cadenaIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('cadena')
          .select('id, nombre')
          .in('id', cadenaIds)
          .limit(Math.max(cadenaIds.length, 1));

  const cadenaById = new Map(
    ((cadenaResult.data ?? []) as any[]).map((c) => [c.id, c.nombre] as const)
  );

  const productoMap = new Map(
    ((productosData ?? []) as Producto[]).map((p) => [p.id, p] as const)
  );

  const dataset: VentaDatasetItem[] = monthVentasRows.map((row) => {
    const pdv = obtenerPrimero(row.pdv);
    const empleado = obtenerPrimero(row.empleado);
    const dateStr = getMexicoDateIso(row.fecha_utc);
    const weekBucket = getWeekStartIso(dateStr);
    const supervisorId = empleado?.supervisor_empleado_id ?? null;
    const supervisorLabel = supervisorId
      ? (supervisorById.get(supervisorId) ?? `Supervisor ${supervisorId.slice(0, 8)}`)
      : 'Sin supervisor';
    const prod = row.producto_id ? productoMap.get(row.producto_id) : null;
    const zona = pdv?.zona ?? empleado?.zona ?? 'Sin zona';
    const cadena = pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? 'Sin cadena') : 'Sin cadena';

    return {
      fechaOperacion: dateStr,
      weekBucket,
      pdvId: row.pdv_id,
      pdvLabel: pdv ? `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}` : 'PDV sin nombre',
      pdvClaveBtl: pdv?.clave_btl ?? 'SIN BTL',
      pdvIdCadena: pdv?.id_cadena ?? '',
      pdvNombre: pdv?.nombre ?? 'PDV sin nombre',
      empleadoId: row.empleado_id,
      empleadoLabel: empleado?.nombre_completo ?? 'Sin dermoconsejera',
      supervisorId,
      supervisorLabel,
      zona,
      cadena,
      totalUnidades: row.total_unidades,
      totalMonto: Number(row.total_monto),
      confirmada: row.confirmada,
      total: 1,
    };
  });

  const uniquePdvs = new Map<string, string>();
  const uniqueEmpleados = new Map<string, string>();

  for (const row of monthVentasRows) {
    const pdv = obtenerPrimero(row.pdv);
    const emp = obtenerPrimero(row.empleado);
    if (pdv) {
      uniquePdvs.set(pdv.id, `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}`);
    }
    if (emp) {
      uniqueEmpleados.set(emp.id, emp.nombre_completo);
    }
  }

  const pdvsList = Array.from(uniquePdvs.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

  const empleadosList = Array.from(uniqueEmpleados.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

  const uniqueSupervisores = new Map<string, string>();
  for (const [id, name] of supervisorById.entries()) {
    uniqueSupervisores.set(id, name);
  }
  const supervisoresList = Array.from(uniqueSupervisores.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));

  const extemporaneosPanel = await obtenerRegistrosExtemporaneosPanel(supabase, {
    actorPuesto: options?.actor?.puesto ?? options?.actorPuesto ?? null,
    actorEmpleadoId: options?.actor?.empleadoId ?? options?.actorEmpleadoId ?? null,
    tiposRegistro: ['VENTA', 'AMBAS'],
  });

  return {
    resumen: {
      total: totalItems,
      confirmadas: monthVentasRows.filter((item) => item.confirmada).length,
      pendientesConfirmacion: monthVentasRows.filter((item) => !item.confirmada).length,
      unidades: monthVentasRows.reduce((total, item) => total + item.total_unidades, 0),
      monto: monthVentasRows.reduce((total, item) => total + Number(item.total_monto), 0),
    },
    ventas,
    jornadasContexto,
    catalogoProductos,
    resumenExtemporaneo: extemporaneosPanel.resumen,
    registrosExtemporaneos: extemporaneosPanel.registros,
    paginacion: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    infraestructuraLista: !productosError,
    mensajeInfraestructura: productosError
      ? 'El catalogo de productos no esta disponible para ventas. Revisa Configuracion.'
      : undefined,
    dataset,
    supervisores: supervisoresList,
    pdvs: pdvsList,
    empleados: empleadosList,
  };
}

export async function obtenerPanelVentas(
  actorOrSupabase: ActorActual | TypedSupabaseClient,
  options?: ObtenerVentasOptions,
  customSupabase?: TypedSupabaseClient
): Promise<VentasPanelData> {
  if (isSupabaseClient(actorOrSupabase)) {
    return obtenerPanelVentasUncached(actorOrSupabase, options);
  }

  const actor = actorOrSupabase;
  const resolvedOptions: ObtenerVentasOptions = {
    ...options,
    actor,
    actorPuesto: actor.puesto,
    actorEmpleadoId: actor.empleadoId ?? null,
  };

  if (customSupabase) {
    return obtenerPanelVentasUncached(customSupabase, resolvedOptions);
  }

  const service = options?.serviceClient ?? createServiceClient();
  return unstable_cache(
    async () => obtenerPanelVentasUncached(service, { ...resolvedOptions, serviceClient: service }),
    ['ventas-panel-v3', buildVentasCacheKey(actor, resolvedOptions)],
    {
      revalidate: VENTAS_PANEL_REVALIDATE_SECONDS,
      tags: buildVentasCacheTags(actor),
    }
  )();
}
