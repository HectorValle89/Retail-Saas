import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActorActual } from '@/lib/auth/session';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import { generateR2DownloadUrl, isR2ProxyUrl } from '@/lib/storage/r2Service';
import { createServiceClient } from '@/lib/supabase/server';
import type { Empleado, Pdv, RutaSemanal, RutaSemanalVisita } from '@/types/database';

import { buildMonthRange } from './reporteVisitasOperativasService';

type MaybeMany<T> = T | T[] | null;

type RutaSupervisorRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>;
type RutaVisitaPdvRelacion = Pick<Pdv, 'nombre' | 'clave_btl' | 'zona'>;

type RutaVisitasSupervisoresRouteRow = Pick<
  RutaSemanal,
  'id' | 'cuenta_cliente_id' | 'supervisor_empleado_id' | 'semana_inicio' | 'estatus'
> & {
  supervisor: MaybeMany<RutaSupervisorRelacion>;
};

type RutaVisitasSupervisoresVisitRow = Pick<
  RutaSemanalVisita,
  | 'id'
  | 'ruta_semanal_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'dia_semana'
  | 'orden'
  | 'estatus'
  | 'selfie_url'
  | 'selfie_hash'
  | 'evidencia_url'
  | 'evidencia_hash'
  | 'selfie_thumbnail_url'
  | 'selfie_thumbnail_hash'
  | 'evidencia_thumbnail_url'
  | 'evidencia_thumbnail_hash'
  | 'checklist_calidad'
  | 'comentarios'
  | 'completada_en'
> & {
  pdv: MaybeMany<RutaVisitaPdvRelacion>;
};

export type VisitasSupervisoresEstadoFiltro = 'TODAS' | 'COMPLETADA' | 'PLANIFICADA' | 'CANCELADA';

export interface VisitasSupervisoresResumen {
  supervisores: number;
  rutas: number;
  visitas: number;
  completadas: number;
  selfies: number;
  evidencias: number;
  checklistPromedio: number;
}

export interface VisitasSupervisoresOption {
  supervisorEmpleadoId: string;
  supervisor: string;
  rutas: number;
  visitas: number;
  completadas: number;
}

export interface VisitasSupervisoresItem {
  routeId: string;
  visitId: string;
  supervisorEmpleadoId: string;
  supervisor: string;
  idNomina: string | null;
  puesto: string | null;
  semanaInicio: string;
  fechaOperacion: string;
  diaLabel: string;
  rutaEstatus: string;
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA';
  pdv: string;
  pdvClaveBtl: string | null;
  zona: string | null;
  orden: number;
  selfieUrl: string | null;
  selfieThumbnailUrl: string | null;
  evidenciaUrl: string | null;
  evidenciaThumbnailUrl: string | null;
  checklistCompletado: number;
  checklistTotal: number;
  comentarios: string | null;
  completadaEn: string | null;
}

export interface VisitasSupervisoresData {
  periodo: string;
  estadoFiltro: VisitasSupervisoresEstadoFiltro;
  limit: number;
  infraestructuraLista: boolean;
  mensajeInfraestructura?: string;
  resumen: VisitasSupervisoresResumen;
  supervisores: VisitasSupervisoresOption[];
  items: VisitasSupervisoresItem[];
}

interface ObtenerVisitasSupervisoresOptions {
  periodo?: string;
  supervisorEmpleadoId?: string;
  estadoFiltro?: string;
  limit?: number;
}

const VISITAS_SUPERVISORES_REVALIDATE_SECONDS = 60;

function normalizeLimit(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 25;
  }

  return Math.min(100, Math.max(10, Math.floor(value)));
}

function normalizeEstadoFiltro(value?: string | null): VisitasSupervisoresEstadoFiltro {
  if (value === 'COMPLETADA' || value === 'PLANIFICADA' || value === 'CANCELADA') {
    return value;
  }

  return 'TODAS';
}

function obtenerPrimero<T>(value: MaybeMany<T>) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function buildDefaultResponse(
  periodo: string,
  estadoFiltro: VisitasSupervisoresEstadoFiltro,
  limit: number,
  message?: string
): VisitasSupervisoresData {
  return {
    periodo,
    estadoFiltro,
    limit,
    infraestructuraLista: message == null,
    mensajeInfraestructura: message,
    resumen: {
      supervisores: 0,
      rutas: 0,
      visitas: 0,
      completadas: 0,
      selfies: 0,
      evidencias: 0,
      checklistPromedio: 0,
    },
    supervisores: [],
    items: [],
  };
}

function buildCacheKey(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  options: ObtenerVisitasSupervisoresOptions
) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    periodo: options.periodo ?? null,
    supervisorEmpleadoId: options.supervisorEmpleadoId ?? null,
    estadoFiltro: normalizeEstadoFiltro(options.estadoFiltro),
    limit: normalizeLimit(options.limit),
  });
}

function buildCacheTags(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  options: ObtenerVisitasSupervisoresOptions
) {
  return buildModuleCacheTags({
    module: 'reportes',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: options.supervisorEmpleadoId ?? null,
    period: options.periodo ?? null,
  });
}

function buildDayLabel(fecha: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(`${fecha}T12:00:00Z`));
}

function getOperationDate(weekStart: string, diaSemana: number) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, diaSemana - 1));
  return date.toISOString().slice(0, 10);
}

function getChecklistProgress(checklist: Record<string, boolean>) {
  const entries = Object.values(checklist);
  const total = entries.length;
  const completed = entries.filter(Boolean).length;

  return {
    total,
    completed,
  };
}

function normalizeReference(value: string | null | undefined) {
  return value?.trim() || null;
}

type ArchivoHashMediaRow = Pick<
  import('@/types/database').ArchivoHash,
  'sha256' | 'bucket' | 'ruta_archivo' | 'miniatura_bucket' | 'miniatura_ruta_archivo'
>;

async function signStorageReference(
  service: SupabaseClient,
  bucket: string,
  route: string,
  expiresInSeconds = 60 * 60
) {
  const normalizedBucket = bucket.trim();
  const normalizedRoute = route.trim();

  if (!normalizedBucket || !normalizedRoute) {
    return null;
  }

  if (normalizedBucket === 'CF_R2') {
    try {
      return await generateR2DownloadUrl(normalizedRoute);
    } catch {
      return null;
    }
  }

  const { data, error } = await service.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedRoute, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

async function resolveMediaUrl(
  service: SupabaseClient | undefined,
  reference: string | null | undefined,
  hash: string | null | undefined,
  lookupByHash: Map<string, ArchivoHashMediaRow>
) {
  const normalizedReference = normalizeReference(reference);
  const normalizedHash = normalizeReference(hash);

  if (!service) {
    return normalizedReference;
  }

  if (normalizedHash) {
    const lookup = lookupByHash.get(normalizedHash);
    if (lookup) {
      const signed = await signStorageReference(service, lookup.bucket, lookup.ruta_archivo ?? '');
      if (signed) {
        return signed;
      }
    }
  }

  if (!normalizedReference) {
    return null;
  }

  if (/^https?:\/\//i.test(normalizedReference)) {
    return normalizedReference;
  }

  if (isR2ProxyUrl(normalizedReference)) {
    return normalizedReference;
  }

  const segments = normalizedReference.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [bucket, ...pathSegments] = segments;
    const signed = await signStorageReference(service, bucket, pathSegments.join('/'));
    if (signed) {
      return signed;
    }
  }

  try {
    return await generateR2DownloadUrl(normalizedReference);
  } catch {
    return null;
  }
}

async function resolveThumbnailUrl(
  service: SupabaseClient | undefined,
  reference: string | null | undefined,
  hash: string | null | undefined,
  originalHash: string | null | undefined,
  lookupByHash: Map<string, ArchivoHashMediaRow>
) {
  if (!service) {
    return normalizeReference(reference);
  }

  const resolved = await resolveMediaUrl(service, reference, hash, lookupByHash);
  if (resolved) {
    return resolved;
  }

  const normalizedOriginalHash = normalizeReference(originalHash);
  if (!normalizedOriginalHash) {
    return null;
  }

  const lookup = lookupByHash.get(normalizedOriginalHash);
  if (!lookup?.miniatura_bucket || !lookup.miniatura_ruta_archivo) {
    return null;
  }

  return signStorageReference(service, lookup.miniatura_bucket, lookup.miniatura_ruta_archivo);
}

function formatOperationDate(weekStart: string, diaSemana: number) {
  const date = getOperationDate(weekStart, diaSemana);
  return date;
}

export function buildVisitasSupervisoresDetalle(
  routesRaw: RutaVisitasSupervisoresRouteRow[],
  visitsRaw: RutaVisitasSupervisoresVisitRow[],
  options: {
    periodo: string;
    estadoFiltro: VisitasSupervisoresEstadoFiltro;
    limit: number;
  }
): VisitasSupervisoresData {
  const routeMap = new Map<string, RutaVisitasSupervisoresRouteRow>();

  for (const route of routesRaw) {
    if (route.estatus === 'BORRADOR') {
      continue;
    }

    routeMap.set(route.id, route);
  }

  const monthRange = buildMonthRange(options.periodo);

  const filteredVisits = visitsRaw.flatMap((visit) => {
    const route = routeMap.get(visit.ruta_semanal_id);
    if (!route) {
      return [];
    }

    const supervisor = obtenerPrimero(route.supervisor);
    const pdv = obtenerPrimero(visit.pdv);
    const checklist = getChecklistProgress(visit.checklist_calidad);
    const fechaOperacion = formatOperationDate(route.semana_inicio, visit.dia_semana);

    // Excluir visitas cuya fecha de operacion caiga fuera del mes seleccionado.
    // Esto ocurre cuando una ruta semanal cruza el limite de mes (ej. ruta del 27/abr
    // con dia_semana=5 genera fechaOperacion=01/may, que no debe aparecer en Abril).
    if (fechaOperacion < monthRange.startDate || fechaOperacion >= monthRange.endDateExclusive) {
      return [];
    }

    const item = {
      routeId: route.id,
      visitId: visit.id,
      supervisorEmpleadoId: route.supervisor_empleado_id,
      supervisor: supervisor?.nombre_completo ?? 'Sin supervisor',
      idNomina: supervisor?.id_nomina ?? null,
      puesto: supervisor?.puesto ?? null,
      semanaInicio: route.semana_inicio,
      fechaOperacion,
      diaLabel: buildDayLabel(fechaOperacion),
      rutaEstatus: route.estatus,
      estatus: visit.estatus,
      pdv: pdv?.nombre ?? 'Sin PDV',
      pdvClaveBtl: pdv?.clave_btl ?? null,
      zona: pdv?.zona ?? null,
      orden: visit.orden,
      selfieUrl: visit.selfie_url,
      selfieThumbnailUrl: visit.selfie_thumbnail_url,
      evidenciaUrl: visit.evidencia_url,
      evidenciaThumbnailUrl: visit.evidencia_thumbnail_url,
      checklistCompletado: checklist.completed,
      checklistTotal: checklist.total,
      comentarios: visit.comentarios,
      completadaEn: visit.completada_en,
    } satisfies VisitasSupervisoresItem;

    return [item];
  });

  const normalizedVisits = filteredVisits.filter((visit) => {
    if (options.estadoFiltro === 'TODAS') {
      return true;
    }

    return visit.estatus === options.estadoFiltro;
  });

  const supervisors = new Map<string, VisitasSupervisoresOption>();
  const routesCounted = new Set<string>();
  let completed = 0;
  let selfies = 0;
  let evidencias = 0;
  let checklistCompleted = 0;
  let checklistTotal = 0;

  for (const visit of normalizedVisits) {
    const supervisorKey = visit.supervisorEmpleadoId;
    const current = supervisors.get(supervisorKey) ?? {
      supervisorEmpleadoId: supervisorKey,
      supervisor: visit.supervisor,
      rutas: 0,
      visitas: 0,
      completadas: 0,
    };

    current.visitas += 1;
    if (visit.estatus === 'COMPLETADA') {
      current.completadas += 1;
      completed += 1;
    }
    if (visit.selfieUrl) {
      selfies += 1;
    }
    if (visit.evidenciaUrl) {
      evidencias += 1;
    }

    checklistCompleted += visit.checklistCompletado;
    checklistTotal += visit.checklistTotal;

    current.supervisor =
      current.supervisor === 'Sin supervisor' && visit.supervisor !== 'Sin supervisor'
        ? visit.supervisor
        : current.supervisor;
    supervisors.set(supervisorKey, current);

    const routeKey = visit.routeId;
    if (!routesCounted.has(routeKey)) {
      routesCounted.add(routeKey);
    }
  }

  for (const routeId of routesCounted) {
    const route = routeMap.get(routeId);
    if (!route) {
      continue;
    }

    const current = supervisors.get(route.supervisor_empleado_id);
    if (current) {
      current.rutas += 1;
      supervisors.set(route.supervisor_empleado_id, current);
    }
  }

  const items = normalizedVisits
    .slice()
    .sort((left, right) => {
      if (right.fechaOperacion !== left.fechaOperacion) {
        return right.fechaOperacion.localeCompare(left.fechaOperacion);
      }

      if (right.completadaEn !== left.completadaEn) {
        return String(right.completadaEn ?? '').localeCompare(String(left.completadaEn ?? ''));
      }

      if (right.supervisor !== left.supervisor) {
        return left.supervisor.localeCompare(right.supervisor, 'es-MX');
      }

      if (right.pdv !== left.pdv) {
        return left.pdv.localeCompare(right.pdv, 'es-MX');
      }

      return left.orden - right.orden;
    })
    .slice(0, options.limit);

  const resumen: VisitasSupervisoresResumen = {
    supervisores: supervisors.size,
    rutas: routesCounted.size,
    visitas: normalizedVisits.length,
    completadas: completed,
    selfies,
    evidencias,
    checklistPromedio:
      checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0,
  };

  return {
    periodo: options.periodo,
    estadoFiltro: options.estadoFiltro,
    limit: options.limit,
    infraestructuraLista: true,
    resumen,
    supervisores: Array.from(supervisors.values()).sort((left, right) => {
      if (right.visitas !== left.visitas) {
        return right.visitas - left.visitas;
      }

      return left.supervisor.localeCompare(right.supervisor, 'es-MX');
    }),
    items,
  };
}

async function hydrateVisitasSupervisoresMedia(
  service: SupabaseClient,
  data: VisitasSupervisoresData,
  visitsRaw: RutaVisitasSupervisoresVisitRow[]
) {
  const archiveHashes = Array.from(
    new Set(
      visitsRaw
        .flatMap((visit) => [
          visit.selfie_hash,
          visit.selfie_thumbnail_hash,
          visit.evidencia_hash,
          visit.evidencia_thumbnail_hash,
        ])
        .filter((value): value is string => Boolean(value && value.trim()))
    )
  );

  const archiveLookupByHash = new Map<string, ArchivoHashMediaRow>();

  if (archiveHashes.length > 0) {
    const { data: archiveRows, error } = await service
      .from('archivo_hash')
      .select('sha256, bucket, ruta_archivo, miniatura_bucket, miniatura_ruta_archivo')
      .in('sha256', archiveHashes);

    if (!error) {
      for (const row of (archiveRows ?? []) as ArchivoHashMediaRow[]) {
        archiveLookupByHash.set(row.sha256, row);
      }
    }
  }

  const visitsById = new Map(visitsRaw.map((visit) => [visit.id, visit]));

  const items = await Promise.all(
    data.items.map(async (item) => {
      const visit = visitsById.get(item.visitId);
      if (!visit) {
        return item;
      }

      return {
        ...item,
        selfieUrl: await resolveMediaUrl(
          service,
          visit.selfie_url,
          visit.selfie_hash,
          archiveLookupByHash
        ),
        selfieThumbnailUrl: await resolveThumbnailUrl(
          service,
          visit.selfie_thumbnail_url,
          visit.selfie_thumbnail_hash,
          visit.selfie_hash,
          archiveLookupByHash
        ),
        evidenciaUrl: await resolveMediaUrl(
          service,
          visit.evidencia_url,
          visit.evidencia_hash,
          archiveLookupByHash
        ),
        evidenciaThumbnailUrl: await resolveThumbnailUrl(
          service,
          visit.evidencia_thumbnail_url,
          visit.evidencia_thumbnail_hash,
          visit.evidencia_hash,
          archiveLookupByHash
        ),
      } satisfies VisitasSupervisoresItem;
    })
  );

  return {
    ...data,
    resumen: data.resumen,
    items,
  };
}

async function obtenerVisitasSupervisoresUncached(
  actor: ActorActual,
  supabase: SupabaseClient,
  options: ObtenerVisitasSupervisoresOptions = {}
): Promise<VisitasSupervisoresData> {
  const range = buildMonthRange(options.periodo);
  const estadoFiltro = normalizeEstadoFiltro(options.estadoFiltro);
  const limit = normalizeLimit(options.limit);

  let routesQuery = supabase
    .from('ruta_semanal')
    .select(
      `
      id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      semana_inicio,
      estatus,
      supervisor:supervisor_empleado_id(id_nomina, nombre_completo, puesto)
    `
    )
    .gte('semana_inicio', range.startDate)
    .lt('semana_inicio', range.endDateExclusive)
    .order('semana_inicio', { ascending: true })
    .limit(800);

  if (actor.cuentaClienteId) {
    routesQuery = routesQuery.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }

  if (options.supervisorEmpleadoId) {
    routesQuery = routesQuery.eq('supervisor_empleado_id', options.supervisorEmpleadoId);
  }

  const { data: routesData, error: routesError } = await routesQuery;
  if (routesError) {
    return buildDefaultResponse(range.periodo, estadoFiltro, limit, routesError.message);
  }

  const routesRaw = (routesData ?? []) as RutaVisitasSupervisoresRouteRow[];
  const routeIds = routesRaw.map((item) => item.id);
  if (routeIds.length === 0) {
    return buildDefaultResponse(range.periodo, estadoFiltro, limit);
  }

  const visitsSelectWithThumbnails = `
      id,
      ruta_semanal_id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      pdv_id,
      dia_semana,
      orden,
      estatus,
      selfie_url,
      selfie_hash,
      selfie_thumbnail_url,
      selfie_thumbnail_hash,
      evidencia_url,
      evidencia_hash,
      evidencia_thumbnail_url,
      evidencia_thumbnail_hash,
      checklist_calidad,
      comentarios,
      completada_en,
      pdv:pdv_id(nombre, clave_btl, zona)
    `;
  const visitsSelectBase = `
      id,
      ruta_semanal_id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      pdv_id,
      dia_semana,
      orden,
      estatus,
      selfie_url,
      selfie_hash,
      evidencia_url,
      evidencia_hash,
      checklist_calidad,
      comentarios,
      completada_en,
      pdv:pdv_id(nombre, clave_btl, zona)
    `;

  const runVisitsQuery = (select: string) =>
    supabase.from('ruta_semanal_visita').select(select).in('ruta_semanal_id', routeIds).limit(5000);

  let { data: visitsData, error: visitsError } = await runVisitsQuery(visitsSelectWithThumbnails);
  let infraestructuraMessage: string | undefined;

  if (visitsError && visitsError.message.toLowerCase().includes('thumbnail')) {
    infraestructuraMessage =
      'El reporte cargó sin miniaturas porque faltan columnas de miniatura en ruta_semanal_visita. Aplica la migración 20260423170000_ruta_semanal_visita_thumbnails.sql.';
    const fallback = await runVisitsQuery(visitsSelectBase);
    visitsData = fallback.data;
    visitsError = fallback.error;
  }

  if (visitsError) {
    return buildDefaultResponse(range.periodo, estadoFiltro, limit, visitsError.message);
  }

  const rawVisits = ((visitsData ?? []) as Partial<RutaVisitasSupervisoresVisitRow>[]).map(
    (visit) => ({
      ...visit,
      selfie_thumbnail_url: visit.selfie_thumbnail_url ?? null,
      selfie_thumbnail_hash: visit.selfie_thumbnail_hash ?? null,
      evidencia_thumbnail_url: visit.evidencia_thumbnail_url ?? null,
      evidencia_thumbnail_hash: visit.evidencia_thumbnail_hash ?? null,
    })
  ) as RutaVisitasSupervisoresVisitRow[];
  const baseData = buildVisitasSupervisoresDetalle(routesRaw, rawVisits, {
    periodo: range.periodo,
    estadoFiltro,
    limit,
  });

  const hydratedData = await hydrateVisitasSupervisoresMedia(supabase, baseData, rawVisits);

  return {
    ...hydratedData,
    infraestructuraLista: infraestructuraMessage == null,
    mensajeInfraestructura: infraestructuraMessage,
  };
}

export async function obtenerVisitasSupervisoresDetalle(
  actor: ActorActual,
  options: ObtenerVisitasSupervisoresOptions = {},
  customSupabase?: SupabaseClient
): Promise<VisitasSupervisoresData> {
  if (customSupabase) {
    return obtenerVisitasSupervisoresUncached(actor, customSupabase, options);
  }

  const cacheKey = buildCacheKey(actor, options);

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient;
      return obtenerVisitasSupervisoresUncached(actor, service, options);
    },
    ['reportes:visitas-supervisores', cacheKey],
    {
      tags: buildCacheTags(actor, options),
      revalidate: VISITAS_SUPERVISORES_REVALIDATE_SECONDS,
    }
  )();
}
