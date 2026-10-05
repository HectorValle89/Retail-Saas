import { unstable_cache, revalidateTag } from 'next/cache';
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
  buildResolvedSupervisorLookup,
  resolveEffectiveSupervisorId,
} from '../lib/supervisorAttribution';
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
  | 'created_at'
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
  fechaRegistro?: string;
  weekBucket: string;
  pdvId: string;
  pdvLabel: string;
  pdvClaveBtl?: string;
  pdvIdCadena?: string | null;
  pdvNombre?: string;
  empleadoId: string;
  empleadoLabel: string;
  empleadoIdNomina?: string;
  supervisorId: string | null;
  supervisorLabel: string;
  zona: string;
  cadena: string;
  totalUnidades: number;
  totalMonto: number;
  confirmada: boolean;
  total: number;
  subtipoIncidencia?: 'V' | 'I' | 'F' | '0';
  productoId?: string | null;
  productoSku?: string | null;
  productoNombre?: string | null;
  productoNombreCorto?: string | null;
}

export interface SelectorOption {
  id: string;
  label: string;
}

export interface VentaCapturaDetalleItem {
  id: string;
  createdAt: string;
  empleadoId: string;
  fechaOperativa: string;
  tipoRegistro: 'VENTA' | 'LOVE_ISDIN' | 'CANJE' | 'DESABASTO' | string;
  subtipoRegistro: string | null;
  cantidad: number;
  productoNombre: string | null;
  materialNombre: string | null;
  materialNombreCorto?: string | null;
  observaciones: string | null;
  pdvId: string | null;
  pdvNombre?: string | null;
  pdvClaveBtl?: string | null;
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
  capturasDetalle?: VentaCapturaDetalleItem[];
}

interface ObtenerVentasOptions {
  page?: number;
  pageSize?: number;
  actorPuesto?: Puesto | null;
  actorEmpleadoId?: string | null;
  actor?: ActorActual | null;
  serviceClient?: TypedSupabaseClient;
  month?: string | null;
  bypassCache?: boolean;
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

function getMexicoDateIso(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function getTodayIso() {
  return getMexicoDateIso(new Date());
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
  const defaultMonth = getMexicoDateIso(new Date()).slice(0, 7);
  return [
    actor.cuentaClienteId ?? 'sin-cuenta',
    actor.empleadoId,
    actor.puesto,
    String(normalizePage(options?.page)),
    String(normalizePageSize(options?.pageSize)),
    options?.month || defaultMonth,
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

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

async function fetchAsignacionesDiariasResueltasMes(
  supabase: SupabaseClient,
  options: {
    monthStartIso: string;
    monthEndIso: string;
    accountId?: string | null;
    supervisorEmpleadoId?: string | null;
  }
) {
  let allRows: Array<{
    fecha: string;
    empleado_id: string;
    pdv_id: string | null;
    supervisor_empleado_id: string | null;
  }> = [];

  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    let q = supabase
      .from('asignacion_diaria_resuelta')
      .select('fecha, empleado_id, pdv_id, supervisor_empleado_id')
      .gte('fecha', options.monthStartIso)
      .lte('fecha', options.monthEndIso)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (options.accountId) {
      q = q.eq('cuenta_cliente_id', options.accountId);
    }
    if (options.supervisorEmpleadoId) {
      q = q.eq('supervisor_empleado_id', options.supervisorEmpleadoId);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[ventaService] Error fetching asignacion_diaria_resuelta page:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data as any);
    if (data.length < PAGE_SIZE) break;
    page++;
    if (page >= 20) break;
  }

  return allRows;
}

async function fetchCapturasDetalleMes(
  supabase: SupabaseClient,
  options: {
    monthStartIso: string;
    monthEndIso: string;
    accountId?: string | null;
    teamDermoIdsArr?: string[] | null;
  }
) {
  let allCaptures: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    let q = supabase
      .from('captura_publica_registro')
      .select(
        `
        id,
        created_at,
        empleado_id,
        fecha_operativa,
        tipo_registro,
        subtipo_registro,
        cantidad,
        producto_nombre_snapshot,
        material_nombre_snapshot,
        material:material_catalogo_id(nombre, nombre_corto),
        observaciones,
        pdv_id,
        pdv:pdv_id(clave_btl, nombre, zona, cadena_id)
      `
      )
      .gte('fecha_operativa', options.monthStartIso)
      .lte('fecha_operativa', options.monthEndIso)
      .or(
        'tipo_registro.in.(LOVE_ISDIN,CANJE,DESABASTO),subtipo_registro.in.(VACACIONES,INCAPACIDAD,FALTA,SIN_VENTAS)'
      )
      .order('fecha_operativa', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (options.accountId) {
      q = q.eq('cuenta_cliente_id', options.accountId);
    }

    if (options.teamDermoIdsArr) {
      if (options.teamDermoIdsArr.length === 0) {
        q = q.eq('empleado_id', '00000000-0000-0000-0000-000000000000');
      } else {
        q = q.in('empleado_id', options.teamDermoIdsArr);
      }
    }

    const { data, error } = await q;
    if (error) {
      console.error('[ventaService] Error fetching capturasDetalle page:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allCaptures = allCaptures.concat(data);
    if (data.length < PAGE_SIZE) break;
    page++;
    if (page >= 20) break;
  }

  return allCaptures;
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

  const todayIso = getMexicoDateIso(new Date());
  const currentMonth = options?.month || todayIso.slice(0, 7);

  const esVisualizadorReporte = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'].includes(
    actorPuesto ?? ''
  );

  if (esVisualizadorReporte) {
    const [yearStr, monthStr] = currentMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    const monthStartIso = `${currentMonth}-01`;
    const monthEndIso = `${currentMonth}-${lastDay}`;

    // Construct base queries for parallel execution
    let assignmentsQuery = supabase
      .from('asignacion')
      .select(
        `
        empleado_id,
        empleado:empleado_id(id, nombre_completo, id_nomina, estatus_laboral, fecha_baja),
        pdv_id,
        pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id),
        supervisor_empleado_id,
        fecha_inicio,
        fecha_fin
      `
      )
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', monthEndIso)
      .or(`fecha_fin.is.null,fecha_fin.gte.${monthStartIso}`)
      .limit(10000);

    if (accountId) {
      assignmentsQuery = assignmentsQuery.eq('cuenta_cliente_id', accountId);
    }
    if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
      assignmentsQuery = assignmentsQuery.eq('supervisor_empleado_id', actorEmpleadoId);
    }

    let employeesQuery = supabase
      .from('empleado')
      .select(
        'id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, usuario:usuario!usuario_empleado_id_fkey!inner(cuenta_cliente_id)'
      )
      .eq('estatus_laboral', 'ACTIVO')
      .limit(10000);

    if (accountId) {
      employeesQuery = employeesQuery.eq('usuario.cuenta_cliente_id', accountId);
    }

    const cadenasQuery = supabase.from('cadena').select('id, nombre').limit(1000);
    const productosQuery = supabase.from('producto').select('id, sku, nombre, nombre_corto').limit(5000);
    const supervisorPdvsQuery = supabase
      .from('supervisor_pdv')
      .select('pdv_id, empleado_id, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', monthEndIso)
      .or(`fecha_fin.is.null,fecha_fin.gte.${monthStartIso}`)
      .limit(10000);

    let pdvsQuery = supabase
      .from('pdv')
      .select('id, clave_btl, nombre, zona, cadena_id, id_cadena')
      .limit(10000);

    if (accountId) {
      pdvsQuery = pdvsQuery.eq('cuenta_cliente_id', accountId);
    }

    // Parallel resolution of all metadata queries first
    const [asgRes, empRes, cadRes, prodRes, supPdvRes, adrData, pdvsRes] = await Promise.all([
      assignmentsQuery,
      employeesQuery,
      cadenasQuery,
      productosQuery,
      supervisorPdvsQuery,
      fetchAsignacionesDiariasResueltasMes(supabase, {
        monthStartIso,
        monthEndIso,
        accountId,
        supervisorEmpleadoId: actorPuesto === 'SUPERVISOR' ? actorEmpleadoId : null,
      }),
      pdvsQuery,
    ]);

    const asgData = asgRes.data ?? [];
    const empData = empRes.data ?? [];
    const cadenasData = cadRes.data ?? [];
    const productosData = prodRes.data ?? [];
    const supervisorPdvsData = supPdvRes.data ?? [];
    const pdvsData = pdvsRes.data ?? [];

    if (asgRes.error)
      console.error('[ventaService] Error querying assignments:', asgRes.error.message);
    if (empRes.error)
      console.error('[ventaService] Error querying employees:', empRes.error.message);

    const resolvedSupervisorLookup = buildResolvedSupervisorLookup(adrData as any[]);
    const cadenaMap = new Map((cadenasData ?? []).map((c: any) => [c.id, c.nombre]));
    const productosMap = new Map((productosData ?? []).map((p: any) => [p.id, p]));

    const supervisorMap = new Map<string, string>();
    const activeDermos: any[] = [];
    const teamDermoIds = new Set<string>();

    if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
      (adrData ?? []).forEach((row: any) => {
        if (
          row.empleado_id &&
          (row.pdv_id || row.estado_operativo === 'FORMACION' || row.estado_operativo === 'ASIGNADA_PDV') &&
          row.estado_operativo !== 'SIN_ASIGNACION'
        ) {
          teamDermoIds.add(row.empleado_id);
        }
      });
      (asgData ?? []).forEach((a: any) => {
        if (a.empleado_id && a.pdv_id) teamDermoIds.add(a.empleado_id);
      });
      (empData ?? []).forEach((e: any) => {
        if (e.supervisor_empleado_id === actorEmpleadoId) teamDermoIds.add(e.id);
      });
    }

    (empData ?? []).forEach((emp: any) => {
      if (emp.puesto === 'SUPERVISOR') {
        supervisorMap.set(emp.id, emp.nombre_completo);
      } else if (emp.puesto === 'DERMOCONSEJERO') {
        if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
          if (teamDermoIds.has(emp.id)) {
            activeDermos.push(emp);
          }
        } else {
          activeDermos.push(emp);
        }
      }
    });

    const teamDermoIdsArr = Array.from(teamDermoIds);

    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonthNum = month === 12 ? 1 : month + 1;
    const nextMonthStr = String(nextMonthNum).padStart(2, '0');
    const monthStartUtcFilter = `${currentMonth}-01T06:00:00.000Z`;
    const monthEndUtcFilter = `${nextMonthYear}-${nextMonthStr}-01T05:59:59.999Z`;

    // 1. Build fast in-memory lookup maps for PDVs and Empleados
    const pdvMap = new Map<string, any>();
    (pdvsData ?? []).forEach((p: any) => {
      if (p && p.id) {
        pdvMap.set(p.id, p);
      }
    });
    (asgData ?? []).forEach((a: any) => {
      const pdv = Array.isArray(a.pdv) ? a.pdv[0] : a.pdv;
      if (pdv && pdv.id && !pdvMap.has(pdv.id)) {
        pdvMap.set(pdv.id, pdv);
      }
    });

    const empMap = new Map<string, any>();
    (empData ?? []).forEach((e: any) => {
      if (e.id) {
        empMap.set(e.id, e);
      }
    });
    (asgData ?? []).forEach((a: any) => {
      const emp = Array.isArray(a.empleado) ? a.empleado[0] : a.empleado;
      if (emp && emp.id && !empMap.has(emp.id)) {
        empMap.set(emp.id, emp);
      }
    });

    // 2. Fetch total count scoped to team if supervisor
    let totalCountQuery = supabase
      .from('venta')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_utc', monthStartUtcFilter)
      .lte('fecha_utc', monthEndUtcFilter);

    if (accountId) {
      totalCountQuery = totalCountQuery.eq('cuenta_cliente_id', accountId);
    }

    if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
      if (teamDermoIdsArr.length === 0) {
        totalCountQuery = totalCountQuery.eq('empleado_id', '00000000-0000-0000-0000-000000000000');
      } else {
        totalCountQuery = totalCountQuery.in('empleado_id', teamDermoIdsArr);
      }
    }

    // Parallel fetch of paginated capturas and total count
    const [captData, totalCountRes] = await Promise.all([
      fetchCapturasDetalleMes(supabase, {
        monthStartIso,
        monthEndIso,
        accountId,
        teamDermoIdsArr: actorPuesto === 'SUPERVISOR' && actorEmpleadoId ? teamDermoIdsArr : null,
      }),
      totalCountQuery,
    ]);

    const { count: totalVentasCount } = totalCountRes;
    const totalCount = totalVentasCount ?? 0;

    const PAGE_SIZE = 1000;
    const totalPagesToFetch = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    let viewData: any[] = [];
    const BATCH_SIZE = 6; // Keep subrequest concurrency <= 6 to respect Cloudflare Workers limits

    for (let batchStart = 0; batchStart < totalPagesToFetch; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalPagesToFetch);
      const pagePromises = [];
      for (let p = batchStart; p < batchEnd; p++) {
        const from = p * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let pQuery = supabase
          .from('venta')
          .select(
            `
            id,
            cuenta_cliente_id,
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
            asistencia:asistencia_id(fecha_operacion),
            pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)
          `
          )
          .gte('fecha_utc', monthStartUtcFilter)
          .lte('fecha_utc', monthEndUtcFilter)
          .order('fecha_utc', { ascending: false })
          .range(from, to);

        if (accountId) {
          pQuery = pQuery.eq('cuenta_cliente_id', accountId);
        }

        if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId) {
          if (teamDermoIdsArr.length === 0) {
            pQuery = pQuery.eq('empleado_id', '00000000-0000-0000-0000-000000000000');
          } else {
            pQuery = pQuery.in('empleado_id', teamDermoIdsArr);
          }
        }

        pagePromises.push(pQuery);
      }

      const batchResults = await Promise.all(pagePromises);
      batchResults.forEach((res) => {
        if (res.data) {
          viewData = viewData.concat(res.data);
        }
      });
    }

    const employeeNominaMap = new Map<string, string>();
    (empData ?? []).forEach((emp: any) => {
      employeeNominaMap.set(emp.id, emp.id_nomina ?? '');
    });

    const datasetMap = new Map<string, VentaDatasetItem>();

    (viewData ?? []).forEach((row: any) => {
      const dateStr =
        (Array.isArray(row.asistencia)
          ? row.asistencia[0]?.fecha_operacion
          : row.asistencia?.fecha_operacion) || getMexicoDateIso(row.fecha_utc);
      const pdv = pdvMap.get(row.pdv_id) || (Array.isArray(row.pdv) ? row.pdv[0] : row.pdv);
      const emp = empMap.get(row.empleado_id);
      const prod = row.producto_id ? productosMap.get(row.producto_id) : null;

      const supervisorId = resolveEffectiveSupervisorId({
        empleadoId: row.empleado_id,
        pdvId: row.pdv_id,
        operationDate: dateStr,
        resolvedMap: resolvedSupervisorLookup,
        assignments: asgData,
        supervisorPdvs: supervisorPdvsData,
        employeeSupervisorId: emp?.supervisor_empleado_id ?? null,
      });
      const supervisorLabel = supervisorId
        ? supervisorMap.get(supervisorId) || 'Sin supervisor'
        : 'Sin supervisor';

      if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId && supervisorId !== actorEmpleadoId) {
        return;
      }

      const key = `${row.empleado_id}_${row.pdv_id}_${dateStr}_${row.producto_id ?? 'general'}`;

      let item = datasetMap.get(key);
      if (!item) {
        item = {
          fechaOperacion: dateStr,
          weekBucket: getWeekStartIso(dateStr),
          pdvId: row.pdv_id,
          pdvLabel: pdv ? `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}` : 'PDV sin nombre',
          pdvClaveBtl: pdv?.clave_btl ?? 'SIN BTL',
          pdvIdCadena: '',
          pdvNombre: pdv?.nombre ?? 'PDV sin nombre',
          empleadoId: row.empleado_id,
          empleadoLabel: emp?.nombre_completo ?? 'Sin dermoconsejera',
          empleadoIdNomina: emp?.id_nomina ?? employeeNominaMap.get(row.empleado_id) ?? '',
          supervisorId: supervisorId,
          supervisorLabel: supervisorLabel,
          zona: pdv?.zona ?? emp?.zona ?? 'Sin zona',
          cadena: pdv?.cadena_id ? (cadenaMap.get(pdv.cadena_id) ?? 'Sin cadena') : 'Sin cadena',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: row.confirmada,
          total: 0,
          productoId: row.producto_id ?? null,
          productoSku: row.producto_sku ?? prod?.sku ?? null,
          productoNombre: row.producto_nombre ?? prod?.nombre ?? null,
          productoNombreCorto: row.producto_nombre_corto ?? prod?.nombre_corto ?? null,
        };
        datasetMap.set(key, item);
      }

      item.totalUnidades += row.total_unidades ?? 0;
      item.totalMonto += Number(row.total_monto ?? 0);
      item.total += 1;
    });

    const capturesByGroup = new Map<string, any[]>();
    (captData ?? []).forEach((capt: any) => {
      const dateStr = String(capt.fecha_operativa).slice(0, 10);
      const key = `${capt.empleado_id}||${capt.pdv_id || ''}||${dateStr}`;
      if (!capturesByGroup.has(key)) {
        capturesByGroup.set(key, []);
      }
      capturesByGroup.get(key)!.push(capt);
    });

    capturesByGroup.forEach((list) => {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    capturesByGroup.forEach((list, key) => {
      const [empId, pdvId, dateStr] = key.split('||');

      const targetCaptures = list.filter((c: any) =>
        ['VACACIONES', 'INCAPACIDAD', 'FALTA', 'SIN_VENTAS'].includes(c.subtipo_registro)
      );

      if (targetCaptures.length === 0) return;

      const latestCapt = targetCaptures[targetCaptures.length - 1];
      const subtipo = latestCapt.subtipo_registro;

      let resolvedPdvId = pdvId;
      let pdvObj = latestCapt.pdv;
      if (!pdvObj && empId) {
        const matchingAsg = (asgData ?? []).find((a: any) => a.empleado_id === empId);
        if (matchingAsg) {
          resolvedPdvId = matchingAsg.pdv_id;
          pdvObj = matchingAsg.pdv;
        }
      }

      const resolvedKey = `${empId}||${resolvedPdvId}||${dateStr}`;
      let item = datasetMap.get(resolvedKey);

      const subtipoMap: Record<string, 'V' | 'I' | 'F' | '0'> = {
        VACACIONES: 'V',
        INCAPACIDAD: 'I',
        FALTA: 'F',
        SIN_VENTAS: '0',
      };

      const subtipoInc = subtipo ? subtipoMap[subtipo] : undefined;

      if (item) {
        if (item.totalUnidades === 0 && subtipoInc) {
          item.subtipoIncidencia = subtipoInc;
        }
      } else {
        const emp = (empData ?? []).find((e: any) => e.id === empId);
        const supervisorId = resolveEffectiveSupervisorId({
          empleadoId: empId,
          pdvId: resolvedPdvId,
          operationDate: dateStr,
          assignments: asgData,
          supervisorPdvs: supervisorPdvsData,
          employeeSupervisorId: emp?.supervisor_empleado_id ?? null,
        });
        const supervisorLabel = supervisorId
          ? supervisorMap.get(supervisorId) || 'Sin supervisor'
          : 'Sin supervisor';

        datasetMap.set(resolvedKey, {
          fechaOperacion: dateStr,
          weekBucket: getWeekStartIso(dateStr),
          pdvId: resolvedPdvId,
          pdvLabel: pdvObj
            ? `${pdvObj.clave_btl ?? 'SIN BTL'} - ${pdvObj.nombre}`
            : 'PDV sin nombre',
          pdvClaveBtl: pdvObj?.clave_btl ?? 'SIN BTL',
          pdvIdCadena: '',
          pdvNombre: pdvObj?.nombre ?? 'PDV sin nombre',
          empleadoId: empId,
          empleadoLabel: emp?.nombre_completo ?? 'Sin dermoconsejera',
          empleadoIdNomina: emp?.id_nomina ?? employeeNominaMap.get(empId) ?? '',
          supervisorId,
          supervisorLabel: supervisorLabel,
          zona: pdvObj?.zona ?? 'Sin zona',
          cadena: pdvObj?.cadena_id
            ? (cadenaMap.get(pdvObj.cadena_id) ?? 'Sin cadena')
            : 'Sin cadena',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: true,
          total: 0,
          subtipoIncidencia: subtipoInc,
        });
      }
    });

    const dataset = Array.from(datasetMap.values());

    const salesCombinations = new Set(dataset.map((row) => `${row.empleadoId}||${row.pdvId}`));

    // 1. Merge active assignments that have 0 sales in the current month
    (asgData ?? []).forEach((asg: any) => {
      const emp = Array.isArray(asg.empleado) ? asg.empleado[0] : asg.empleado;
      // Omitir asignaciones con fechas inconsistentes o invertidas
      if (asg.fecha_fin && asg.fecha_inicio && asg.fecha_inicio > asg.fecha_fin) {
        return;
      }
      // Omitir colaboradores con baja anterior al inicio del mes
      if (emp?.estatus_laboral === 'BAJA' && emp?.fecha_baja && emp.fecha_baja < monthStartIso) {
        return;
      }
      // Omitir asignaciones posteriores a la fecha efectiva de baja
      if (emp?.estatus_laboral === 'BAJA' && emp?.fecha_baja && asg.fecha_inicio > emp.fecha_baja) {
        return;
      }
      const supervisorId = resolveEffectiveSupervisorId({
        empleadoId: asg.empleado_id,
        pdvId: asg.pdv_id,
        operationDate: asg.fecha_inicio || monthStartIso,
        resolvedMap: resolvedSupervisorLookup,
        assignments: asgData,
        supervisorPdvs: supervisorPdvsData,
        employeeSupervisorId: asg.supervisor_empleado_id,
      });

      if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId && supervisorId !== actorEmpleadoId) {
        return;
      }

      const key = `${asg.empleado_id}||${asg.pdv_id}`;
      if (!salesCombinations.has(key)) {
        const pdv = asg.pdv || pdvMap.get(asg.pdv_id);
        dataset.push({
          fechaOperacion: '',
          weekBucket: '',
          pdvId: asg.pdv_id,
          pdvLabel: pdv
            ? `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}`
            : (pdvMap.get(asg.pdv_id) ? `${pdvMap.get(asg.pdv_id).clave_btl ?? 'SIN BTL'} - ${pdvMap.get(asg.pdv_id).nombre}` : 'PDV sin nombre'),
          pdvClaveBtl: pdv?.clave_btl ?? pdvMap.get(asg.pdv_id)?.clave_btl ?? 'SIN BTL',
          pdvIdCadena: '',
          pdvNombre: pdv?.nombre ?? pdvMap.get(asg.pdv_id)?.nombre ?? 'PDV sin nombre',
          empleadoId: asg.empleado_id,
          empleadoLabel: asg.empleado?.nombre_completo ?? emp?.nombre_completo ?? 'Sin dermoconsejera',
          empleadoIdNomina: asg.empleado?.id_nomina ?? emp?.id_nomina ?? employeeNominaMap.get(asg.empleado_id) ?? '',
          supervisorId,
          supervisorLabel: supervisorId ? (supervisorMap.get(supervisorId) || 'Sin supervisor') : 'Sin supervisor',
          zona: asg.pdv?.zona ?? pdvMap.get(asg.pdv_id)?.zona ?? 'Sin zona',
          cadena: asg.pdv?.cadena_id
            ? (cadenaMap.get(asg.pdv.cadena_id) ?? 'Sin cadena')
            : (pdvMap.get(asg.pdv_id)?.cadena_id ? (cadenaMap.get(pdvMap.get(asg.pdv_id).cadena_id) ?? 'Sin cadena') : 'Sin cadena'),
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: true,
          total: 0,
        });
        salesCombinations.add(key);
      }
    });

    // 1b. Merge combinations from asignacion_diaria_resuelta
    (adrData ?? []).forEach((adr: any) => {
      if (!adr.empleado_id || !adr.pdv_id) return;
      const key = `${adr.empleado_id}||${adr.pdv_id}`;
      if (!salesCombinations.has(key)) {
        const emp = empMap.get(adr.empleado_id);
        const pdv = pdvMap.get(adr.pdv_id);
        if (emp?.estatus_laboral === 'BAJA' && emp?.fecha_baja && emp.fecha_baja < monthStartIso) {
          return;
        }

        const supervisorId = resolveEffectiveSupervisorId({
          empleadoId: adr.empleado_id,
          pdvId: adr.pdv_id,
          operationDate: adr.fecha || monthStartIso,
          resolvedMap: resolvedSupervisorLookup,
          assignments: asgData,
          supervisorPdvs: supervisorPdvsData,
          employeeSupervisorId: adr.supervisor_empleado_id,
        });

        if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId && supervisorId !== actorEmpleadoId) {
          return;
        }

        dataset.push({
          fechaOperacion: '',
          weekBucket: '',
          pdvId: adr.pdv_id,
          pdvLabel: pdv ? `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}` : 'PDV sin nombre',
          pdvClaveBtl: pdv?.clave_btl ?? 'SIN BTL',
          pdvIdCadena: pdv?.id_cadena ?? '',
          pdvNombre: pdv?.nombre ?? 'PDV sin nombre',
          empleadoId: adr.empleado_id,
          empleadoLabel: emp?.nombre_completo ?? 'Sin dermoconsejera',
          empleadoIdNomina: emp?.id_nomina ?? employeeNominaMap.get(adr.empleado_id) ?? '',
          supervisorId,
          supervisorLabel: supervisorId ? (supervisorMap.get(supervisorId) || 'Sin supervisor') : 'Sin supervisor',
          zona: pdv?.zona ?? 'Sin zona',
          cadena: pdv?.cadena_id ? (cadenaMap.get(pdv.cadena_id) ?? 'Sin cadena') : 'Sin cadena',
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
        const empSupId = resolveEffectiveSupervisorId({
          empleadoId: emp.id,
          pdvId: '',
          operationDate: monthStartIso,
          resolvedMap: resolvedSupervisorLookup,
          assignments: asgData,
          supervisorPdvs: supervisorPdvsData,
          employeeSupervisorId: emp.supervisor_empleado_id ?? null,
        });
        if (actorPuesto === 'SUPERVISOR' && actorEmpleadoId && empSupId !== actorEmpleadoId) {
          return;
        }
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
          empleadoIdNomina: emp.id_nomina ?? '',
          supervisorId: empSupId,
          supervisorLabel: empSupId ? (supervisorMap.get(empSupId) || 'Sin supervisor') : 'Sin supervisor',
          zona: 'Sin zona',
          cadena: 'Sin cadena',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: true,
          total: 0,
        });
      }
    });

    if (esSupervisor && actorEmpleadoId) {
      dataset.splice(
        0,
        dataset.length,
        ...dataset.filter((item) => item.supervisorId === actorEmpleadoId)
      );
    }

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

    const capturasDetalle: VentaCapturaDetalleItem[] = (captData ?? []).map((c: any) => ({
      id: c.id,
      createdAt: c.created_at,
      empleadoId: c.empleado_id,
      fechaOperativa: String(c.fecha_operativa || '').slice(0, 10),
      tipoRegistro: c.tipo_registro,
      subtipoRegistro: c.subtipo_registro ?? null,
      cantidad: Number(c.cantidad ?? (c.tipo_registro === 'LOVE_ISDIN' ? 1 : 1)),
      productoNombre: c.producto_nombre_snapshot ?? null,
      materialNombre: c.material_nombre_snapshot ?? null,
      materialNombreCorto: c.material?.nombre_corto ?? null,
      observaciones: c.observaciones ?? null,
      pdvId: c.pdv_id ?? null,
      pdvNombre: c.pdv?.nombre ?? null,
      pdvClaveBtl: c.pdv?.clave_btl ?? null,
    }));

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
      capturasDetalle,
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
    created_at,
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

  const productoMap = new Map(((productosData ?? []) as Producto[]).map((p) => [p.id, p] as const));

  const dataset: VentaDatasetItem[] = monthVentasRows.map((row) => {
    const pdv = obtenerPrimero(row.pdv);
    const empleado = obtenerPrimero(row.empleado);
    const dateStr = getMexicoDateIso(row.fecha_utc);
    const fechaRegistro = row.created_at ? getMexicoDateIso(row.created_at) : dateStr;
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
      fechaRegistro,
      weekBucket,
      pdvId: row.pdv_id,
      pdvLabel: pdv ? `${pdv.clave_btl ?? 'SIN BTL'} - ${pdv.nombre}` : 'PDV sin nombre',
      pdvClaveBtl: pdv?.clave_btl ?? 'SIN BTL',
      pdvIdCadena: pdv?.id_cadena ?? '',
      pdvNombre: pdv?.nombre ?? 'PDV sin nombre',
      empleadoId: row.empleado_id,
      empleadoLabel: empleado?.nombre_completo ?? 'Sin dermoconsejera',
      empleadoIdNomina: empleado?.id_nomina ?? '',
      supervisorId,
      supervisorLabel,
      zona,
      cadena,
      totalUnidades: row.total_unidades,
      totalMonto: Number(row.total_monto),
      confirmada: row.confirmada,
      total: 1,
      productoId: row.producto_id ?? null,
      productoSku: row.producto_sku ?? prod?.sku ?? null,
      productoNombre: row.producto_nombre ?? prod?.nombre ?? null,
      productoNombreCorto: row.producto_nombre_corto ?? prod?.nombre_corto ?? null,
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

  if (resolvedOptions.bypassCache) {
    const tags = buildVentasCacheTags(actor);
    tags.forEach((tag) => {
      try {
        revalidateTag(tag, 'max');
      } catch (err) {
        console.warn(`[ventaService] Error revalidating tag ${tag}:`, err);
      }
    });
    return obtenerPanelVentasUncached(customSupabase ?? createServiceClient(), resolvedOptions);
  }

  if (customSupabase) {
    return obtenerPanelVentasUncached(customSupabase, resolvedOptions);
  }

  const service = options?.serviceClient ?? createServiceClient();
  return unstable_cache(
    async () => obtenerPanelVentasUncached(service, { ...resolvedOptions, serviceClient: service }),
    ['ventas-panel-v6', buildVentasCacheKey(actor, resolvedOptions)],
    {
      revalidate: VENTAS_PANEL_REVALIDATE_SECONDS,
      tags: buildVentasCacheTags(actor),
    }
  )();
}
