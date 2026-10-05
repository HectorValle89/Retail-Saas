import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import { createServiceClient } from '@/lib/supabase/server';
import { getWeekDateIso, getWeekEndIso, getWeekStartIso } from '../lib/weeklyRoute';
import { getPlanningMonthDays, getPlanningMonthIso } from '../lib/monthPlanning';
import type { RutaSemanalPdvOption } from './rutaSemanalService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

interface EffectiveRangeRow {
  pdv_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

interface AssignmentRangeRow extends EffectiveRangeRow {
  id: string;
  cuenta_cliente_id: string | null;
  horario_referencia: string | null;
}

interface PdvCatalogRow {
  id: string;
  clave_btl: string;
  nombre: string;
  zona: string | null;
  direccion: string | null;
  estatus: string | null;
  formato: string | null;
}

interface GeocercaRow {
  pdv_id: string;
  latitud: number | null;
  longitud: number | null;
}

interface PdvStateRangeRow {
  pdv_id: string;
  estado: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

interface CatalogChangeVersionRow {
  scope_key: string;
  version: number;
  updated_at: string;
}

type MaybeMany<T> = T | T[] | null;

interface MonthlySubmissionRow {
  id: string;
  estado: RutaMensualEnvioEstado;
  revision: number;
  total_visitas: number;
  total_dias_planeados: number;
  enviado_en: string;
  revisado_en: string | null;
}

interface MonthlyVisitRow {
  id: string;
  pdv_id: string;
  dia_semana: number;
  orden: number;
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA';
  comentarios: string | null;
  completada_en: string | null;
  ruta: MaybeMany<{ semana_inicio: string }>;
  pdv: MaybeMany<{ nombre: string; clave_btl: string; zona: string | null }>;
}

export type RutaMensualEnvioEstado =
  | 'PENDIENTE_COORDINACION'
  | 'APROBADA'
  | 'CAMBIOS_SOLICITADOS'
  | 'EN_PROGRESO'
  | 'CERRADA';

export interface RutaMensualPlannerVisit {
  id: string;
  fecha: string;
  pdvId: string;
  pdv: string;
  claveBtl: string;
  zona: string | null;
  orden: number;
  estatus: MonthlyVisitRow['estatus'];
  comentarios: string | null;
  completadaEn: string | null;
}

export interface RutaMensualPlannerSnapshot {
  envioId: string | null;
  estado: RutaMensualEnvioEstado | 'BORRADOR';
  revision: number | null;
  totalVisitas: number;
  totalDiasPlaneados: number;
  enviadoEn: string | null;
  revisadoEn: string | null;
  visitas: RutaMensualPlannerVisit[];
}

function isActiveOnDate(row: EffectiveRangeRow, dateIso: string) {
  return (
    row.fecha_inicio.slice(0, 10) <= dateIso &&
    (!row.fecha_fin || row.fecha_fin.slice(0, 10) >= dateIso)
  );
}

function isOperableState(value: string | null | undefined) {
  return value === 'ACTIVO' || value === 'TEMPORAL';
}

function resolvePdvStateForDate(pdv: PdvCatalogRow, states: PdvStateRangeRow[], dateIso: string) {
  const effective = states
    .filter(
      (state) =>
        state.pdv_id === pdv.id &&
        state.vigente_desde.slice(0, 10) <= dateIso &&
        (!state.vigente_hasta || state.vigente_hasta.slice(0, 10) >= dateIso)
    )
    .sort((left, right) => right.vigente_desde.localeCompare(left.vigente_desde))[0];

  return effective?.estado ?? pdv.estatus;
}

async function getCatalogChangeVersion(service: TypedSupabaseClient, actor: ActorActual) {
  const scopes = [
    `cuenta:${actor.cuentaClienteId ?? ''}`,
    `empleado:${actor.empleadoId}`,
    `supervisor:${actor.empleadoId}`,
  ].filter((scope) => !scope.endsWith(':'));
  const { data, error } = await service
    .from('ui_change_version')
    .select('scope_key, version, updated_at')
    .eq('module', 'ruta-semanal')
    .eq('surface', 'all')
    .eq('role_target', 'ALL')
    .in('scope_key', scopes);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CatalogChangeVersionRow[])
    .sort((left, right) => left.scope_key.localeCompare(right.scope_key))
    .map((row) => `${row.scope_key}:${row.version}:${row.updated_at}`)
    .join('|');
}

async function obtenerCatalogoPdvsRutaSupervisorRango(
  service: TypedSupabaseClient,
  actor: ActorActual,
  rangeStart: string,
  rangeEnd: string,
  operationDates: string[]
): Promise<RutaSemanalPdvOption[]> {
  if (actor.puesto !== 'SUPERVISOR' || !actor.cuentaClienteId) {
    return [];
  }

  const [
    { data: relations, error: relationsError },
    { data: assignments, error: assignmentsError },
    { data: accountPdvs, error: accountPdvsError },
  ] = await Promise.all([
    service
      .from('supervisor_pdv')
      .select('pdv_id, fecha_inicio, fecha_fin')
      .eq('empleado_id', actor.empleadoId)
      .eq('activo', true)
      .lte('fecha_inicio', rangeEnd)
      .or(`fecha_fin.is.null,fecha_fin.gte.${rangeStart}`)
      .limit(1000),
    service
      .from('asignacion')
      .select('id, cuenta_cliente_id, pdv_id, fecha_inicio, fecha_fin, horario_referencia')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', rangeEnd)
      .or(`fecha_fin.is.null,fecha_fin.gte.${rangeStart}`)
      .order('fecha_inicio', { ascending: false })
      .limit(1000),
    service
      .from('cuenta_cliente_pdv')
      .select('pdv_id, fecha_inicio, fecha_fin')
      .eq('cuenta_cliente_id', actor.cuentaClienteId)
      .eq('activo', true)
      .lte('fecha_inicio', rangeEnd)
      .or(`fecha_fin.is.null,fecha_fin.gte.${rangeStart}`)
      .limit(1000),
  ]);

  const infrastructureError = relationsError ?? assignmentsError ?? accountPdvsError;
  if (infrastructureError) {
    throw new Error(infrastructureError.message);
  }

  const relationRows = (relations ?? []) as EffectiveRangeRow[];
  const assignmentRows = (assignments ?? []) as AssignmentRangeRow[];
  const accountRows = (accountPdvs ?? []) as EffectiveRangeRow[];
  const candidateIds = Array.from(
    new Set([...relationRows, ...assignmentRows].map((row) => row.pdv_id))
  ).filter((pdvId) => accountRows.some((row) => row.pdv_id === pdvId));

  if (candidateIds.length === 0) {
    return [];
  }

  const [
    { data: pdvs, error: pdvsError },
    { data: geocercas, error: geocercasError },
    { data: pdvStates, error: pdvStatesError },
  ] = await Promise.all([
    service
      .from('pdv')
      .select('id, clave_btl, nombre, zona, direccion, estatus, formato')
      .in('id', candidateIds)
      .order('nombre', { ascending: true }),
    service.from('geocerca_pdv').select('pdv_id, latitud, longitud').in('pdv_id', candidateIds),
    service
      .from('pdv_estado_vigencia')
      .select('pdv_id, estado, vigente_desde, vigente_hasta')
      .in('pdv_id', candidateIds)
      .lte('vigente_desde', rangeEnd)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${rangeStart}`),
  ]);

  const catalogError = pdvsError ?? geocercasError ?? pdvStatesError;
  if (catalogError) {
    throw new Error(catalogError.message);
  }

  const pdvRows = (pdvs ?? []) as PdvCatalogRow[];
  const geocercaMap = new Map(((geocercas ?? []) as GeocercaRow[]).map((row) => [row.pdv_id, row]));
  const stateRows = (pdvStates ?? []) as PdvStateRangeRow[];
  return pdvRows.flatMap((pdv) => {
    const pdvRelations = relationRows.filter((row) => row.pdv_id === pdv.id);
    const pdvAssignments = assignmentRows.filter((row) => row.pdv_id === pdv.id);
    const pdvAccountRanges = accountRows.filter((row) => row.pdv_id === pdv.id);
    const diasDisponibles = operationDates.filter(
      (dateIso) =>
        pdvAccountRanges.some((row) => isActiveOnDate(row, dateIso)) &&
        (pdvRelations.some((row) => isActiveOnDate(row, dateIso)) ||
          pdvAssignments.some((row) => isActiveOnDate(row, dateIso))) &&
        isOperableState(resolvePdvStateForDate(pdv, stateRows, dateIso))
    );

    if (diasDisponibles.length === 0) {
      return [];
    }

    const representativeAssignment = pdvAssignments.find((row) =>
      isActiveOnDate(row, diasDisponibles[0])
    );
    const geocerca = geocercaMap.get(pdv.id);

    return [
      {
        id: pdv.id,
        asignacionId: representativeAssignment?.id ?? null,
        cuentaClienteId: representativeAssignment?.cuenta_cliente_id ?? actor.cuentaClienteId,
        nombre: pdv.nombre,
        claveBtl: pdv.clave_btl,
        zona: pdv.zona,
        direccion: pdv.direccion,
        latitud: geocerca?.latitud ?? null,
        longitud: geocerca?.longitud ?? null,
        formato: pdv.formato,
        horarioReferencia: representativeAssignment?.horario_referencia ?? null,
        vigenteDesde: diasDisponibles[0] ?? null,
        vigenteHasta: diasDisponibles.at(-1) ?? null,
        diasDisponibles,
      } satisfies RutaSemanalPdvOption,
    ];
  });
}

export async function obtenerCatalogoPdvsRutaSupervisorSemana(
  service: TypedSupabaseClient,
  actor: ActorActual,
  referenceDate: string | Date
): Promise<RutaSemanalPdvOption[]> {
  const weekStart = getWeekStartIso(referenceDate);
  const weekEnd = getWeekEndIso(weekStart);
  const weekDates = Array.from({ length: 7 }, (_, index) => getWeekDateIso(weekStart, index + 1));
  return obtenerCatalogoPdvsRutaSupervisorRango(service, actor, weekStart, weekEnd, weekDates);
}

export async function obtenerCatalogoPdvsRutaSupervisorMes(
  service: TypedSupabaseClient,
  actor: ActorActual,
  monthIso: string
): Promise<RutaSemanalPdvOption[]> {
  const month = getPlanningMonthIso(`${monthIso}-01`);
  const days = getPlanningMonthDays(month);
  const monthStart = days[0]?.fecha ?? `${month}-01`;
  const monthEnd = days.at(-1)?.fecha ?? monthStart;
  return obtenerCatalogoPdvsRutaSupervisorRango(
    service,
    actor,
    monthStart,
    monthEnd,
    days.map((day) => day.fecha)
  );
}

export async function obtenerPlaneacionRutaSupervisorMes(
  service: TypedSupabaseClient,
  actor: ActorActual,
  monthIso: string
): Promise<RutaMensualPlannerSnapshot> {
  const month = getPlanningMonthIso(`${monthIso}-01`);
  if (actor.puesto !== 'SUPERVISOR' || !actor.cuentaClienteId) {
    return {
      envioId: null,
      estado: 'BORRADOR',
      revision: null,
      totalVisitas: 0,
      totalDiasPlaneados: 0,
      enviadoEn: null,
      revisadoEn: null,
      visitas: [],
    };
  }

  const { data: submission, error: submissionError } = await service
    .from('ruta_mensual_envio')
    .select('id, estado, revision, total_visitas, total_dias_planeados, enviado_en, revisado_en')
    .eq('cuenta_cliente_id', actor.cuentaClienteId)
    .eq('supervisor_empleado_id', actor.empleadoId)
    .eq('periodo', `${month}-01`)
    .maybeSingle();

  if (submissionError) throw new Error(submissionError.message);
  if (!submission) {
    return {
      envioId: null,
      estado: 'BORRADOR',
      revision: null,
      totalVisitas: 0,
      totalDiasPlaneados: 0,
      enviadoEn: null,
      revisadoEn: null,
      visitas: [],
    };
  }

  const envio = submission as MonthlySubmissionRow;
  const { data: visits, error: visitsError } = await service
    .from('ruta_semanal_visita')
    .select(
      'id, pdv_id, dia_semana, orden, estatus, comentarios, completada_en, ruta:ruta_semanal_id(semana_inicio), pdv:pdv_id(nombre, clave_btl, zona)'
    )
    .eq('ruta_mensual_envio_id', envio.id)
    .order('dia_semana', { ascending: true })
    .order('orden', { ascending: true })
    .limit(3100);

  if (visitsError) throw new Error(visitsError.message);

  const normalizedVisits = ((visits ?? []) as unknown as MonthlyVisitRow[])
    .map((visit) => {
      const route = Array.isArray(visit.ruta) ? visit.ruta[0] : visit.ruta;
      const pdv = Array.isArray(visit.pdv) ? visit.pdv[0] : visit.pdv;
      if (!route?.semana_inicio) return null;
      const fecha = getWeekDateIso(route.semana_inicio, visit.dia_semana);
      if (!fecha.startsWith(`${month}-`)) return null;
      return {
        id: visit.id,
        fecha,
        pdvId: visit.pdv_id,
        pdv: pdv?.nombre ?? 'PDV sin nombre',
        claveBtl: pdv?.clave_btl ?? 'Sin ID PDV',
        zona: pdv?.zona ?? null,
        orden: visit.orden,
        estatus: visit.estatus,
        comentarios: visit.comentarios,
        completadaEn: visit.completada_en,
      } satisfies RutaMensualPlannerVisit;
    })
    .filter((visit): visit is RutaMensualPlannerVisit => visit !== null)
    .sort((left, right) => left.fecha.localeCompare(right.fecha) || left.orden - right.orden);

  return {
    envioId: envio.id,
    estado: envio.estado,
    revision: envio.revision,
    totalVisitas: envio.total_visitas,
    totalDiasPlaneados: envio.total_dias_planeados,
    enviadoEn: envio.enviado_en,
    revisadoEn: envio.revisado_en,
    visitas: normalizedVisits,
  };
}

export async function obtenerCatalogoPdvsRutaSupervisorSemanaParaActor(
  actor: ActorActual,
  referenceDate: string | Date
) {
  const weekStart = getWeekStartIso(referenceDate);
  const service = createServiceClient() as TypedSupabaseClient;
  const changeVersion = await getCatalogChangeVersion(service, actor);
  const read = unstable_cache(
    async () => obtenerCatalogoPdvsRutaSupervisorSemana(service, actor, weekStart),
    [
      'ruta-semanal-pdvs-disponibles',
      actor.cuentaClienteId ?? 'sin-cuenta',
      actor.empleadoId,
      weekStart,
      changeVersion || 'sin-cambios',
    ],
    {
      revalidate: false,
      tags: buildModuleCacheTags({
        module: 'ruta-semanal',
        accountId: actor.cuentaClienteId ?? null,
        employeeId: actor.empleadoId,
        supervisorId: actor.empleadoId,
        period: weekStart,
      }),
    }
  );

  return read();
}

export async function obtenerWorkspaceRutaSupervisorMesParaActor(
  actor: ActorActual,
  monthIso: string
) {
  const month = getPlanningMonthIso(`${monthIso}-01`);
  const service = createServiceClient() as TypedSupabaseClient;
  const changeVersion = await getCatalogChangeVersion(service, actor);
  const read = unstable_cache(
    async () => {
      const [pdvs, planeacion] = await Promise.all([
        obtenerCatalogoPdvsRutaSupervisorMes(service, actor, month),
        obtenerPlaneacionRutaSupervisorMes(service, actor, month),
      ]);
      return { month, pdvs, planeacion };
    },
    [
      'ruta-mensual-workspace',
      actor.cuentaClienteId ?? 'sin-cuenta',
      actor.empleadoId,
      month,
      changeVersion || 'sin-cambios',
    ],
    {
      revalidate: false,
      tags: buildModuleCacheTags({
        module: 'ruta-semanal',
        accountId: actor.cuentaClienteId ?? null,
        employeeId: actor.empleadoId,
        supervisorId: actor.empleadoId,
        period: month,
      }),
    }
  );

  return read();
}