import { unstable_cache, revalidateTag } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import { createServiceClient } from '@/lib/supabase/server';
import type {
  Asistencia,
  CuentaCliente,
  Empleado,
  LoveIsdin,
  LoveIsdinResumenDiario,
  LoveIsdinQrAsignacion,
  LoveIsdinQrCodigo,
  Pdv,
  UsuarioSistema,
} from '@/types/database';
import { resolveLoveEffectiveAccount } from '../lib/loveRegistration';
import { resolveLoveQrSignedUrl } from '../lib/loveQrImport';
import { computeLoveQuotaProgress, fetchLoveQuotaTargetRows } from '../lib/loveQuota';
import {
  obtenerRegistrosExtemporaneosPanel,
  type RegistroExtemporaneoListadoItem,
  type RegistroExtemporaneoResumen,
} from '@/features/solicitudes/extemporaneoService';

type MaybeMany<T> = T | T[] | null;

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'from' in value &&
    typeof (value as { from?: unknown }).from === 'function'
  );
}

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre' | 'identificador'>;
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
type PdvRelacion = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id'>;
type LoveQrCodigoRelacion = Pick<LoveIsdinQrCodigo, 'id' | 'codigo' | 'imagen_url' | 'estado'>;
type UsuarioEmpleadoRelacion = Pick<UsuarioSistema, 'empleado_id' | 'estado_cuenta'>;
type SupervisorRelacion = Pick<Empleado, 'id' | 'nombre_completo'>;
type AsistenciaSupervisorRelacion = Pick<Asistencia, 'supervisor_empleado_id'>;

interface LoveIsdinQueryRow extends Pick<
  LoveIsdin,
  | 'id'
  | 'cuenta_cliente_id'
  | 'asistencia_id'
  | 'empleado_id'
  | 'pdv_id'
  | 'qr_codigo_id'
  | 'qr_asignacion_id'
  | 'qr_personal'
  | 'afiliado_nombre'
  | 'afiliado_contacto'
  | 'ticket_folio'
  | 'fecha_utc'
  | 'estatus'
  | 'evidencia_url'
  | 'evidencia_hash'
  | 'metadata'
> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
  empleado: MaybeMany<EmpleadoRelacion>;
  pdv: MaybeMany<PdvRelacion>;
  asistencia: MaybeMany<AsistenciaSupervisorRelacion>;
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
  | 'check_in_utc'
  | 'check_out_utc'
  | 'supervisor_empleado_id'
> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
}

interface LoveQrAsignacionRow extends Pick<
  LoveIsdinQrAsignacion,
  | 'id'
  | 'cuenta_cliente_id'
  | 'qr_codigo_id'
  | 'empleado_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'motivo'
  | 'observaciones'
> {}

interface LoveQrCodigoRow extends LoveQrCodigoRelacion {}

interface LoveQrImportLoteRow {
  id: string;
  archivo_nombre: string;
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO';
  advertencias: unknown;
  metadata: Record<string, unknown> | null;
  confirmado_en: string | null;
  created_at: string;
}

interface LoveResumenDiarioRow extends Pick<
  LoveIsdinResumenDiario,
  | 'fecha_operacion'
  | 'cuenta_cliente_id'
  | 'pdv_id'
  | 'empleado_id'
  | 'supervisor_empleado_id'
  | 'zona'
  | 'cadena'
  | 'qr_codigo_id'
  | 'afiliaciones_total'
  | 'afiliaciones_validas'
  | 'afiliaciones_pendientes'
  | 'afiliaciones_rechazadas'
  | 'afiliaciones_duplicadas'
> {}

interface CuentaUsuarioRow extends UsuarioEmpleadoRelacion {
  empleado: MaybeMany<EmpleadoRelacion>;
}

interface SelectorOption {
  id: string;
  label: string;
}

export interface LoveIsdinResumen {
  total: number;
  validas: number;
  pendientes: number;
  rechazadas: number;
  afiliacionesHoy: number;
}

export interface LoveIsdinListadoItem {
  id: string;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  asistenciaId: string | null;
  empleadoId: string;
  empleado: string;
  puesto: string | null;
  idNomina: string | null;
  pdvId: string;
  pdvClaveBtl: string | null;
  pdvNombre: string | null;
  zona: string | null;
  cadena: string | null;
  qrCodigoId: string | null;
  qrAsignacionId: string | null;
  qrPersonal: string | null;
  afiliadoNombre: string;
  afiliadoContacto: string | null;
  ticketFolio: string | null;
  fechaUtc: string;
  estatus: string;
  evidenciaUrl: string | null;
  tieneEvidencia: boolean;
  afiliacionesHoyEmpleado: number;
  supervisorId: string | null;
}

export interface LoveIsdinContexto {
  id: string;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  empleadoId: string;
  empleado: string;
  pdvId: string;
  pdvClaveBtl: string;
  pdvNombre: string;
  fechaOperacion: string;
}

export interface LoveAfiliacionesKpi {
  hoy: number;
  semana: number;
  mes: number;
  objetivoHoy: number;
  objetivoSemana: number;
  objetivoMes: number;
  cumplimientoHoyPct: number;
  cumplimientoSemanaPct: number;
  cumplimientoMesPct: number;
  validasMes: number;
  pendientesMes: number;
}

export interface LoveAggregateItem {
  id: string;
  label: string;
  helper: string | null;
  total: number;
  objetivo: number;
  validas: number;
  pendientes: number;
  rechazadas: number;
  duplicadas: number;
}

export interface LoveTimelinePoint {
  bucket: string;
  total: number;
  objetivo: number;
  validas: number;
  pendientes: number;
  rechazadas: number;
  duplicadas: number;
}

export interface LoveKpiDatasetItem {
  fechaOperacion: string;
  weekBucket: string;
  pdvId: string;
  pdvLabel: string;
  pdvNombre?: string | null;
  pdvClaveBtl?: string | null;
  empleadoId: string;
  empleadoLabel: string;
  supervisorId: string | null;
  supervisorLabel: string;
  zona: string;
  cadena: string;
  total: number;
  objetivo: number;
  validas: number;
  pendientes: number;
  rechazadas: number;
  duplicadas: number;
  ausenciaTipo?: string | null;
  ausenciaDescuento?: number;
  ausenciaObservacion?: string | null;
  estatusLaboral?: string;
}

export interface LoveQrResumen {
  activos: number;
  disponibles: number;
  bloqueados: number;
  bajas: number;
  dcActivasConQr: number;
  dcActivasSinQr: number;
}

export interface LoveQrInventoryItem {
  qrCodigoId: string;
  codigo: string;
  imageUrl: string | null;
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA';
  empleadoId: string | null;
  empleado: string | null;
  idNomina: string | null;
  supervisorId: string | null;
  supervisor: string | null;
  zona: string | null;
  fechaInicio: string | null;
  motivo: string | null;
}

export interface LoveQrImportLotItem {
  id: string;
  archivoNombre: string;
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO';
  creadoEn: string;
  confirmadoEn: string | null;
  advertencias: number;
  tipoCarga: string | null;
  manifiestoPath: string | null;
  zipPath: string | null;
}

export interface LoveIsdinFailedRegistrationItem {
  id: string;
  fecha: string;
  empleado: string;
  pdv: string;
  pdvClave: string;
  tipoFalla: 'RECHAZADA' | 'DUPLICADA' | 'INTENTO_FALLIDO';
  causa: string;
  detalles: string | null;
}

export interface LoveIsdinFailedReasonStat {
  causa: string;
  total: number;
  porcentaje: number;
}

export interface LoveIsdinPanelData {
  scopeLabel: string;
  resumen: LoveIsdinResumen;
  afiliacionesKpi: LoveAfiliacionesKpi;
  afiliaciones: LoveIsdinListadoItem[];
  jornadasContexto: LoveIsdinContexto[];
  cuentas: SelectorOption[];
  empleados: SelectorOption[];
  dermoconsejerasSinQr: SelectorOption[];
  pdvs: SelectorOption[];
  timelineDiaria: LoveTimelinePoint[];
  timelineSemanal: LoveTimelinePoint[];
  kpiDataset: LoveKpiDatasetItem[];
  porPdv: LoveAggregateItem[];
  porDc: LoveAggregateItem[];
  porSupervisor: LoveAggregateItem[];
  porZona: LoveAggregateItem[];
  porCadena: LoveAggregateItem[];
  qrResumen: LoveQrResumen;
  qrInventario: LoveQrInventoryItem[];
  qrInfraestructuraLista: boolean;
  qrMensajeInfraestructura?: string;
  qrImportLotes: LoveQrImportLotItem[];
  resumenExtemporaneo: RegistroExtemporaneoResumen;
  registrosExtemporaneos: RegistroExtemporaneoListadoItem[];
  registrosFallidos: LoveIsdinFailedRegistrationItem[];
  causasFallas: LoveIsdinFailedReasonStat[];
  paginacion: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  infraestructuraLista: boolean;
  mensajeInfraestructura?: string;
}

const DEFAULT_RESUMEN: LoveIsdinResumen = {
  total: 0,
  validas: 0,
  pendientes: 0,
  rechazadas: 0,
  afiliacionesHoy: 0,
};

const DEFAULT_KPI: LoveAfiliacionesKpi = {
  hoy: 0,
  semana: 0,
  mes: 0,
  objetivoHoy: 0,
  objetivoSemana: 0,
  objetivoMes: 0,
  cumplimientoHoyPct: 0,
  cumplimientoSemanaPct: 0,
  cumplimientoMesPct: 0,
  validasMes: 0,
  pendientesMes: 0,
};

const DEFAULT_QR_RESUMEN: LoveQrResumen = {
  activos: 0,
  disponibles: 0,
  bloqueados: 0,
  bajas: 0,
  dcActivasConQr: 0,
  dcActivasSinQr: 0,
};

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
};

function obtenerSupervisorEfectivoLove(item: LoveIsdinQueryRow) {
  const asistenciaSupervisor = obtenerPrimero(item.asistencia)?.supervisor_empleado_id ?? null;
  if (asistenciaSupervisor) {
    return asistenciaSupervisor;
  }

  const metadata =
    item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : null;
  const metadataSupervisor = metadata?.supervisor_empleado_id;
  if (typeof metadataSupervisor === 'string' && metadataSupervisor) {
    return metadataSupervisor;
  }

  return obtenerPrimero(item.empleado)?.supervisor_empleado_id ?? null;
}

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

function getMexicoDateIso(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function getTodayMexicoIso() {
  return getMexicoDateIso(new Date().toISOString());
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function getMonthEndIso(monthIso: string) {
  const [year, month] = monthIso.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).toISOString().slice(0, 10);
}

function isSameOperationalDay(value: string, today: string) {
  return getMexicoDateIso(value) === today;
}

function sortAggregateItems(map: Map<string, LoveAggregateItem>) {
  return Array.from(map.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label, 'es-MX');
  });
}

function sortTimeline(map: Map<string, LoveTimelinePoint>) {
  return Array.from(map.values()).sort((left, right) => left.bucket.localeCompare(right.bucket));
}

function categorizarCausaFalla(observaciones: string | null): string {
  if (!observaciones) {
    return 'Sin observaciones especificadas';
  }
  const text = observaciones.toLowerCase();
  if (
    text.includes('lenta') ||
    text.includes('fallando') ||
    text.includes('tardaba') ||
    text.includes('sistema') ||
    text.includes('plataforma') ||
    text.includes('error') ||
    text.includes('tardar')
  ) {
    return 'Falla de plataforma / Lentitud';
  }
  if (
    text.includes('cliente') &&
    (text.includes('desesper') ||
      text.includes('quiso') ||
      text.includes('retir') ||
      text.includes('ir') ||
      text.includes('domicilio'))
  ) {
    return 'Cliente se desesperó / Desistió';
  }
  if (
    text.includes('compra') ||
    text.includes('ticket') ||
    text.includes('acumular') ||
    text.includes('no pudo')
  ) {
    return 'Problema con acumulación de compra / Ticket';
  }
  if (text.includes('duplicado') || text.includes('ya estaba') || text.includes('repetido')) {
    return 'Registro duplicado';
  }
  return 'Otras situaciones operativas';
}

function mergeAggregateCounts(
  target: LoveAggregateItem | LoveTimelinePoint,
  source: {
    afiliaciones_total: number;
    afiliaciones_validas: number;
    afiliaciones_pendientes: number;
    afiliaciones_rechazadas: number;
    afiliaciones_duplicadas: number;
    objetivo?: number;
  }
) {
  target.total += source.afiliaciones_total;
  target.objetivo += source.objetivo ?? 0;
  target.validas += source.afiliaciones_validas;
  target.pendientes += source.afiliaciones_pendientes;
  target.rechazadas += source.afiliaciones_rechazadas;
  target.duplicadas += source.afiliaciones_duplicadas;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

type QueryResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

interface QueryWithOptionalIn<T> {
  in?: (column: string, values: string[]) => { limit: (count: number) => QueryResult<T> };
  limit: (count: number) => QueryResult<T>;
}

interface ObtenerLoveIsdinPanelOptions {
  actor?: ActorActual | null;
  serviceClient?: TypedSupabaseClient;
  page?: number;
  pageSize?: number;
  month?: string | null;
  bypassCache?: boolean;
}

const LOVE_ISDIN_PANEL_REVALIDATE_SECONDS = 60;

function buildLoveIsdinCacheKey(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  options: ObtenerLoveIsdinPanelOptions
) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    page: normalizePage(options.page),
    pageSize: normalizePageSize(options.pageSize),
    month: options.month ?? null,
  });
}

function buildLoveIsdinCacheTags(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>
) {
  return buildModuleCacheTags({
    module: 'love-isdin',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
  });
}

async function obtenerPanelLoveIsdinUncached(
  supabase: TypedSupabaseClient,
  options: ObtenerLoveIsdinPanelOptions = {}
): Promise<LoveIsdinPanelData> {
  const client = supabase;
  const storageClient = options?.serviceClient ?? supabase;
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const resolvedAccount = options?.actor
    ? await resolveLoveEffectiveAccount(storageClient, options.actor.cuentaClienteId)
    : null;
  const accountId = resolvedAccount?.id ?? null;
  const scopeLabel = resolvedAccount?.nombre ?? 'LOVE ISDIN';
  const supervisorActorId =
    options.actor?.puesto === 'SUPERVISOR' ? options.actor.empleadoId : null;
  const asistenciaSupervisorSelect = supervisorActorId
    ? 'asistencia:asistencia_id!inner(supervisor_empleado_id)'
    : 'asistencia:asistencia_id(supervisor_empleado_id)';

  const todayIso = getTodayMexicoIso();
  const currentWeekStart = getWeekStartIso(todayIso);
  const currentMonth = options?.month || todayIso.slice(0, 7);
  const currentMonthStart = `${currentMonth}-01`;
  const currentMonthEnd = getMonthEndIso(currentMonth);

  // Mexico City timezone (UTC-6) start and end boundaries for the month in UTC
  const currentMonthStartUtc = `${currentMonth}-01T06:00:00.000Z`;
  const [yearStr, monthStr] = currentMonth.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthNum = month === 12 ? 1 : month + 1;
  const nextMonthStr = String(nextMonthNum).padStart(2, '0');
  const currentMonthEndUtc = `${nextMonthYear}-${nextMonthStr}-01T05:59:59.999Z`;

  let countQuery = client
    .from('love_isdin')
    .select(`id, ${asistenciaSupervisorSelect}`, { count: 'exact', head: true })
    .in('estatus', ['VALIDA', 'PENDIENTE_VALIDACION'])
    .gte('fecha_utc', currentMonthStartUtc)
    .lte('fecha_utc', currentMonthEndUtc);

  if (accountId) {
    countQuery = countQuery.eq('cuenta_cliente_id', accountId);
  }

  if (supervisorActorId) {
    countQuery = countQuery.eq('asistencia.supervisor_empleado_id', supervisorActorId);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    return {
      scopeLabel,
      resumen: DEFAULT_RESUMEN,
      afiliacionesKpi: DEFAULT_KPI,
      afiliaciones: [],
      jornadasContexto: [],
      cuentas: [],
      empleados: [],
      dermoconsejerasSinQr: [],
      pdvs: [],
      timelineDiaria: [],
      timelineSemanal: [],
      kpiDataset: [],
      porPdv: [],
      porDc: [],
      porSupervisor: [],
      porZona: [],
      porCadena: [],
      qrResumen: DEFAULT_QR_RESUMEN,
      qrInventario: [],
      qrInfraestructuraLista: false,
      qrMensajeInfraestructura:
        'Las tablas de QR oficial aun no estan disponibles. Aplica la migracion de LOVE ISDIN para habilitar el inventario.',
      qrImportLotes: [],
      resumenExtemporaneo: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registrosExtemporaneos: [],
      registrosFallidos: [],
      causasFallas: [],
      paginacion: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `love_isdin` aun no esta disponible en Supabase. Ejecuta la migracion operativa de LOVE ISDIN.',
    };
  }

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let loveListQuery = client
    .from('love_isdin')
    .select(
      `
      id,
      cuenta_cliente_id,
      asistencia_id,
      empleado_id,
      pdv_id,
      qr_codigo_id,
      qr_asignacion_id,
      qr_personal,
      afiliado_nombre,
      afiliado_contacto,
      ticket_folio,
      fecha_utc,
      estatus,
      evidencia_url,
      evidencia_hash,
      metadata,
      ${asistenciaSupervisorSelect},
      cuenta_cliente:cuenta_cliente_id(id, nombre, identificador),
      empleado:empleado_id(id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral),
      pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id)
    `
    )
    .in('estatus', ['VALIDA', 'PENDIENTE_VALIDACION'])
    .gte('fecha_utc', currentMonthStartUtc)
    .lte('fecha_utc', currentMonthEndUtc)
    .order('fecha_utc', { ascending: false });

  let jornadasQuery = client
    .from('asistencia')
    .select(
      `
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_operacion,
      empleado_nombre,
      pdv_clave_btl,
      pdv_nombre,
      check_in_utc,
      check_out_utc,
      supervisor_empleado_id,
      cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)
    `
    )
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false });

  if (accountId) {
    loveListQuery = loveListQuery.eq('cuenta_cliente_id', accountId);
    jornadasQuery = jornadasQuery.eq('cuenta_cliente_id', accountId);
  }

  if (supervisorActorId) {
    loveListQuery = loveListQuery.eq('asistencia.supervisor_empleado_id', supervisorActorId);
    jornadasQuery = jornadasQuery.eq('supervisor_empleado_id', supervisorActorId);
  }

  let failedCapturesQuery = client
    .from('captura_publica_registro')
    .select(
      `
      id,
      fecha_operativa,
      observaciones,
      metadata,
      created_at,
      empleado:empleado_id(nombre_completo, id_nomina, zona),
      pdv:pdv_id(nombre, clave_btl)
    `
    )
    .eq('tipo_registro', 'LOVE_ISDIN')
    .eq('subtipo_registro', 'LOVE_FALLIDO')
    .order('fecha_operativa', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  let failedLoveQuery = client
    .from('love_isdin')
    .select(
      `
      id,
      fecha_utc,
      estatus,
      afiliado_nombre,
      ticket_folio,
      metadata,
      ${asistenciaSupervisorSelect},
      empleado:empleado_id(nombre_completo, id_nomina, zona),
      pdv:pdv_id(nombre, clave_btl)
    `
    )
    .in('estatus', ['RECHAZADA', 'DUPLICADA'])
    .order('fecha_utc', { ascending: false })
    .limit(200);

  if (accountId) {
    failedCapturesQuery = failedCapturesQuery.eq('cuenta_cliente_id', accountId);
    failedLoveQuery = failedLoveQuery.eq('cuenta_cliente_id', accountId);
  }

  if (supervisorActorId) {
    failedCapturesQuery = failedCapturesQuery.eq('supervisor_empleado_id', supervisorActorId);
    failedLoveQuery = failedLoveQuery.eq('asistencia.supervisor_empleado_id', supervisorActorId);
  }

  const [
    loveResult,
    jornadasResult,
    accountsResult,
    empleadosResult,
    pdvsResult,
    failedCapturesResult,
    failedLoveResult,
  ] = await Promise.all([
    loveListQuery.range(from, to),
    jornadasQuery.limit(24),
    accountId
      ? Promise.resolve({
          data: [resolvedAccount],
          error: null,
        })
      : client
          .from('cuenta_cliente')
          .select('id, nombre, identificador')
          .eq('activa', true)
          .order('nombre')
          .limit(10),
    client
      .from('empleado')
      .select('id, id_nomina, nombre_completo, puesto')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo')
      .limit(60),
    client
      .from('pdv')
      .select('id, clave_btl, nombre')
      .eq('estatus', 'ACTIVO')
      .order('nombre')
      .limit(60),
    failedCapturesQuery,
    failedLoveQuery,
  ]);

  if (loveResult.error) {
    return {
      scopeLabel,
      resumen: DEFAULT_RESUMEN,
      afiliacionesKpi: DEFAULT_KPI,
      afiliaciones: [],
      jornadasContexto: [],
      cuentas: [],
      empleados: [],
      dermoconsejerasSinQr: [],
      pdvs: [],
      timelineDiaria: [],
      timelineSemanal: [],
      kpiDataset: [],
      porPdv: [],
      porDc: [],
      porSupervisor: [],
      porZona: [],
      porCadena: [],
      qrResumen: DEFAULT_QR_RESUMEN,
      qrInventario: [],
      qrInfraestructuraLista: false,
      qrMensajeInfraestructura:
        'Las tablas de QR oficial aun no estan disponibles. Aplica la migracion de LOVE ISDIN para habilitar el inventario.',
      qrImportLotes: [],
      resumenExtemporaneo: {
        total: 0,
        pendientes: 0,
        aprobados: 0,
        rechazados: 0,
      },
      registrosExtemporaneos: [],
      registrosFallidos: [],
      causasFallas: [],
      paginacion: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `love_isdin` aun no esta disponible en Supabase. Ejecuta la migracion operativa de LOVE ISDIN.',
    };
  }

  const loveRows = (loveResult.data ?? []) as LoveIsdinQueryRow[];

  const cadenaIds = Array.from(
    new Set(
      loveRows
        .map((item) => obtenerPrimero(item.pdv)?.cadena_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let monthLoveRows: LoveIsdinQueryRow[] = [];
  let lovePageOffset = 0;
  const LOVE_PAGE_SIZE = 1000;

  while (true) {
    let query = client
      .from('love_isdin')
      .select(
        `
        id,
        cuenta_cliente_id,
        asistencia_id,
        empleado_id,
        pdv_id,
        qr_codigo_id,
        qr_asignacion_id,
        qr_personal,
        afiliado_nombre,
        afiliado_contacto,
        ticket_folio,
        fecha_utc,
        estatus,
        evidencia_url,
        evidencia_hash,
        metadata,
        ${asistenciaSupervisorSelect},
        cuenta_cliente:cuenta_cliente_id(id, nombre, identificador),
        empleado:empleado_id(id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral),
        pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id)
      `
      )
      .gte('fecha_utc', currentMonthStartUtc)
      .lte('fecha_utc', currentMonthEndUtc)
      .order('fecha_utc', { ascending: false })
      .range(lovePageOffset, lovePageOffset + LOVE_PAGE_SIZE - 1);

    if (accountId) {
      query = query.eq('cuenta_cliente_id', accountId);
    }

    if (supervisorActorId) {
      query = query.eq('asistencia.supervisor_empleado_id', supervisorActorId);
    }

    const { data: pageData, error: pageErr } = await query;
    if (pageErr) {
      console.error('[loveIsdinService] Error paging month love_isdin:', pageErr.message);
      break;
    }
    if (!pageData || pageData.length === 0) {
      break;
    }
    monthLoveRows = monthLoveRows.concat(pageData as unknown as LoveIsdinQueryRow[]);
    if (pageData.length < LOVE_PAGE_SIZE) {
      break;
    }
    lovePageOffset += LOVE_PAGE_SIZE;
    if (lovePageOffset >= 100000) {
      break;
    }
  }

  let monthSummaryRowsFromView: LoveResumenDiarioRow[] = [];
  let summaryPageOffset = 0;
  const SUMMARY_PAGE_SIZE = 1000;

  while (true) {
    let query = client
      .from('love_isdin_resumen_diario')
      .select(
        `
        fecha_operacion,
        cuenta_cliente_id,
        pdv_id,
        empleado_id,
        supervisor_empleado_id,
        zona,
        cadena,
        qr_codigo_id,
        afiliaciones_total,
        afiliaciones_validas,
        afiliaciones_pendientes,
        afiliaciones_rechazadas,
        afiliaciones_duplicadas
      `
      )
      .gte('fecha_operacion', currentMonthStart)
      .lte('fecha_operacion', currentMonthEnd)
      .order('fecha_operacion', { ascending: true })
      .range(summaryPageOffset, summaryPageOffset + SUMMARY_PAGE_SIZE - 1);

    if (accountId) {
      query = query.eq('cuenta_cliente_id', accountId);
    }

    if (supervisorActorId) {
      query = query.eq('supervisor_empleado_id', supervisorActorId);
    }

    const { data: pageData, error: pageErr } = await query;
    if (pageErr) {
      console.error('[loveIsdinService] Error paging love_isdin_resumen_diario:', pageErr.message);
      break;
    }
    if (!pageData || pageData.length === 0) {
      break;
    }
    monthSummaryRowsFromView = monthSummaryRowsFromView.concat(
      pageData as unknown as LoveResumenDiarioRow[]
    );
    if (pageData.length < SUMMARY_PAGE_SIZE) {
      break;
    }
    summaryPageOffset += SUMMARY_PAGE_SIZE;
    if (summaryPageOffset >= 100000) {
      break;
    }
  }

  const [cadenaResult, qrCodesResult, qrAssignmentsResult, qrImportLotsResult, dcUsersResult] =
    await Promise.all([
      (() => {
        if (cadenaIds.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }

        const query = client.from('cadena').select('id, nombre') as unknown as QueryWithOptionalIn<
          Pick<CuentaCliente, 'id'> & { nombre: string }
        >;

        return typeof query.in === 'function'
          ? query.in('id', cadenaIds).limit(Math.max(cadenaIds.length, 1))
          : Promise.resolve({ data: [], error: null });
      })(),
      (() => {
        let query = client
          .from('love_isdin_qr_codigo')
          .select('id, codigo, imagen_url, estado')
          .order('created_at', { ascending: false })
          .limit(500);

        if (accountId) {
          query = query.eq('cuenta_cliente_id', accountId);
        }

        return query;
      })(),
      (() => {
        const baseQuery = client
          .from('love_isdin_qr_asignacion')
          .select(
            'id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin, motivo, observaciones'
          )
          .order('fecha_inicio', { ascending: false })
          .limit(500);

        const scopedQuery =
          typeof baseQuery.is === 'function' ? baseQuery.is('fecha_fin', null) : baseQuery;
        return accountId ? scopedQuery.eq('cuenta_cliente_id', accountId) : scopedQuery;
      })(),
      (() => {
        let query = client
          .from('love_isdin_qr_import_lote')
          .select('id, archivo_nombre, estado, advertencias, metadata, confirmado_en, created_at')
          .order('created_at', { ascending: false })
          .limit(24);

        if (accountId) {
          query = query.eq('cuenta_cliente_id', accountId);
        }

        return query;
      })(),
      (() => {
        let query = client
          .from('usuario')
          .select(
            `
          empleado_id,
          estado_cuenta,
          empleado:empleado_id(id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral)
        `
          )
          .limit(600);

        if (accountId) {
          query = query.eq('cuenta_cliente_id', accountId);
        }

        return query;
      })(),
    ]);

  const cadenaById = new Map(
    ((cadenaResult.data ?? []) as Array<Pick<CuentaCliente, 'id'> & { nombre: string }>).map(
      (item) => [item.id, item.nombre] as const
    )
  );

  const monthLoveRowsFiltered = monthLoveRows.filter((item) => {
    const operationDate = getMexicoDateIso(item.fecha_utc);
    return operationDate.slice(0, 7) === currentMonth;
  });

  const monthSummaryRowsFromViewFiltered = monthSummaryRowsFromView.filter(
    (item) => item.fecha_operacion.slice(0, 7) === currentMonth
  );
  const loveQuotaTargetsResult = await fetchLoveQuotaTargetRows(client as TypedSupabaseClient, {
    accountId,
    dateFrom: currentMonthStart,
    dateTo: currentMonthEnd,
    supervisorId: supervisorActorId,
  });

  const employeeDetailById = new Map<string, EmpleadoRelacion>();
  const pdvDetailById = new Map<string, PdvRelacion>();

  for (const row of [...loveRows, ...monthLoveRowsFiltered]) {
    const empleado = obtenerPrimero(row.empleado);
    const pdv = obtenerPrimero(row.pdv);

    if (empleado) {
      employeeDetailById.set(empleado.id, empleado);
    }

    if (pdv) {
      pdvDetailById.set(pdv.id, pdv);
    }
  }

  const supervisorIds = Array.from(
    new Set([
      ...monthSummaryRowsFromViewFiltered
        .map((item) => item.supervisor_empleado_id)
        .filter((value): value is string => Boolean(value)),
      ...monthLoveRowsFiltered
        .map((item) => obtenerSupervisorEfectivoLove(item))
        .filter((value): value is string => Boolean(value)),
    ])
  );

  const supervisorsResult =
    supervisorIds.length === 0
      ? { data: [], error: null }
      : await (() => {
          const query = client
            .from('empleado')
            .select('id, nombre_completo') as unknown as QueryWithOptionalIn<SupervisorRelacion>;

          return typeof query.in === 'function'
            ? query.in('id', supervisorIds).limit(Math.max(supervisorIds.length, 1))
            : Promise.resolve({ data: [], error: null });
        })();

  const supervisorById = new Map(
    ((supervisorsResult.data ?? []) as SupervisorRelacion[]).map(
      (item) => [item.id, item.nombre_completo] as const
    )
  );

  const monthSummaryRows: LoveResumenDiarioRow[] =
    monthSummaryRowsFromViewFiltered.length > 0
      ? monthSummaryRowsFromViewFiltered
      : monthLoveRowsFiltered.map((item) => {
          const empleado = obtenerPrimero(item.empleado);
          const pdv = obtenerPrimero(item.pdv);

          return {
            fecha_operacion: getMexicoDateIso(item.fecha_utc),
            cuenta_cliente_id: item.cuenta_cliente_id,
            pdv_id: item.pdv_id,
            empleado_id: item.empleado_id,
            supervisor_empleado_id: obtenerSupervisorEfectivoLove(item),
            zona: pdv?.zona ?? empleado?.zona ?? null,
            cadena: pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? null) : null,
            qr_codigo_id: item.qr_codigo_id,
            afiliaciones_total: 1,
            afiliaciones_validas: item.estatus === 'VALIDA' ? 1 : 0,
            afiliaciones_pendientes: item.estatus === 'PENDIENTE_VALIDACION' ? 1 : 0,
            afiliaciones_rechazadas: item.estatus === 'RECHAZADA' ? 1 : 0,
            afiliaciones_duplicadas: item.estatus === 'DUPLICADA' ? 1 : 0,
          };
        });

  const kpiDatasetMap = new Map<string, LoveKpiDatasetItem>();

  for (const target of loveQuotaTargetsResult.error ? [] : loveQuotaTargetsResult.data) {
    const key = `${target.fechaOperacion}::${target.empleadoId}::${target.pdvId}`;
    kpiDatasetMap.set(key, {
      fechaOperacion: target.fechaOperacion,
      weekBucket: target.weekBucket,
      pdvId: target.pdvId,
      pdvLabel: target.pdvLabel,
      pdvNombre: target.pdvNombre ?? null,
      pdvClaveBtl: target.pdvClaveBtl ?? null,
      empleadoId: target.empleadoId,
      empleadoLabel: target.empleadoLabel,
      supervisorId: target.supervisorId,
      supervisorLabel: target.supervisorLabel,
      zona: target.zona,
      cadena: target.cadena,
      total: 0,
      objetivo: target.objetivo,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
      ausenciaTipo: target.ausenciaTipo ?? null,
      ausenciaDescuento: target.ausenciaDescuento ?? 0,
      ausenciaObservacion: target.ausenciaObservacion ?? null,
      estatusLaboral: target.estatusLaboral ?? 'ACTIVO',
    });
  }

  for (const row of monthSummaryRows) {
    const empleado = employeeDetailById.get(row.empleado_id) ?? null;
    const pdv = pdvDetailById.get(row.pdv_id) ?? null;
    const cadena =
      row.cadena ??
      (pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? null) : null) ??
      'Sin cadena';
    const zona = row.zona ?? pdv?.zona ?? empleado?.zona ?? 'Sin zona';
    const supervisorId = row.supervisor_empleado_id;
    const key = `${row.fecha_operacion}::${row.empleado_id}::${row.pdv_id}`;
    const current =
      kpiDatasetMap.get(key) ??
      ({
        fechaOperacion: row.fecha_operacion,
        weekBucket: getWeekStartIso(row.fecha_operacion),
        pdvId: row.pdv_id,
        pdvLabel: `${pdv?.clave_btl ?? 'SIN BTL'} - ${pdv?.nombre ?? 'PDV sin nombre'}`,
        pdvNombre: pdv?.nombre ?? null,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        empleadoId: row.empleado_id,
        empleadoLabel: empleado?.nombre_completo ?? 'Sin dermoconsejera',
        supervisorId,
        supervisorLabel: supervisorId
          ? (supervisorById.get(supervisorId) ?? `Supervisor ${supervisorId.slice(0, 8)}`)
          : 'Sin supervisor',
        zona,
        cadena,
        total: 0,
        objetivo: 0,
        validas: 0,
        pendientes: 0,
        rechazadas: 0,
        duplicadas: 0,
        ausenciaTipo: null,
        ausenciaDescuento: 0,
        ausenciaObservacion: null,
        estatusLaboral: empleado?.estatus_laboral ?? 'ACTIVO',
      } satisfies LoveKpiDatasetItem);

    current.total += row.afiliaciones_validas + row.afiliaciones_pendientes;
    current.validas += row.afiliaciones_validas;
    current.pendientes += row.afiliaciones_pendientes;
    current.rechazadas += row.afiliaciones_rechazadas;
    current.duplicadas += row.afiliaciones_duplicadas;
    kpiDatasetMap.set(key, current);
  }

  const kpiDataset = Array.from(kpiDatasetMap.values())
    .filter((item) => !supervisorActorId || item.supervisorId === supervisorActorId)
    .sort((left, right) => {
      const dateDiff = left.fechaOperacion.localeCompare(right.fechaOperacion, 'es-MX');
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return left.empleadoLabel.localeCompare(right.empleadoLabel, 'es-MX');
    });

  const conteoHoyPorEmpleado = monthSummaryRows.reduce<Record<string, number>>((acc, item) => {
    if (item.fecha_operacion === todayIso) {
      acc[item.empleado_id] = (acc[item.empleado_id] ?? 0) + item.afiliaciones_total;
    }

    return acc;
  }, {});

  const afiliaciones = loveRows.map((item) => {
    const empleado = obtenerPrimero(item.empleado);
    const pdv = obtenerPrimero(item.pdv);

    return {
      id: item.id,
      cuentaClienteId: item.cuenta_cliente_id,
      cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
      asistenciaId: item.asistencia_id,
      empleadoId: item.empleado_id,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      puesto: empleado?.puesto ?? null,
      idNomina: empleado?.id_nomina ?? null,
      pdvId: item.pdv_id,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      pdvNombre: pdv?.nombre ?? null,
      zona: pdv?.zona ?? null,
      cadena: pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? null) : null,
      qrCodigoId: item.qr_codigo_id,
      qrAsignacionId: item.qr_asignacion_id,
      qrPersonal: item.qr_personal,
      afiliadoNombre: item.afiliado_nombre,
      afiliadoContacto: item.afiliado_contacto,
      ticketFolio: item.ticket_folio,
      fechaUtc: item.fecha_utc,
      estatus: item.estatus,
      evidenciaUrl: item.evidencia_url,
      tieneEvidencia: Boolean(item.evidencia_url && item.evidencia_hash),
      afiliacionesHoyEmpleado: conteoHoyPorEmpleado[item.empleado_id] ?? 0,
      supervisorId: obtenerSupervisorEfectivoLove(item),
    } satisfies LoveIsdinListadoItem;
  });

  const jornadasContexto = ((jornadasResult.data ?? []) as JornadaContextoQueryRow[])
    .filter((item) => Boolean(item.check_in_utc) && item.fecha_operacion === todayIso)
    .map((item) => ({
      id: item.id,
      cuentaClienteId: item.cuenta_cliente_id,
      cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
      empleadoId: item.empleado_id,
      empleado: item.empleado_nombre,
      pdvId: item.pdv_id,
      pdvClaveBtl: item.pdv_clave_btl,
      pdvNombre: item.pdv_nombre,
      fechaOperacion: item.fecha_operacion,
    }));

  const pdvMap = new Map<string, LoveAggregateItem>();
  const dcMap = new Map<string, LoveAggregateItem>();
  const supervisorMap = new Map<string, LoveAggregateItem>();
  const zonaMap = new Map<string, LoveAggregateItem>();
  const cadenaMap = new Map<string, LoveAggregateItem>();
  const dailyMap = new Map<string, LoveTimelinePoint>();
  const weeklyMap = new Map<string, LoveTimelinePoint>();

  for (const row of kpiDataset) {
    const operationDate = row.fechaOperacion;
    const weekBucket = row.weekBucket;
    const supervisorId = row.supervisorId;
    const supervisorNombre = row.supervisorLabel;
    const pdvKey = row.pdvId;
    const pdvEntry = pdvMap.get(pdvKey) ?? {
      id: pdvKey,
      label: row.pdvLabel,
      helper: [row.cadena, row.zona].filter(Boolean).join(' · ') || null,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    pdvMap.set(pdvKey, pdvEntry);
    mergeAggregateCounts(pdvEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const dcKey = row.empleadoId;
    const dcEntry = dcMap.get(dcKey) ?? {
      id: dcKey,
      label: row.empleadoLabel,
      helper: row.zona,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    dcMap.set(dcKey, dcEntry);
    mergeAggregateCounts(dcEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const supervisorEntry = supervisorMap.get(supervisorId ?? 'sin-supervisor') ?? {
      id: supervisorId ?? 'sin-supervisor',
      label: supervisorNombre,
      helper: row.zona,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    supervisorMap.set(supervisorId ?? 'sin-supervisor', supervisorEntry);
    mergeAggregateCounts(supervisorEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const zonaKey = row.zona;
    const zonaEntry = zonaMap.get(zonaKey) ?? {
      id: zonaKey,
      label: zonaKey,
      helper: null,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    zonaMap.set(zonaKey, zonaEntry);
    mergeAggregateCounts(zonaEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const cadenaKey = row.cadena;
    const cadenaEntry = cadenaMap.get(cadenaKey) ?? {
      id: cadenaKey,
      label: cadenaKey,
      helper: null,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    cadenaMap.set(cadenaKey, cadenaEntry);
    mergeAggregateCounts(cadenaEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const dailyEntry = dailyMap.get(operationDate) ?? {
      bucket: operationDate,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    dailyMap.set(operationDate, dailyEntry);
    mergeAggregateCounts(dailyEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });

    const weeklyEntry = weeklyMap.get(weekBucket) ?? {
      bucket: weekBucket,
      total: 0,
      objetivo: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      duplicadas: 0,
    };
    weeklyMap.set(weekBucket, weeklyEntry);
    mergeAggregateCounts(weeklyEntry, {
      afiliaciones_total: row.total,
      afiliaciones_validas: row.validas,
      afiliaciones_pendientes: row.pendientes,
      afiliaciones_rechazadas: row.rechazadas,
      afiliaciones_duplicadas: row.duplicadas,
      objetivo: row.objetivo,
    });
  }

  const qrInfraestructuraLista = !qrCodesResult.error && !qrAssignmentsResult.error;
  const qrCodes = (qrCodesResult.data ?? []) as LoveQrCodigoRow[];
  const signedQrImageById = new Map<string, string | null>(
    await Promise.all(
      qrCodes.map(
        async (item) =>
          [
            item.id,
            await resolveLoveQrSignedUrl(storageClient as TypedSupabaseClient, item.imagen_url),
          ] as const
      )
    )
  );
  const qrAssignments = (qrAssignmentsResult.data ?? []) as LoveQrAsignacionRow[];
  const qrImportLotesRows = (qrImportLotsResult.data ?? []) as LoveQrImportLoteRow[];
  const dcUsers = (dcUsersResult.data ?? []) as CuentaUsuarioRow[];
  const dcById = new Map<string, EmpleadoRelacion>();
  const activeDcIds = new Set<string>();

  for (const row of dcUsers) {
    const empleado = obtenerPrimero(row.empleado);

    if (!empleado || empleado.puesto !== 'DERMOCONSEJERO') {
      continue;
    }

    dcById.set(row.empleado_id, empleado);

    if (empleado.estatus_laboral === 'ACTIVO' && row.estado_cuenta !== 'BAJA') {
      activeDcIds.add(row.empleado_id);
    }
  }

  const activeQrAssignmentsByEmployee = new Map<string, LoveQrAsignacionRow>();
  for (const row of qrAssignments) {
    activeQrAssignmentsByEmployee.set(row.empleado_id, row);
  }

  const qrResumen: LoveQrResumen = qrInfraestructuraLista
    ? {
        activos: qrCodes.filter((item) => item.estado === 'ACTIVO').length,
        disponibles: qrCodes.filter((item) => item.estado === 'DISPONIBLE').length,
        bloqueados: qrCodes.filter((item) => item.estado === 'BLOQUEADO').length,
        bajas: qrCodes.filter((item) => item.estado === 'BAJA').length,
        dcActivasConQr: Array.from(activeDcIds).filter((id) =>
          activeQrAssignmentsByEmployee.has(id)
        ).length,
        dcActivasSinQr: Array.from(activeDcIds).filter(
          (id) => !activeQrAssignmentsByEmployee.has(id)
        ).length,
      }
    : DEFAULT_QR_RESUMEN;

  const qrInventario = qrInfraestructuraLista
    ? qrCodes.map((qrCode) => {
        const assignment = qrAssignments.find((item) => item.qr_codigo_id === qrCode.id) ?? null;
        const empleado = assignment ? (dcById.get(assignment.empleado_id) ?? null) : null;
        const supervisorId = empleado?.supervisor_empleado_id ?? null;

        return {
          qrCodigoId: qrCode.id,
          codigo: qrCode.codigo,
          imageUrl: signedQrImageById.get(qrCode.id) ?? qrCode.imagen_url,
          estado: qrCode.estado,
          empleadoId: assignment?.empleado_id ?? null,
          empleado: empleado?.nombre_completo ?? null,
          idNomina: empleado?.id_nomina ?? null,
          supervisorId,
          supervisor: supervisorId ? (supervisorById.get(supervisorId) ?? null) : null,
          zona: empleado?.zona ?? null,
          fechaInicio: assignment?.fecha_inicio ?? null,
          motivo: assignment?.motivo ?? null,
        } satisfies LoveQrInventoryItem;
      })
    : [];

  const dermoconsejerasSinQr = Array.from(activeDcIds)
    .filter((id) => !activeQrAssignmentsByEmployee.has(id))
    .map((id) => {
      const empleado = dcById.get(id);
      if (!empleado) {
        return null;
      }

      return {
        id,
        label: `${empleado.nombre_completo}${empleado.id_nomina ? ` / ${empleado.id_nomina}` : ''}${
          empleado.zona ? ` / ${empleado.zona}` : ''
        }`,
      } satisfies SelectorOption;
    })
    .filter((item): item is SelectorOption => item !== null)
    .sort((left, right) => left.label.localeCompare(right.label, 'es-MX'));

  const qrImportLotes = qrImportLotesRows.map((item) => {
    const metadata =
      item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? item.metadata
        : null;
    const advertencias = Array.isArray(item.advertencias)
      ? item.advertencias.length
      : Number(metadata?.advertencias_total ?? 0);

    return {
      id: item.id,
      archivoNombre: item.archivo_nombre,
      estado: item.estado,
      creadoEn: item.created_at,
      confirmadoEn: item.confirmado_en,
      advertencias: Number.isFinite(advertencias) ? advertencias : 0,
      tipoCarga: typeof metadata?.tipo_carga === 'string' ? metadata.tipo_carga : null,
      manifiestoPath:
        typeof metadata?.manifiesto_path === 'string' ? metadata.manifiesto_path : null,
      zipPath: typeof metadata?.zip_path === 'string' ? metadata.zip_path : null,
    } satisfies LoveQrImportLotItem;
  });

  const extemporaneosPanel = await obtenerRegistrosExtemporaneosPanel(client, {
    actorPuesto: options?.actor?.puesto ?? null,
    actorEmpleadoId: options?.actor?.empleadoId ?? null,
    tiposRegistro: ['LOVE_ISDIN', 'AMBAS'],
  });

  const validasMes = kpiDataset.reduce((acc, item) => acc + item.validas, 0);
  const pendientesMes = kpiDataset.reduce((acc, item) => acc + item.pendientes, 0);
  const hoy = kpiDataset
    .filter((item) => item.fechaOperacion === todayIso)
    .reduce((acc, item) => acc + item.total, 0);
  const semana = kpiDataset
    .filter((item) => item.weekBucket === currentWeekStart)
    .reduce((acc, item) => acc + item.total, 0);
  const objetivoHoy = kpiDataset
    .filter((item) => item.fechaOperacion === todayIso)
    .reduce((acc, item) => acc + item.objetivo, 0);
  const objetivoSemana = kpiDataset
    .filter((item) => item.weekBucket === currentWeekStart)
    .reduce((acc, item) => acc + item.objetivo, 0);
  const objetivoMes = kpiDataset.reduce((acc, item) => acc + item.objetivo, 0);
  const cumplimientoHoy = computeLoveQuotaProgress(hoy, objetivoHoy);
  const cumplimientoSemana = computeLoveQuotaProgress(semana, objetivoSemana);
  const cumplimientoMes = computeLoveQuotaProgress(
    kpiDataset.reduce((acc, item) => acc + item.total, 0),
    objetivoMes
  );

  return {
    scopeLabel,
    resumen: {
      total: totalItems,
      validas: afiliaciones.filter((item) => item.estatus === 'VALIDA').length,
      pendientes: afiliaciones.filter((item) => item.estatus === 'PENDIENTE_VALIDACION').length,
      rechazadas: afiliaciones.filter(
        (item) => item.estatus === 'RECHAZADA' || item.estatus === 'DUPLICADA'
      ).length,
      afiliacionesHoy: afiliaciones.filter((item) => isSameOperationalDay(item.fechaUtc, todayIso))
        .length,
    },
    afiliacionesKpi: {
      hoy,
      semana,
      mes: kpiDataset.reduce((acc, item) => acc + item.total, 0),
      objetivoHoy,
      objetivoSemana,
      objetivoMes,
      cumplimientoHoyPct: cumplimientoHoy.cumplimientoPct,
      cumplimientoSemanaPct: cumplimientoSemana.cumplimientoPct,
      cumplimientoMesPct: cumplimientoMes.cumplimientoPct,
      validasMes,
      pendientesMes,
    },
    afiliaciones,
    jornadasContexto,
    cuentas: ((accountsResult.data ?? []) as Array<Pick<CuentaCliente, 'id' | 'nombre'>>).map(
      (item) => ({
        id: item.id,
        label: item.nombre,
      })
    ),
    empleados: (
      (empleadosResult.data ?? []) as Pick<
        Empleado,
        'id' | 'id_nomina' | 'nombre_completo' | 'puesto'
      >[]
    ).map((item) => ({
      id: item.id,
      label: `${item.nombre_completo}${item.id_nomina ? ` / ${item.id_nomina}` : ''} / ${item.puesto}`,
    })),
    dermoconsejerasSinQr,
    pdvs: ((pdvsResult.data ?? []) as Pick<Pdv, 'id' | 'clave_btl' | 'nombre'>[]).map((item) => ({
      id: item.id,
      label: `${item.clave_btl} / ${item.nombre}`,
    })),
    timelineDiaria: sortTimeline(dailyMap),
    timelineSemanal: sortTimeline(weeklyMap),
    kpiDataset,
    porPdv: sortAggregateItems(pdvMap),
    porDc: sortAggregateItems(dcMap),
    porSupervisor: sortAggregateItems(supervisorMap),
    porZona: sortAggregateItems(zonaMap),
    porCadena: sortAggregateItems(cadenaMap),
    qrResumen,
    qrInventario: qrInventario.sort((left, right) => {
      if (left.estado !== right.estado) {
        return left.estado.localeCompare(right.estado, 'es-MX');
      }

      return left.codigo.localeCompare(right.codigo, 'es-MX');
    }),
    qrInfraestructuraLista,
    qrMensajeInfraestructura: qrInfraestructuraLista
      ? undefined
      : 'Las tablas de QR oficial aun no estan disponibles. Aplica la migracion LOVE QR para habilitar inventario y cobertura.',
    qrImportLotes,
    resumenExtemporaneo: extemporaneosPanel.resumen,
    registrosExtemporaneos: extemporaneosPanel.registros,
    registrosFallidos: (() => {
      const failedCapturesRows = (failedCapturesResult.data ?? []) as any[];
      const failedLoveRows = (failedLoveResult.data ?? []) as any[];
      const list: LoveIsdinFailedRegistrationItem[] = [];

      for (const row of failedCapturesRows) {
        const empleado = obtenerPrimero(row.empleado);
        const pdv = obtenerPrimero(row.pdv);
        list.push({
          id: row.id,
          fecha: row.fecha_operativa,
          empleado: empleado?.nombre_completo ?? 'Sin dermoconsejera',
          pdv: pdv?.nombre ?? 'Sin PDV',
          pdvClave: pdv?.clave_btl ?? '—',
          tipoFalla: 'INTENTO_FALLIDO',
          causa: categorizarCausaFalla(row.observaciones),
          detalles: row.observaciones,
        });
      }

      for (const row of failedLoveRows) {
        const empleado = obtenerPrimero(row.empleado);
        const pdv = obtenerPrimero(row.pdv);
        const metadata =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        const observaciones = (metadata.observaciones || metadata.motivo_rechazo || null) as
          | string
          | null;
        list.push({
          id: row.id,
          fecha: getMexicoDateIso(row.fecha_utc),
          empleado: empleado?.nombre_completo ?? 'Sin dermoconsejera',
          pdv: pdv?.nombre ?? 'Sin PDV',
          pdvClave: pdv?.clave_btl ?? '—',
          tipoFalla: row.estatus as 'RECHAZADA' | 'DUPLICADA',
          causa:
            row.estatus === 'DUPLICADA'
              ? 'Registro duplicado'
              : categorizarCausaFalla(observaciones) || 'Rechazado por administración',
          detalles: observaciones,
        });
      }

      list.sort((left, right) => right.fecha.localeCompare(left.fecha));
      return list;
    })(),
    causasFallas: (() => {
      const failedCapturesRows = (failedCapturesResult.data ?? []) as any[];
      const failedLoveRows = (failedLoveResult.data ?? []) as any[];
      const list: string[] = [];

      for (const row of failedCapturesRows) {
        list.push(categorizarCausaFalla(row.observaciones));
      }

      for (const row of failedLoveRows) {
        const metadata =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        const observaciones = (metadata.observaciones || metadata.motivo_rechazo || null) as
          | string
          | null;
        list.push(
          row.estatus === 'DUPLICADA'
            ? 'Registro duplicado'
            : categorizarCausaFalla(observaciones) || 'Rechazado por administración'
        );
      }

      const causasMap = new Map<string, number>();
      for (const causa of list) {
        causasMap.set(causa, (causasMap.get(causa) ?? 0) + 1);
      }

      const totalFallos = list.length;
      return Array.from(causasMap.entries())
        .map(([causa, total]) => ({
          causa,
          total,
          porcentaje: totalFallos > 0 ? Math.round((total / totalFallos) * 10000) / 100 : 0,
        }))
        .sort((left, right) => right.total - left.total);
    })(),
    paginacion: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    infraestructuraLista: true,
  };
}

export async function obtenerPanelLoveIsdin(
  actorOrSupabase: ActorActual | TypedSupabaseClient,
  options?: ObtenerLoveIsdinPanelOptions,
  customSupabase?: TypedSupabaseClient
): Promise<LoveIsdinPanelData> {
  if (isSupabaseClient(actorOrSupabase)) {
    return obtenerPanelLoveIsdinUncached(actorOrSupabase, options);
  }

  const actor = actorOrSupabase;
  const resolvedOptions: ObtenerLoveIsdinPanelOptions = {
    ...options,
    actor,
  };

  if (resolvedOptions.bypassCache) {
    const tags = buildLoveIsdinCacheTags(actor);
    tags.forEach((tag) => {
      try {
        revalidateTag(tag, 'max');
      } catch (err) {
        console.warn(`[loveIsdinService] Error revalidating tag ${tag}:`, err);
      }
    });
    return obtenerPanelLoveIsdinUncached(customSupabase ?? createServiceClient(), resolvedOptions);
  }

  if (customSupabase) {
    return obtenerPanelLoveIsdinUncached(customSupabase, resolvedOptions);
  }

  const service = options?.serviceClient ?? createServiceClient();
  return unstable_cache(
    async () =>
      obtenerPanelLoveIsdinUncached(service, { ...resolvedOptions, serviceClient: service }),
    ['love-isdin-panel', buildLoveIsdinCacheKey(actor, resolvedOptions)],
    {
      revalidate: LOVE_ISDIN_PANEL_REVALIDATE_SECONDS,
      tags: buildLoveIsdinCacheTags(actor),
    }
  )();
}
