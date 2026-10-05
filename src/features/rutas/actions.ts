'use server';

import { revalidatePath } from 'next/cache';
import { requerirActorActivo } from '@/lib/auth/session';
import { publishUiChanges } from '@/lib/ui-change/server';
import {
  buildUiChangeScope,
  buildUiChangeTargetsFromBusinessEvent,
  type UiChangeScope,
  type UiChangeTarget,
} from '@/lib/ui-change/types';
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization';
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import {
  getWeekDateIso,
  getWeekDayLabel,
  getWeekEndIso,
  getNextWeekStartIso,
  getWeekStartIso,
  isAssignmentActiveForWeek,
  normalizeWeekStart,
} from './lib/weeklyRoute';
import {
  parseRutaSemanalWorkflowMetadata,
  parseRutaVisitaWorkflowMetadata,
  serializeRutaSemanalWorkflowMetadata,
  type RutaApprovalState,
  type RutaChangeRequestType,
} from './lib/routeWorkflow';
import {
  normalizeAgendaEventType,
  normalizeAgendaImpactMode,
  parseRutaAgendaEventMetadata,
  serializeRutaAgendaEventMetadata,
} from './lib/routeAgenda';
import { SUPERVISOR_CHECKLIST_ITEMS } from './lib/supervisorVisitChecklist';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_RUTA_INICIAL, type RutaActionState } from './state';
import {
  hasDirectR2Reference,
  readDirectR2Reference,
  registerDirectR2Evidence,
} from '@/lib/storage/directR2Server';
import {
  notificarRutaEnviada,
  notificarRutaMensualEnviada,
  notificarRutaAprobada,
  notificarRutaRechazada,
  notificarCambioRutaSolicitado,
  notificarCambioRutaResuelto,
  notificarAgendaEventoCreado,
  notificarAgendaEventoResuelto,
  notificarRutasMesGestionadas,
  notificarRutaMensualCambiosSolicitados,
} from '@/lib/notifications/workflows/rutaSemanalEmail';
import { isRouteDuplicateError } from './lib/routeSaveErrors';
import {
  buildWeeklyRouteVisitSyncPlan,
  type RouteWeeklyPlanDraftVisit,
} from './lib/routeWeeklyPlan';
import { normalizeQuotaMonthStart } from './lib/recurringVisitQuotas';
import {
  normalizeRutaMesManagementMonth,
  normalizeRutaMesManagementSummary,
  type RutaMesManagementAction,
  type RutaMesManagementSummary,
} from './lib/monthlyRouteManagement';
import { calcularDistanciaMetros } from '@/features/asistencias/lib/attendanceCapture';
import {
  normalizeMonthlyRouteSubmission,
  normalizeMonthlyRouteSubmissionResult,
} from './lib/monthlyRouteSubmission';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

const RUTA_EVIDENCIAS_BUCKET = 'operacion-evidencias';
const RUTA_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const RUTA_OPERATIONAL_DASHBOARD_EVENTS = new Set([
  'ruta_visita_checkin',
  'ruta_visita_checkout',
  'ruta_visita_completada',
  'ruta_agenda_evento_checkin',
  'ruta_agenda_evento_checkout',
  'ruta_agenda_evento_evidencia_unica',
]);

const RUTA_SOLICITUD_EVENTS = new Set(['ruta_cambio_solicitado', 'ruta_cambio_resuelto']);

function compactUiScopes(scopes: Array<UiChangeScope | null | undefined>) {
  return Array.from(new Set(scopes.filter((scope): scope is UiChangeScope => Boolean(scope))));
}

function buildRutaScopedTargets({
  eventType,
  cuentaClienteId,
  empleadoId,
  supervisorEmpleadoId,
  metadata,
  supervisorScopes,
  managerScopes,
  modules,
}: {
  eventType: string;
  cuentaClienteId: string | null;
  empleadoId: string;
  supervisorEmpleadoId: string | null;
  metadata: Record<string, unknown>;
  supervisorScopes: UiChangeScope[];
  managerScopes: UiChangeScope[];
  modules: string[];
}) {
  const targets: UiChangeTarget[] = [];

  if (supervisorScopes.length > 0) {
    targets.push(
      ...buildUiChangeTargetsFromBusinessEvent({
        eventType,
        modules,
        surfaces: ['panel'],
        scopes: supervisorScopes,
        cuentaClienteId,
        empleadoId,
        supervisorEmpleadoId,
        roleTargets: ['SUPERVISOR'],
        metadata,
      })
    );
  }

  if (managerScopes.length > 0) {
    targets.push(
      ...buildUiChangeTargetsFromBusinessEvent({
        eventType,
        modules,
        surfaces: ['panel'],
        scopes: managerScopes,
        cuentaClienteId,
        empleadoId,
        supervisorEmpleadoId,
        roleTargets: ['COORDINADOR', 'ADMINISTRADOR'],
        metadata,
      })
    );
  }

  return targets;
}

async function publishRutaSemanalUiChanges(
  actor: Awaited<ReturnType<typeof requerirActorActivo>>,
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    supervisorEmpleadoId,
    pdvId,
    routeId,
    visitId,
    eventType,
    weekStart,
  }: {
    cuentaClienteId?: string | null;
    supervisorEmpleadoId?: string | null;
    pdvId?: string | null;
    routeId?: string | null;
    visitId?: string | null;
    eventType: string;
    weekStart?: string | null;
  }
) {
  const resolvedSupervisorId =
    supervisorEmpleadoId ?? (actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null);
  const resolvedAccountId = cuentaClienteId ?? actor.cuentaClienteId ?? null;
  const supervisorScopes = compactUiScopes([
    buildUiChangeScope('empleado', actor.empleadoId),
    buildUiChangeScope('supervisor', resolvedSupervisorId),
  ]);
  const managerScopes = compactUiScopes([
    buildUiChangeScope('cuenta', resolvedAccountId),
    buildUiChangeScope('periodo', weekStart ?? null),
  ]);
  const metadata = {
    routeId: routeId ?? null,
    visitId: visitId ?? null,
    pdvId: pdvId ?? null,
    periodo: weekStart ?? null,
  };
  const targets = buildRutaScopedTargets({
    eventType,
    cuentaClienteId: resolvedAccountId,
    empleadoId: actor.empleadoId,
    supervisorEmpleadoId: resolvedSupervisorId,
    metadata,
    supervisorScopes,
    managerScopes,
    modules: ['ruta-semanal'],
  });

  if (RUTA_OPERATIONAL_DASHBOARD_EVENTS.has(eventType)) {
    targets.push(
      ...buildRutaScopedTargets({
        eventType,
        cuentaClienteId: resolvedAccountId,
        empleadoId: actor.empleadoId,
        supervisorEmpleadoId: resolvedSupervisorId,
        metadata,
        supervisorScopes,
        managerScopes: compactUiScopes([buildUiChangeScope('cuenta', resolvedAccountId)]),
        modules: ['dashboard', 'asistencias'],
      })
    );
  }

  if (RUTA_SOLICITUD_EVENTS.has(eventType)) {
    targets.push(
      ...buildRutaScopedTargets({
        eventType,
        cuentaClienteId: resolvedAccountId,
        empleadoId: actor.empleadoId,
        supervisorEmpleadoId: resolvedSupervisorId,
        metadata,
        supervisorScopes,
        managerScopes,
        modules: ['solicitudes'],
      })
    );
  }

  await publishUiChanges(targets, { service });
}

async function publishRutaMensualUiChanges(
  actor: Awaited<ReturnType<typeof requerirActorActivo>>,
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    supervisorIds,
    eventType,
    monthStart,
  }: {
    cuentaClienteId: string;
    supervisorIds: string[];
    eventType: string;
    monthStart: string;
  }
) {
  const metadata = {
    periodo: monthStart,
    month: monthStart.slice(0, 7),
  };
  const targets = buildRutaScopedTargets({
    eventType,
    cuentaClienteId,
    empleadoId: actor.empleadoId,
    supervisorEmpleadoId: null,
    metadata,
    supervisorScopes: [],
    managerScopes: compactUiScopes([
      buildUiChangeScope('cuenta', cuentaClienteId),
      buildUiChangeScope('periodo', monthStart),
    ]),
    modules: ['ruta-semanal'],
  });

  for (const supervisorId of supervisorIds) {
    targets.push(
      ...buildRutaScopedTargets({
        eventType,
        cuentaClienteId,
        empleadoId: supervisorId,
        supervisorEmpleadoId: supervisorId,
        metadata,
        supervisorScopes: compactUiScopes([
          buildUiChangeScope('empleado', supervisorId),
          buildUiChangeScope('supervisor', supervisorId),
        ]),
        managerScopes: [],
        modules: ['ruta-semanal'],
      })
    );
  }

  await publishUiChanges(targets, { service });
}

function buildState(partial: Partial<RutaActionState>): RutaActionState {
  return {
    ...ESTADO_RUTA_INICIAL,
    ...partial,
  };
}

function buildRouteSaveErrorState(error: unknown, fallbackMessage: string) {
  // Si la ruta ya existe o la visita quedó materializada antes del reenvio,
  // tratamos el duplicado como un guardado idempotente y seguimos el flujo normal.
  if (isRouteDuplicateError(error)) {
    return null;
  }

  return buildState({
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}

async function requerirSupervisorRutaEditable() {
  const actor = await requerirActorActivo();

  if (actor.puesto !== 'SUPERVISOR') {
    throw new Error('Solo SUPERVISOR puede editar la ruta semanal.');
  }

  return actor;
}

function normalizeText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(RUTA_EVIDENCIAS_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: RUTA_ALLOWED_MIME_TYPES,
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

async function uploadRutaEvidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    actorAuthUserId,
    cuentaClienteId,
    supervisorEmpleadoId,
    file,
    evidenceKind,
    directReference,
    directThumbnailReference,
  }: {
    actorUsuarioId: string;
    actorAuthUserId?: string | null;
    cuentaClienteId: string;
    supervisorEmpleadoId: string;
    file: File | null;
    evidenceKind: 'selfie' | 'evidencia';
    directReference?: ReturnType<typeof readDirectR2Reference>;
    directThumbnailReference?: ReturnType<typeof readDirectR2Reference>;
  }
) {
  if (directReference && hasDirectR2Reference(directReference)) {
    const registered = await registerDirectR2Evidence(service, {
      actorUsuarioId,
      actorAuthUserId,
      modulo: `ruta_semanal_${evidenceKind}`,
      referenciaEntidadId: supervisorEmpleadoId,
      reference: directReference,
    });

    const registeredThumbnail =
      directThumbnailReference && hasDirectR2Reference(directThumbnailReference)
        ? await registerDirectR2Evidence(service, {
            actorUsuarioId,
            actorAuthUserId,
            modulo: `ruta_semanal_${evidenceKind}_thumbnail`,
            referenciaEntidadId: supervisorEmpleadoId,
            reference: directThumbnailReference,
          })
        : null;

    return {
      archivo: {
        url: registered.url,
        hash: registered.hash,
      },
      miniatura: registeredThumbnail
        ? {
            url: registeredThumbnail.url,
            hash: registeredThumbnail.hash,
          }
        : null,
      deduplicated: false,
      optimization: {
        optimizationKind: 'r2_direct',
        originalBytes: registered.size,
        optimizedBytes: registered.size,
        targetMet: true,
        notes: ['Subida directa via R2'],
        officialAssetKind: 'original',
      },
    };
  }

  if (!file) {
    throw new Error('La evidencia requerida no fue adjuntada.');
  }

  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', file));
  }

  if (!RUTA_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La evidencia debe ser imagen JPEG/PNG/WEBP o PDF.');
  }

  await ensureBucket(service);
  return storeOptimizedEvidence({
    service,
    bucket: RUTA_EVIDENCIAS_BUCKET,
    actorUsuarioId,
    storagePrefix: `ruta-semanal/${cuentaClienteId}/${supervisorEmpleadoId}/${evidenceKind}`,
    file,
  });
}

function normalizeInt(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} invalido.`);
  }

  return parsed;
}

function buildChecklist(formData: FormData) {
  return Object.fromEntries(
    SUPERVISOR_CHECKLIST_ITEMS.map((item) => [
      item.key,
      String(formData.get(`checklist_${item.key}`) ?? '').trim() === 'true',
    ])
  );
}

function buildChecklistComments(formData: FormData) {
  return Object.fromEntries(
    SUPERVISOR_CHECKLIST_ITEMS.flatMap((item) => {
      if (!('commentKey' in item)) {
        return [];
      }

      const value = normalizeText(formData.get(`checklist_comment_${item.commentKey}`));
      return value ? [[item.commentKey, value]] : [];
    })
  );
}

function normalizeOptionalNonNegativeInt(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('La cantidad de registros Love ISDIN debe ser un entero igual o mayor a cero.');
  }

  return parsed;
}

function normalizeFloat(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGpsState(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();

  if (
    normalized === 'DENTRO_GEOCERCA' ||
    normalized === 'FUERA_GEOCERCA' ||
    normalized === 'SIN_GPS' ||
    normalized === 'PENDIENTE'
  ) {
    return normalized;
  }

  return 'PENDIENTE';
}

function normalizeGpsCaptureStatus(gpsState: ReturnType<typeof normalizeGpsState>) {
  if (gpsState === 'SIN_GPS') {
    return 'SIN_GPS';
  }

  if (gpsState === 'PENDIENTE') {
    return 'PENDIENTE';
  }

  return 'OK';
}

function resolveRouteStatusFromApprovalState(approvalState: RutaApprovalState) {
  if (approvalState === 'APROBADA') {
    return 'PUBLICADA' as const;
  }

  return 'BORRADOR' as const;
}

function isRutaMetadataMissingError(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('ruta_semanal.metadata') ||
    (normalized.includes('column') && normalized.includes('metadata'))
  );
}

function isRutaAgendaInfrastructureMissingError(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('public.ruta_agenda_evento') ||
    normalized.includes('public.ruta_visita_pendiente_reposicion') ||
    normalized.includes('ruta_agenda_evento') ||
    normalized.includes('ruta_visita_pendiente_reposicion')
  );
}

function buildAgendaInfrastructureState() {
  return buildState({
    message:
      'La agenda operativa dinamica aun no esta disponible en esta base. Aplica la migracion 20260326213000_ruta_agenda_operativa.sql para habilitar eventos del dia y reposiciones.',
  });
}

function getAgendaInfrastructureMessage() {
  return (
    buildAgendaInfrastructureState().message ??
    'La agenda operativa dinamica aun no esta disponible en esta base.'
  );
}

function normalizeJsonStringArray(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('invalid');
    }

    return parsed.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
  } catch {
    throw new Error(`${label} invalido.`);
  }
}

async function syncAgendaEventRepositions({
  supabase,
  actorUsuarioId,
  routeId,
  supervisorEmpleadoId,
  cuentaClienteId,
  agendaEventoId,
  fechaOperacion,
  displacedVisitIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorUsuarioId: string;
  routeId: string;
  supervisorEmpleadoId: string;
  cuentaClienteId: string;
  agendaEventoId: string;
  fechaOperacion: string;
  displacedVisitIds: string[];
}) {
  if (displacedVisitIds.length === 0) {
    return;
  }

  const { data: existing } = await supabase
    .from('ruta_visita_pendiente_reposicion')
    .select('ruta_semanal_visita_id')
    .eq('ruta_semanal_id', routeId)
    .eq('clasificacion', 'JUSTIFICADA')
    .in('ruta_semanal_visita_id', displacedVisitIds);

  const alreadyQueued = new Set((existing ?? []).map((item) => item.ruta_semanal_visita_id));

  const { data: visits } = await supabase
    .from('ruta_semanal_visita')
    .select('id, pdv_id')
    .eq('ruta_semanal_id', routeId)
    .in('id', displacedVisitIds);

  const rows = (visits ?? [])
    .filter((item) => !alreadyQueued.has(item.id))
    .map((item) => ({
      cuenta_cliente_id: cuentaClienteId,
      ruta_semanal_id: routeId,
      ruta_semanal_visita_id: item.id,
      agenda_evento_id: agendaEventoId,
      supervisor_empleado_id: supervisorEmpleadoId,
      pdv_id: item.pdv_id,
      fecha_origen: fechaOperacion,
      semana_sugerida_inicio: getNextWeekStartIso(fechaOperacion),
      clasificacion: 'JUSTIFICADA',
      motivo: 'La visita fue desplazada por una sobreposicion operativa aprobada.',
      estado: 'PENDIENTE',
      metadata: {
        source: 'AGENDA_EVENTO',
        created_by_usuario_id: actorUsuarioId,
      },
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('ruta_visita_pendiente_reposicion').insert(rows);
  if (error) {
    if (isRutaAgendaInfrastructureMissingError(error.message)) {
      throw new Error(getAgendaInfrastructureMessage());
    }
    throw error;
  }
}

type RutaSemanalLookupRow = {
  id: string;
  cuenta_cliente_id: string;
  supervisor_empleado_id: string;
  semana_inicio: string;
  metadata: unknown;
};

type RutaSemanalLookupFallbackRow = Omit<RutaSemanalLookupRow, 'metadata'>;

type AsignacionQuotaBaseRow = {
  pdv_id: string;
  cuenta_cliente_id: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_publicacion: string;
  supervisor_empleado_id: string;
};

function isEffectiveOnDate(
  row: { fecha_inicio: string; fecha_fin: string | null },
  dateIso: string
) {
  return (
    row.fecha_inicio.slice(0, 10) <= dateIso &&
    (!row.fecha_fin || row.fecha_fin.slice(0, 10) >= dateIso)
  );
}

async function requerirCoordinadorRuta() {
  const actor = await requerirActorActivo();

  if (actor.puesto !== 'COORDINADOR' && actor.puesto !== 'ADMINISTRADOR') {
    throw new Error('Solo COORDINADOR o ADMINISTRADOR puede aprobar o resolver rutas.');
  }

  return actor;
}

async function requerirGestorCuotasRuta() {
  const actor = await requerirActorActivo();

  if (actor.puesto !== 'COORDINADOR' && actor.puesto !== 'ADMINISTRADOR') {
    throw new Error('Solo ADMINISTRADOR o COORDINADOR puede gestionar cuotas de visitas.');
  }

  return actor;
}

async function registrarEventoAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    tabla,
    registroId,
    cuentaClienteId,
    usuarioId,
    payload,
  }: {
    tabla: string;
    registroId: string;
    cuentaClienteId: string;
    usuarioId: string;
    payload: Record<string, unknown>;
  }
) {
  await supabase.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  });
}

export async function agregarVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const semanaInicio = normalizeWeekStart(String(formData.get('semana_inicio') ?? '').trim());
    const semanaFin = getWeekEndIso(semanaInicio);
    const diaSemana = normalizeInt(formData.get('dia_semana'), 'Dia');
    const orden = normalizeInt(formData.get('orden'), 'Orden');
    const pdvId = String(formData.get('pdv_id') ?? '').trim();
    const notas = normalizeText(formData.get('notas'));

    if (!pdvId) {
      return buildState({ message: 'El PDV es obligatorio para planificar la visita.' });
    }

    const { data: asignaciones, error: asignacionError } = await supabase
      .from('asignacion')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion'
      )
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('pdv_id', pdvId)
      .order('created_at', { ascending: false })
      .limit(40);

    if (asignacionError) {
      return buildState({ message: asignacionError.message });
    }

    const asignacionActiva = (asignaciones ?? []).find((item) =>
      isAssignmentActiveForWeek(item, semanaInicio, semanaFin)
    );

    if (!asignacionActiva || !asignacionActiva.cuenta_cliente_id) {
      return buildState({
        message: 'El PDV seleccionado no tiene una asignacion activa y publicada para esa semana.',
      });
    }

    const { data: rutaExistente } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, estatus')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('semana_inicio', semanaInicio)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let rutaId = rutaExistente?.id ?? null;

    if (!rutaId) {
      const { data: nuevaRuta, error: createRouteError } = await supabase
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: asignacionActiva.cuenta_cliente_id,
          supervisor_empleado_id: actor.empleadoId,
          semana_inicio: semanaInicio,
          estatus: 'PUBLICADA',
          notas,
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
        })
        .select('id')
        .maybeSingle();

      if (createRouteError || !nuevaRuta) {
        return buildState({
          message: createRouteError?.message ?? 'No fue posible crear la ruta semanal.',
        });
      }

      rutaId = nuevaRuta.id;
    } else if (notas) {
      await supabase
        .from('ruta_semanal')
        .update({
          notas,
          updated_by_usuario_id: actor.usuarioId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rutaId);
    }

    const { data: visita, error: createVisitError } = await supabase
      .from('ruta_semanal_visita')
      .insert({
        ruta_semanal_id: rutaId,
        cuenta_cliente_id: asignacionActiva.cuenta_cliente_id,
        supervisor_empleado_id: actor.empleadoId,
        pdv_id: pdvId,
        asignacion_id: asignacionActiva.id,
        dia_semana: diaSemana,
        orden,
      })
      .select('id')
      .maybeSingle();

    if (createVisitError || !visita) {
      return buildState({
        message:
          createVisitError?.message ?? 'No fue posible programar la visita en la ruta semanal.',
      });
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visita.id,
      cuentaClienteId: asignacionActiva.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_programada',
        ruta_semanal_id: rutaId,
        asignacion_id: asignacionActiva.id,
        pdv_id: pdvId,
        semana_inicio: semanaInicio,
        dia_semana: diaSemana,
        orden,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: asignacionActiva.cuenta_cliente_id,
      pdvId,
      routeId: rutaId,
      visitId: visita.id,
      eventType: 'ruta_visita_programada',
      weekStart: semanaInicio,
    });

    return buildState({
      ok: true,
      message: 'Visita agregada a la ruta semanal.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible agregar la visita.',
    });
  }
}

type RouteCanvasVisitPayload = {
  visitId?: string | null;
  pdvId: string;
  day: number;
  notes?: string | null;
};

type RouteChangeRequestProposalPayload = {
  pdvId: string;
  order: number;
};

function buildRouteVisitUniqueKey(day: number, pdvId: string) {
  return `${day}:${pdvId}`;
}

function parseRouteCanvasPayload(raw: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('La planeacion semanal no tiene un formato valido.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('La planeacion semanal debe enviarse como una lista de visitas.');
  }

  const normalized = parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`La visita ${index + 1} no tiene un formato valido.`);
    }

    const source = item as Record<string, unknown>;
    const pdvId = String(source.pdvId ?? '').trim();
    const day = Number(source.day);
    const notes =
      typeof source.notes === 'string' && source.notes.trim() ? source.notes.trim() : null;
    const visitId =
      typeof source.visitId === 'string' && source.visitId.trim() ? source.visitId.trim() : null;

    if (!pdvId) {
      throw new Error(`La visita ${index + 1} no tiene PDV asignado.`);
    }

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(`La visita ${index + 1} tiene un dia invalido.`);
    }

    return {
      visitId,
      pdvId,
      day,
      notes,
    } satisfies RouteCanvasVisitPayload;
  });

  const seenKeys = new Set<string>();
  for (const visit of normalized) {
    const uniqueKey = buildRouteVisitUniqueKey(visit.day, visit.pdvId);
    if (seenKeys.has(uniqueKey)) {
      throw new Error('No puedes repetir la misma tienda en el mismo dia dentro de la ruta.');
    }
    seenKeys.add(uniqueKey);
  }

  return normalized;
}

function normalizeChangeRequestType(raw: string): RutaChangeRequestType {
  if (raw === 'CAMBIO_DIA' || raw === 'CANCELACION_DIA' || raw === 'CAMBIO_TIENDA') {
    return raw;
  }

  throw new Error('Selecciona un tipo valido de cambio de ruta.');
}

function parseRouteChangeProposalPayload(raw: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('La propuesta de ruta del dia no tiene un formato valido.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('La propuesta de ruta del dia debe enviarse como lista de tiendas.');
  }

  const normalized = parsed
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`La tienda propuesta ${index + 1} no tiene un formato valido.`);
      }

      const source = item as Record<string, unknown>;
      const pdvId = String(source.pdvId ?? '').trim();
      const order = Number(source.order);

      if (!pdvId) {
        throw new Error(`La tienda propuesta ${index + 1} no tiene PDV valido.`);
      }

      if (!Number.isInteger(order) || order <= 0) {
        throw new Error(`La tienda propuesta ${index + 1} tiene un orden invalido.`);
      }

      return {
        pdvId,
        order,
      } satisfies RouteChangeRequestProposalPayload;
    })
    .sort((left, right) => left.order - right.order);

  const seen = new Set<string>();
  for (const proposal of normalized) {
    if (seen.has(proposal.pdvId)) {
      throw new Error('No puedes repetir la misma tienda dentro del cambio de ruta.');
    }
    seen.add(proposal.pdvId);
  }

  return normalized;
}

async function resolveSupervisorWeekAssignmentsAndPdvs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    supervisorEmpleadoId,
    semanaInicio,
    semanaFin,
    pdvIds,
  }: {
    supervisorEmpleadoId: string;
    semanaInicio: string;
    semanaFin: string;
    pdvIds: string[];
  }
) {
  const safePdvIds = pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000'];

  const [
    { data: asignaciones, error: asignacionError },
    { data: supervisorPdvs, error: supervisorPdvsError },
  ] = await Promise.all([
    supabase
      .from('asignacion')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion'
      )
      .eq('supervisor_empleado_id', supervisorEmpleadoId)
      .in('pdv_id', safePdvIds)
      .order('created_at', { ascending: false })
      .limit(400),
    supabase
      .from('supervisor_pdv')
      .select('pdv_id, activo, fecha_inicio, fecha_fin')
      .eq('empleado_id', supervisorEmpleadoId)
      .in('pdv_id', safePdvIds)
      .limit(400),
  ]);

  if (asignacionError) {
    throw new Error(asignacionError.message);
  }

  if (supervisorPdvsError) {
    throw new Error(supervisorPdvsError.message);
  }

  const activeAssignments = new Map<
    string,
    {
      id: string;
      cuenta_cliente_id: string;
    }
  >();

  for (const assignment of asignaciones ?? []) {
    if (
      assignment.estado_publicacion === 'PUBLICADA' &&
      isAssignmentActiveForWeek(assignment, semanaInicio, semanaFin) &&
      assignment.cuenta_cliente_id &&
      !activeAssignments.has(assignment.pdv_id)
    ) {
      activeAssignments.set(assignment.pdv_id, {
        id: assignment.id,
        cuenta_cliente_id: assignment.cuenta_cliente_id,
      });
    }
  }

  const supervisorOwnedPdvs = new Set(
    (supervisorPdvs ?? [])
      .filter((relation) => relation.activo)
      .filter((relation) => {
        const relationStart = relation.fecha_inicio.slice(0, 10);
        const relationEnd = relation.fecha_fin ? relation.fecha_fin.slice(0, 10) : null;
        const normalizedWeekStart = semanaInicio.slice(0, 10);
        const normalizedWeekEnd = semanaFin.slice(0, 10);

        if (relationStart > normalizedWeekEnd) {
          return false;
        }

        if (relationEnd && relationEnd < normalizedWeekStart) {
          return false;
        }

        return true;
      })
      .map((relation) => relation.pdv_id)
  );

  return {
    activeAssignments,
    supervisorOwnedPdvs,
  };
}

function resolveDayNumberWithinRouteWeek(weekStart: string, operationDate: string) {
  const normalizedDate = operationDate.slice(0, 10);

  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    if (getWeekDateIso(weekStart, dayNumber) === normalizedDate) {
      return dayNumber;
    }
  }

  return null;
}

async function applyRouteChangeToDay({
  supabase,
  rutaId,
  cuentaClienteId,
  supervisorEmpleadoId,
  semanaInicio,
  semanaFin,
  targetDayNumber,
  proposedVisits,
}: {
  supabase: TypedSupabaseClient;
  rutaId: string;
  cuentaClienteId: string;
  supervisorEmpleadoId: string;
  semanaInicio: string;
  semanaFin: string;
  targetDayNumber: number;
  proposedVisits: RouteChangeRequestProposalPayload[];
}) {
  const { data: currentDayVisits, error: currentDayVisitsError } = await supabase
    .from('ruta_semanal_visita')
    .select('id, pdv_id, dia_semana, estatus, orden')
    .eq('ruta_semanal_id', rutaId)
    .eq('dia_semana', targetDayNumber)
    .order('orden', { ascending: true })
    .limit(120);

  if (currentDayVisitsError) {
    throw new Error(currentDayVisitsError.message);
  }

  if ((currentDayVisits ?? []).some((visit) => visit.estatus !== 'PLANIFICADA')) {
    throw new Error(
      'No se puede reescribir una ruta que ya tiene visitas ejecutadas o cerradas en ese dia.'
    );
  }

  const pdvIds = proposedVisits.map((item) => item.pdvId);
  const { activeAssignments, supervisorOwnedPdvs } = await resolveSupervisorWeekAssignmentsAndPdvs(
    supabase,
    {
      supervisorEmpleadoId,
      semanaInicio,
      semanaFin,
      pdvIds,
    }
  );

  const missingPdv = pdvIds.find(
    (pdvId) => !activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId)
  );
  if (missingPdv) {
    throw new Error('Uno de los PDVs propuestos ya no pertenece al supervisor para esa semana.');
  }

  const currentVisitsByPdv = new Map(
    (currentDayVisits ?? []).map((visit) => [visit.pdv_id, visit])
  );
  const proposedPdvIds = new Set(proposedVisits.map((item) => item.pdvId));
  const removableIds = (currentDayVisits ?? [])
    .filter((visit) => !proposedPdvIds.has(visit.pdv_id))
    .map((visit) => visit.id);

  if (removableIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('ruta_semanal_visita')
      .delete()
      .in('id', removableIds);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  const occupiedOrders = new Set((currentDayVisits ?? []).map((v) => v.orden));
  const processedVisits: any[] = [];

  for (const proposal of proposedVisits) {
    const existing = currentVisitsByPdv.get(proposal.pdvId);
    const assignment = activeAssignments.get(proposal.pdvId);

    // Si ya existe y es la misma, la actualizamos
    if (existing) {
      const { error: updateError } = await supabase
        .from('ruta_semanal_visita')
        .update({
          orden: proposal.order,
          asignacion_id: assignment?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        // Si falla por duplicado de orden, intentamos buscar el siguiente disponible
        if (isRouteDuplicateError(updateError)) {
          let nextOrder = proposal.order;
          while (occupiedOrders.has(nextOrder)) {
            nextOrder++;
          }
          await supabase
            .from('ruta_semanal_visita')
            .update({
              orden: nextOrder,
              asignacion_id: assignment?.id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          occupiedOrders.add(nextOrder);
        } else {
          throw new Error(updateError.message);
        }
      } else {
        occupiedOrders.add(proposal.order);
      }
      continue;
    }

    // Si es nueva, intentamos insertar
    let orderToUse = proposal.order;
    while (occupiedOrders.has(orderToUse)) {
      orderToUse++;
    }

    const { error: insertError } = await supabase.from('ruta_semanal_visita').insert({
      ruta_semanal_id: rutaId,
      cuenta_cliente_id: assignment?.cuenta_cliente_id ?? cuentaClienteId,
      supervisor_empleado_id: supervisorEmpleadoId,
      pdv_id: proposal.pdvId,
      asignacion_id: assignment?.id ?? null,
      dia_semana: targetDayNumber,
      orden: orderToUse,
      estatus: 'PLANIFICADA',
    });

    if (insertError) {
      if (!isRouteDuplicateError(insertError)) {
        throw new Error(insertError.message);
      }
    } else {
      occupiedOrders.add(orderToUse);
    }
  }
}

export async function guardarPlaneacionRutaSemanalCanvas(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const semanaInicio = normalizeWeekStart(String(formData.get('semana_inicio') ?? '').trim());
    const rawPlan = String(formData.get('route_plan_json') ?? '[]').trim();
    const visits = parseRouteCanvasPayload(rawPlan);
    const editableWeekStart = getWeekStartIso();

    if (semanaInicio < editableWeekStart) {
      return buildState({
        message: `La planeacion editable inicia desde la semana del ${editableWeekStart}.`,
      });
    }

    const rutaLookupWithMetadata = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, estatus, metadata')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('semana_inicio', semanaInicio)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadataColumnAvailable = !isRutaMetadataMissingError(
      rutaLookupWithMetadata.error?.message
    );
    const rutaLookupFallback = metadataColumnAvailable
      ? null
      : await supabase
          .from('ruta_semanal')
          .select('id, cuenta_cliente_id, estatus')
          .eq('supervisor_empleado_id', actor.empleadoId)
          .eq('semana_inicio', semanaInicio)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    const rutaExistente = metadataColumnAvailable
      ? rutaLookupWithMetadata.data
      : rutaLookupFallback?.data;
    const rutaError = metadataColumnAvailable
      ? rutaLookupWithMetadata.error
      : (rutaLookupFallback?.error ?? null);

    if (rutaError) {
      console.error('[Ruta] Error buscando ruta existente:', rutaError);
    }

    if (visits.length === 0 && !rutaExistente) {
      return buildState({ ok: true, message: 'No hay visitas que guardar en la ruta semanal.' });
    }

    const pdvIds = Array.from(new Set(visits.map((item) => item.pdvId)));
    const submittedDays = Array.from(new Set(visits.map((item) => item.day)));
    const { data: asignaciones, error: asignacionError } = await supabase
      .from('asignacion')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion'
      )
      .eq('supervisor_empleado_id', actor.empleadoId)
      .in('pdv_id', pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false })
      .limit(400);

    if (asignacionError) {
      return buildState({ message: asignacionError.message });
    }

    const { data: supervisorPdvs, error: supervisorPdvsError } = await supabase
      .from('supervisor_pdv')
      .select('pdv_id, activo, fecha_inicio, fecha_fin')
      .eq('empleado_id', actor.empleadoId)
      .in('pdv_id', pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(400);

    if (supervisorPdvsError) {
      return buildState({ message: supervisorPdvsError.message });
    }

    const findAssignmentForDate = (pdvId: string, dateIso: string) =>
      (asignaciones ?? []).find(
        (assignment) =>
          assignment.pdv_id === pdvId &&
          assignment.estado_publicacion === 'PUBLICADA' &&
          Boolean(assignment.cuenta_cliente_id) &&
          isEffectiveOnDate(assignment, dateIso)
      ) ?? null;
    const isSupervisorOwnerOnDate = (pdvId: string, dateIso: string) =>
      (supervisorPdvs ?? []).some(
        (relation) =>
          relation.pdv_id === pdvId && relation.activo && isEffectiveOnDate(relation, dateIso)
      );
    const invalidVisit = visits.find((visit) => {
      const operationDate = getWeekDateIso(semanaInicio, visit.day);
      return (
        !findAssignmentForDate(visit.pdvId, operationDate) &&
        !isSupervisorOwnerOnDate(visit.pdvId, operationDate)
      );
    });
    if (invalidVisit) {
      const { data: pdvData } = await supabase
        .from('pdv')
        .select('nombre, clave_btl')
        .eq('id', invalidVisit.pdvId)
        .maybeSingle();

      const pdvLabel = pdvData
        ? `"${pdvData.nombre}" (${pdvData.clave_btl})`
        : `con ID ${invalidVisit.pdvId}`;
      const invalidDate = getWeekDateIso(semanaInicio, invalidVisit.day);

      return buildState({
        message: `El punto de venta ${pdvLabel} no pertenece al supervisor el ${invalidDate}. Retíralo de ese día o cambia la fecha de la visita.`,
      });
    }

    const firstVisitDate = visits[0] ? getWeekDateIso(semanaInicio, visits[0].day) : null;
    const firstVisitAssignment =
      visits[0] && firstVisitDate ? findAssignmentForDate(visits[0].pdvId, firstVisitDate) : null;
    const cuentaClienteId =
      rutaExistente?.cuenta_cliente_id ??
      firstVisitAssignment?.cuenta_cliente_id ??
      actor.cuentaClienteId;

    if (!cuentaClienteId) {
      return buildState({
        message: 'No fue posible resolver la cuenta cliente para guardar la ruta semanal.',
      });
    }

    let rutaId = rutaExistente?.id ?? null;

    if (!rutaId) {
      const metadata = metadataColumnAvailable
        ? serializeRutaSemanalWorkflowMetadata({
            ...parseRutaSemanalWorkflowMetadata(null),
            approval: {
              state: 'PENDIENTE_COORDINACION',
              note: 'Ruta enviada por supervisor para aprobacion semanal.',
              reviewedAt: null,
              reviewedByUsuarioId: null,
            },
          })
        : undefined;

      const { data: nuevaRuta, error: createRouteError } = await supabase
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: actor.empleadoId,
          semana_inicio: semanaInicio,
          estatus: 'BORRADOR',
          notas: 'Ruta semanal enviada por supervisor para aprobacion de coordinacion.',
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
          ...(metadataColumnAvailable ? { metadata } : {}),
        })
        .select('id')
        .maybeSingle();

      if (createRouteError) {
        if (isRouteDuplicateError(createRouteError)) {
          const duplicateLookup = await supabase
            .from('ruta_semanal')
            .select('id')
            .eq('supervisor_empleado_id', actor.empleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle();

          if (duplicateLookup.data?.id) {
            rutaId = duplicateLookup.data.id;
          } else {
            return buildState({
              message:
                'Ya existe una ruta para esta semana pero no fue posible recuperarla para actualizarla.',
            });
          }
        } else {
          return buildState({
            message: createRouteError.message ?? 'No fue posible crear la ruta semanal.',
          });
        }
      } else {
        rutaId = nuevaRuta?.id ?? null;
      }
    }

    if (!rutaId) {
      return buildState({
        message: 'No fue posible resolver el identificador de la ruta semanal.',
      });
    }

    const { error: updateRouteHeaderError } = await supabase
      .from('ruta_semanal')
      .update({
        estatus: 'BORRADOR',
        notas: 'Ruta enviada o actualizada desde el canvas del supervisor.',
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
        ...(metadataColumnAvailable
          ? {
              metadata: serializeRutaSemanalWorkflowMetadata({
                ...parseRutaSemanalWorkflowMetadata((rutaExistente as any)?.metadata ?? null),
                approval: {
                  state: 'PENDIENTE_COORDINACION',
                  note: 'Ruta enviada o actualizada desde el canvas del supervisor.',
                  reviewedAt: null,
                  reviewedByUsuarioId: null,
                },
              }),
            }
          : {}),
      })
      .eq('id', rutaId);

    if (updateRouteHeaderError) {
      const updateErrorState = buildRouteSaveErrorState(
        updateRouteHeaderError,
        'No fue posible actualizar el estado de la ruta semanal.'
      );

      if (updateErrorState) {
        return updateErrorState;
      }
    }

    const { data: existingRouteVisits, error: existingRouteVisitsError } = await supabase
      .from('ruta_semanal_visita')
      .select('dia_semana, orden, pdv_id, estatus')
      .eq('ruta_semanal_id', rutaId)
      .limit(400);

    if (existingRouteVisitsError) {
      return buildState({ message: existingRouteVisitsError.message });
    }

    let deleteQuery = supabase
      .from('ruta_semanal_visita')
      .delete()
      .eq('ruta_semanal_id', rutaId)
      .in('estatus', ['PLANIFICADA', 'CANCELADA']);

    if (submittedDays.length > 0) {
      deleteQuery = deleteQuery.in('dia_semana', submittedDays);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      return buildState({ message: deleteError.message });
    }

    const plannedRouteVisits: RouteWeeklyPlanDraftVisit[] = [];

    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      const dayItems = (visits ?? []).filter((v) => v.day === day);

      for (const visit of dayItems) {
        const operationDate = getWeekDateIso(semanaInicio, day);
        const assignment = findAssignmentForDate(visit.pdvId, operationDate);

        if (!assignment && !isSupervisorOwnerOnDate(visit.pdvId, operationDate)) {
          continue;
        }

        plannedRouteVisits.push({
          day,
          pdvId: visit.pdvId,
          notes: visit.notes ?? null,
        });
      }
    }

    const { insertVisits, skippedLockedVisits } = buildWeeklyRouteVisitSyncPlan(
      (existingRouteVisits ?? []).map((visit) => ({
        diaSemana: visit.dia_semana,
        orden: visit.orden,
        pdvId: visit.pdv_id,
        estatus: visit.estatus,
      })),
      plannedRouteVisits
    );

    if (insertVisits.length > 0) {
      const { error: insertError } = await supabase.from('ruta_semanal_visita').upsert(
        insertVisits.map((v) => {
          const assignment = findAssignmentForDate(v.pdvId, getWeekDateIso(semanaInicio, v.day));

          return {
            ruta_semanal_id: rutaId,
            cuenta_cliente_id: assignment?.cuenta_cliente_id ?? cuentaClienteId,
            supervisor_empleado_id: actor.empleadoId,
            pdv_id: v.pdvId,
            asignacion_id: assignment?.id ?? null,
            dia_semana: v.day,
            orden: v.orden,
            comentarios: v.notes,
            estatus: 'PLANIFICADA',
          };
        }),
        {
          onConflict: 'ruta_semanal_id,dia_semana,pdv_id',
          ignoreDuplicates: false,
        }
      );

      if (insertError) {
        const insertErrorState = buildRouteSaveErrorState(
          insertError,
          'No fue posible programar la visita en la ruta semanal.'
        );

        if (insertErrorState) {
          return insertErrorState;
        }
      }
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_canvas_enviada_a_coordinacion',
        semana_inicio: semanaInicio,
        total_visitas: visits.length,
        total_pdvs: pdvIds.length,
        visitas_completadas_preservadas: skippedLockedVisits.length,
        approval_state: 'PENDIENTE_COORDINACION',
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId,
      routeId: rutaId,
      eventType: 'ruta_canvas_enviado_coordinacion',
      weekStart: semanaInicio,
    });

    await notificarRutaEnviada(supabase, {
      supervisorNombre: actor.nombreCompleto,
      supervisorId: actor.empleadoId,
      semana: semanaInicio,
      cuentaClienteId,
      totalTiendas: visits.length,
      totalDias: new Set(visits.map((v) => v.day)).size,
    });

    return buildState({
      ok: true,
      message: 'Ruta semanal enviada a coordinacion para aprobacion.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el canvas semanal.',
    });
  }
}

export async function guardarPlaneacionRutaMensualCanvas(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const planningMonth = String(formData.get('planning_month') ?? '').trim();
    const rawPlan = String(formData.get('month_plan_json') ?? '').trim();
    const expectedRevisionRaw = String(formData.get('expected_revision') ?? '').trim();

    if (!actor.cuentaClienteId) {
      return buildState({ message: 'Tu sesión no tiene una cuenta cliente para enviar la ruta.' });
    }
    if (!rawPlan) {
      return buildState({ message: 'Agrega al menos una visita antes de enviar la ruta mensual.' });
    }

    const visits = normalizeMonthlyRouteSubmission(rawPlan, planningMonth);
    if (visits.length === 0) {
      return buildState({ message: 'Agrega al menos una visita antes de enviar la ruta mensual.' });
    }

    const expectedRevision = expectedRevisionRaw ? Number(expectedRevisionRaw) : null;
    if (
      expectedRevision !== null &&
      (!Number.isInteger(expectedRevision) || expectedRevision < 1)
    ) {
      return buildState({ message: 'La revisión mensual enviada no es válida.' });
    }

    const service = createServiceClient() as TypedSupabaseClient;
    const { data, error } = await service.rpc('rpc_guardar_ruta_mensual', {
      p_cuenta_cliente_id: actor.cuentaClienteId,
      p_supervisor_empleado_id: actor.empleadoId,
      p_mes: `${planningMonth}-01`,
      p_usuario_id: actor.usuarioId,
      p_visitas: visits,
      p_revision_esperada: expectedRevision,
    });

    if (error) {
      const knownMessages: Array<[string, string]> = [
        [
          'RUTA_MENSUAL_CAMBIO_CONCURRENTE',
          'La ruta cambió desde que abriste el mes. Actualiza la pantalla y vuelve a revisar antes de enviar.',
        ],
        [
          'RUTA_MENSUAL_FECHA_PROTEGIDA',
          'El mes contiene un día aprobado, iniciado o con visitas ejecutadas. Ese día debe liberarse desde coordinación antes de modificarlo.',
        ],
        [
          'RUTA_MENSUAL_PDV_FUERA_ALCANCE',
          'Una tienda dejó de pertenecer a tu cartera en la fecha seleccionada. Actualiza el catálogo y revisa los días marcados.',
        ],
        [
          'RUTA_MENSUAL_FECHA_NO_EDITABLE',
          'La ruta contiene una fecha pasada o fuera del mes seleccionado.',
        ],
        ['RUTA_MENSUAL_SIN_VISITAS', 'Agrega al menos una visita antes de enviar la ruta mensual.'],
      ];
      const known = knownMessages.find(([code]) => error.message.includes(code));
      return buildState({
        message: known?.[1] ?? error.message ?? 'No fue posible enviar la ruta mensual.',
      });
    }

    const summary = normalizeMonthlyRouteSubmissionResult(data);
    if (!summary.ok || !summary.submissionId) {
      return buildState({ message: 'La base no confirmó el envío completo de la ruta mensual.' });
    }

    await publishRutaMensualUiChanges(actor, service, {
      cuentaClienteId: actor.cuentaClienteId,
      supervisorIds: [actor.empleadoId],
      eventType: 'ruta_mensual_enviada_coordinacion',
      monthStart: `${planningMonth}-01`,
    });

    const notificationResult = await Promise.allSettled([
      notificarRutaMensualEnviada(service, {
        supervisorNombre: actor.nombreCompleto,
        supervisorId: actor.empleadoId,
        month: planningMonth,
        cuentaClienteId: actor.cuentaClienteId,
        totalVisitas: summary.visits,
        totalDias: summary.plannedDays,
      }),
    ]);
    if (notificationResult[0]?.status === 'rejected') {
      console.error(
        '[Ruta] No fue posible notificar el envío mensual:',
        notificationResult[0].reason
      );
    }

    revalidatePath('/ruta-semanal');
    revalidatePath('/operacion-supervisores');
    return buildState({
      ok: true,
      message: `Ruta de ${planningMonth} enviada completa: ${summary.visits} visitas en ${summary.plannedDays} días.`,
    });
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible enviar la planificación mensual.',
    });
  }
}

export async function completarVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const visitaId = String(formData.get('visita_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const selfieR2 = readDirectR2Reference(formData, 'selfie');
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'));
    const comentarios = normalizeText(formData.get('comentarios'));
    const checklist = buildChecklist(formData);

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' });
    }

    if (!selfieFile) {
      return buildState({
        message: 'La selfie de supervision es obligatoria para cerrar la visita.',
      });
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select(
        'id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, dia_semana, estatus, selfie_url, evidencia_url'
      )
      .eq('id', visitaId)
      .maybeSingle();

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' });
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' });
    }

    // ── Validación estricta: solo se puede completar la visita del día actual ──
    const { data: rutaPadre, error: rutaPadreError } = await supabase
      .from('ruta_semanal')
      .select('semana_inicio')
      .eq('id', visita.ruta_semanal_id)
      .maybeSingle();

    if (rutaPadreError || !rutaPadre) {
      return buildState({
        message:
          rutaPadreError?.message ?? 'No fue posible resolver la ruta semanal de esta visita.',
      });
    }

    const fechaOperacionVisita = getWeekDateIso(rutaPadre.semana_inicio, visita.dia_semana);
    const hoyMexico = getIsoDateInMexicoCity();

    if (fechaOperacionVisita !== hoyMexico) {
      const diaLabel = getWeekDayLabel(visita.dia_semana);
      return buildState({
        message: `Esta visita corresponde al ${diaLabel} ${fechaOperacionVisita}. Solo puedes completar visitas del dia de hoy (${hoyMexico}). Si necesitas cerrar una visita de otro dia, solicita autorizacion a tu coordinador.`,
      });
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    });

    const evidenciaUpload = evidenciaFile
      ? await uploadRutaEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          actorAuthUserId: actor.authUserId,
          cuentaClienteId: visita.cuenta_cliente_id,
          supervisorEmpleadoId: actor.empleadoId,
          file: evidenciaFile,
          evidenceKind: 'evidencia',
        })
      : null;

    const completadaEn = new Date().toISOString();
    const { error: updateVisitError } = await supabase
      .from('ruta_semanal_visita')
      .update({
        estatus: 'COMPLETADA',
        selfie_url: selfieUpload.archivo.url,
        evidencia_url: evidenciaUpload?.archivo.url ?? null,
        checklist_calidad: checklist,
        comentarios,
        completada_en: completadaEn,
        updated_at: completadaEn,
      })
      .eq('id', visitaId);

    if (updateVisitError) {
      return buildState({ message: updateVisitError.message });
    }

    const { data: visitasRuta } = await supabase
      .from('ruta_semanal_visita')
      .select('id, estatus')
      .eq('ruta_semanal_id', visita.ruta_semanal_id)
      .limit(200);

    const todasCompletadas = (visitasRuta ?? []).every((item) => item.estatus === 'COMPLETADA');

    await supabase
      .from('ruta_semanal')
      .update({
        estatus: todasCompletadas ? 'CERRADA' : 'EN_PROGRESO',
        updated_by_usuario_id: actor.usuarioId,
        updated_at: completadaEn,
      })
      .eq('id', visita.ruta_semanal_id);

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visitaId,
      cuentaClienteId: visita.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_completada',
        ruta_semanal_id: visita.ruta_semanal_id,
        checklist,
        selfie_url: true,
        evidencia_url: Boolean(evidenciaUpload),
        selfie_hash: selfieUpload.archivo.hash,
        selfie_deduplicated: selfieUpload.deduplicated,
        evidencia_hash: evidenciaUpload?.archivo.hash ?? null,
        evidencia_deduplicated: evidenciaUpload?.deduplicated ?? false,
        selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
        evidencia_thumbnail_url: evidenciaUpload?.miniatura?.url ?? null,
        selfie_optimization: {
          kind: selfieUpload.optimization.optimizationKind,
          originalBytes: selfieUpload.optimization.originalBytes,
          finalBytes: selfieUpload.optimization.optimizedBytes,
          targetMet: selfieUpload.optimization.targetMet,
          notes: selfieUpload.optimization.notes,
          officialAssetKind: selfieUpload.optimization.officialAssetKind,
        },
        evidencia_optimization: evidenciaUpload
          ? {
              kind: evidenciaUpload.optimization.optimizationKind,
              originalBytes: evidenciaUpload.optimization.originalBytes,
              finalBytes: evidenciaUpload.optimization.optimizedBytes,
              targetMet: evidenciaUpload.optimization.targetMet,
              notes: evidenciaUpload.optimization.notes,
              officialAssetKind: evidenciaUpload.optimization.officialAssetKind,
            }
          : null,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: visita.cuenta_cliente_id,
      pdvId: visita.pdv_id,
      routeId: visita.ruta_semanal_id,
      visitId: visitaId,
      eventType: 'ruta_visita_completada',
    });

    return buildState({
      ok: true,
      message: 'Visita marcada como completada.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible completar la visita.',
    });
  }
}

export async function guardarCuotasVisitasSupervisor(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirGestorCuotasRuta();
    const service = createServiceClient() as TypedSupabaseClient;
    const supervisorEmpleadoId = String(formData.get('supervisor_empleado_id') ?? '').trim();
    const cuentaClienteId = String(formData.get('cuenta_cliente_id') ?? '').trim();
    const quotaEffectiveMonth = normalizeQuotaMonthStart(
      String(formData.get('quota_effective_month') ?? '').trim()
    );
    const quotaEntries = Array.from(formData.entries())
      .filter(([key]) => key.startsWith('pdv_quota_'))
      .map(([key, value]) => {
        const pdvId = key.slice('pdv_quota_'.length).trim();
        const parsed = Number(String(value ?? '').trim());

        if (!pdvId) {
          throw new Error('Se encontró una cuota de PDV sin identificador.');
        }

        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
          throw new Error('Cada cuota debe ser un entero entre 0 y 999 visitas mensuales.');
        }

        return [pdvId, parsed] as const;
      });

    if (!supervisorEmpleadoId || !cuentaClienteId) {
      return buildState({ message: 'La cuenta y el supervisor son obligatorios.' });
    }

    if (actor.cuentaClienteId && actor.cuentaClienteId !== cuentaClienteId) {
      return buildState({ message: 'No puedes modificar cuotas de otra cuenta cliente.' });
    }

    if (quotaEntries.length === 0) {
      return buildState({ message: 'Selecciona al menos una tienda para guardar cuotas.' });
    }

    const requestedQuotas = Object.fromEntries(quotaEntries);
    const { data, error } = await service.rpc('guardar_ruta_cuotas_supervisor', {
      p_cuenta_cliente_id: cuentaClienteId,
      p_supervisor_empleado_id: supervisorEmpleadoId,
      p_vigente_desde: quotaEffectiveMonth,
      p_cuotas: requestedQuotas,
      p_usuario_id: actor.usuarioId,
    });

    if (error) {
      return buildState({ message: error.message });
    }

    const savedQuotas =
      data && typeof data === 'object' && !Array.isArray(data)
        ? Object.fromEntries(
            Object.entries(data as Record<string, unknown>).map(([pdvId, value]) => [
              pdvId,
              Number(value),
            ])
          )
        : requestedQuotas;

    await registrarEventoAudit(service, {
      tabla: 'ruta_cuota_supervisor_pdv',
      registroId: supervisorEmpleadoId,
      cuentaClienteId,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_cuotas_recurrentes_actualizadas',
        supervisor_empleado_id: supervisorEmpleadoId,
        vigente_desde: quotaEffectiveMonth,
        pdv_monthly_quotas: savedQuotas,
      },
    });

    await publishRutaSemanalUiChanges(actor, service, {
      cuentaClienteId,
      supervisorEmpleadoId,
      eventType: 'ruta_cuotas_recurrentes_actualizadas',
      weekStart: quotaEffectiveMonth,
    });

    revalidatePath('/operacion-supervisores');
    revalidatePath('/ruta-semanal');

    const effectiveMonthLabel = new Intl.DateTimeFormat('es-MX', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Mexico_City',
    }).format(new Date(`${quotaEffectiveMonth}T12:00:00-06:00`));

    return buildState({
      ok: true,
      message: `Cuotas guardadas desde ${effectiveMonthLabel}. Seguirán vigentes hasta que registres un nuevo cambio.`,
      savedPdvMonthlyQuotas: savedQuotas,
      savedQuotaEffectiveMonth: quotaEffectiveMonth,
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar las cuotas.',
    });
  }
}

export async function actualizarControlRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const rutaId = String(formData.get('ruta_id') ?? '').trim();
    const supervisorEmpleadoId = String(formData.get('supervisor_empleado_id') ?? '').trim();
    const semanaInicio = String(formData.get('semana_inicio') ?? '').trim();
    const minimumVisitsPerPdvRaw = String(formData.get('minimum_visits_per_pdv') ?? '').trim();
    const quotaEntries = Array.from(formData.entries())
      .filter(([key]) => key.startsWith('pdv_quota_'))
      .map(([key, value]) => {
        const pdvId = key.slice('pdv_quota_'.length).trim();
        const rawValue = String(value ?? '').trim();

        if (!pdvId) {
          throw new Error('Se encontro una cuota de PDV sin identificador.');
        }

        if (rawValue === '') {
          return [pdvId, 0] as const;
        }

        const parsed = Number(rawValue);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('Cada cuota por PDV debe ser un entero igual o mayor a cero.');
        }

        return [pdvId, parsed] as const;
      });
    const approvalState = String(formData.get('approval_state') ?? '').trim();
    const approvalNote = normalizeText(formData.get('approval_note'));

    if (!rutaId && (!supervisorEmpleadoId || !semanaInicio)) {
      return buildState({
        message: 'Se necesita una ruta o el supervisor con la semana para guardar quotas.',
      });
    }

    const requestedMinimumVisitsPerPdv =
      minimumVisitsPerPdvRaw === ''
        ? null
        : normalizeInt(minimumVisitsPerPdvRaw, 'Visitas minimas por PDV');

    const rutaQueryWithMetadata = service
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata');

    const rutaResult = rutaId
      ? await rutaQueryWithMetadata.eq('id', rutaId).maybeSingle()
      : await rutaQueryWithMetadata
          .eq('supervisor_empleado_id', supervisorEmpleadoId)
          .eq('semana_inicio', semanaInicio)
          .maybeSingle();

    const metadataColumnAvailable = !isRutaMetadataMissingError(rutaResult.error?.message);

    const fallbackResult = metadataColumnAvailable
      ? null
      : rutaId
        ? await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
            .eq('id', rutaId)
            .maybeSingle()
        : await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
            .eq('supervisor_empleado_id', supervisorEmpleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle();

    const fallbackRutaData = (fallbackResult?.data as RutaSemanalLookupFallbackRow | null) ?? null;

    let ruta: RutaSemanalLookupRow | null = metadataColumnAvailable
      ? ((rutaResult.data as RutaSemanalLookupRow | null) ?? null)
      : fallbackRutaData
        ? {
            ...fallbackRutaData,
            metadata: {},
          }
        : null;
    let error = metadataColumnAvailable ? rutaResult.error : (fallbackResult?.error ?? null);

    if (!ruta && supervisorEmpleadoId && semanaInicio) {
      const alternateLookup = metadataColumnAvailable
        ? await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
            .eq('supervisor_empleado_id', supervisorEmpleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle()
        : await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
            .eq('supervisor_empleado_id', supervisorEmpleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle();

      if (alternateLookup.data) {
        ruta = metadataColumnAvailable
          ? ((alternateLookup.data as RutaSemanalLookupRow | null) ?? null)
          : {
              ...(alternateLookup.data as RutaSemanalLookupFallbackRow),
              metadata: {},
            };
        error = null;
      }
    }

    const resolvedRutaId = ruta?.id ?? rutaId;

    const targetSupervisorEmpleadoId = ruta?.supervisor_empleado_id ?? supervisorEmpleadoId;
    const targetWeekStart = ruta?.semana_inicio ?? semanaInicio;
    const targetWeekEnd = getWeekEndIso(targetWeekStart);

    const [assignmentsResult, supervisorPdvResult] = await Promise.all([
      supabase
        .from('asignacion')
        .select('pdv_id, fecha_inicio, fecha_fin, estado_publicacion, supervisor_empleado_id')
        .eq('supervisor_empleado_id', targetSupervisorEmpleadoId)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('supervisor_pdv')
        .select('pdv_id, activo, fecha_inicio, fecha_fin')
        .eq('empleado_id', targetSupervisorEmpleadoId)
        .eq('activo', true)
        .order('fecha_inicio', { ascending: false })
        .limit(400),
    ]);

    if (assignmentsResult.error || supervisorPdvResult.error) {
      return buildState({
        message:
          assignmentsResult.error?.message ??
          supervisorPdvResult.error?.message ??
          'No fue posible calcular la base de PDVs del supervisor.',
      });
    }

    const pdvIds = new Set<string>();

    const assignmentRows = (assignmentsResult.data ?? []) as AsignacionQuotaBaseRow[];

    for (const assignment of assignmentRows) {
      if (
        assignment.estado_publicacion === 'PUBLICADA' &&
        isAssignmentActiveForWeek(assignment, targetWeekStart, targetWeekEnd)
      ) {
        pdvIds.add(assignment.pdv_id);
      }
    }

    for (const relation of supervisorPdvResult.data ?? []) {
      const startsBeforeWeek = relation.fecha_inicio <= targetWeekEnd;
      const endsAfterWeek = !relation.fecha_fin || relation.fecha_fin >= targetWeekStart;

      if (relation.activo && startsBeforeWeek && endsAfterWeek) {
        pdvIds.add(relation.pdv_id);
      }
    }

    // El formulario ya representa el subconjunto filtrado visible por Coordinacion.
    // Si el universo estructural cambia o se reduce por lectura parcial, preservamos
    // las cuotas enviadas por el usuario para no perder el guardado.
    for (const [pdvId] of quotaEntries) {
      pdvIds.add(pdvId);
    }

    const hasSpecificPdvQuotas = quotaEntries.length > 0;
    const quotaUpdateRequested = hasSpecificPdvQuotas || minimumVisitsPerPdvRaw !== '';
    const pdvQuotaMap = new Map(quotaEntries);
    const pdvMonthlyQuotas = Object.fromEntries(
      Array.from(pdvIds).map((pdvId) => [
        pdvId,
        hasSpecificPdvQuotas ? (pdvQuotaMap.get(pdvId) ?? 0) : (requestedMinimumVisitsPerPdv ?? 0),
      ])
    );
    const expectedMonthlyVisits = hasSpecificPdvQuotas
      ? Object.values(pdvMonthlyQuotas).reduce((acc, value) => acc + value, 0)
      : requestedMinimumVisitsPerPdv === null
        ? null
        : requestedMinimumVisitsPerPdv * pdvIds.size;
    const minimumVisitsPerPdv = hasSpecificPdvQuotas ? null : requestedMinimumVisitsPerPdv;
    const cuentaClienteId =
      ruta?.cuenta_cliente_id ??
      assignmentRows.find((item) => item.cuenta_cliente_id)?.cuenta_cliente_id ??
      actor.cuentaClienteId;

    if (error || !ruta) {
      if (!cuentaClienteId) {
        return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' });
      }

      if (!metadataColumnAvailable) {
        return buildState({
          message:
            'La base local aun no tiene el workflow de ruta semanal. Aplica la migracion 20260322103000_ruta_semanal_workflow_metadata.sql para guardar la cuota general.',
        });
      }

      const { data: rutaCreada, error: createError } = await service
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: supervisorEmpleadoId,
          semana_inicio: semanaInicio,
          estatus: 'BORRADOR',
          notas: 'Ruta creada por Coordinacion para control de quotas.',
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
          metadata: serializeRutaSemanalWorkflowMetadata(
            parseRutaSemanalWorkflowMetadata({
              expectedMonthlyVisits,
              minimumVisitsPerPdv,
              pdvMonthlyQuotas,
            })
          ),
        })
        .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
        .maybeSingle();

      const routeCreateResult =
        createError?.message?.toLowerCase().includes('row-level security') ||
        createError?.message?.toLowerCase().includes('permission')
          ? await service
              .from('ruta_semanal')
              .insert({
                cuenta_cliente_id: cuentaClienteId,
                supervisor_empleado_id: supervisorEmpleadoId,
                semana_inicio: semanaInicio,
                estatus: 'BORRADOR',
                notas: 'Ruta creada por Coordinacion para control de quotas.',
                created_by_usuario_id: actor.usuarioId,
                updated_by_usuario_id: actor.usuarioId,
                metadata: serializeRutaSemanalWorkflowMetadata(
                  parseRutaSemanalWorkflowMetadata({
                    expectedMonthlyVisits,
                    minimumVisitsPerPdv,
                    pdvMonthlyQuotas,
                  })
                ),
              })
              .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
              .maybeSingle()
          : null;

      const finalCreateError = routeCreateResult?.error ?? createError;
      const finalRutaCreada = routeCreateResult?.data ?? rutaCreada;

      if (finalCreateError || !finalRutaCreada) {
        return buildState({
          message:
            finalCreateError?.message ?? 'No fue posible crear la ruta base para guardar quotas.',
        });
      }

      await registrarEventoAudit(service, {
        tabla: 'ruta_semanal',
        registroId: finalRutaCreada.id,
        cuentaClienteId: finalRutaCreada.cuenta_cliente_id,
        usuarioId: actor.usuarioId,
        payload: {
          evento: 'ruta_quota_creada_por_coordinacion',
          supervisor_empleado_id: supervisorEmpleadoId,
          semana_inicio: semanaInicio,
          minimum_visits_per_pdv: minimumVisitsPerPdv,
          expected_monthly_visits: expectedMonthlyVisits,
          pdv_monthly_quotas: pdvMonthlyQuotas,
        },
      });

      await publishRutaSemanalUiChanges(actor, service, {
        cuentaClienteId: finalRutaCreada.cuenta_cliente_id,
        supervisorEmpleadoId,
        routeId: finalRutaCreada.id,
        eventType: 'ruta_quota_creada',
        weekStart: semanaInicio,
      });

      return buildState({
        ok: true,
        message: 'Cuota general del supervisor guardada. Se creo una ruta base para el supervisor.',
        savedRouteId: finalRutaCreada.id,
        savedPdvMonthlyQuotas: pdvMonthlyQuotas,
      });
    }

    if (!metadataColumnAvailable) {
      return buildState({
        message:
          'La cuota general aun no puede guardarse porque falta la columna de workflow en ruta semanal. Aplica la migracion 20260322103000_ruta_semanal_workflow_metadata.sql.',
      });
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata);
    if (quotaUpdateRequested) {
      metadata.minimumVisitsPerPdv = minimumVisitsPerPdv;
      metadata.expectedMonthlyVisits = expectedMonthlyVisits;
      metadata.pdvMonthlyQuotas = pdvMonthlyQuotas;
    }

    if (approvalState) {
      metadata.approval = {
        state:
          approvalState === 'APROBADA' || approvalState === 'CAMBIOS_SOLICITADOS'
            ? approvalState
            : 'PENDIENTE_COORDINACION',
        note: approvalNote,
        reviewedAt: new Date().toISOString(),
        reviewedByUsuarioId: actor.usuarioId,
      };
    } else if (approvalNote !== null) {
      metadata.approval = {
        ...metadata.approval,
        note: approvalNote,
        reviewedAt: new Date().toISOString(),
        reviewedByUsuarioId: actor.usuarioId,
      };
    }

    const { error: updateError } = await service
      .from('ruta_semanal')
      .update({
        estatus:
          metadata.approval.state === 'APROBADA'
            ? 'PUBLICADA'
            : metadata.approval.state === 'CAMBIOS_SOLICITADOS'
              ? 'BORRADOR'
              : 'BORRADOR',
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedRutaId);

    const finalUpdateError =
      updateError?.message?.toLowerCase().includes('row-level security') ||
      updateError?.message?.toLowerCase().includes('permission')
        ? (
            await service
              .from('ruta_semanal')
              .update({
                estatus:
                  metadata.approval.state === 'APROBADA'
                    ? 'PUBLICADA'
                    : metadata.approval.state === 'CAMBIOS_SOLICITADOS'
                      ? 'BORRADOR'
                      : 'BORRADOR',
                metadata: serializeRutaSemanalWorkflowMetadata(metadata),
                updated_by_usuario_id: actor.usuarioId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', resolvedRutaId)
          ).error
        : updateError;

    if (finalUpdateError) {
      return buildState({ message: finalUpdateError.message });
    }

    await registrarEventoAudit(service, {
      tabla: 'ruta_semanal',
      registroId: resolvedRutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_control_actualizado',
        minimum_visits_per_pdv: minimumVisitsPerPdv,
        expected_monthly_visits: expectedMonthlyVisits,
        pdv_monthly_quotas: metadata.pdvMonthlyQuotas,
        approval_state: metadata.approval.state,
        approval_note: metadata.approval.note,
      },
    });

    await publishRutaSemanalUiChanges(actor, service, {
      cuentaClienteId: ruta.cuenta_cliente_id,
      supervisorEmpleadoId: ruta.supervisor_empleado_id,
      routeId: resolvedRutaId,
      eventType: 'ruta_control_actualizado',
      weekStart: ruta.semana_inicio,
    });

    // Notificacion asincrona al supervisor
    if (approvalState === 'APROBADA') {
      await notificarRutaAprobada(service, {
        supervisorId: targetSupervisorEmpleadoId,
        coordinadorNombre: actor.nombreCompleto,
        semana: targetWeekStart,
      });
    } else if (approvalState === 'CAMBIOS_SOLICITADOS') {
      await notificarRutaRechazada(service, {
        supervisorId: targetSupervisorEmpleadoId,
        coordinadorNombre: actor.nombreCompleto,
        semana: targetWeekStart,
        nota: approvalNote ?? 'Tu ruta requiere cambios para ser aprobada.',
      });
    }

    // Sincronizar estado con el envio mensual si pertenece a uno
    try {
      const { data: enlaceMensual } = await service
        .from('ruta_mensual_envio_semana')
        .select('ruta_mensual_envio_id')
        .eq('ruta_semanal_id', resolvedRutaId)
        .maybeSingle();

      const rawMeta =
        ruta && typeof ruta.metadata === 'object' && ruta.metadata !== null
          ? (ruta.metadata as Record<string, unknown>)
          : {};
      const monthlySubObj =
        rawMeta.monthlySubmission && typeof rawMeta.monthlySubmission === 'object'
          ? (rawMeta.monthlySubmission as Record<string, unknown>)
          : null;
      const rawMonthlyId = enlaceMensual?.ruta_mensual_envio_id ?? monthlySubObj?.id;
      const monthlySubmissionId =
        typeof rawMonthlyId === 'string' && rawMonthlyId.trim() ? rawMonthlyId.trim() : null;

      if (monthlySubmissionId) {
        if (metadata.approval.state === 'CAMBIOS_SOLICITADOS') {
          await service
            .from('ruta_mensual_envio')
            .update({
              estado: 'CAMBIOS_SOLICITADOS',
              revisado_en: new Date().toISOString(),
              revisado_por_usuario_id: actor.usuarioId,
            })
            .eq('id', monthlySubmissionId);
        } else if (metadata.approval.state === 'APROBADA') {
          const { data: semanasEnvio } = await service
            .from('ruta_mensual_envio_semana')
            .select('ruta_semanal_id, ruta_semanal(id, estatus, metadata)')
            .eq('ruta_mensual_envio_id', monthlySubmissionId);

          const todasAprobadas = (semanasEnvio ?? []).every((item) => {
            const linked = Array.isArray(item.ruta_semanal)
              ? item.ruta_semanal[0]
              : item.ruta_semanal;
            if (!linked) return false;
            if (linked.id === resolvedRutaId) return true;
            const linkedMeta = parseRutaSemanalWorkflowMetadata(linked.metadata);
            return linkedMeta.approval.state === 'APROBADA';
          });

          if (todasAprobadas && (semanasEnvio?.length ?? 0) > 0) {
            await service
              .from('ruta_mensual_envio')
              .update({
                estado: 'APROBADA',
                revisado_en: new Date().toISOString(),
                revisado_por_usuario_id: actor.usuarioId,
              })
              .eq('id', monthlySubmissionId);
          }
        }
      }
    } catch (syncError) {
      console.warn('[Ruta] Error sincronizando estado mensual:', syncError);
    }

    return buildState({
      ok: true,
      message: 'Control de ruta actualizado.',
      savedRouteId: resolvedRutaId,
      savedPdvMonthlyQuotas: metadata.pdvMonthlyQuotas,
    });
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible actualizar el control de ruta.',
    });
  }
}

export async function solicitarCambioRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const rutaId = String(formData.get('ruta_id') ?? '').trim();
    const requestType = normalizeChangeRequestType(
      String(formData.get('change_request_type') ?? 'CAMBIO_DIA')
        .trim()
        .toUpperCase()
    );
    const targetVisitId = String(formData.get('target_visit_id') ?? '').trim();
    const targetDayNumberRaw = String(formData.get('target_day_number') ?? '').trim();
    const proposedRouteRaw = String(formData.get('change_request_route_json') ?? '[]').trim();
    const note = normalizeText(formData.get('change_request_note'));

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' });
    }

    const targetDayNumber = Number(targetDayNumberRaw);

    if (!Number.isInteger(targetDayNumber) || targetDayNumber < 1 || targetDayNumber > 7) {
      return buildState({ message: 'Selecciona el dia exacto que quieres modificar.' });
    }

    if (requestType === 'CAMBIO_TIENDA' && !targetVisitId) {
      return buildState({
        message: 'Selecciona la tienda exacta dentro de la ruta que quieres cambiar.',
      });
    }

    if (!note) {
      return buildState({ message: 'Explica por que solicitas el cambio de ruta.' });
    }

    const proposedRoute = parseRouteChangeProposalPayload(proposedRouteRaw);

    const { data: ruta, error } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, metadata')
      .eq('id', rutaId)
      .maybeSingle();

    if (error || !ruta) {
      return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' });
    }

    if (ruta.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La ruta no pertenece al supervisor autenticado.' });
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata);

    if (metadata.approval.state !== 'APROBADA') {
      return buildState({
        message: 'Solo puedes solicitar cambios sobre rutas ya aprobadas.',
      });
    }

    if (ruta.estatus !== 'PUBLICADA' && ruta.estatus !== 'EN_PROGRESO') {
      return buildState({
        message: 'La ruta ya no admite modificaciones desde correcciones.',
      });
    }

    const targetOperationDate = getWeekDateIso(ruta.semana_inicio, targetDayNumber);
    const todayIso = getIsoDateInMexicoCity();

    if (targetOperationDate < todayIso) {
      return buildState({
        message: 'Solo puedes modificar dias actuales o futuros dentro de la ruta.',
      });
    }

    const { data: dayVisits, error: dayVisitsError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, pdv_id, dia_semana, estatus')
      .eq('ruta_semanal_id', rutaId)
      .eq('dia_semana', targetDayNumber)
      .order('orden', { ascending: true })
      .limit(120);

    if (dayVisitsError) {
      return buildState({ message: dayVisitsError.message });
    }

    if (!dayVisits || dayVisits.length === 0) {
      return buildState({
        message: 'Ese dia aun no tiene tiendas cargadas dentro de la ruta.',
      });
    }

    let resolvedTargetVisitId: string | null = null;
    let resolvedTargetPdvId: string | null = null;
    const resolvedTargetDayNumber = targetDayNumber;
    const resolvedTargetDayLabel = getWeekDayLabel(targetDayNumber);

    if (requestType === 'CAMBIO_TIENDA') {
      const targetVisit = dayVisits.find((visit) => visit.id === targetVisitId);

      if (!targetVisit) {
        return buildState({
          message: 'La tienda seleccionada no pertenece al dia que quieres cambiar.',
        });
      }

      resolvedTargetVisitId = targetVisit.id;
      resolvedTargetPdvId = targetVisit.pdv_id;
    }

    const effectiveRequestType = proposedRoute.length === 0 ? 'CANCELACION_DIA' : requestType;
    const targetScope = effectiveRequestType === 'CAMBIO_TIENDA' ? 'VISITA' : 'DIA';

    if (effectiveRequestType === 'CANCELACION_DIA' && proposedRoute.length > 0) {
      return buildState({
        message: 'La cancelacion del dia debe enviarse sin tiendas en la nueva ruta.',
      });
    }

    if (effectiveRequestType !== 'CANCELACION_DIA') {
      const proposedPdvIds = proposedRoute.map((item) => item.pdvId);
      const semanaInicio =
        ('semana_inicio' in ruta && typeof ruta.semana_inicio === 'string'
          ? ruta.semana_inicio
          : null) ?? null;

      if (semanaInicio) {
        const semanaFin = getWeekEndIso(semanaInicio);
        const { activeAssignments, supervisorOwnedPdvs } =
          await resolveSupervisorWeekAssignmentsAndPdvs(supabase, {
            supervisorEmpleadoId: actor.empleadoId,
            semanaInicio,
            semanaFin,
            pdvIds: proposedPdvIds,
          });

        const missingPdv = proposedPdvIds.find(
          (pdvId) => !activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId)
        );

        if (missingPdv) {
          return buildState({
            message:
              'Una de las tiendas de la nueva ruta ya no pertenece al supervisor para esa semana.',
          });
        }
      }
    }

    metadata.changeRequest = {
      status: 'PENDIENTE',
      note,
      resolutionNote: null,
      requestType: effectiveRequestType,
      targetScope: targetScope === 'DIA' ? 'DIA' : 'VISITA',
      targetVisitId: resolvedTargetVisitId,
      targetPdvId: resolvedTargetPdvId,
      targetDayNumber: resolvedTargetDayNumber,
      targetDayLabel: resolvedTargetDayLabel,
      proposedVisits: proposedRoute,
      requestedAt: new Date().toISOString(),
      requestedByUsuarioId: actor.usuarioId,
      resolvedAt: null,
      resolvedByUsuarioId: null,
      previousApprovalState: metadata.approval.state,
      previousRouteStatus:
        'estatus' in ruta && typeof ruta.estatus === 'string' ? ruta.estatus : null,
    };
    metadata.approval = {
      ...metadata.approval,
      state: 'CAMBIOS_SOLICITADOS',
      note,
      reviewedAt: metadata.approval.reviewedAt,
      reviewedByUsuarioId: metadata.approval.reviewedByUsuarioId,
    };

    const { error: updateError } = await supabase
      .from('ruta_semanal')
      .update({
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rutaId);

    if (updateError) {
      return buildState({ message: updateError.message });
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_cambio_solicitado',
        request_type: effectiveRequestType,
        nota: note,
        target_scope: metadata.changeRequest.targetScope,
        target_visit_id: resolvedTargetVisitId,
        target_pdv_id: resolvedTargetPdvId,
        target_day_number: resolvedTargetDayNumber,
        target_day_label: resolvedTargetDayLabel,
        proposed_visits: proposedRoute,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: ruta.cuenta_cliente_id,
      routeId: rutaId,
      eventType: 'ruta_cambio_solicitado',
      weekStart: ruta.semana_inicio,
    });

    // Notificacion asincrona a coordinadores
    await notificarCambioRutaSolicitado(supabase, {
      rutaId,
      supervisorNombre: actor.nombreCompleto,
      dia: resolvedTargetDayLabel,
      nota: note,
      cuentaClienteId: ruta.cuenta_cliente_id,
    });

    return buildState({
      ok: true,
      message: 'Solicitud de cambio de ruta enviada a Coordinacion.',
    });
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible solicitar el cambio de ruta.',
    });
  }
}

export async function resolverSolicitudCambioRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const rutaId = String(formData.get('ruta_id') ?? '').trim();
    const decision = String(formData.get('decision') ?? '')
      .trim()
      .toUpperCase();
    const resolutionNote = normalizeText(formData.get('resolution_note'));

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' });
    }

    if (decision !== 'APROBAR' && decision !== 'RECHAZAR') {
      return buildState({ message: 'Selecciona una decision valida para el cambio de ruta.' });
    }

    const { data: ruta, error } = await service
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, metadata')
      .eq('id', rutaId)
      .maybeSingle();

    if (error || !ruta) {
      return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' });
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata);

    if (metadata.changeRequest.status !== 'PENDIENTE') {
      return buildState({ message: 'La ruta no tiene una solicitud de cambio pendiente.' });
    }

    const now = new Date().toISOString();
    const restoredApprovalState = metadata.changeRequest.previousApprovalState ?? 'APROBADA';
    let nextApprovalState: RutaApprovalState = restoredApprovalState;
    let nextRouteStatus =
      metadata.changeRequest.previousRouteStatus ??
      resolveRouteStatusFromApprovalState(restoredApprovalState);

    if (decision === 'APROBAR') {
      const targetDayNumber = metadata.changeRequest.targetDayNumber;

      if (!targetDayNumber) {
        return buildState({ message: 'La solicitud no tiene un dia objetivo valido.' });
      }

      await applyRouteChangeToDay({
        supabase: service,
        rutaId,
        cuentaClienteId: ruta.cuenta_cliente_id,
        supervisorEmpleadoId: ruta.supervisor_empleado_id,
        semanaInicio: ruta.semana_inicio,
        semanaFin: getWeekEndIso(ruta.semana_inicio),
        targetDayNumber,
        proposedVisits: metadata.changeRequest.proposedVisits,
      });

      nextApprovalState = 'APROBADA';
      nextRouteStatus = ruta.estatus === 'EN_PROGRESO' ? 'EN_PROGRESO' : 'PUBLICADA';
    }

    metadata.changeRequest = {
      ...metadata.changeRequest,
      status: decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
      resolutionNote,
      resolvedAt: now,
      resolvedByUsuarioId: actor.usuarioId,
    };
    metadata.approval = {
      state: nextApprovalState,
      note: resolutionNote ?? metadata.changeRequest.note,
      reviewedAt: now,
      reviewedByUsuarioId: actor.usuarioId,
    };

    const { error: updateError } = await service
      .from('ruta_semanal')
      .update({
        estatus: nextRouteStatus,
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: now,
      })
      .eq('id', rutaId);

    if (updateError) {
      return buildState({ message: updateError.message });
    }

    await registrarEventoAudit(service, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_cambio_resuelto',
        decision,
        request_type: metadata.changeRequest.requestType,
        target_scope: metadata.changeRequest.targetScope,
        target_visit_id: metadata.changeRequest.targetVisitId,
        target_pdv_id: metadata.changeRequest.targetPdvId,
        target_day_number: metadata.changeRequest.targetDayNumber,
        target_day_label: metadata.changeRequest.targetDayLabel,
        proposed_visits: metadata.changeRequest.proposedVisits,
        resolution_note: resolutionNote,
      },
    });

    await publishRutaSemanalUiChanges(actor, service, {
      cuentaClienteId: ruta.cuenta_cliente_id,
      supervisorEmpleadoId: ruta.supervisor_empleado_id,
      routeId: rutaId,
      eventType: 'ruta_cambio_resuelto',
      weekStart: ruta.semana_inicio,
    });

    // Notificacion asincrona al supervisor
    await notificarCambioRutaResuelto(service, {
      supervisorId: ruta.supervisor_empleado_id,
      coordinadorNombre: actor.nombreCompleto,
      dia: metadata.changeRequest.targetDayLabel || 'Sin dia especificado',
      aprobado: decision === 'APROBAR',
      nota: resolutionNote ?? undefined,
    });

    return buildState({
      ok: true,
      message:
        decision === 'APROBAR'
          ? 'Cambio de ruta aprobado. La ruta real del supervisor ya fue actualizada.'
          : 'Cambio de ruta rechazado. La ruta previa se mantiene vigente.',
    });
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible resolver el cambio de ruta.',
    });
  }
}

export async function registrarEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const rutaId = String(formData.get('ruta_id') ?? '').trim();
    const fechaOperacion = String(formData.get('fecha_operacion') ?? '').trim();
    const tipoEvento = normalizeAgendaEventType(
      String(formData.get('tipo_evento') ?? '')
        .trim()
        .toUpperCase()
    );
    const modoImpacto = normalizeAgendaImpactMode(
      String(formData.get('modo_impacto') ?? '')
        .trim()
        .toUpperCase()
    );
    const titulo = String(formData.get('titulo') ?? '').trim();
    const descripcion = normalizeText(formData.get('descripcion'));
    const sede = normalizeText(formData.get('sede'));
    const horaInicio = normalizeText(formData.get('hora_inicio'));
    const horaFin = normalizeText(formData.get('hora_fin'));
    const pdvId = normalizeText(formData.get('pdv_id'));
    const displacedVisitIds = normalizeJsonStringArray(
      formData.get('displaced_visit_ids_json'),
      'Las visitas desplazadas'
    );
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    let distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    let gpsState = normalizeGpsState(formData.get('estado_gps'));

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' });
    }

    if (!fechaOperacion) {
      return buildState({ message: 'La fecha operativa es obligatoria.' });
    }

    if (!titulo) {
      return buildState({ message: 'El titulo del evento es obligatorio.' });
    }

    if (tipoEvento === 'VISITA_ADICIONAL' && !pdvId) {
      return buildState({ message: 'La visita adicional debe indicar un PDV.' });
    }

    if (modoImpacto === 'SOBREPONE_PARCIAL' && displacedVisitIds.length === 0) {
      return buildState({
        message:
          'Cuando el evento sobrepone parcialmente la ruta debes indicar las visitas desplazadas.',
      });
    }

    // Si tenemos coordenadas y PDV, evaluar geocerca con exactitud
    if (latitud !== null && longitud !== null && pdvId) {
      const { data: geoPdv } = await supabase
        .from('geocerca_pdv')
        .select('latitud, longitud, radio_tolerancia_metros')
        .eq('pdv_id', pdvId)
        .maybeSingle();

      if (geoPdv && geoPdv.latitud !== null && geoPdv.longitud !== null) {
        distanciaMetros = calcularDistanciaMetros(
          latitud,
          longitud,
          Number(geoPdv.latitud),
          Number(geoPdv.longitud)
        );
        const radio = Number(geoPdv.radio_tolerancia_metros ?? 150);
        gpsState = distanciaMetros <= radio ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA';
      }
    }

    const nowIso = new Date().toISOString();
    const hasLocation = latitud !== null && longitud !== null;
    const initialCheckIn = {
      at: hasLocation ? nowIso : null,
      latitud,
      longitud,
      distanciaMetros,
      gpsState: gpsState ?? (hasLocation ? 'SIN_GPS' : null),
      selfieUrl: null,
      selfieHash: null,
      evidenciaUrl: null,
      evidenciaHash: null,
      comments: descripcion,
    };

    const { data: ruta, error: routeError } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
      .eq('id', rutaId)
      .maybeSingle();

    if (routeError || !ruta) {
      return buildState({
        message: routeError?.message ?? 'No fue posible encontrar la ruta semanal.',
      });
    }

    if (ruta.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La ruta no pertenece al supervisor autenticado.' });
    }

    const approvalState = 'NO_REQUIERE';
    let linkedVisitId: string | null = null;

    if (tipoEvento === 'VISITA_ADICIONAL') {
      if (!pdvId) {
        return buildState({
          message: 'La visita adicional / cambio de tienda debe indicar un PDV.',
        });
      }

      const diaSemana = resolveDayNumberWithinRouteWeek(ruta.semana_inicio, fechaOperacion);

      if (diaSemana === null) {
        return buildState({
          message: 'La fecha del evento debe caer dentro de la semana de la ruta aprobada.',
        });
      }

      const semanaFin = getWeekEndIso(ruta.semana_inicio);
      const { activeAssignments, supervisorOwnedPdvs } =
        await resolveSupervisorWeekAssignmentsAndPdvs(supabase, {
          supervisorEmpleadoId: actor.empleadoId,
          semanaInicio: ruta.semana_inicio,
          semanaFin,
          pdvIds: [pdvId],
        });

      if (!activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId)) {
        return buildState({
          message:
            'Ese PDV no esta disponible para la supervisora dentro de esta semana operativa.',
        });
      }

      const { data: existingVisits, error: existingVisitsError } = await supabase
        .from('ruta_semanal_visita')
        .select('id, pdv_id, orden')
        .eq('ruta_semanal_id', ruta.id)
        .eq('dia_semana', diaSemana)
        .order('orden', { ascending: true })
        .limit(120);

      if (existingVisitsError) {
        return buildState({
          message:
            existingVisitsError.message || 'No fue posible validar las visitas actuales del dia.',
        });
      }

      if ((existingVisits ?? []).some((visit) => visit.pdv_id === pdvId)) {
        return buildState({
          message: 'Ese PDV ya existe como visita en Mi ruta de hoy para la fecha seleccionada.',
        });
      }

      const nextOrder =
        (existingVisits ?? []).reduce(
          (maxOrder, visit) => Math.max(maxOrder, visit.orden ?? 0),
          0
        ) + 1;
      const assignment = activeAssignments.get(pdvId) ?? null;

      const { data: insertedVisit, error: insertVisitError } = await supabase
        .from('ruta_semanal_visita')
        .insert({
          ruta_semanal_id: ruta.id,
          cuenta_cliente_id: assignment?.cuenta_cliente_id ?? ruta.cuenta_cliente_id,
          supervisor_empleado_id: actor.empleadoId,
          pdv_id: pdvId,
          asignacion_id: assignment?.id ?? null,
          dia_semana: diaSemana,
          orden: nextOrder,
          estatus: 'PLANIFICADA',
          comentarios: descripcion,
          metadata: {
            source: 'ruta_agenda_evento',
            source_type: tipoEvento,
            operation_date: fechaOperacion,
            source_title: titulo,
            checkIn: initialCheckIn,
          },
        })
        .select('id')
        .maybeSingle();

      if (insertVisitError || !insertedVisit) {
        return buildState({
          message:
            insertVisitError?.message ??
            'No fue posible agregar la visita adicional a Mi ruta de hoy.',
        });
      }

      linkedVisitId = insertedVisit.id;

      await registrarEventoAudit(supabase, {
        tabla: 'ruta_semanal_visita',
        registroId: insertedVisit.id,
        cuentaClienteId: assignment?.cuenta_cliente_id ?? ruta.cuenta_cliente_id,
        usuarioId: actor.usuarioId,
        payload: {
          evento: 'ruta_visita_adicional_creada_desde_agenda',
          ruta_semanal_id: ruta.id,
          agenda_tipo_evento: tipoEvento,
          pdv_id: pdvId,
          fecha_operacion: fechaOperacion,
          dia_semana: diaSemana,
          orden: nextOrder,
          modo_impacto: modoImpacto,
        },
      });
    }

    const metadata = serializeRutaAgendaEventMetadata({
      displacedVisitIds,
      approvalNote: null,
      checkIn: initialCheckIn,
      checkOut: {
        at: null,
        latitud: null,
        longitud: null,
        distanciaMetros: null,
        gpsState: null,
        selfieUrl: null,
        selfieHash: null,
        evidenciaUrl: null,
        evidenciaHash: null,
        comments: null,
      },
    });

    const { data: inserted, error: insertError } = await supabase
      .from('ruta_agenda_evento')
      .insert({
        cuenta_cliente_id: ruta.cuenta_cliente_id,
        ruta_semanal_id: ruta.id,
        ruta_semanal_visita_id: linkedVisitId,
        supervisor_empleado_id: actor.empleadoId,
        pdv_id: pdvId,
        fecha_operacion: fechaOperacion,
        tipo_evento: tipoEvento,
        modo_impacto: modoImpacto,
        estatus_aprobacion: approvalState,
        estatus_ejecucion: 'PENDIENTE',
        titulo,
        descripcion,
        sede,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        check_in_en: initialCheckIn.at,
        metadata,
        created_by_usuario_id: actor.usuarioId,
      })
      .select('id')
      .maybeSingle();

    if (insertError || !inserted) {
      if (linkedVisitId) {
        await supabase.from('ruta_semanal_visita').delete().eq('id', linkedVisitId);
      }

      if (isRutaAgendaInfrastructureMissingError(insertError?.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({
        message: insertError?.message ?? 'No fue posible registrar el evento operativo.',
      });
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_agenda_evento',
      registroId: inserted.id,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_agenda_evento_creado',
        tipo_evento: tipoEvento,
        modo_impacto: modoImpacto,
        estatus_aprobacion: approvalState,
        fecha_operacion: fechaOperacion,
        displaced_visit_ids: displacedVisitIds,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: ruta.cuenta_cliente_id,
      supervisorEmpleadoId: ruta.supervisor_empleado_id,
      pdvId,
      routeId: rutaId,
      eventType: 'ruta_agenda_evento_creado',
      weekStart: ruta.semana_inicio,
    });

    await notificarAgendaEventoCreado(supabase, {
      eventoId: inserted.id,
      supervisorNombre: actor.nombreCompleto,
      tipo: tipoEvento,
      fecha: fechaOperacion,
      cuentaClienteId: ruta.cuenta_cliente_id,
    });

    return buildState({
      ok: true,
      message:
        tipoEvento === 'VISITA_ADICIONAL'
          ? 'La visita adicional / cambio de tienda ya se agrego a Mi ruta de hoy.'
          : 'Evento registrado en la agenda operativa. Coordinacion fue notificada.',
    });
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState();
    }

    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible registrar el evento operativo.',
    });
  }
}

export async function resolverEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim();
    const decision = String(formData.get('decision') ?? '')
      .trim()
      .toUpperCase();
    const resolutionNote = normalizeText(formData.get('resolution_note'));

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' });
    }

    const { data: agendaEvento, error: eventError } = await service
      .from('ruta_agenda_evento')
      .select(
        'id, cuenta_cliente_id, ruta_semanal_id, supervisor_empleado_id, pdv_id, fecha_operacion, modo_impacto, estatus_aprobacion, metadata, titulo'
      )
      .eq('id', agendaEventoId)
      .maybeSingle();

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({
        message: eventError?.message ?? 'No fue posible encontrar el evento operativo.',
      });
    }

    if (agendaEvento.estatus_aprobacion !== 'PENDIENTE_COORDINACION') {
      return buildState({ message: 'Este evento ya fue resuelto anteriormente.' });
    }

    const approved = decision === 'APROBAR';
    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata);
    metadata.approvalNote = resolutionNote;

    const { error: updateError } = await service
      .from('ruta_agenda_evento')
      .update({
        estatus_aprobacion: approved ? 'APROBADO' : 'RECHAZADO',
        resolved_by_usuario_id: actor.usuarioId,
        resolved_at: new Date().toISOString(),
        metadata: serializeRutaAgendaEventMetadata(metadata),
      })
      .eq('id', agendaEventoId);

    if (updateError) {
      if (isRutaAgendaInfrastructureMissingError(updateError.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({ message: updateError.message });
    }

    if (approved) {
      await syncAgendaEventRepositions({
        supabase,
        actorUsuarioId: actor.usuarioId,
        routeId: agendaEvento.ruta_semanal_id,
        supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
        cuentaClienteId: agendaEvento.cuenta_cliente_id,
        agendaEventoId,
        fechaOperacion: agendaEvento.fecha_operacion,
        displacedVisitIds: metadata.displacedVisitIds,
      });
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_agenda_evento',
      registroId: agendaEventoId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_agenda_evento_resuelto',
        decision: approved ? 'APROBADO' : 'RECHAZADO',
        modo_impacto: agendaEvento.modo_impacto,
        displaced_visit_ids: metadata.displacedVisitIds,
        resolution_note: resolutionNote,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
      pdvId: agendaEvento.pdv_id,
      routeId: agendaEvento.ruta_semanal_id,
      eventType: 'ruta_agenda_evento_resuelto',
      weekStart: agendaEvento.fecha_operacion,
    });

    // Notificacion asincrona al supervisor
    await notificarAgendaEventoResuelto(service, {
      supervisorId: agendaEvento.supervisor_empleado_id,
      coordinadorNombre: actor.nombreCompleto,
      titulo: agendaEvento.titulo,
      fecha: agendaEvento.fecha_operacion,
      aprobado: approved,
      nota: resolutionNote ?? undefined,
    });

    return buildState({
      ok: true,
      message: approved
        ? 'Evento aprobado y pendientes de reposicion generados.'
        : 'Evento rechazado.',
    });
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState();
    }

    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible resolver el evento operativo.',
    });
  }
}

export async function registrarInicioVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const visitaId = String(formData.get('visita_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const selfieR2 = readDirectR2Reference(formData, 'selfie');
    const comments = normalizeText(formData.get('comments'));
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    const gpsState = normalizeGpsState(formData.get('estado_gps'));
    const gpsCaptureStatus = normalizeGpsCaptureStatus(gpsState);

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' });
    }

    if (!selfieFile && !hasDirectR2Reference(selfieR2)) {
      return buildState({ message: 'La selfie de llegada es obligatoria.' });
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select(
        'id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, metadata, dia_semana, ruta_semanal:ruta_semanal_id(semana_inicio)'
      )
      .eq('id', visitaId)
      .maybeSingle();

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' });
    }

    // Validar que la visita sea para el dia de hoy (GMT-6)
    const todayIso = getIsoDateInMexicoCity();
    const semanaInicio = (visita.ruta_semanal as any)?.semana_inicio;
    if (!semanaInicio) {
      return buildState({ message: 'No fue posible determinar la semana de inicio de la ruta.' });
    }
    const fechaOperacion = getWeekDateIso(semanaInicio, visita.dia_semana);

    if (fechaOperacion !== todayIso) {
      return buildState({
        message: `Solo puedes registrar visitas para el dia de hoy (${todayIso}). La visita seleccionada es del ${fechaOperacion}. Si necesitas cerrar una visita pasada, contacta a coordinacion para autorizacion.`,
      });
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' });
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
      directReference: selfieR2,
      directThumbnailReference: readDirectR2Reference(formData, 'selfie_thumbnail'),
    });

    const metadata = parseRutaVisitaWorkflowMetadata(visita.metadata);
    const checkInPayload = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      gpsCaptureStatus,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      selfieThumbnailUrl: selfieUpload.miniatura?.url ?? null,
      selfieThumbnailHash: selfieUpload.miniatura?.hash ?? null,
      evidenciaUrl: null,
      evidenciaHash: null,
      evidenciaThumbnailUrl: null,
      evidenciaThumbnailHash: null,
      comments,
    };
    metadata.checkIn = checkInPayload;

    const rpcPayload = {
      id: visitaId,
      entidad_tipo: 'VISITA',
      accion: 'CHECKIN',
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: visita.cuenta_cliente_id,
      selfie_url: selfieUpload.archivo.url,
      selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
      metadata_delta: {
        checkIn: checkInPayload,
      },
    };

    const { data: rpcResult, error: rpcError } = await service.rpc(
      'rpc_registrar_accion_ruta_supervisor',
      {
        p_datos: rpcPayload,
      }
    );

    if (rpcError || !rpcResult?.ok) {
      throw new Error(
        rpcError?.message ?? 'No fue posible registrar el inicio de visita mediante RPC.'
      );
    }

    // Sincronizar con evento de agenda si esta visita proviene de un evento
    await service
      .from('ruta_agenda_evento')
      .update({
        check_in_en: checkInPayload.at,
        selfie_url: selfieUpload.archivo.url,
      })
      .eq('ruta_semanal_visita_id', visitaId);

    await publishRutaSemanalUiChanges(actor, service, {
      cuentaClienteId: visita.cuenta_cliente_id,
      pdvId: visita.pdv_id,
      routeId: visita.ruta_semanal_id,
      visitId: visitaId,
      eventType: 'ruta_visita_checkin',
    });

    return buildState({
      ok: true,
      message: 'Llegada registrada en la ruta.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la llegada.',
    });
  }
}

export async function registrarSalidaVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const visitaId = String(formData.get('visita_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'));
    const selfieR2 = readDirectR2Reference(formData, 'selfie');
    const evidenciaR2 = readDirectR2Reference(formData, 'evidencia');
    const comments = normalizeText(formData.get('comments'));
    const checklist = buildChecklist(formData);
    const checklistComments = buildChecklistComments(formData);
    const loveIsdinRecordsCount = normalizeOptionalNonNegativeInt(
      formData.get('love_isdin_records_count')
    );
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    const gpsState = normalizeGpsState(formData.get('estado_gps'));
    const gpsCaptureStatus = normalizeGpsCaptureStatus(gpsState);

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' });
    }

    if (!selfieFile && !hasDirectR2Reference(selfieR2)) {
      return buildState({ message: 'La selfie de salida es obligatoria.' });
    }

    if (!comments) {
      return buildState({
        message: 'Debes registrar comentarios finales sobre la visita antes de cerrarla.',
      });
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select(
        'id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, metadata, dia_semana, ruta_semanal:ruta_semanal_id(semana_inicio)'
      )
      .eq('id', visitaId)
      .maybeSingle();

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' });
    }

    // Validar que la visita sea para el dia de hoy (GMT-6)
    const todayIso = getIsoDateInMexicoCity();
    const semanaInicio = (visita.ruta_semanal as any)?.semana_inicio;
    if (!semanaInicio) {
      return buildState({ message: 'No fue posible determinar la semana de inicio de la ruta.' });
    }
    const fechaOperacion = getWeekDateIso(semanaInicio, visita.dia_semana);

    if (fechaOperacion !== todayIso) {
      return buildState({
        message: `Solo puedes registrar visitas para el dia de hoy (${todayIso}). La visita seleccionada es del ${fechaOperacion}. Si necesitas cerrar una visita pasada, contacta a coordinacion para autorizacion.`,
      });
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' });
    }

    const existingMetadata = parseRutaVisitaWorkflowMetadata(visita.metadata);
    if (!existingMetadata.checkIn.at) {
      return buildState({ message: 'Primero debes registrar tu llegada a la tienda.' });
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
      directReference: selfieR2,
      directThumbnailReference: readDirectR2Reference(formData, 'selfie_thumbnail'),
    });

    const evidenciaUpload =
      evidenciaFile || hasDirectR2Reference(evidenciaR2)
        ? await uploadRutaEvidence(service, {
            actorUsuarioId: actor.usuarioId,
            actorAuthUserId: actor.authUserId,
            cuentaClienteId: visita.cuenta_cliente_id,
            supervisorEmpleadoId: actor.empleadoId,
            file: evidenciaFile,
            evidenceKind: 'evidencia',
            directReference: evidenciaR2,
            directThumbnailReference: readDirectR2Reference(formData, 'evidencia_thumbnail'),
          })
        : null;

    const metadata = parseRutaVisitaWorkflowMetadata(visita.metadata);
    metadata.checklistComments = checklistComments;
    metadata.loveIsdinRecordsCount = loveIsdinRecordsCount;
    const checkOutPayload = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      gpsCaptureStatus,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      selfieThumbnailUrl: selfieUpload.miniatura?.url ?? null,
      selfieThumbnailHash: selfieUpload.miniatura?.hash ?? null,
      evidenciaUrl: evidenciaUpload?.archivo.url ?? null,
      evidenciaHash: evidenciaUpload?.archivo.hash ?? null,
      evidenciaThumbnailUrl: evidenciaUpload?.miniatura?.url ?? null,
      evidenciaThumbnailHash: evidenciaUpload?.miniatura?.hash ?? null,
      comments,
    };
    metadata.checkOut = checkOutPayload;

    const rpcPayload = {
      id: visitaId,
      entidad_tipo: 'VISITA',
      accion: 'CHECKOUT',
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: visita.cuenta_cliente_id,
      selfie_url: selfieUpload.archivo.url,
      selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
      evidencia_url: evidenciaUpload?.archivo.url ?? null,
      evidencia_thumbnail_url: evidenciaUpload?.miniatura?.url ?? null,
      checklist: checklist,
      comments: comments,
      metadata_delta: {
        checklistComments,
        loveIsdinRecordsCount,
        checkOut: checkOutPayload,
      },
    };

    const { data: rpcResult, error: rpcError } = await service.rpc(
      'rpc_registrar_accion_ruta_supervisor',
      {
        p_datos: rpcPayload,
      }
    );

    if (rpcError || !rpcResult?.ok) {
      throw new Error(rpcError?.message ?? 'No fue posible cerrar la visita mediante RPC.');
    }

    // Sincronizar con evento de agenda si esta visita proviene de un evento
    await service
      .from('ruta_agenda_evento')
      .update({
        estatus_ejecucion: 'COMPLETADO',
        check_out_en: checkOutPayload.at,
        evidencia_url: evidenciaUpload?.archivo.url ?? null,
      })
      .eq('ruta_semanal_visita_id', visitaId);

    await publishRutaSemanalUiChanges(actor, service, {
      cuentaClienteId: visita.cuenta_cliente_id,
      pdvId: visita.pdv_id,
      routeId: visita.ruta_semanal_id,
      visitId: visitaId,
      eventType: 'ruta_visita_checkout',
    });

    return buildState({
      ok: true,
      message: 'Visita cerrada y checklist completado.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible cerrar la visita.',
    });
  }
}

export async function registrarInicioEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const selfieR2 = readDirectR2Reference(formData, 'selfie');
    const comments = normalizeText(formData.get('comments'));
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    const gpsState = normalizeGpsState(formData.get('estado_gps'));

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' });
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de llegada es obligatoria.' });
    }

    const { data: agendaEvento, error: eventError } = await supabase
      .from('ruta_agenda_evento')
      .select(
        'id, cuenta_cliente_id, ruta_semanal_id, supervisor_empleado_id, pdv_id, fecha_operacion, metadata'
      )
      .eq('id', agendaEventoId)
      .maybeSingle();

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({
        message: eventError?.message ?? 'No fue posible encontrar el evento operativo.',
      });
    }

    if (agendaEvento.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'El evento no pertenece al supervisor autenticado.' });
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    });

    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata);
    const checkInPayload = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      selfieThumbnailUrl: selfieUpload.miniatura?.url ?? null,
      selfieThumbnailHash: selfieUpload.miniatura?.hash ?? null,
      evidenciaUrl: null,
      evidenciaHash: null,
      evidenciaThumbnailUrl: null,
      evidenciaThumbnailHash: null,
      comments,
    };
    metadata.checkIn = checkInPayload;

    const rpcPayload = {
      id: agendaEventoId,
      entidad_tipo: 'EVENTO',
      accion: 'CHECKIN',
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: agendaEvento.cuenta_cliente_id,
      selfie_url: selfieUpload.archivo.url,
      selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
      metadata_delta: {
        checkIn: checkInPayload,
      },
    };

    const { data: rpcResult, error: rpcError } = await service.rpc(
      'rpc_registrar_accion_ruta_supervisor',
      {
        p_datos: rpcPayload,
      }
    );

    if (rpcError || !rpcResult?.ok) {
      if (isRutaAgendaInfrastructureMissingError(rpcError?.message)) {
        return buildAgendaInfrastructureState();
      }
      throw new Error(
        rpcError?.message ?? 'No fue posible iniciar el evento operativo mediante RPC.'
      );
    }

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
      pdvId: agendaEvento.pdv_id,
      routeId: agendaEvento.ruta_semanal_id,
      eventType: 'ruta_agenda_evento_checkin',
      weekStart: agendaEvento.fecha_operacion,
    });

    return buildState({
      ok: true,
      message: 'Evento operativo iniciado.',
    });
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState();
    }

    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible iniciar el evento operativo.',
    });
  }
}

export async function registrarEvidenciaEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const selfieR2 = readDirectR2Reference(formData, 'selfie');
    const comments = normalizeText(formData.get('comments'));
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    const gpsState = normalizeGpsState(formData.get('estado_gps'));

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' });
    }

    if (!selfieFile && !hasDirectR2Reference(selfieR2)) {
      return buildState({ message: 'La selfie del evento es obligatoria.' });
    }

    if (!comments) {
      return buildState({ message: 'El motivo o comentario del evento es obligatorio.' });
    }

    const { data: agendaEvento, error: eventError } = await supabase
      .from('ruta_agenda_evento')
      .select(
        'id, cuenta_cliente_id, ruta_semanal_id, ruta_semanal_visita_id, supervisor_empleado_id, pdv_id, fecha_operacion, metadata'
      )
      .eq('id', agendaEventoId)
      .maybeSingle();

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({
        message: eventError?.message ?? 'No fue posible encontrar el evento operativo.',
      });
    }

    // Validar que el evento sea para el dia de hoy (GMT-6)
    const todayIso = getIsoDateInMexicoCity();
    if (agendaEvento.fecha_operacion !== todayIso) {
      return buildState({
        message: `Solo puedes registrar eventos operativos para el dia de hoy (${todayIso}). El evento seleccionado es del ${agendaEvento.fecha_operacion}.`,
      });
    }

    if (agendaEvento.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'El evento no pertenece al supervisor autenticado.' });
    }

    let finalDistanciaMetros = distanciaMetros;
    let finalGpsState = gpsState;
    if (latitud !== null && longitud !== null && agendaEvento.pdv_id) {
      const { data: geoPdv } = await supabase
        .from('geocerca_pdv')
        .select('latitud, longitud, radio_tolerancia_metros')
        .eq('pdv_id', agendaEvento.pdv_id)
        .maybeSingle();

      if (geoPdv && geoPdv.latitud !== null && geoPdv.longitud !== null) {
        finalDistanciaMetros = calcularDistanciaMetros(
          latitud,
          longitud,
          Number(geoPdv.latitud),
          Number(geoPdv.longitud)
        );
        const radio = Number(geoPdv.radio_tolerancia_metros ?? 150);
        finalGpsState = finalDistanciaMetros <= radio ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA';
      }
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
      directReference: selfieR2,
      directThumbnailReference: readDirectR2Reference(formData, 'selfie_thumbnail'),
    });

    const capturedAt = new Date().toISOString();
    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata);
    const evidencePayload = {
      at: capturedAt,
      latitud,
      longitud,
      distanciaMetros: finalDistanciaMetros,
      gpsState: finalGpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      selfieThumbnailUrl: selfieUpload.miniatura?.url ?? null,
      selfieThumbnailHash: selfieUpload.miniatura?.hash ?? null,
      evidenciaUrl: null,
      evidenciaHash: null,
      evidenciaThumbnailUrl: null,
      evidenciaThumbnailHash: null,
      comments,
    };

    metadata.checkIn = evidencePayload;
    metadata.checkOut = evidencePayload;

    const { error: updateError } = await service
      .from('ruta_agenda_evento')
      .update({
        estatus_ejecucion: 'COMPLETADO',
        check_in_en: capturedAt,
        check_out_en: capturedAt,
        selfie_url: selfieUpload.archivo.url,
        metadata: serializeRutaAgendaEventMetadata(metadata),
      })
      .eq('id', agendaEventoId);

    if (updateError) {
      if (isRutaAgendaInfrastructureMissingError(updateError.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({ message: updateError.message });
    }

    if (agendaEvento.ruta_semanal_visita_id) {
      await service
        .from('ruta_semanal_visita')
        .update({
          estatus: 'COMPLETADA',
          completada_en: capturedAt,
          selfie_url: selfieUpload.archivo.url,
          comentarios: comments,
          metadata: {
            checkIn: evidencePayload,
            checkOut: evidencePayload,
          },
        })
        .eq('id', agendaEvento.ruta_semanal_visita_id);
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_agenda_evento',
      registroId: agendaEventoId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_agenda_evento_evidencia_unica',
        fecha_operacion: agendaEvento.fecha_operacion,
        estado_gps: finalGpsState,
      },
    });

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
      pdvId: agendaEvento.pdv_id,
      routeId: agendaEvento.ruta_semanal_id,
      eventType: 'ruta_agenda_evento_evidencia_unica',
      weekStart: agendaEvento.fecha_operacion,
    });

    return buildState({
      ok: true,
      message: 'Evidencia del evento registrada.',
    });
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState();
    }

    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la evidencia del evento.',
    });
  }
}

export async function registrarSalidaEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable();
    const supabase = await createClient();
    const service = createServiceClient() as TypedSupabaseClient;
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim();
    const selfieFile = asUploadedFile(formData.get('selfie_file'));
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'));
    const comments = normalizeText(formData.get('comments'));
    const latitud = normalizeFloat(formData.get('latitud'));
    const longitud = normalizeFloat(formData.get('longitud'));
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'));
    const gpsState = normalizeGpsState(formData.get('estado_gps'));

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' });
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de salida es obligatoria.' });
    }

    const { data: agendaEvento, error: eventError } = await supabase
      .from('ruta_agenda_evento')
      .select(
        'id, cuenta_cliente_id, ruta_semanal_id, ruta_semanal_visita_id, supervisor_empleado_id, pdv_id, fecha_operacion, metadata'
      )
      .eq('id', agendaEventoId)
      .maybeSingle();

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState();
      }

      return buildState({
        message: eventError?.message ?? 'No fue posible encontrar el evento operativo.',
      });
    }

    if (agendaEvento.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'El evento no pertenece al supervisor autenticado.' });
    }

    let finalDistanciaMetros = distanciaMetros;
    let finalGpsState = gpsState;
    if (latitud !== null && longitud !== null && agendaEvento.pdv_id) {
      const { data: geoPdv } = await supabase
        .from('geocerca_pdv')
        .select('latitud, longitud, radio_tolerancia_metros')
        .eq('pdv_id', agendaEvento.pdv_id)
        .maybeSingle();

      if (geoPdv && geoPdv.latitud !== null && geoPdv.longitud !== null) {
        finalDistanciaMetros = calcularDistanciaMetros(
          latitud,
          longitud,
          Number(geoPdv.latitud),
          Number(geoPdv.longitud)
        );
        const radio = Number(geoPdv.radio_tolerancia_metros ?? 150);
        finalGpsState = finalDistanciaMetros <= radio ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA';
      }
    }

    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata);
    if (!metadata.checkIn.at) {
      return buildState({ message: 'Primero debes registrar la llegada del evento.' });
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      actorAuthUserId: actor.authUserId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    });

    const evidenciaUpload = evidenciaFile
      ? await uploadRutaEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          actorAuthUserId: actor.authUserId,
          cuentaClienteId: agendaEvento.cuenta_cliente_id,
          supervisorEmpleadoId: actor.empleadoId,
          file: evidenciaFile,
          evidenceKind: 'evidencia',
        })
      : null;
    const checkOutPayload = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros: finalDistanciaMetros,
      gpsState: finalGpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      selfieThumbnailUrl: selfieUpload.miniatura?.url ?? null,
      selfieThumbnailHash: selfieUpload.miniatura?.hash ?? null,
      evidenciaUrl: evidenciaUpload?.archivo.url ?? null,
      evidenciaHash: evidenciaUpload?.archivo.hash ?? null,
      evidenciaThumbnailUrl: evidenciaUpload?.miniatura?.url ?? null,
      evidenciaThumbnailHash: evidenciaUpload?.miniatura?.hash ?? null,
      comments,
    };
    metadata.checkOut = checkOutPayload;

    const rpcPayload = {
      id: agendaEventoId,
      entidad_tipo: 'EVENTO',
      accion: 'CHECKOUT',
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: agendaEvento.cuenta_cliente_id,
      selfie_url: selfieUpload.archivo.url,
      selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
      evidencia_url: evidenciaUpload?.archivo.url ?? null,
      evidencia_thumbnail_url: evidenciaUpload?.miniatura?.url ?? null,
      metadata_delta: {
        checkOut: checkOutPayload,
      },
    };

    const { data: rpcResult, error: rpcError } = await service.rpc(
      'rpc_registrar_accion_ruta_supervisor',
      {
        p_datos: rpcPayload,
      }
    );

    if (rpcError || !rpcResult?.ok) {
      if (isRutaAgendaInfrastructureMissingError(rpcError?.message)) {
        return buildAgendaInfrastructureState();
      }
      throw new Error(
        rpcError?.message ?? 'No fue posible cerrar el evento operativo mediante RPC.'
      );
    }

    if (agendaEvento.ruta_semanal_visita_id) {
      await service
        .from('ruta_semanal_visita')
        .update({
          estatus: 'COMPLETADA',
          completada_en: checkOutPayload.at,
          selfie_url: selfieUpload.archivo.url,
          evidencia_url: evidenciaUpload?.archivo.url ?? null,
          comentarios: comments,
          metadata: {
            checkIn: metadata.checkIn,
            checkOut: checkOutPayload,
          },
        })
        .eq('id', agendaEvento.ruta_semanal_visita_id);
    }

    await publishRutaSemanalUiChanges(actor, supabase, {
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
      pdvId: agendaEvento.pdv_id,
      routeId: agendaEvento.ruta_semanal_id,
      eventType: 'ruta_agenda_evento_checkout',
      weekStart: agendaEvento.fecha_operacion,
    });

    return buildState({
      ok: true,
      message: 'Evento operativo cerrado.',
    });
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState();
    }

    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible cerrar el evento operativo.',
    });
  }
}

function buildRutaMesManagementError(
  action: RutaMesManagementAction,
  month: string,
  message: string
): RutaMesManagementSummary {
  return {
    ...normalizeRutaMesManagementSummary({
      ok: false,
      accion: action,
      mes: month,
      ejecutado: false,
    }),
    ok: false,
    message,
  };
}

async function gestionarRutasMes(
  action: RutaMesManagementAction,
  monthIso: string,
  execute: boolean,
  expectedEligibleCount?: number,
  supervisorIds?: string[] | null
): Promise<RutaMesManagementSummary> {
  const month = normalizeRutaMesManagementMonth(monthIso);

  try {
    const actor = await requerirCoordinadorRuta();
    const cuentaClienteId = actor.cuentaClienteId;

    if (!cuentaClienteId) {
      return buildRutaMesManagementError(
        action,
        month,
        'Tu sesión no tiene una cuenta cliente para gestionar rutas mensuales.'
      );
    }

    const service = createServiceClient() as TypedSupabaseClient;
    const { data, error } = await service.rpc('rpc_gestionar_rutas_mes', {
      p_cuenta_cliente_id: cuentaClienteId,
      p_mes: `${month}-01`,
      p_accion: action,
      p_usuario_id: actor.usuarioId,
      p_ejecutar: execute,
      p_elegibles_esperados: expectedEligibleCount ?? null,
      p_supervisor_empleado_ids:
        supervisorIds && supervisorIds.length > 0 ? supervisorIds : null,
    });

    if (error) {
      if (error.message.includes('RUTA_MES_CAMBIO_CONCURRENTE')) {
        return buildRutaMesManagementError(
          action,
          month,
          'Las rutas cambiaron después de la previsualización. Revisa nuevamente antes de confirmar.'
        );
      }
      throw new Error(error.message);
    }

    const summary = normalizeRutaMesManagementSummary(data);
    if (!execute || !summary.executed || summary.affectedCount === 0) {
      return summary;
    }

    const eventType = action === 'LIBERAR' ? 'ruta_mes_liberado' : 'ruta_mes_aprobado';
    await publishRutaMensualUiChanges(actor, service, {
      cuentaClienteId,
      supervisorIds: summary.supervisorIds,
      eventType,
      monthStart: `${month}-01`,
    });

    const notificationResult = await Promise.allSettled([
      notificarRutasMesGestionadas(service, {
        supervisorIds: summary.supervisorIds,
        actorNombre: actor.nombreCompleto,
        month,
        action,
        cuentaClienteId,
      }),
    ]);
    if (notificationResult[0]?.status === 'rejected') {
      console.error(
        '[Ruta] No fue posible notificar la gestión mensual:',
        notificationResult[0].reason
      );
    }

    revalidatePath('/ruta-semanal');
    revalidatePath('/operacion-supervisores');
    return summary;
  } catch (error) {
    return buildRutaMesManagementError(
      action,
      month,
      error instanceof Error ? error.message : 'No fue posible gestionar las rutas del mes.'
    );
  }
}

export async function previsualizarGestionRutasMes(
  action: RutaMesManagementAction,
  monthIso: string,
  supervisorIds?: string[] | null
) {
  return gestionarRutasMes(action, monthIso, false, undefined, supervisorIds);
}

export async function ejecutarGestionRutasMes(
  action: RutaMesManagementAction,
  monthIso: string,
  expectedEligibleCount: number,
  supervisorIds?: string[] | null
) {
  return gestionarRutasMes(action, monthIso, true, expectedEligibleCount, supervisorIds);
}

export async function aprobarRutasMesCompleto(
  monthIso: string
): Promise<{ ok: boolean; message: string; approvedCount: number }> {
  const result = await ejecutarGestionRutasMes('APROBAR', monthIso, 0);
  return {
    ok: result.ok,
    message: result.message,
    approvedCount: result.affectedCount,
  };
}

export async function aprobarRutaSupervisorMesDirecto(
  supervisorEmpleadoId: string,
  monthIso: string,
  approvalNote?: string
): Promise<{ ok: boolean; message: string }> {
  const month = normalizeRutaMesManagementMonth(monthIso);
  try {
    const actor = await requerirCoordinadorRuta();
    const cuentaClienteId = actor.cuentaClienteId;
    if (!cuentaClienteId) {
      return { ok: false, message: 'Tu sesión no tiene una cuenta cliente asignada.' };
    }
    const service = createServiceClient() as TypedSupabaseClient;

    // 1. Intentar aprobación mensual vía RPC
    const preview = await previsualizarGestionRutasMes('APROBAR', month, [supervisorEmpleadoId]);
    if (preview.ok && preview.eligibleCount > 0) {
      await ejecutarGestionRutasMes('APROBAR', month, preview.eligibleCount, [supervisorEmpleadoId]);
    }

    // 2. Garantizar que todas las rutas semanales del supervisor en ese mes se marquen como APROBADAS y PUBLICADAS
    const monthStart = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    const { data: rutasSem } = await service
      .from('ruta_semanal')
      .select('id, metadata')
      .eq('supervisor_empleado_id', supervisorEmpleadoId)
      .gte('semana_inicio', monthStart)
      .lte('semana_inicio', monthEnd);

    if (rutasSem && rutasSem.length > 0) {
      const nowIso = new Date().toISOString();
      for (const r of rutasSem) {
        const currentMeta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
        const currentApproval = (currentMeta.approval && typeof currentMeta.approval === 'object' ? currentMeta.approval : {}) as Record<string, unknown>;
        const updatedMeta = {
          ...currentMeta,
          approval: {
            ...currentApproval,
            state: 'APROBADA',
            reviewedAt: nowIso,
            reviewedByUsuarioId: actor.usuarioId,
            note: approvalNote ?? currentApproval.note ?? null,
          },
        };
        await service
          .from('ruta_semanal')
          .update({
            estatus: 'PUBLICADA',
            metadata: updatedMeta,
            updated_at: nowIso,
          })
          .eq('id', r.id);
      }
    }

    revalidatePath('/ruta-semanal');
    revalidatePath('/operacion-supervisores');

    return {
      ok: true,
      message: 'Ruta mensual del supervisor aprobada con éxito.',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'No fue posible aprobar la ruta mensual.',
    };
  }
}

export async function solicitarCambiosRutaSupervisorMesDirecto(
  supervisorEmpleadoId: string,
  monthIso: string,
  approvalNote: string
): Promise<{ ok: boolean; message: string }> {
  const month = normalizeRutaMesManagementMonth(monthIso);
  try {
    const actor = await requerirCoordinadorRuta();
    const cuentaClienteId = actor.cuentaClienteId;
    if (!cuentaClienteId) {
      return { ok: false, message: 'Tu sesión no tiene una cuenta cliente asignada.' };
    }
    const service = createServiceClient() as TypedSupabaseClient;
    const nowIso = new Date().toISOString();
    const monthStart = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    // 1. Actualizar directamente el envío mensual (ruta_mensual_envio) a CAMBIOS_SOLICITADOS
    const { data: envios } = await service
      .from('ruta_mensual_envio')
      .select('id, metadata, estado')
      .eq('supervisor_empleado_id', supervisorEmpleadoId)
      .eq('periodo', monthStart);

    if (envios && envios.length > 0) {
      for (const e of envios) {
        const currentMeta = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>;
        const updatedMeta = {
          ...currentMeta,
          nota: approvalNote,
          reviewedAt: nowIso,
          reviewedByUsuarioId: actor.usuarioId,
          lastAction: 'CAMBIOS_SOLICITADOS',
        };
        await service
          .from('ruta_mensual_envio')
          .update({
            estado: 'CAMBIOS_SOLICITADOS',
            revisado_en: nowIso,
            revisado_por_usuario_id: actor.usuarioId,
            metadata: updatedMeta,
            updated_at: nowIso,
          })
          .eq('id', e.id);
      }
    }

    // 2. Garantizar que todas las rutas semanales del supervisor en el mes se marquen con CAMBIOS_SOLICITADOS y BORRADOR
    const { data: rutasSem } = await service
      .from('ruta_semanal')
      .select('id, metadata')
      .eq('supervisor_empleado_id', supervisorEmpleadoId)
      .gte('semana_inicio', monthStart)
      .lte('semana_inicio', monthEnd);

    if (rutasSem && rutasSem.length > 0) {
      for (const r of rutasSem) {
        const currentMeta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
        const currentApproval = (currentMeta.approval && typeof currentMeta.approval === 'object' ? currentMeta.approval : {}) as Record<string, unknown>;
        const updatedMeta = {
          ...currentMeta,
          approval: {
            ...currentApproval,
            state: 'CAMBIOS_SOLICITADOS',
            reviewedAt: nowIso,
            reviewedByUsuarioId: actor.usuarioId,
            note: approvalNote,
          },
        };
        await service
          .from('ruta_semanal')
          .update({
            estatus: 'BORRADOR',
            metadata: updatedMeta,
            updated_at: nowIso,
          })
          .eq('id', r.id);
      }
    }

    // 3. Registrar en audit_log para trazabilidad
    await service.from('audit_log').insert({
      tabla: 'ruta_mensual_envio',
      registro_id: envios?.[0]?.id ?? supervisorEmpleadoId,
      accion: 'EVENTO',
      payload: {
        evento: 'ruta_mes_cambios_solicitados',
        mes: month,
        nota: approvalNote,
        supervisor_empleado_id: supervisorEmpleadoId,
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: cuentaClienteId,
    });

    // 4. Publicar cambios UI en tiempo real
    await publishRutaMensualUiChanges(actor, service, {
      cuentaClienteId,
      supervisorIds: [supervisorEmpleadoId],
      eventType: 'ruta_mes_liberado',
      monthStart,
    });

    // 5. Notificar al supervisor en su aplicación (mensaje interno y push)
    try {
      await notificarRutaMensualCambiosSolicitados(service, {
        supervisorId: supervisorEmpleadoId,
        actorNombre: actor.nombreCompleto,
        month,
        nota: approvalNote,
        cuentaClienteId,
      });
    } catch (notifErr) {
      console.error('[Ruta] Error notificando al supervisor sobre cambios:', notifErr);
    }

    revalidatePath('/ruta-semanal');
    revalidatePath('/operacion-supervisores');

    return {
      ok: true,
      message: 'Se han solicitado cambios al supervisor y se le envió la notificación con tus observaciones.',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'No fue posible solicitar cambios.',
    };
  }
}