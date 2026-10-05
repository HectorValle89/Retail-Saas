'use server';

import { revalidateTag } from 'next/cache';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
  aplicarPlaneacionSupervisorPdvs,
  aplicarPlaneacionMensual,
  previsualizarPlaneacionSupervisorPdvs,
  previsualizarPlaneacionMensual,
  type PlaneacionRpcClient,
} from '@/features/asignaciones/services/planeacionMensualService';
import {
  getPlaneacionMensualCacheTag,
  refrescarPlaneacionMensualSnapshot,
  type PlaneacionMensualReadRpcClient,
} from '@/features/asignaciones/services/planeacionMensualReadService';
import {
  enqueueAndProcessMaterializedAssignments,
  processMaterializationDirtyQueue,
} from '@/features/asignaciones/services/asignacionMaterializationService';
import type {
  PlaneacionMensualActionState,
  PlaneacionMensualOperacion,
} from '@/features/asignaciones/types/planeacionMensual';
import {
  collectPlaneacionMensualOperationPdvIds,
  validatePlaneacionMensualOperacion,
} from '@/features/asignaciones/lib/planeacionMensualOperacion';
import {
  refrescarCuotaMensualResumen,
  type PlaneacionCuotaResumenRpcClient,
} from '@/features/asignaciones/services/planeacionCuotaResumenService';
import {
  collectPlaneacionAffectedMonths,
  getOpenEndedPlaneacionMaterializationEnd,
} from '@/features/asignaciones/lib/planeacionMensualVigencia';
import {
  sincronizarInactivacionPdvCascada,
  sincronizarReasignacionSupervisorCascada,
} from '@/features/asignaciones/services/operationalLifecycleService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;
function getAffectedPdvIds(operaciones: PlaneacionMensualOperacion[]): string[] {
  return collectPlaneacionMensualOperationPdvIds(operaciones);
}

function isTargetedSupervisorBatch(operaciones: PlaneacionMensualOperacion[]) {
  return operaciones.every(
    (operation) =>
      operation.tipoOperacion === 'REASIGNAR_SUPERVISOR' && Boolean(operation.pdvOrigenId)
  );
}

async function publishPlaneacionChanges(
  service: ReturnType<typeof createServiceClient>,
  input: {
    cuentaClienteId: string;
    mes: string;
    mesesAfectados: string[];
    operaciones: PlaneacionMensualOperacion[];
  }
) {
  const pdvIds = getAffectedPdvIds(input.operaciones);
  const empleadoIds = input.operaciones
    .map((operation) => operation.empleadoId)
    .filter((value): value is string => Boolean(value));
  const supervisorIds = input.operaciones.flatMap((operation) => [
    operation.payload?.supervisorOrigenId,
    operation.payload?.supervisorDestinoId,
  ]);
  const scopes = [
    buildUiChangeScope('cuenta', input.cuentaClienteId),
    ...input.mesesAfectados.map((month) => buildUiChangeScope('periodo', month)),
    ...pdvIds.map((id) => buildUiChangeScope('pdv', id)),
    ...empleadoIds.map((id) => buildUiChangeScope('empleado', id)),
    ...supervisorIds.map((id) => buildUiChangeScope('supervisor', id)),
  ];

  await publishUiChanges(
    buildUiChangeTargetsFromBusinessEvent({
      eventType: 'planeacion_mensual_publicada',
      modules: [
        'asignaciones',
        'dashboard',
        'asistencias',
        'pdvs',
        'reportes',
        'ventas',
        'love-isdin',
        'materiales',
        'ruta-semanal',
      ],
      surfaces: ['all'],
      scopes,
      cuentaClienteId: input.cuentaClienteId,
      roleTargets: ['ALL'],
      metadata: {
        periodo: input.mes,
        periodos_afectados: input.mesesAfectados,
        operaciones: input.operaciones.map((operation) => operation.tipoOperacion),
      },
    }),
    { service }
  );
}

function emptyState(message: string): PlaneacionMensualActionState {
  return {
    ok: false,
    message,
    preview: null,
    loteId: null,
    version: null,
    materializacionPendiente: false,
  };
}

function validateCommonInput(input: {
  cuentaClienteId: string;
  mes: string;
  operaciones: PlaneacionMensualOperacion[];
}) {
  if (!UUID_PATTERN.test(input.cuentaClienteId)) {
    throw new Error('La cuenta de cliente no es válida.');
  }

  if (!MONTH_PATTERN.test(input.mes)) {
    throw new Error('El mes debe enviarse como el primer día en formato YYYY-MM-01.');
  }

  if (
    !Array.isArray(input.operaciones) ||
    input.operaciones.length < 1 ||
    input.operaciones.length > 100
  ) {
    throw new Error('El lote debe contener entre 1 y 100 operaciones.');
  }

  const issue = input.operaciones.flatMap(validatePlaneacionMensualOperacion)[0];
  if (issue) {
    throw new Error(`La operación no es válida (${issue.code}, campo ${issue.field}).`);
  }
}

export async function previsualizarPlaneacionMensualAction(input: {
  cuentaClienteId: string;
  mes: string;
  operaciones: PlaneacionMensualOperacion[];
}): Promise<PlaneacionMensualActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  try {
    validateCommonInput(input);
    if (actor.cuentaClienteId && actor.cuentaClienteId !== input.cuentaClienteId) {
      return emptyState('La cuenta solicitada queda fuera del alcance del usuario.');
    }

    const service = createServiceClient();
    const client = service as unknown as PlaneacionRpcClient;
    const preview = isTargetedSupervisorBatch(input.operaciones)
      ? await previsualizarPlaneacionSupervisorPdvs(client, input)
      : await previsualizarPlaneacionMensual(client, input);

    return {
      ok: preview.ok,
      message: preview.ok
        ? 'Vista previa lista para confirmar.'
        : 'La vista previa contiene conflictos que deben resolverse.',
      preview,
      loteId: null,
      version: preview.versionBase,
      materializacionPendiente: false,
    };
  } catch (error) {
    return emptyState(error instanceof Error ? error.message : 'No fue posible validar el lote.');
  }
}

export async function aplicarPlaneacionMensualAction(input: {
  cuentaClienteId: string;
  mes: string;
  idempotencyKey: string;
  versionBase: number;
  operaciones: PlaneacionMensualOperacion[];
}): Promise<PlaneacionMensualActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  try {
    validateCommonInput(input);
    if (actor.cuentaClienteId && actor.cuentaClienteId !== input.cuentaClienteId) {
      return emptyState('La cuenta solicitada queda fuera del alcance del usuario.');
    }
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 180) {
      return emptyState('La llave de idempotencia no es válida.');
    }
    if (!Number.isInteger(input.versionBase) || input.versionBase < 0) {
      return emptyState('La versión base no es válida.');
    }

    const service = createServiceClient();
    const client = service as unknown as PlaneacionRpcClient;
    const applyInput = { ...input, usuarioId: actor.usuarioId };
    const result = isTargetedSupervisorBatch(input.operaciones)
      ? await aplicarPlaneacionSupervisorPdvs(client, applyInput)
      : await aplicarPlaneacionMensual(client, applyInput);

    let materializacionPendiente = false;
    try {
      const openEndedWork = input.operaciones
        .filter((operation) => Boolean(operation.empleadoId))
        .map((operation) => ({
          empleadoId: operation.empleadoId as string,
          fechaInicio: operation.fechaInicio,
          fechaFin:
            operation.fechaFin ?? getOpenEndedPlaneacionMaterializationEnd(operation.fechaInicio),
          motivo: 'PLANEACION_MAESTRA_VIGENCIA',
          payload: {
            tipoOperacion: operation.tipoOperacion,
            loteId: result.loteId,
          },
        }));
      if (!result.idempotent && openEndedWork.length > 0) {
        await enqueueAndProcessMaterializedAssignments(openEndedWork, service);
      }
      const materialization = await processMaterializationDirtyQueue({ limit: 250 }, service);
      const detectedChange = !result.idempotent || materialization.processed > 0;

      if (detectedChange) {
        const affectedPdvIds = getAffectedPdvIds(input.operaciones);
        const affectedMonths = collectPlaneacionAffectedMonths(input.operaciones);

        // Cascada aguas arriba y aguas abajo para reasignación de supervisores
        const supervisorOps = input.operaciones.filter(
          (op) =>
            op.tipoOperacion === 'REASIGNAR_SUPERVISOR' &&
            Boolean(op.payload?.supervisorDestinoId) &&
            Boolean(op.pdvOrigenId)
        );
        if (supervisorOps.length > 0) {
          const bySupervisor = new Map<string, { pdvIds: string[]; fechaInicio: string }>();
          for (const op of supervisorOps) {
            const supId = op.payload!.supervisorDestinoId!;
            const existing = bySupervisor.get(supId) ?? {
              pdvIds: [],
              fechaInicio: op.fechaInicio,
            };
            existing.pdvIds.push(op.pdvOrigenId!);
            bySupervisor.set(supId, existing);
          }
          for (const [supId, group] of bySupervisor) {
            await sincronizarReasignacionSupervisorCascada(service as never, {
              pdvIds: group.pdvIds,
              nuevoSupervisorId: supId,
              fechaEfectiva: group.fechaInicio,
              cuentaClienteId: input.cuentaClienteId,
              usuarioId: actor.usuarioId,
              motivo: 'Reasignación desde planeación mensual de asignaciones',
            });
          }
        }

        // Cascada aguas arriba y aguas abajo para cambio de estado de PDV
        const estadoPdvOps = input.operaciones.filter(
          (op) =>
            op.tipoOperacion === 'CAMBIAR_ESTADO_PDV' &&
            Boolean(op.pdvOrigenId) &&
            Boolean(op.payload?.estadoPdv)
        );
        for (const op of estadoPdvOps) {
          const pdvId = op.pdvOrigenId!;
          const estadoPdv = op.payload!.estadoPdv!;
          if (estadoPdv === 'INACTIVO') {
            await service
              .from('pdv')
              .update({ estatus: 'INACTIVO', updated_at: new Date().toISOString() })
              .eq('id', pdvId);

            await sincronizarInactivacionPdvCascada(service as never, {
              pdvId,
              cuentaClienteId: input.cuentaClienteId,
              fechaInactivacion: op.fechaInicio,
              usuarioId: actor.usuarioId,
              motivo: op.motivo || 'Inactivación desde planeación mensual de asignaciones',
            });
          } else if (estadoPdv === 'ACTIVO') {
            await service
              .from('pdv')
              .update({ estatus: 'ACTIVO', updated_at: new Date().toISOString() })
              .eq('id', pdvId);
          }
        }

        for (const affectedMonth of affectedMonths) {
          await refrescarCuotaMensualResumen(
            service as unknown as PlaneacionCuotaResumenRpcClient,
            {
              cuentaClienteId: input.cuentaClienteId,
              mes: affectedMonth,
              pdvIds: affectedPdvIds,
            }
          );
          await refrescarPlaneacionMensualSnapshot(
            service as unknown as PlaneacionMensualReadRpcClient,
            input.cuentaClienteId,
            affectedMonth,
            affectedPdvIds
          );
          revalidateTag(getPlaneacionMensualCacheTag(input.cuentaClienteId, affectedMonth), 'max');
        }
        await publishPlaneacionChanges(service, {
          ...input,
          mesesAfectados: affectedMonths,
        });
      }
    } catch {
      materializacionPendiente = true;
    }

    return {
      ok: true,
      message: materializacionPendiente
        ? 'Cambios publicados; la actualización diaria quedó en cola para reintento.'
        : result.idempotent
          ? 'El lote ya había sido publicado; no se duplicaron cambios.'
          : 'Cambios publicados y asignaciones diarias actualizadas.',
      preview: result.preview ?? null,
      loteId: result.loteId,
      version: result.version,
      materializacionPendiente,
    };
  } catch (error) {
    return emptyState(
      error instanceof Error ? error.message : 'No fue posible publicar la planeación mensual.'
    );
  }
}
