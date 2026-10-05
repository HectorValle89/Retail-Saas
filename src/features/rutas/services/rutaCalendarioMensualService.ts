import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import type { ActorActual } from '@/lib/auth/session';
import {
  parseRutaSemanalWorkflowMetadata,
  parseRutaVisitaWorkflowMetadata,
  type RutaApprovalState,
  type RutaVisitaCheckpointMetadata,
} from '../lib/routeWorkflow';
import {
  SUPERVISOR_CHECKLIST_ITEMS,
  calculateSupervisorChecklistCompletion,
} from '../lib/supervisorVisitChecklist';
import {
  getAgendaImpactLabel,
  getAgendaTypeLabel,
  parseRutaAgendaEventMetadata,
} from '../lib/routeAgenda';
import {
  formatRouteCalendarDate,
  formatRouteCalendarMonth,
  getRouteCalendarDateForVisit,
  getRouteCalendarMonthDays,
  getRouteCalendarWeekRange,
  isIsoDateInMonth,
  normalizeRouteCalendarMonth,
} from '../lib/rutaCalendar';
import { getWeekStartIso } from '../lib/weeklyRoute';
import { calcularDistanciaMetros } from '@/features/asistencias/lib/attendanceCapture';
import { formatearDistanciaGeocercaSufijo } from '@/lib/geo/distanceFormat';

type QueryClient = SupabaseClient;

type Related<T> = T | T[] | null;

interface RouteSupervisorRow {
  id: string;
  nombre_completo: string;
  zona: string | null;
}

interface RouteRow {
  id: string;
  cuenta_cliente_id: string;
  supervisor_empleado_id: string;
  semana_inicio: string;
  estatus: 'BORRADOR' | 'PUBLICADA' | 'EN_PROGRESO' | 'CERRADA';
  notas: string | null;
  ruta_mensual_envio_id?: string | null;
  metadata: unknown;
  updated_at: string;
  supervisor: Related<RouteSupervisorRow>;
}

interface MonthlySummaryRouteRow {
  route_id: string;
  cuenta_cliente_id: string;
  supervisor_empleado_id: string;
  supervisor_nombre: string;
  supervisor_zona: string | null;
  supervisor_estatus_laboral?: string | null;
  supervisor_fecha_baja?: string | null;
  semana_inicio: string;
  route_status: RouteRow['estatus'];
  route_notes: string | null;
  route_metadata: unknown;
  route_updated_at: string;
}

interface MonthlySummaryDayRow {
  route_id: string;
  dia_semana: number;
  fecha: string;
  planned_count: number;
  completed_count: number;
  event_count: number;
  displaced_count: number;
  replacement_pending_count: number;
}

interface MonthlySummaryPayload {
  routes: MonthlySummaryRouteRow[];
  days: MonthlySummaryDayRow[];
}

interface VisitPdvRow {
  id: string;
  clave_btl: string | null;
  nombre: string;
  zona: string | null;
  direccion: string | null;
}

interface VisitRow {
  id: string;
  ruta_semanal_id: string;
  ruta_mensual_envio_id: string | null;
  supervisor_empleado_id: string;
  pdv_id: string;
  pdv: Related<VisitPdvRow>;
  dia_semana: number;
  orden: number;
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA';
  selfie_url: string | null;
  evidencia_url: string | null;
  checklist_calidad: Record<string, boolean> | null;
  comentarios: string | null;
  completada_en: string | null;
  metadata: unknown;
}

interface MonthlyEnvelopeRow {
  id: string;
  estado: 'PENDIENTE_COORDINACION' | 'APROBADA' | 'CAMBIOS_SOLICITADOS' | 'EN_PROGRESO' | 'CERRADA';
}

interface AgendaEventRow {
  id: string;
  ruta_semanal_id: string;
  ruta_semanal_visita_id: string | null;
  supervisor_empleado_id: string;
  pdv_id: string | null;
  pdv: Related<VisitPdvRow>;
  fecha_operacion: string;
  tipo_evento: string;
  modo_impacto: 'SUMA' | 'SOBREPONE_PARCIAL' | 'REEMPLAZA_TOTAL';
  estatus_aprobacion: 'NO_REQUIERE' | 'PENDIENTE_COORDINACION' | 'APROBADO' | 'RECHAZADO';
  estatus_ejecucion: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO';
  titulo: string;
  descripcion: string | null;
  sede: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  selfie_url: string | null;
  evidencia_url: string | null;
  check_in_en: string | null;
  check_out_en: string | null;
  metadata: unknown;
}

interface PendingRepositionRow {
  id: string;
  ruta_semanal_id: string;
  ruta_semanal_visita_id: string;
  agenda_evento_id: string | null;
  supervisor_empleado_id: string;
  pdv_id: string;
  pdv: Related<VisitPdvRow>;
  fecha_origen: string;
  semana_sugerida_inicio: string | null;
  clasificacion: 'JUSTIFICADA' | 'INJUSTIFICADA';
  motivo: string;
  estado: 'PENDIENTE' | 'REPROGRAMADA' | 'DESCARTADA' | 'EJECUTADA';
}

export type RutaCalendarioCellTone =
  | 'neutral'
  | 'slate'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'emerald';

export type RutaCalendarioRouteStatus = RouteRow['estatus'];

export interface RutaCalendarioCell {
  fecha: string;
  numero: number;
  letra: string;
  routeId: string | null;
  routeStatus: RutaCalendarioRouteStatus | null;
  approvalState: RutaApprovalState | 'SIN_RUTA';
  plannedCount: number;
  completedCount: number;
  pendingCount: number;
  replacementPendingCount: number;
  eventCount: number;
  displacedCount: number;
  tone: RutaCalendarioCellTone;
  label: string;
}

export interface RutaCalendarioSupervisorRow {
  supervisorEmpleadoId: string;
  supervisor: string;
  zona: string | null;
  cells: RutaCalendarioCell[];
}

export interface RutaCalendarioMensualData {
  month: string;
  monthLabel: string;
  days: ReturnType<typeof getRouteCalendarMonthDays>;
  supervisors: RutaCalendarioSupervisorRow[];
  totals: {
    planned: number;
    completed: number;
    pending: number;
    routes: number;
  };
}

export type GeocercaEvaluacionEstado = 'DENTRO' | 'FUERA' | 'SIN_GPS' | 'NO_REGISTRADO';

export interface RutaCalendarioChecklistItemDetail {
  key: string;
  label: string;
  checked: boolean;
  notApplicable: boolean;
  commentKey?: string;
  commentLabel?: string;
  commentValue?: string;
}

export interface RutaCalendarioFotoDetail {
  tipo: 'CHECK_IN' | 'CHECK_OUT' | 'EVIDENCIA' | 'EVENTO';
  titulo: string;
  url: string;
  miniaturaUrl?: string | null;
  capturadaEn?: string | null;
}

export interface RutaCalendarioDesplazamientoInfo {
  displaced: boolean;
  eventId: string;
  eventTitulo: string;
  tipoEvento: string;
  tipoLabel: string;
  modoImpacto: string;
  modoImpactoLabel: string;
}

export interface RutaCalendarioVisitDetail {
  id: string;
  pdvId: string;
  pdv: string | null;
  claveBtl: string | null;
  zona: string | null;
  direccion: string | null;
  orden: number;
  estatus: VisitRow['estatus'];
  latitud?: number | null;
  longitud?: number | null;
  completadaEn: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  evidenciaDisponible: boolean;
  checklistCompletion: number;
  checklistItems: RutaCalendarioChecklistItemDetail[];
  checklistComments: Record<string, string>;
  checklistCalidad: Record<string, boolean> | null;
  loveIsdinRecordsCount: number | null;
  comentarios: string | null;
  pendingReason: string | null;
  pendingClassification: PendingRepositionRow['clasificacion'] | null;
  // Fotos
  fotos: RutaCalendarioFotoDetail[];
  checkInSelfieUrl: string | null;
  checkOutSelfieUrl: string | null;
  evidenciaUrl: string | null;
  // Geocerca & GPS
  geocercaEstado: GeocercaEvaluacionEstado;
  geocercaResumen: string;
  checkInGpsState: string | null;
  checkInDistanciaMetros: number | null;
  checkInResumen: string | null;
  checkOutGpsState: string | null;
  checkOutDistanciaMetros: number | null;
  checkOutResumen: string | null;
  // Desplazamiento
  desplazamiento: RutaCalendarioDesplazamientoInfo | null;
}

export interface RutaCalendarioEventDetail {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipoEvento: string;
  tipoLabel: string;
  modoImpacto: AgendaEventRow['modo_impacto'];
  modoImpactoLabel: string;
  estatusAprobacion: AgendaEventRow['estatus_aprobacion'];
  estatusEjecucion: AgendaEventRow['estatus_ejecucion'];
  pdvId: string | null;
  pdv: string | null;
  claveBtl: string | null;
  zona: string | null;
  direccion: string | null;
  sede: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  evidenciaDisponible: boolean;
  selfieUrl: string | null;
  evidenciaUrl: string | null;
  fotos: RutaCalendarioFotoDetail[];
  displacedVisitIds: string[];
  displacedVisits: Array<{
    id: string;
    pdv: string | null;
    claveBtl: string | null;
    orden: number;
  }>;
  // GPS & Geocerca
  gpsState: string | null;
  distanciaMetros: number | null;
  geocercaEstado: GeocercaEvaluacionEstado;
  geocercaResumen: string;
  checkInLatitud: number | null;
  checkInLongitud: number | null;
  checkInGpsState: string | null;
  checkInDistanciaMetros: number | null;
  checkInResumen: string | null;
  checkOutLatitud: number | null;
  checkOutLongitud: number | null;
  checkOutGpsState: string | null;
  checkOutDistanciaMetros: number | null;
  checkOutResumen: string | null;
  pdvLatitud: number | null;
  pdvLongitud: number | null;
  pdvRadioMetros: number | null;
}

export interface RutaCalendarioPendingDetail {
  id: string;
  visitId: string;
  pdv: string | null;
  fechaOrigen: string;
  clasificacion: PendingRepositionRow['clasificacion'];
  motivo: string;
  estado: PendingRepositionRow['estado'];
  semanaSugeridaInicio: string | null;
}

export interface RutaCalendarioTerritoryPdv {
  pdvId: string;
  nombre: string;
  claveBtl: string | null;
  zona: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  isVacante: boolean;
}

export interface RutaCalendarioDiaDetail {
  fecha: string;
  fechaLabel: string;
  supervisorEmpleadoId: string;
  supervisor: string | null;
  zona: string | null;
  routeId: string | null;
  routeStatus: RutaCalendarioRouteStatus | null;
  approvalState: RutaApprovalState | 'SIN_RUTA';
  routeNotes: string | null;
  plannedVisits: RutaCalendarioVisitDetail[];
  completedVisits: RutaCalendarioVisitDetail[];
  pendingVisits: RutaCalendarioVisitDetail[];
  events: RutaCalendarioEventDetail[];
  pendingRepositions: RutaCalendarioPendingDetail[];
  territoryPdvs?: RutaCalendarioTerritoryPdv[];
}

function relatedOne<T>(value: Related<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isMissingAgendaTableError(message?: string | null) {
  const normalized = message?.toLowerCase() ?? '';
  return (
    normalized.includes('ruta_agenda_evento') ||
    normalized.includes('ruta_visita_pendiente_reposicion') ||
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  );
}

function getSupervisorName(route: RouteRow) {
  return relatedOne(route.supervisor)?.nombre_completo ?? 'Supervisor sin nombre';
}

function getRouteApprovalState(route: RouteRow): RutaApprovalState {
  const state = parseRutaSemanalWorkflowMetadata(route.metadata).approval.state;
  if (
    state === 'PENDIENTE_COORDINACION' &&
    (route.estatus === 'PUBLICADA' ||
      route.estatus === 'EN_PROGRESO' ||
      route.estatus === 'CERRADA')
  ) {
    return 'APROBADA';
  }

  return state;
}

function getMonthlyEnvelopeApprovalState(envelope: MonthlyEnvelopeRow): RutaApprovalState {
  if (envelope.estado === 'CAMBIOS_SOLICITADOS') return 'CAMBIOS_SOLICITADOS';
  if (envelope.estado === 'PENDIENTE_COORDINACION') return 'PENDIENTE_COORDINACION';
  return 'APROBADA';
}

function getMonthlyEnvelopeRouteStatus(
  envelope: MonthlyEnvelopeRow,
  route: RouteRow
): RutaCalendarioRouteStatus {
  if (envelope.estado === 'PENDIENTE_COORDINACION' || envelope.estado === 'CAMBIOS_SOLICITADOS') {
    return 'BORRADOR';
  }
  if (route.estatus === 'EN_PROGRESO' || route.estatus === 'CERRADA') return route.estatus;
  return 'PUBLICADA';
}

function getCellTone({
  route,
  approvalState,
  plannedCount,
  completedCount,
  pendingCount,
  fecha,
  todayIso,
}: {
  route: RouteRow | null;
  approvalState: RutaApprovalState | 'SIN_RUTA';
  plannedCount: number;
  completedCount: number;
  pendingCount: number;
  fecha: string;
  todayIso: string;
}): RutaCalendarioCellTone {
  if (!route) return 'neutral';
  if (plannedCount === 0) return 'neutral';
  if (approvalState === 'CAMBIOS_SOLICITADOS') return 'amber';
  if (approvalState === 'PENDIENTE_COORDINACION') return 'violet';
  if (pendingCount === 0 && completedCount === plannedCount) return 'emerald';
  if (fecha < todayIso && pendingCount > 0) return 'rose';
  if (completedCount > 0) return 'amber';
  return 'sky';
}

function buildCellLabel({
  route,
  approvalState,
  plannedCount,
  completedCount,
  pendingCount,
}: {
  route: RouteRow | null;
  approvalState: RutaApprovalState | 'SIN_RUTA';
  plannedCount: number;
  completedCount: number;
  pendingCount: number;
}) {
  if (!route) return 'Sin ruta';
  if (plannedCount === 0) return '—';
  if (approvalState === 'PENDIENTE_COORDINACION') return `P${plannedCount}`;
  if (approvalState === 'CAMBIOS_SOLICITADOS') return `!${plannedCount}`;
  if (pendingCount === 0) return `✓${completedCount}`;
  if (completedCount > 0) return `${completedCount}/${plannedCount}`;
  return String(plannedCount);
}

function getEffectiveSupervisorId(actor: ActorActual, supervisorEmpleadoId?: string | null) {
  const effectiveSupervisorId =
    actor.puesto === 'SUPERVISOR' ? actor.empleadoId : supervisorEmpleadoId?.trim() || null;
  return effectiveSupervisorId;
}

function ensureValidMonth(monthIso: string | null | undefined) {
  const normalized = normalizeRouteCalendarMonth(monthIso);
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error('El mes solicitado no es válido.');
  }
  return normalized;
}

function normalizeMonthlySummaryPayload(value: unknown): MonthlySummaryPayload {
  const payload =
    value && typeof value === 'object'
      ? (value as { routes?: unknown; days?: unknown })
      : { routes: [], days: [] };
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const days = Array.isArray(payload.days) ? payload.days : [];

  return {
    routes: routes.map((item) => {
      const row = item as Partial<MonthlySummaryRouteRow>;
      return {
        route_id: String(row.route_id ?? ''),
        cuenta_cliente_id: String(row.cuenta_cliente_id ?? ''),
        supervisor_empleado_id: String(row.supervisor_empleado_id ?? ''),
        supervisor_nombre: String(row.supervisor_nombre ?? 'Supervisor sin nombre'),
        supervisor_zona: row.supervisor_zona ?? null,
        supervisor_estatus_laboral: row.supervisor_estatus_laboral ?? null,
        supervisor_fecha_baja: row.supervisor_fecha_baja ?? null,
        semana_inicio: String(row.semana_inicio ?? ''),
        route_status: row.route_status ?? 'BORRADOR',
        route_notes: row.route_notes ?? null,
        route_metadata: row.route_metadata ?? {},
        route_updated_at: String(row.route_updated_at ?? ''),
      };
    }),
    days: days.map((item) => {
      const row = item as Partial<MonthlySummaryDayRow>;
      return {
        route_id: String(row.route_id ?? ''),
        dia_semana: Number(row.dia_semana ?? 0),
        fecha: String(row.fecha ?? ''),
        planned_count: Number(row.planned_count ?? 0),
        completed_count: Number(row.completed_count ?? 0),
        event_count: Number(row.event_count ?? 0),
        displaced_count: Number(row.displaced_count ?? 0),
        replacement_pending_count: Number(row.replacement_pending_count ?? 0),
      };
    }),
  };
}

async function fetchMonthlySummaryRows(
  supabase: QueryClient,
  actor: ActorActual,
  monthIso: string,
  supervisorEmpleadoId?: string | null
) {
  const { monthStart, monthEnd } = getRouteCalendarWeekRange(monthIso);
  const effectiveSupervisorId = getEffectiveSupervisorId(actor, supervisorEmpleadoId);
  const { data, error } = await supabase.rpc('rpc_ruta_calendario_mensual_resumen', {
    p_month_start: monthStart,
    p_month_end: monthEnd,
    p_cuenta_cliente_id: actor.cuentaClienteId,
    p_supervisor_empleado_id: effectiveSupervisorId,
  });

  if (error) throw new Error(error.message);
  return normalizeMonthlySummaryPayload(data);
}

export async function obtenerCalendarioMensualRuta(
  supabase: QueryClient,
  actor: ActorActual,
  options: { monthIso?: string | null; supervisorEmpleadoId?: string | null } = {}
): Promise<RutaCalendarioMensualData> {
  const monthIso = ensureValidMonth(options.monthIso);
  const todayIso = getIsoDateInMexicoCity();
  const days = getRouteCalendarMonthDays(monthIso, todayIso);
  const summary = await fetchMonthlySummaryRows(
    supabase,
    actor,
    monthIso,
    options.supervisorEmpleadoId
  );

  const routes = new Map<string, RouteRow>();
  for (const row of summary.routes) {
    routes.set(row.route_id, {
      id: row.route_id,
      cuenta_cliente_id: row.cuenta_cliente_id,
      supervisor_empleado_id: row.supervisor_empleado_id,
      semana_inicio: row.semana_inicio,
      estatus: row.route_status,
      notas: row.route_notes,
      metadata: row.route_metadata,
      updated_at: row.route_updated_at,
      supervisor: {
        id: row.supervisor_empleado_id,
        nombre_completo: row.supervisor_nombre,
        zona: row.supervisor_zona,
      },
    });
  }
  const supervisorEmploymentStatus = new Map<
    string,
    { estatusLaboral: string | null; fechaBaja: string | null }
  >();
  for (const row of summary.routes) {
    if (!supervisorEmploymentStatus.has(row.supervisor_empleado_id)) {
      supervisorEmploymentStatus.set(row.supervisor_empleado_id, {
        estatusLaboral: row.supervisor_estatus_laboral ?? null,
        fechaBaja: row.supervisor_fecha_baja ?? null,
      });
    }
  }
  const summariesByRouteDate = new Map(
    summary.days.map((row) => [`${row.route_id}:${row.fecha}`, row])
  );

  const supervisors = new Map<
    string,
    { supervisor: string; zona: string | null; cells: RutaCalendarioCell[] }
  >();
  const totals = { planned: 0, completed: 0, pending: 0, routes: 0 };

  for (const route of routes.values()) {
    const supervisorId = route.supervisor_empleado_id;
    const supervisor = supervisors.get(supervisorId) ?? {
      supervisor: getSupervisorName(route),
      zona: relatedOne(route.supervisor)?.zona ?? null,
      cells: [],
    };
    totals.routes += 1;

    for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
      const fecha = getRouteCalendarDateForVisit(route.semana_inicio, dayNumber);
      if (!isIsoDateInMonth(fecha, monthIso)) continue;

      const summary = summariesByRouteDate.get(`${route.id}:${fecha}`);
      const plannedCount = summary?.planned_count ?? 0;
      const completedCount = summary?.completed_count ?? 0;
      const pendingCount = Math.max(plannedCount - completedCount, 0);
      const eventCount = summary?.event_count ?? 0;
      const replacementPendingCount = summary?.replacement_pending_count ?? 0;
      const displacedCount = summary?.displaced_count ?? 0;
      const approvalState = getRouteApprovalState(route);

      supervisor.cells.push({
        fecha,
        numero: Number(fecha.slice(8, 10)),
        letra: days.find((day) => day.fecha === fecha)?.letra ?? '',
        routeId: route.id,
        routeStatus: route.estatus,
        approvalState,
        plannedCount,
        completedCount,
        pendingCount,
        replacementPendingCount,
        eventCount,
        displacedCount,
        tone: getCellTone({
          route,
          approvalState,
          plannedCount,
          completedCount,
          pendingCount,
          fecha,
          todayIso,
        }),
        label: buildCellLabel({
          route,
          approvalState,
          plannedCount,
          completedCount,
          pendingCount,
        }),
      });

      totals.planned += plannedCount;
      totals.completed += completedCount;
      totals.pending += pendingCount;
    }

    supervisors.set(supervisorId, supervisor);
  }

  const rows: RutaCalendarioSupervisorRow[] = Array.from(supervisors.entries())
    .map(([supervisorEmpleadoId, row]) => ({
      supervisorEmpleadoId,
      supervisor: row.supervisor,
      zona: row.zona,
      cells: days.map(
        (day) =>
          row.cells.find((cell) => cell.fecha === day.fecha) ??
          ({
            fecha: day.fecha,
            numero: day.numero,
            letra: day.letra,
            routeId: null,
            routeStatus: null,
            approvalState: 'SIN_RUTA' as const,
            plannedCount: 0,
            completedCount: 0,
            pendingCount: 0,
            replacementPendingCount: 0,
            eventCount: 0,
            displacedCount: 0,
            tone: 'neutral',
            label: 'Sin ruta',
          } satisfies RutaCalendarioCell)
      ),
    }))
    .filter((row) => {
      const employment = supervisorEmploymentStatus.get(row.supervisorEmpleadoId);
      if (employment?.estatusLaboral === 'BAJA') {
        const hasMonthActivity = row.cells.some(
          (cell) =>
            cell.plannedCount > 0 ||
            cell.completedCount > 0 ||
            cell.eventCount > 0 ||
            cell.replacementPendingCount > 0
        );
        if (!hasMonthActivity) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => left.supervisor.localeCompare(right.supervisor, 'es'));

  return {
    month: monthIso,
    monthLabel: formatRouteCalendarMonth(monthIso),
    days,
    supervisors: rows,
    totals,
  };
}

function buildSupervisorChecklistDetail(
  checklist: Record<string, boolean> | null | undefined,
  checklistComments: Record<string, string> | null | undefined
): RutaCalendarioChecklistItemDetail[] {
  const normalizedChecklist = checklist ?? {};
  const normalizedComments = checklistComments ?? {};
  const completion = calculateSupervisorChecklistCompletion(checklist);

  return SUPERVISOR_CHECKLIST_ITEMS.map((item) => {
    const isExcluded = completion.excludedKeys.includes(item.key);
    const checked = normalizedChecklist[item.key] === true;
    const hasComment = 'commentKey' in item;
    const commentKey = hasComment ? item.commentKey : undefined;
    const commentLabel = hasComment ? item.commentLabel : undefined;
    const commentValue = commentKey ? normalizedComments[commentKey] || undefined : undefined;

    return {
      key: item.key,
      label: item.label,
      checked,
      notApplicable: isExcluded,
      commentKey,
      commentLabel,
      commentValue,
    };
  });
}

function evaluateGeocercaState(
  checkIn: RutaVisitaCheckpointMetadata,
  checkOut: RutaVisitaCheckpointMetadata
): {
  estado: GeocercaEvaluacionEstado;
  resumen: string;
  checkInResumen: string | null;
  checkOutResumen: string | null;
} {
  const evaluateCheckpoint = (cp: RutaVisitaCheckpointMetadata, label: string) => {
    if (!cp.at) return null;
    if (cp.gpsState === 'DENTRO_GEOCERCA') {
      const dist = formatearDistanciaGeocercaSufijo(cp.distanciaMetros);
      return `${label}: Dentro de geocerca${dist}`;
    }
    if (cp.gpsState === 'FUERA_GEOCERCA') {
      const dist = formatearDistanciaGeocercaSufijo(cp.distanciaMetros);
      return `${label}: Fuera de geocerca${dist}`;
    }
    if (cp.gpsState === 'SIN_GPS') {
      return `${label}: Sin señal GPS`;
    }
    return `${label}: GPS registrado`;
  };

  const inDesc = evaluateCheckpoint(checkIn, 'Llegada');
  const outDesc = evaluateCheckpoint(checkOut, 'Salida');

  if (!checkIn.at && !checkOut.at) {
    return {
      estado: 'NO_REGISTRADO',
      resumen: 'Sin registro de llegada o salida',
      checkInResumen: null,
      checkOutResumen: null,
    };
  }

  const isInside =
    checkIn.gpsState === 'DENTRO_GEOCERCA' || checkOut.gpsState === 'DENTRO_GEOCERCA';
  const isOutside = checkIn.gpsState === 'FUERA_GEOCERCA' || checkOut.gpsState === 'FUERA_GEOCERCA';
  const isNoGps = checkIn.gpsState === 'SIN_GPS' || checkOut.gpsState === 'SIN_GPS';

  if (isInside && !isOutside) {
    const distances = [checkIn.distanciaMetros, checkOut.distanciaMetros].filter(
      (d): d is number => d !== null
    );
    const minDistance = distances.length > 0 ? Math.min(...distances) : null;
    const distText = formatearDistanciaGeocercaSufijo(minDistance);
    return {
      estado: 'DENTRO',
      resumen: `Dentro de geocerca${distText}`,
      checkInResumen: inDesc,
      checkOutResumen: outDesc,
    };
  }

  if (isOutside) {
    const distances = [checkIn.distanciaMetros, checkOut.distanciaMetros].filter(
      (d): d is number => d !== null
    );
    const maxDistance = distances.length > 0 ? Math.max(...distances) : null;
    const distText = formatearDistanciaGeocercaSufijo(maxDistance);
    return {
      estado: 'FUERA',
      resumen: `Fuera de geocerca${distText}`,
      checkInResumen: inDesc,
      checkOutResumen: outDesc,
    };
  }

  if (isNoGps) {
    return {
      estado: 'SIN_GPS',
      resumen: 'Sin señal GPS registrada',
      checkInResumen: inDesc,
      checkOutResumen: outDesc,
    };
  }

  return {
    estado: 'NO_REGISTRADO',
    resumen: 'GPS registrado',
    checkInResumen: inDesc,
    checkOutResumen: outDesc,
  };
}

function buildVisitFotos(
  visit: VisitRow,
  workflow: ReturnType<typeof parseRutaVisitaWorkflowMetadata>
): RutaCalendarioFotoDetail[] {
  const fotos: RutaCalendarioFotoDetail[] = [];
  const seenUrls = new Set<string>();

  if (workflow.checkIn.selfieUrl) {
    seenUrls.add(workflow.checkIn.selfieUrl);
    fotos.push({
      tipo: 'CHECK_IN',
      titulo: 'Selfie de llegada (Check-in)',
      url: workflow.checkIn.selfieUrl,
      miniaturaUrl: workflow.checkIn.selfieThumbnailUrl,
      capturadaEn: workflow.checkIn.at,
    });
  }

  const checkOutSelfie = workflow.checkOut.selfieUrl || visit.selfie_url;
  if (checkOutSelfie && !seenUrls.has(checkOutSelfie)) {
    seenUrls.add(checkOutSelfie);
    fotos.push({
      tipo: 'CHECK_OUT',
      titulo: 'Selfie de salida con dermoconsejera (Check-out)',
      url: checkOutSelfie,
      miniaturaUrl: workflow.checkOut.selfieThumbnailUrl,
      capturadaEn: workflow.checkOut.at ?? visit.completada_en,
    });
  }

  const evidenciaUrl =
    workflow.checkOut.evidenciaUrl || workflow.checkIn.evidenciaUrl || visit.evidencia_url;
  if (evidenciaUrl && !seenUrls.has(evidenciaUrl)) {
    seenUrls.add(evidenciaUrl);
    fotos.push({
      tipo: 'EVIDENCIA',
      titulo: 'Evidencia adicional en tienda',
      url: evidenciaUrl,
      miniaturaUrl: workflow.checkOut.evidenciaThumbnailUrl,
      capturadaEn: workflow.checkOut.at ?? visit.completada_en,
    });
  }

  return fotos;
}

function mapVisitDetail(
  visit: VisitRow,
  pendingByVisit: Map<string, PendingRepositionRow[]>,
  fecha: string,
  todayIso: string,
  geocercasMap?: Map<string, { latitud: number; longitud: number; radio: number }>
): RutaCalendarioVisitDetail {
  const pdv = relatedOne(visit.pdv);
  const workflow = parseRutaVisitaWorkflowMetadata(visit.metadata);
  const pending = pendingByVisit.get(visit.id)?.[0] ?? null;
  const checklist = calculateSupervisorChecklistCompletion(visit.checklist_calidad);
  const checklistItems = buildSupervisorChecklistDetail(
    visit.checklist_calidad,
    workflow.checklistComments
  );
  const geocerca = evaluateGeocercaState(workflow.checkIn, workflow.checkOut);
  const fotos = buildVisitFotos(visit, workflow);
  const targetGeocerca = geocercasMap?.get(visit.pdv_id);

  const checkInSelfieUrl = workflow.checkIn.selfieUrl ?? null;
  const checkOutSelfieUrl = workflow.checkOut.selfieUrl ?? visit.selfie_url ?? null;
  const evidenciaUrl =
    workflow.checkOut.evidenciaUrl ?? workflow.checkIn.evidenciaUrl ?? visit.evidencia_url ?? null;

  return {
    id: visit.id,
    pdvId: visit.pdv_id,
    pdv: pdv?.nombre ?? null,
    claveBtl: pdv?.clave_btl ?? null,
    zona: pdv?.zona ?? null,
    direccion: pdv?.direccion ?? null,
    orden: visit.orden,
    estatus: visit.estatus,
    latitud: targetGeocerca?.latitud ?? null,
    longitud: targetGeocerca?.longitud ?? null,
    completadaEn: visit.completada_en,
    checkInAt: workflow.checkIn.at,
    checkOutAt: workflow.checkOut.at,
    evidenciaDisponible: fotos.length > 0,
    checklistCompletion: checklist.percentage,
    checklistItems,
    checklistComments: workflow.checklistComments,
    checklistCalidad: visit.checklist_calidad,
    loveIsdinRecordsCount: workflow.loveIsdinRecordsCount,
    comentarios: visit.comentarios || workflow.checkOut.comments || workflow.checkIn.comments,
    pendingReason:
      pending?.motivo ??
      (fecha <= todayIso && visit.estatus === 'PLANIFICADA' ? 'Visita no registrada' : null),
    pendingClassification: pending?.clasificacion ?? null,
    fotos,
    checkInSelfieUrl,
    checkOutSelfieUrl,
    evidenciaUrl,
    geocercaEstado: geocerca.estado,
    geocercaResumen: geocerca.resumen,
    checkInGpsState: workflow.checkIn.gpsState,
    checkInDistanciaMetros: workflow.checkIn.distanciaMetros,
    checkInResumen: geocerca.checkInResumen,
    checkOutGpsState: workflow.checkOut.gpsState,
    checkOutDistanciaMetros: workflow.checkOut.distanciaMetros,
    checkOutResumen: geocerca.checkOutResumen,
    desplazamiento: null,
  };
}

function mapEventDetail(
  event: AgendaEventRow,
  geocercasMap: Map<string, { latitud: number; longitud: number; radio: number }>,
  activeVisits: RutaCalendarioVisitDetail[] = []
): RutaCalendarioEventDetail {
  const pdv = relatedOne(event.pdv);
  const metadata = parseRutaAgendaEventMetadata(event.metadata);
  const fotos: RutaCalendarioFotoDetail[] = [];
  const seenUrls = new Set<string>();

  // Si hay visita vinculada (por ruta_semanal_visita_id o por pdv_id en el mismo día)
  const linkedVisit =
    activeVisits.find(
      (v) =>
        (event.ruta_semanal_visita_id && v.id === event.ruta_semanal_visita_id) ||
        (event.pdv_id && v.pdvId === event.pdv_id)
    ) ?? null;

  // Agregar fotos del evento
  const eventSelfie = event.selfie_url || metadata.checkIn.selfieUrl || metadata.checkOut.selfieUrl;
  if (eventSelfie && !seenUrls.has(eventSelfie)) {
    seenUrls.add(eventSelfie);
    fotos.push({
      tipo: 'EVENTO',
      titulo: 'Selfie / Foto del evento',
      url: eventSelfie,
      capturadaEn: event.check_in_en ?? event.check_out_en,
    });
  }

  const eventEvidencia =
    event.evidencia_url || metadata.checkIn.evidenciaUrl || metadata.checkOut.evidenciaUrl;
  if (eventEvidencia && !seenUrls.has(eventEvidencia)) {
    seenUrls.add(eventEvidencia);
    fotos.push({
      tipo: 'EVIDENCIA',
      titulo: 'Evidencia adicional del evento',
      url: eventEvidencia,
      capturadaEn: event.check_in_en ?? event.check_out_en,
    });
  }

  // Incorporar fotos de la visita vinculada si existen
  if (linkedVisit) {
    for (const foto of linkedVisit.fotos) {
      if (!seenUrls.has(foto.url)) {
        seenUrls.add(foto.url);
        fotos.push(foto);
      }
    }
  }

  // Horarios de Entrada (Check-in) y Salida (Check-out)
  const checkInAt = event.check_in_en || metadata.checkIn.at || linkedVisit?.checkInAt || null;
  const checkOutAt = event.check_out_en || metadata.checkOut.at || linkedVisit?.checkOutAt || null;

  // Geocerca del PDV objetivo si aplica
  const targetGeocerca = event.pdv_id ? geocercasMap.get(event.pdv_id) : undefined;
  const pdvLatitud = targetGeocerca?.latitud ?? null;
  const pdvLongitud = targetGeocerca?.longitud ?? null;
  const pdvRadioMetros = targetGeocerca?.radio ?? null;

  // Coordenadas Check-in
  let checkInLatitud = metadata.checkIn.latitud ?? null;
  let checkInLongitud = metadata.checkIn.longitud ?? null;
  let checkInDistanciaMetros = metadata.checkIn.distanciaMetros ?? null;
  let checkInGpsState = metadata.checkIn.gpsState ?? null;

  if (checkInLatitud === null && linkedVisit?.checkInGpsState) {
    checkInGpsState = linkedVisit.checkInGpsState;
    checkInDistanciaMetros = linkedVisit.checkInDistanciaMetros;
  }

  // Recalcular distancia exacta y estado geocerca si tenemos coordenadas y geocerca objetivo
  if (checkInLatitud !== null && checkInLongitud !== null && targetGeocerca) {
    checkInDistanciaMetros = calcularDistanciaMetros(
      checkInLatitud,
      checkInLongitud,
      targetGeocerca.latitud,
      targetGeocerca.longitud
    );
    checkInGpsState =
      checkInDistanciaMetros <= targetGeocerca.radio ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA';
  }

  // Coordenadas Check-out
  let checkOutLatitud = metadata.checkOut.latitud ?? null;
  let checkOutLongitud = metadata.checkOut.longitud ?? null;
  let checkOutDistanciaMetros = metadata.checkOut.distanciaMetros ?? null;
  let checkOutGpsState = metadata.checkOut.gpsState ?? null;

  if (checkOutLatitud === null && linkedVisit?.checkOutGpsState) {
    checkOutGpsState = linkedVisit.checkOutGpsState;
    checkOutDistanciaMetros = linkedVisit.checkOutDistanciaMetros;
  }

  if (checkOutLatitud !== null && checkOutLongitud !== null && targetGeocerca) {
    checkOutDistanciaMetros = calcularDistanciaMetros(
      checkOutLatitud,
      checkOutLongitud,
      targetGeocerca.latitud,
      targetGeocerca.longitud
    );
    checkOutGpsState =
      checkOutDistanciaMetros <= targetGeocerca.radio ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA';
  }

  // Resumen Check-in
  let checkInResumen = 'Sin validación GPS';
  if (checkInGpsState === 'DENTRO_GEOCERCA') {
    const distText = formatearDistanciaGeocercaSufijo(checkInDistanciaMetros);
    checkInResumen = `Dentro de geocerca${distText}`;
  } else if (checkInGpsState === 'FUERA_GEOCERCA') {
    const distText = formatearDistanciaGeocercaSufijo(checkInDistanciaMetros);
    checkInResumen = `Fuera de geocerca${distText}`;
  } else if (checkInLatitud !== null && checkInLongitud !== null) {
    checkInResumen = `Coordenada GPS registrada (${checkInLatitud.toFixed(4)}, ${checkInLongitud.toFixed(4)})`;
  } else if (checkInGpsState === 'SIN_GPS') {
    checkInResumen = 'Sin señal GPS registrada';
  }

  // Resumen Check-out
  let checkOutResumen = 'Sin validación GPS';
  if (checkOutGpsState === 'DENTRO_GEOCERCA') {
    const distText = formatearDistanciaGeocercaSufijo(checkOutDistanciaMetros);
    checkOutResumen = `Dentro de geocerca${distText}`;
  } else if (checkOutGpsState === 'FUERA_GEOCERCA') {
    const distText = formatearDistanciaGeocercaSufijo(checkOutDistanciaMetros);
    checkOutResumen = `Fuera de geocerca${distText}`;
  } else if (checkOutLatitud !== null && checkOutLongitud !== null) {
    checkOutResumen = `Coordenada GPS registrada (${checkOutLatitud.toFixed(4)}, ${checkOutLongitud.toFixed(4)})`;
  } else if (checkOutGpsState === 'SIN_GPS') {
    checkOutResumen = 'Sin señal GPS registrada';
  }

  // Evaluación consolidada de Geocerca del evento
  let geocercaEstado: GeocercaEvaluacionEstado = 'NO_REGISTRADO';
  let geocercaResumen = 'Sin validación GPS';

  const bestDistancia =
    checkInDistanciaMetros ??
    checkOutDistanciaMetros ??
    metadata.checkIn.distanciaMetros ??
    metadata.checkOut.distanciaMetros ??
    null;
  const bestGpsState =
    checkInGpsState ??
    checkOutGpsState ??
    metadata.checkIn.gpsState ??
    metadata.checkOut.gpsState ??
    null;

  if (
    bestGpsState === 'DENTRO_GEOCERCA' ||
    checkInGpsState === 'DENTRO_GEOCERCA' ||
    checkOutGpsState === 'DENTRO_GEOCERCA'
  ) {
    geocercaEstado = 'DENTRO';
    const distText = formatearDistanciaGeocercaSufijo(bestDistancia);
    geocercaResumen = `Dentro de geocerca${distText}`;
  } else if (
    bestGpsState === 'FUERA_GEOCERCA' ||
    checkInGpsState === 'FUERA_GEOCERCA' ||
    checkOutGpsState === 'FUERA_GEOCERCA'
  ) {
    geocercaEstado = 'FUERA';
    const distText = formatearDistanciaGeocercaSufijo(bestDistancia);
    geocercaResumen = `Fuera de geocerca${distText}`;
  } else if (checkInLatitud !== null || checkOutLatitud !== null) {
    geocercaEstado = 'DENTRO';
    const lat = checkInLatitud ?? checkOutLatitud;
    const lng = checkInLongitud ?? checkOutLongitud;
    geocercaResumen = `Ubicación GPS registrada (${lat?.toFixed(4)}, ${lng?.toFixed(4)})`;
  } else if (bestGpsState === 'SIN_GPS') {
    geocercaEstado = 'SIN_GPS';
    geocercaResumen = 'Sin señal GPS registrada';
  }

  const allDisplacedIds = Array.from(
    new Set([
      ...metadata.displacedVisitIds,
      ...(event.ruta_semanal_visita_id ? [event.ruta_semanal_visita_id] : []),
    ])
  );

  return {
    id: event.id,
    titulo: event.titulo,
    descripcion: event.descripcion,
    tipoEvento: event.tipo_evento,
    tipoLabel: getAgendaTypeLabel(event.tipo_evento as any),
    modoImpacto: event.modo_impacto,
    modoImpactoLabel: getAgendaImpactLabel(event.modo_impacto),
    estatusAprobacion: event.estatus_aprobacion,
    estatusEjecucion: event.estatus_ejecucion,
    pdvId: event.pdv_id,
    pdv: pdv?.nombre ?? null,
    claveBtl: pdv?.clave_btl ?? null,
    zona: pdv?.zona ?? null,
    direccion: pdv?.direccion ?? null,
    sede: event.sede,
    horaInicio: event.hora_inicio,
    horaFin: event.hora_fin,
    checkInAt,
    checkOutAt,
    evidenciaDisponible: fotos.length > 0,
    selfieUrl: eventSelfie ?? null,
    evidenciaUrl: eventEvidencia ?? null,
    fotos,
    displacedVisitIds: allDisplacedIds,
    displacedVisits: [],
    gpsState: bestGpsState,
    distanciaMetros: bestDistancia,
    geocercaEstado,
    geocercaResumen,
    checkInLatitud,
    checkInLongitud,
    checkInGpsState,
    checkInDistanciaMetros,
    checkInResumen,
    checkOutLatitud,
    checkOutLongitud,
    checkOutGpsState,
    checkOutDistanciaMetros,
    checkOutResumen,
    pdvLatitud,
    pdvLongitud,
    pdvRadioMetros,
  };
}

function sortVisitsByArrivalOrOrder(
  a: RutaCalendarioVisitDetail,
  b: RutaCalendarioVisitDetail
): number {
  const timeA = a.checkInAt || (a.estatus === 'COMPLETADA' ? a.completadaEn : null);
  const timeB = b.checkInAt || (b.estatus === 'COMPLETADA' ? b.completadaEn : null);

  if (timeA && timeB) {
    const diff = new Date(timeA).getTime() - new Date(timeB).getTime();
    if (diff !== 0) return diff;
  }
  // Las visitas con hora de llegada registrada se ordenan primero cronológicamente
  if (timeA && !timeB) return -1;
  if (!timeA && timeB) return 1;
  // Si ninguna tiene llegada registrada, se conserva el orden planeado
  return a.orden - b.orden;
}

export async function obtenerDetalleRutaCalendarioDia(
  supabase: QueryClient,
  actor: ActorActual,
  options: { fecha: string; supervisorEmpleadoId: string }
): Promise<RutaCalendarioDiaDetail> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.fecha)) {
    throw new Error('La fecha solicitada no es válida.');
  }

  const supervisorEmpleadoId =
    actor.puesto === 'SUPERVISOR' ? actor.empleadoId : options.supervisorEmpleadoId.trim();
  if (!supervisorEmpleadoId) {
    throw new Error('El supervisor es obligatorio.');
  }

  const weekStart = getWeekStartIso(options.fecha);
  let routeQuery = supabase
    .from('ruta_semanal')
    .select(
      'id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, notas, ruta_mensual_envio_id, metadata, updated_at, supervisor:supervisor_empleado_id(id, nombre_completo, zona)'
    )
    .eq('supervisor_empleado_id', supervisorEmpleadoId)
    .eq('semana_inicio', weekStart);

  if (actor.cuentaClienteId) {
    routeQuery = routeQuery.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }
  let envelopeQuery = supabase
    .from('ruta_mensual_envio')
    .select('id, estado')
    .eq('supervisor_empleado_id', supervisorEmpleadoId)
    .eq('periodo', `${options.fecha.slice(0, 7)}-01`);
  if (actor.cuentaClienteId) {
    envelopeQuery = envelopeQuery.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }

  const [routeResult, envelopeResult] = await Promise.all([
    routeQuery.order('updated_at', { ascending: false }).limit(1),
    envelopeQuery.maybeSingle(),
  ]);
  if (routeResult.error) throw new Error(routeResult.error.message);
  if (envelopeResult.error) throw new Error(envelopeResult.error.message);

  const candidateRoute = ((routeResult.data ?? []) as unknown as RouteRow[])[0] ?? null;
  const envelope = (envelopeResult.data as MonthlyEnvelopeRow | null) ?? null;
  const route = candidateRoute?.ruta_mensual_envio_id && !envelope ? null : candidateRoute;
  const routeStatus = route
    ? envelope
      ? getMonthlyEnvelopeRouteStatus(envelope, route)
      : route.estatus
    : null;
  const approvalState = route
    ? envelope
      ? getMonthlyEnvelopeApprovalState(envelope)
      : getRouteApprovalState(route)
    : 'SIN_RUTA';
  const emptyDetail: RutaCalendarioDiaDetail = {
    fecha: options.fecha,
    fechaLabel: formatRouteCalendarDate(options.fecha),
    supervisorEmpleadoId,
    supervisor: route ? getSupervisorName(route) : null,
    zona: route ? (relatedOne(route.supervisor)?.zona ?? null) : null,
    routeId: route?.id ?? null,
    routeStatus,
    approvalState,
    routeNotes: route?.notas ?? null,
    plannedVisits: [],
    completedVisits: [],
    pendingVisits: [],
    events: [],
    pendingRepositions: [],
  };

  if (!route) return emptyDetail;

  const dayNumber = Array.from({ length: 7 }, (_, index) => index + 1).find(
    (candidate) => getRouteCalendarDateForVisit(weekStart, candidate) === options.fecha
  );
  if (!dayNumber) {
    throw new Error('La fecha no pertenece a la semana de la ruta.');
  }
  let visitsQuery = supabase
    .from('ruta_semanal_visita')
    .select(
      'id, ruta_semanal_id, ruta_mensual_envio_id, supervisor_empleado_id, pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion), dia_semana, orden, estatus, selfie_url, evidencia_url, checklist_calidad, comentarios, completada_en, metadata'
    )
    .eq('ruta_semanal_id', route.id)
    .eq('dia_semana', dayNumber);
  visitsQuery = envelope
    ? visitsQuery.eq('ruta_mensual_envio_id', envelope.id)
    : visitsQuery.is('ruta_mensual_envio_id', null);
  visitsQuery = visitsQuery.order('orden', { ascending: true }).limit(100);
  const eventsQuery = supabase
    .from('ruta_agenda_evento')
    .select(
      'id, ruta_semanal_id, ruta_semanal_visita_id, supervisor_empleado_id, pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion), fecha_operacion, tipo_evento, modo_impacto, estatus_aprobacion, estatus_ejecucion, titulo, descripcion, sede, hora_inicio, hora_fin, selfie_url, evidencia_url, check_in_en, check_out_en, metadata'
    )
    .eq('ruta_semanal_id', route.id)
    .eq('fecha_operacion', options.fecha)
    .order('hora_inicio', { ascending: true })
    .limit(100);
  const pendingQuery = supabase
    .from('ruta_visita_pendiente_reposicion')
    .select(
      'id, ruta_semanal_id, ruta_semanal_visita_id, agenda_evento_id, supervisor_empleado_id, pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion), fecha_origen, semana_sugerida_inicio, clasificacion, motivo, estado'
    )
    .eq('ruta_semanal_id', route.id)
    .eq('fecha_origen', options.fecha)
    .limit(100);

  const monthPrefix = options.fecha.slice(0, 7);
  const monthStart = `${monthPrefix}-01`;
  const [yearStr, monthNumStr] = monthPrefix.split('-');
  const lastDay = new Date(Number(yearStr), Number(monthNumStr), 0).getDate();
  const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  let quotaPdvsQuery = supabase
    .from('ruta_cuota_supervisor_pdv')
    .select('pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus)')
    .eq('supervisor_empleado_id', supervisorEmpleadoId)
    .lte('vigente_desde', options.fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${options.fecha}`);

  if (actor.cuentaClienteId) {
    quotaPdvsQuery = quotaPdvsQuery.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }
  quotaPdvsQuery = quotaPdvsQuery.limit(300);

  let supervisorRelQuery = supabase
    .from('supervisor_pdv')
    .select('pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus)')
    .eq('empleado_id', supervisorEmpleadoId)
    .eq('activo', true)
    .lte('fecha_inicio', options.fecha)
    .or(`fecha_fin.is.null,fecha_fin.gte.${options.fecha}`)
    .limit(300);

  let assignmentsQuery = supabase
    .from('asignacion')
    .select('pdv_id')
    .eq('estado_publicacion', 'PUBLICADA')
    .lte('fecha_inicio', options.fecha)
    .or(`fecha_fin.is.null,fecha_fin.gte.${options.fecha}`);

  if (actor.cuentaClienteId) {
    assignmentsQuery = assignmentsQuery.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }
  assignmentsQuery = assignmentsQuery.limit(1000);

  const [
    visitsResult,
    eventsResult,
    pendingResult,
    quotaPdvsResult,
    supervisorRelResult,
    assignmentsResult,
  ] = await Promise.all([
    visitsQuery,
    eventsQuery,
    pendingQuery,
    quotaPdvsQuery,
    supervisorRelQuery,
    assignmentsQuery,
  ]);
  const firstError =
    visitsResult.error ??
    (eventsResult.error && !isMissingAgendaTableError(eventsResult.error.message)
      ? eventsResult.error
      : null) ??
    (pendingResult.error && !isMissingAgendaTableError(pendingResult.error.message)
      ? pendingResult.error
      : null);
  if (firstError) throw new Error(firstError.message);

  const pendingRows = (pendingResult.error
    ? []
    : (pendingResult.data ?? [])) as unknown as PendingRepositionRow[];
  const pendingByVisit = new Map<string, PendingRepositionRow[]>();
  for (const item of pendingRows) {
    if (item.estado === 'DESCARTADA' || item.estado === 'EJECUTADA') continue;
    pendingByVisit.set(item.ruta_semanal_visita_id, [
      ...(pendingByVisit.get(item.ruta_semanal_visita_id) ?? []),
      item,
    ]);
  }

  const rawVisitsData = ((visitsResult.data ?? []) as unknown as VisitRow[]).map((visit) =>
    envelope && visit.estatus === 'CANCELADA'
      ? { ...visit, estatus: 'PLANIFICADA' as const }
      : visit
  );
  const rawEventsData = (eventsResult.error
    ? []
    : (eventsResult.data ?? [])) as unknown as AgendaEventRow[];

  interface AssignedPdvItem {
    id: string;
    clave_btl: string | null;
    nombre: string;
    zona: string | null;
    direccion: string | null;
  }
  const assignedPdvMap = new Map<string, AssignedPdvItem>();

  for (const row of ((quotaPdvsResult.data ?? []) as any[])) {
    const p = relatedOne(row.pdv);
    if (p && p.id && !assignedPdvMap.has(p.id)) {
      assignedPdvMap.set(p.id, {
        id: p.id,
        clave_btl: p.clave_btl ?? null,
        nombre: p.nombre,
        zona: p.zona ?? null,
        direccion: p.direccion ?? null,
      });
    }
  }

  for (const row of ((supervisorRelResult.data ?? []) as any[])) {
    const p = relatedOne(row.pdv);
    if (p && p.id && !assignedPdvMap.has(p.id)) {
      assignedPdvMap.set(p.id, {
        id: p.id,
        clave_btl: p.clave_btl ?? null,
        nombre: p.nombre,
        zona: p.zona ?? null,
        direccion: p.direccion ?? null,
      });
    }
  }

  const assignedToDcSet = new Set<string>(
    ((assignmentsResult.data ?? []) as Array<{ pdv_id: string }>).map((a) => a.pdv_id)
  );

  // Consultar geocercas de todos los PDVs involucrados en visitas, eventos y territorio
  const pdvIds = Array.from(
    new Set([
      ...rawVisitsData.map((v) => v.pdv_id).filter(Boolean),
      ...rawEventsData.map((e) => e.pdv_id).filter(Boolean),
      ...Array.from(assignedPdvMap.keys()),
    ])
  ) as string[];

  const geocercasMap = new Map<string, { latitud: number; longitud: number; radio: number }>();
  if (pdvIds.length > 0) {
    const { data: geocercasData } = await supabase
      .from('geocerca_pdv')
      .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
      .in('pdv_id', pdvIds)
      .limit(500);

    for (const g of (geocercasData ?? []) as any[]) {
      if (g.latitud !== null && g.longitud !== null) {
        geocercasMap.set(g.pdv_id, {
          latitud: Number(g.latitud),
          longitud: Number(g.longitud),
          radio: Number(g.radio_tolerancia_metros ?? 150),
        });
      }
    }
  }

  const territoryPdvs: RutaCalendarioTerritoryPdv[] = Array.from(assignedPdvMap.values())
    .map((pdv) => {
      const geo = geocercasMap.get(pdv.id);
      return {
        pdvId: pdv.id,
        nombre: pdv.nombre,
        claveBtl: pdv.clave_btl ?? null,
        zona: pdv.zona ?? null,
        direccion: pdv.direccion ?? null,
        latitud: geo?.latitud ?? null,
        longitud: geo?.longitud ?? null,
        isVacante: !assignedToDcSet.has(pdv.id),
      };
    })
    .filter((p) => typeof p.latitud === 'number' && typeof p.longitud === 'number');

  const todayIso = getIsoDateInMexicoCity();
  const visitDetails = rawVisitsData.map((visit) =>
    mapVisitDetail(visit, pendingByVisit, options.fecha, todayIso, geocercasMap)
  );
  const activeVisits = visitDetails.filter((visit) => visit.estatus !== 'CANCELADA');
  const rawEvents = rawEventsData.map((event) => mapEventDetail(event, geocercasMap, activeVisits));

  // Vincular desplazamientos cruzados entre visitas y eventos
  const events = rawEvents.map((event) => {
    const isReemplazaTotal = event.modoImpacto === 'REEMPLAZA_TOTAL';
    const displacedVisits = activeVisits
      .filter((v) => isReemplazaTotal || event.displacedVisitIds.includes(v.id))
      .map((v) => ({
        id: v.id,
        pdv: v.pdv,
        claveBtl: v.claveBtl,
        orden: v.orden,
      }));

    return {
      ...event,
      displacedVisits,
    };
  });

  const activeVisitsWithDisplacements = activeVisits.map((visit) => {
    const displacingEvent = events.find(
      (e) => e.modoImpacto === 'REEMPLAZA_TOTAL' || e.displacedVisitIds.includes(visit.id)
    );

    if (!displacingEvent) {
      return visit;
    }

    return {
      ...visit,
      desplazamiento: {
        displaced: true,
        eventId: displacingEvent.id,
        eventTitulo: displacingEvent.titulo,
        tipoEvento: displacingEvent.tipoEvento,
        tipoLabel: displacingEvent.tipoLabel,
        modoImpacto: displacingEvent.modoImpacto,
        modoImpactoLabel: displacingEvent.modoImpactoLabel,
      },
    };
  });

  const sortedPlannedVisits = [...activeVisitsWithDisplacements].sort(sortVisitsByArrivalOrOrder);

  return {
    ...emptyDetail,
    plannedVisits: sortedPlannedVisits,
    completedVisits: sortedPlannedVisits.filter((visit) => visit.estatus === 'COMPLETADA'),
    pendingVisits: sortedPlannedVisits.filter((visit) => visit.estatus !== 'COMPLETADA'),
    events,
    pendingRepositions: pendingRows.map((item) => ({
      id: item.id,
      visitId: item.ruta_semanal_visita_id,
      pdv: relatedOne(item.pdv)?.nombre ?? null,
      fechaOrigen: item.fecha_origen,
      clasificacion: item.clasificacion,
      motivo: item.motivo,
      estado: item.estado,
      semanaSugeridaInicio: item.semana_sugerida_inicio,
    })),
    territoryPdvs,
  };
}

export async function obtenerCalendarioMensualRutaParaActor(
  actor: ActorActual,
  options: { monthIso?: string | null; supervisorEmpleadoId?: string | null } = {}
) {
  const monthIso = ensureValidMonth(options.monthIso);
  const supervisorId =
    actor.puesto === 'SUPERVISOR'
      ? actor.empleadoId
      : options.supervisorEmpleadoId?.trim() || 'todos';

  const read = unstable_cache(
    async () =>
      obtenerCalendarioMensualRuta(createServiceClient() as QueryClient, actor, {
        monthIso,
        supervisorEmpleadoId: supervisorId === 'todos' ? null : supervisorId,
      }),
    [
      'ruta-calendario-mensual',
      actor.cuentaClienteId ?? 'global',
      actor.empleadoId,
      actor.puesto,
      monthIso,
      supervisorId,
    ],
    {
      revalidate: 30,
      tags: buildModuleCacheTags({
        module: 'ruta-semanal',
        accountId: actor.cuentaClienteId,
        employeeId: actor.empleadoId,
        supervisorId: supervisorId === 'todos' ? null : supervisorId,
        period: monthIso,
      }),
    }
  );

  return read();
}

export async function obtenerDetalleRutaCalendarioDiaParaActor(
  actor: ActorActual,
  options: { fecha: string; supervisorEmpleadoId: string }
) {
  const supervisorId =
    actor.puesto === 'SUPERVISOR' ? actor.empleadoId : options.supervisorEmpleadoId.trim();
  const read = unstable_cache(
    async () =>
      obtenerDetalleRutaCalendarioDia(createServiceClient() as QueryClient, actor, {
        fecha: options.fecha,
        supervisorEmpleadoId: supervisorId,
      }),
    [
      'ruta-calendario-dia',
      actor.cuentaClienteId ?? 'global',
      actor.empleadoId,
      actor.puesto,
      supervisorId,
      options.fecha,
    ],
    {
      revalidate: 10,
      tags: buildModuleCacheTags({
        module: 'ruta-semanal',
        accountId: actor.cuentaClienteId,
        employeeId: actor.empleadoId,
        supervisorId,
        period: options.fecha,
      }),
    }
  );

  return read();
}