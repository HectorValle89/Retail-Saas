'use server';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import {
  ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
  type SupervisorAttendanceActionState,
} from './state';

type TypedSupabaseClient = ReturnType<typeof createServiceClient>;

function buildState(
  partial: Partial<SupervisorAttendanceActionState>
): SupervisorAttendanceActionState {
  return {
    ...ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
    ...partial,
  };
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`);
  }

  return normalized;
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeAttendanceResolution(value: FormDataEntryValue | null) {
  const status = normalizeRequiredText(value, 'Resolucion');
  if (status !== 'VALIDA' && status !== 'RECHAZADA') {
    throw new Error('La resolucion de asistencia no es valida.');
  }

  return status;
}

function normalizeReviewTarget(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  if (normalized === 'CHECK_IN' || normalized === 'CHECK_OUT') {
    return normalized;
  }

  throw new Error('El objetivo de revision no es valido.');
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function registrarEventoAudit(
  service: TypedSupabaseClient,
  actorUsuarioId: string,
  cuentaClienteId: string | null,
  registroId: string,
  payload: Record<string, unknown>
) {
  await service.from('audit_log').insert({
    tabla: 'asistencia',
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  });
}

export async function resolverAsistenciaSupervisor(
  _previousState: SupervisorAttendanceActionState,
  formData: FormData
): Promise<SupervisorAttendanceActionState> {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'SUPERVISOR']);
    const service = createServiceClient() as TypedSupabaseClient;
    const asistenciaId = normalizeRequiredText(formData.get('asistencia_id'), 'Asistencia');
    const nextStatus = normalizeAttendanceResolution(formData.get('estatus'));
    const reviewTarget = normalizeReviewTarget(formData.get('review_target'));
    const comentarios = normalizeOptionalText(formData.get('comentarios'));

    const { data: asistencia, error } = await service
      .from('asistencia')
      .select(
        'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_operacion, check_in_utc, check_out_utc, estatus, metadata'
      )
      .eq('id', asistenciaId)
      .maybeSingle();

    if (error || !asistencia) {
      throw new Error(error?.message ?? 'No fue posible encontrar la asistencia solicitada.');
    }

    if (actor.puesto === 'SUPERVISOR' && asistencia.supervisor_empleado_id !== actor.empleadoId) {
      throw new Error('No puedes resolver una asistencia fuera de tu operacion diaria.');
    }

    if (reviewTarget === 'CHECK_IN' && !asistencia.check_in_utc) {
      throw new Error('La entrada todavia no tiene check-in registrado.');
    }

    if (reviewTarget === 'CHECK_OUT' && !asistencia.check_out_utc) {
      throw new Error('La salida todavia no tiene check-out registrado.');
    }

    if (reviewTarget === 'CHECK_IN' && asistencia.estatus === 'CERRADA') {
      throw new Error('La jornada ya esta cerrada y no admite cambios de supervision.');
    }

    const nextMetadata = normalizeMetadata(asistencia.metadata);
    const previousSupervision = normalizeMetadata(nextMetadata.supervision);
    nextMetadata.supervision = {
      ...previousSupervision,
      supervisor_resuelta_en: new Date().toISOString(),
      supervisor_resuelta_por_usuario_id: actor.usuarioId,
      supervisor_resuelta_por_puesto: actor.puesto,
      supervisor_resolucion: nextStatus,
      supervisor_comentarios: comentarios,
      ...(reviewTarget === 'CHECK_IN'
        ? {
            entry_status: nextStatus,
            entry_resolved_at: new Date().toISOString(),
            entry_resolved_by_usuario_id: actor.usuarioId,
            entry_resolved_by_puesto: actor.puesto,
            entry_comments: comentarios,
          }
        : {
            checkout_status: nextStatus,
            checkout_resolved_at: new Date().toISOString(),
            checkout_resolved_by_usuario_id: actor.usuarioId,
            checkout_resolved_by_puesto: actor.puesto,
            checkout_comments: comentarios,
          }),
    };

    const persistedStatus =
      reviewTarget === 'CHECK_OUT'
        ? nextStatus === 'VALIDA'
          ? 'CERRADA'
          : 'RECHAZADA'
        : nextStatus;

    const { error: updateError } = await service
      .from('asistencia')
      .update({
        estatus: persistedStatus,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asistenciaId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const auditPayload = {
      evento:
        reviewTarget === 'CHECK_OUT'
          ? nextStatus === 'VALIDA'
            ? 'supervisor_aprobo_salida'
            : 'supervisor_rechazo_salida'
          : nextStatus === 'VALIDA'
            ? 'supervisor_aprobo_entrada'
            : 'supervisor_rechazo_entrada',
      review_target: reviewTarget,
      asistencia_id: asistencia.id,
      empleado_id: asistencia.empleado_id,
      pdv_id: asistencia.pdv_id,
      fecha_operacion: asistencia.fecha_operacion,
      comentarios,
    };

    const uiTargets = buildUiChangeTargetsFromBusinessEvent({
      eventType:
        nextStatus === 'VALIDA'
          ? reviewTarget === 'CHECK_OUT'
            ? 'asistencia_supervisor_salida_validada'
            : 'asistencia_supervisor_validada'
          : reviewTarget === 'CHECK_OUT'
            ? 'asistencia_supervisor_salida_rechazada'
            : 'asistencia_supervisor_rechazada',
      modules: ['dashboard'],
      surfaces: ['panel', 'insights'],
      scopes: [
        buildUiChangeScope('cuenta', asistencia.cuenta_cliente_id),
        buildUiChangeScope('empleado', asistencia.empleado_id),
        buildUiChangeScope('supervisor', asistencia.supervisor_empleado_id),
      ],
      cuentaClienteId: asistencia.cuenta_cliente_id,
      empleadoId: asistencia.empleado_id,
      supervisorEmpleadoId: asistencia.supervisor_empleado_id,
      metadata: {
        asistenciaId: asistencia.id,
        pdvId: asistencia.pdv_id,
        fechaOperacion: asistencia.fecha_operacion,
        reviewTarget,
      },
    });

    await Promise.all([
      registrarEventoAudit(
        service,
        actor.usuarioId,
        asistencia.cuenta_cliente_id,
        asistencia.id,
        auditPayload
      ),
      publishUiChanges(uiTargets, { service }),
    ]);

    return buildState({
      ok: true,
      message:
        reviewTarget === 'CHECK_OUT'
          ? nextStatus === 'VALIDA'
            ? 'Salida aprobada por supervision.'
            : 'Salida rechazada por supervision.'
          : nextStatus === 'VALIDA'
            ? 'Entrada aprobada por supervision.'
            : 'Entrada rechazada por supervision.',
    });
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible resolver la entrada operativa.',
    });
  }
}

export async function registrarAsistenciaManualSupervisor(
  _previousState: SupervisorAttendanceActionState,
  formData: FormData
): Promise<SupervisorAttendanceActionState> {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'SUPERVISOR']);
    const service = createServiceClient() as TypedSupabaseClient;

    const empleadoId = normalizeRequiredText(formData.get('empleado_id'), 'Dermoconsejera');
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'Punto de Venta');
    const fechaOperacion = normalizeRequiredText(formData.get('fecha_operacion'), 'Fecha');
    const tipoRegistro = normalizeRequiredText(formData.get('tipo_registro'), 'Tipo de registro');
    const comentarios = normalizeOptionalText(formData.get('comentarios'));

    // 1. Fetch employee name
    const { data: empleado, error: empError } = await service
      .from('empleado')
      .select('nombre_completo, supervisor_empleado_id')
      .eq('id', empleadoId)
      .maybeSingle();

    if (empError || !empleado) {
      throw new Error('No fue posible encontrar a la dermoconsejera.');
    }

    // Fetch active assignment to verify operational supervisor status
    const { data: activeAssignment } = await service
      .from('asignacion')
      .select('id, supervisor_empleado_id')
      .eq('empleado_id', empleadoId)
      .eq('pdv_id', pdvId)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', fechaOperacion)
      .or(`fecha_fin.gte.${fechaOperacion},fecha_fin.is.null`)
      .limit(1)
      .maybeSingle();

    if (actor.puesto === 'SUPERVISOR') {
      const esSupervisorEstructural = empleado.supervisor_empleado_id === actor.empleadoId;
      const esSupervisorOperativo = activeAssignment?.supervisor_empleado_id === actor.empleadoId;

      if (!esSupervisorEstructural && !esSupervisorOperativo) {
        throw new Error('No puedes registrar asistencias para dermoconsejeras fuera de tu equipo.');
      }
    }

    // 2. Fetch PDV details
    const { data: pdv, error: pdvError } = await service
      .from('pdv')
      .select('clave_btl, nombre, zona, cadena:cadena_id(nombre)')
      .eq('id', pdvId)
      .maybeSingle();

    if (pdvError || !pdv) {
      throw new Error('No fue posible encontrar el Punto de Venta.');
    }

    const { data: ccPdv } = await service
      .from('cuenta_cliente_pdv')
      .select('cuenta_cliente_id')
      .eq('pdv_id', pdvId)
      .eq('activo', true)
      .maybeSingle();

    const cuentaClienteId = ccPdv?.cuenta_cliente_id ?? actor.cuentaClienteId;

    if (!cuentaClienteId) {
      throw new Error('No fue posible determinar la cuenta cliente asociada al PDV.');
    }

    // 3. Handle FALTA_JUSTIFICADA (Ausencia justificada via solicitud)
    if (tipoRegistro === 'FALTA_JUSTIFICADA') {
      const { data: solicitudExistente } = await service
        .from('solicitud')
        .select('id')
        .eq('empleado_id', empleadoId)
        .eq('fecha_inicio', fechaOperacion)
        .eq('tipo', 'JUSTIFICACION_FALTA')
        .maybeSingle();

      if (solicitudExistente) {
        throw new Error('Ya existe una justificación de falta registrada para este día.');
      }

      const approvalMetadata = {
        approval_path: ['SUPERVISOR'],
        approval_target_statuses: ['REGISTRADA'],
        justifica_asistencia: true,
        estado_resolucion: 'APROBADA',
        notificaciones: [],
        creado_por_supervisor_id: actor.empleadoId,
        metodo_registro: 'ASISTENCIA_BOARD_SUPERVISOR',
      };

      const { error: insError } = await service.from('solicitud').insert({
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: empleadoId,
        supervisor_empleado_id: actor.empleadoId,
        tipo: 'JUSTIFICACION_FALTA',
        fecha_inicio: fechaOperacion,
        fecha_fin: fechaOperacion,
        motivo: comentarios ?? 'Falta justificada por supervisor directamente.',
        estatus: 'REGISTRADA',
        metadata: approvalMetadata,
      });

      if (insError) {
        throw new Error(insError.message);
      }

      // Sincronizar asignaciones materializadas si es necesario
      const { resolveMaterializationImpactRange, enqueueAndProcessMaterializedAssignments } =
        await import('@/features/asignaciones/services/asignacionMaterializationService');
      const impact = resolveMaterializationImpactRange(fechaOperacion, fechaOperacion);
      if (impact) {
        await enqueueAndProcessMaterializedAssignments(
          [
            {
              empleadoId: empleadoId,
              fechaInicio: impact.fechaInicio,
              fechaFin: impact.fechaFin,
              motivo: 'SOLICITUD_RESUELTA',
              payload: {
                estatus_nuevo: 'REGISTRADA',
              },
            },
          ],
          service
        );
      }

      const monthKeys = Array.from(new Set([fechaOperacion.slice(0, 7)].filter(Boolean)));
      await publishUiChanges(
        buildUiChangeTargetsFromBusinessEvent({
          eventType: 'solicitud_supervisor_creada',
          modules: ['solicitudes', 'dashboard', 'asistencias', 'nomina'],
          surfaces: ['panel', 'inbox', 'tabla', 'shell'],
          scopes: [
            buildUiChangeScope('cuenta', cuentaClienteId),
            buildUiChangeScope('empleado', empleadoId),
            buildUiChangeScope('supervisor', actor.empleadoId),
            ...monthKeys.map((monthKey) => buildUiChangeScope('periodo', monthKey)),
          ],
          cuentaClienteId,
          empleadoId,
          supervisorEmpleadoId: actor.empleadoId,
          metadata: {
            periodo: fechaOperacion.slice(0, 7),
            fechaInicio: fechaOperacion,
            fechaFin: fechaOperacion,
          },
        }),
        { service }
      );

      return buildState({
        ok: true,
        message: 'Falta justificada registrada exitosamente para la colaboradora.',
      });
    }

    // 3.1 Handle INCAPACIDAD (Incapacidad médica via solicitud)
    if (tipoRegistro === 'INCAPACIDAD') {
      const { data: solicitudExistente } = await service
        .from('solicitud')
        .select('id')
        .eq('empleado_id', empleadoId)
        .eq('fecha_inicio', fechaOperacion)
        .eq('tipo', 'INCAPACIDAD')
        .maybeSingle();

      if (solicitudExistente) {
        throw new Error('Ya existe una incapacidad registrada para este día.');
      }

      const approvalMetadata = {
        approval_path: ['SUPERVISOR'],
        approval_target_statuses: ['REGISTRADA'],
        justifica_asistencia: true,
        estado_resolucion: 'APROBADA',
        notificaciones: [],
        creado_por_supervisor_id: actor.empleadoId,
        metodo_registro: 'ASISTENCIA_BOARD_SUPERVISOR',
        incapacidad_clase: 'INICIAL',
      };

      const { error: insError } = await service.from('solicitud').insert({
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: empleadoId,
        supervisor_empleado_id: actor.empleadoId,
        tipo: 'INCAPACIDAD',
        fecha_inicio: fechaOperacion,
        fecha_fin: fechaOperacion,
        motivo: comentarios ?? 'Incapacidad médica registrada por supervisor directamente.',
        estatus: 'REGISTRADA',
        metadata: approvalMetadata,
      });

      if (insError) {
        throw new Error(insError.message);
      }

      // Sincronizar asistencia con subtipo_captura: INCAPACIDAD
      const { data: existingAttendance } = await service
        .from('asistencia')
        .select('id, metadata')
        .eq('empleado_id', empleadoId)
        .eq('fecha_operacion', fechaOperacion)
        .maybeSingle();

      const existingMeta =
        existingAttendance?.metadata && typeof existingAttendance.metadata === 'object'
          ? (existingAttendance.metadata as Record<string, any>)
          : {};

      const incMeta = {
        ...existingMeta,
        subtipo_captura: 'INCAPACIDAD',
        registro_manual_supervisor: {
          tipo_registro: 'INCAPACIDAD',
          registrado_en: new Date().toISOString(),
          registrado_por_usuario_id: actor.usuarioId,
          comentarios: comentarios ?? null,
        },
      };

      if (existingAttendance) {
        await service
          .from('asistencia')
          .update({
            estatus: 'VALIDA',
            metadata: incMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAttendance.id);
      } else {
        await service.from('asistencia').insert({
          cuenta_cliente_id: cuentaClienteId,
          empleado_id: empleadoId,
          supervisor_empleado_id: actor.empleadoId,
          pdv_id: pdvId,
          fecha_operacion: fechaOperacion,
          empleado_nombre: empleado.nombre_completo,
          pdv_clave_btl: pdv.clave_btl,
          pdv_nombre: pdv.nombre,
          pdv_zona: pdv.zona,
          cadena_nombre: (pdv.cadena as any)?.nombre ?? 'ISDIN',
          estado_gps: 'SIN_GPS',
          biometria_estado: 'NO_EVALUADA',
          estatus: 'VALIDA',
          origen: 'AJUSTE_ADMIN',
          metadata: incMeta,
          updated_at: new Date().toISOString(),
        });
      }

      // Sincronizar asignaciones materializadas si es necesario
      const { resolveMaterializationImpactRange, enqueueAndProcessMaterializedAssignments } =
        await import('@/features/asignaciones/services/asignacionMaterializationService');
      const impact = resolveMaterializationImpactRange(fechaOperacion, fechaOperacion);
      if (impact) {
        await enqueueAndProcessMaterializedAssignments(
          [
            {
              empleadoId: empleadoId,
              fechaInicio: impact.fechaInicio,
              fechaFin: impact.fechaFin,
              motivo: 'SOLICITUD_RESUELTA',
              payload: {
                estatus_nuevo: 'REGISTRADA',
              },
            },
          ],
          service
        );
      }

      const monthKeys = Array.from(new Set([fechaOperacion.slice(0, 7)].filter(Boolean)));
      await publishUiChanges(
        buildUiChangeTargetsFromBusinessEvent({
          eventType: 'solicitud_supervisor_creada',
          modules: ['solicitudes', 'dashboard', 'asistencias', 'nomina'],
          surfaces: ['panel', 'inbox', 'tabla', 'shell'],
          scopes: [
            buildUiChangeScope('cuenta', cuentaClienteId),
            buildUiChangeScope('empleado', empleadoId),
            buildUiChangeScope('supervisor', actor.empleadoId),
            ...monthKeys.map((monthKey) => buildUiChangeScope('periodo', monthKey)),
          ],
          cuentaClienteId,
          empleadoId,
          supervisorEmpleadoId: actor.empleadoId,
          metadata: {
            periodo: fechaOperacion.slice(0, 7),
            fechaInicio: fechaOperacion,
            fechaFin: fechaOperacion,
          },
        }),
        { service }
      );

      return buildState({
        ok: true,
        message: 'Incapacidad médica registrada exitosamente para la colaboradora.',
      });
    }

    // 3.2 Handle VACACIONES (Vacaciones via solicitud y asistencia)
    if (tipoRegistro === 'VACACIONES') {
      const { data: solicitudExistente } = await service
        .from('solicitud')
        .select('id')
        .eq('empleado_id', empleadoId)
        .eq('fecha_inicio', fechaOperacion)
        .eq('tipo', 'VACACIONES')
        .maybeSingle();

      if (solicitudExistente) {
        throw new Error('Ya existe una solicitud de vacaciones registrada para este día.');
      }

      const approvalMetadata = {
        approval_path: ['SUPERVISOR'],
        approval_target_statuses: ['APROBADA'],
        justifica_asistencia: true,
        estado_resolucion: 'APROBADA',
        notificaciones: [],
        creado_por_supervisor_id: actor.empleadoId,
        metodo_registro: 'ASISTENCIA_BOARD_SUPERVISOR',
      };

      const { error: insError } = await service.from('solicitud').insert({
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: empleadoId,
        supervisor_empleado_id: actor.empleadoId,
        tipo: 'VACACIONES',
        fecha_inicio: fechaOperacion,
        fecha_fin: fechaOperacion,
        motivo: comentarios ?? 'Vacaciones registradas por supervisor directamente.',
        estatus: 'APROBADA',
        metadata: approvalMetadata,
      });

      if (insError) {
        throw new Error(insError.message);
      }

      // Crear o actualizar registro de asistencia con subtipo_captura: VACACIONES
      const { data: existingAttendance } = await service
        .from('asistencia')
        .select('id, metadata')
        .eq('empleado_id', empleadoId)
        .eq('fecha_operacion', fechaOperacion)
        .maybeSingle();

      const existingMeta =
        existingAttendance?.metadata && typeof existingAttendance.metadata === 'object'
          ? (existingAttendance.metadata as Record<string, any>)
          : {};

      const vacMeta = {
        ...existingMeta,
        subtipo_captura: 'VACACIONES',
        registro_manual_supervisor: {
          tipo_registro: 'VACACIONES',
          registrado_en: new Date().toISOString(),
          registrado_por_usuario_id: actor.usuarioId,
          comentarios: comentarios ?? null,
        },
      };

      let attResultId = existingAttendance?.id;
      if (existingAttendance) {
        await service
          .from('asistencia')
          .update({
            estatus: 'VALIDA',
            metadata: vacMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAttendance.id);
      } else {
        const { data: newAtt } = await service
          .from('asistencia')
          .insert({
            cuenta_cliente_id: cuentaClienteId,
            empleado_id: empleadoId,
            supervisor_empleado_id: actor.empleadoId,
            pdv_id: pdvId,
            fecha_operacion: fechaOperacion,
            empleado_nombre: empleado.nombre_completo,
            pdv_clave_btl: pdv.clave_btl,
            pdv_nombre: pdv.nombre,
            pdv_zona: pdv.zona,
            cadena_nombre: (pdv.cadena as any)?.nombre ?? 'ISDIN',
            estado_gps: 'SIN_GPS',
            biometria_estado: 'NO_EVALUADA',
            estatus: 'VALIDA',
            origen: 'AJUSTE_ADMIN',
            metadata: vacMeta,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle();
        attResultId = newAtt?.id;
      }

      // Sincronizar asignaciones materializadas si es necesario
      const { resolveMaterializationImpactRange, enqueueAndProcessMaterializedAssignments } =
        await import('@/features/asignaciones/services/asignacionMaterializationService');
      const impact = resolveMaterializationImpactRange(fechaOperacion, fechaOperacion);
      if (impact) {
        await enqueueAndProcessMaterializedAssignments(
          [
            {
              empleadoId: empleadoId,
              fechaInicio: impact.fechaInicio,
              fechaFin: impact.fechaFin,
              motivo: 'SOLICITUD_RESUELTA',
              payload: {
                estatus_nuevo: 'APROBADA',
              },
            },
          ],
          service
        );
      }

      await registrarEventoAudit(service, actor.usuarioId, cuentaClienteId, attResultId ?? '', {
        accion: 'SUPERVISOR_REGISTRO_VACACIONES',
        empleado_id: empleadoId,
        pdv_id: pdvId,
        fecha_operacion: fechaOperacion,
        tipo_registro: 'VACACIONES',
        comentarios,
      });

      const monthKeys = Array.from(new Set([fechaOperacion.slice(0, 7)].filter(Boolean)));
      await publishUiChanges(
        buildUiChangeTargetsFromBusinessEvent({
          eventType: 'solicitud_supervisor_creada',
          modules: ['solicitudes', 'dashboard', 'asistencias', 'nomina'],
          surfaces: ['panel', 'inbox', 'tabla', 'shell'],
          scopes: [
            buildUiChangeScope('cuenta', cuentaClienteId),
            buildUiChangeScope('empleado', empleadoId),
            buildUiChangeScope('supervisor', actor.empleadoId),
            ...monthKeys.map((monthKey) => buildUiChangeScope('periodo', monthKey)),
          ],
          cuentaClienteId,
          empleadoId,
          supervisorEmpleadoId: actor.empleadoId,
          metadata: {
            periodo: fechaOperacion.slice(0, 7),
            fechaInicio: fechaOperacion,
            fechaFin: fechaOperacion,
          },
        }),
        { service }
      );

      return buildState({
        ok: true,
        message: 'Vacaciones registradas exitosamente para la colaboradora.',
      });
    }

    // 4. Handle SALIDA or ASISTENCIA / RETARDO / FALTA
    const isSalida = tipoRegistro === 'SALIDA';
    const isFaltaInjustificada = tipoRegistro === 'FALTA';
    const checkInTime = normalizeOptionalText(formData.get('check_in_time'));
    const checkOutTime = normalizeOptionalText(formData.get('check_out_time'));

    // Fetch existing attendance to update or insert new
    const { data: existingAttendance } = await service
      .from('asistencia')
      .select('id, metadata, check_in_utc, check_out_utc')
      .eq('empleado_id', empleadoId)
      .eq('fecha_operacion', fechaOperacion)
      .maybeSingle();

    let checkInUtc: string | null = null;
    let checkOutUtc: string | null = null;

    if (isSalida) {
      if (!existingAttendance?.check_in_utc) {
        throw new Error('No es posible registrar salida sin una entrada previa registrada.');
      }
      checkInUtc = existingAttendance.check_in_utc;
      if (!checkOutTime) {
        throw new Error('Debes indicar la hora de salida.');
      }
      checkOutUtc = new Date(`${fechaOperacion}T${checkOutTime}:00.000-06:00`).toISOString();
    } else if (!isFaltaInjustificada) {
      if (checkInTime) {
        checkInUtc = new Date(`${fechaOperacion}T${checkInTime}:00.000-06:00`).toISOString();
      }
      if (checkOutTime) {
        checkOutUtc = new Date(`${fechaOperacion}T${checkOutTime}:00.000-06:00`).toISOString();
      }
    }

    const meta = existingAttendance ? normalizeMetadata(existingAttendance.metadata) : {};
    const existingSupervision = normalizeMetadata(meta.supervision);
    const existingRegistroManual = normalizeMetadata(meta.registro_manual_supervisor);

    if (isSalida) {
      meta.supervision = {
        ...existingSupervision,
        supervisor_resuelta_en: new Date().toISOString(),
        supervisor_resuelta_por_usuario_id: actor.usuarioId,
        supervisor_resuelta_por_puesto: actor.puesto,
        supervisor_resolucion: 'VALIDA',
        supervisor_comentarios: comentarios ?? 'Salida registrada manualmente por supervisor.',
        checkout_status: 'VALIDA',
        checkout_resolved_at: new Date().toISOString(),
        checkout_resolved_by_usuario_id: actor.usuarioId,
        checkout_comments: comentarios ?? 'Salida manual de supervisor.',
      };
      meta.registro_manual_supervisor = {
        ...existingRegistroManual,
        salida_registrada_por_usuario_id: actor.usuarioId,
        salida_registrada_en: new Date().toISOString(),
      };
    } else {
      meta.supervision = {
        ...existingSupervision,
        supervisor_resuelta_en: new Date().toISOString(),
        supervisor_resuelta_por_usuario_id: actor.usuarioId,
        supervisor_resuelta_por_puesto: actor.puesto,
        supervisor_resolucion: isFaltaInjustificada ? 'RECHAZADA' : 'VALIDA',
        supervisor_comentarios:
          comentarios ??
          (isFaltaInjustificada
            ? 'Registrado como Falta por supervisor.'
            : 'Registrado manualmente por supervisor.'),
        entry_status: isFaltaInjustificada ? 'RECHAZADA' : 'VALIDA',
        entry_resolved_at: new Date().toISOString(),
        entry_resolved_by_usuario_id: actor.usuarioId,
      };
      meta.registro_manual_supervisor = {
        ...existingRegistroManual,
        registrado_por_usuario_id: actor.usuarioId,
        registrado_en: new Date().toISOString(),
        tipo_registro: tipoRegistro,
      };
    }

    const asistenciaPayload = {
      cuenta_cliente_id: cuentaClienteId,
      asignacion_id: activeAssignment?.id ?? null,
      empleado_id: empleadoId,
      supervisor_empleado_id: actor.empleadoId,
      pdv_id: pdvId,
      fecha_operacion: fechaOperacion,
      empleado_nombre: empleado.nombre_completo,
      pdv_clave_btl: pdv.clave_btl,
      pdv_nombre: pdv.nombre,
      pdv_zona: pdv.zona,
      cadena_nombre: (pdv.cadena as any)?.nombre ?? 'ISDIN',
      check_in_utc: checkInUtc,
      check_out_utc: checkOutUtc,
      estado_gps: 'SIN_GPS',
      biometria_estado: 'NO_EVALUADA',
      estatus: isFaltaInjustificada ? 'RECHAZADA' : (checkOutUtc ? 'CERRADA' : 'VALIDA'),
      origen: 'AJUSTE_ADMIN',
      metadata: meta,
      updated_at: new Date().toISOString(),
    };

    let resultId = '';
    if (existingAttendance) {
      const { error: updError } = await service
        .from('asistencia')
        .update(asistenciaPayload)
        .eq('id', existingAttendance.id);

      if (updError) {
        throw new Error(updError.message);
      }
      resultId = existingAttendance.id;
    } else {
      const { data: newAtt, error: insError } = await service
        .from('asistencia')
        .insert(asistenciaPayload)
        .select('id')
        .maybeSingle();

      if (insError) {
        throw new Error(insError.message);
      }
      resultId = newAtt?.id ?? '';
    }

    // Publish UI changes
    const uiTargets = buildUiChangeTargetsFromBusinessEvent({
      eventType: isSalida ? 'asistencia_supervisor_salida_validada' : 'asistencia_supervisor_validada',
      modules: ['dashboard'],
      surfaces: ['panel', 'insights'],
      scopes: [
        buildUiChangeScope('cuenta', cuentaClienteId),
        buildUiChangeScope('empleado', empleadoId),
        buildUiChangeScope('supervisor', actor.empleadoId),
      ],
      cuentaClienteId,
      empleadoId,
      supervisorEmpleadoId: actor.empleadoId,
      metadata: {
        asistenciaId: resultId,
        pdvId,
        fechaOperacion,
      },
    });

    await Promise.all([
      registrarEventoAudit(service, actor.usuarioId, cuentaClienteId, resultId, {
        evento: isSalida ? 'supervisor_registro_manual_salida' : 'supervisor_registro_manual',
        empleado_id: empleadoId,
        pdv_id: pdvId,
        fecha_operacion: fechaOperacion,
        tipo_registro: tipoRegistro,
        comentarios,
      }),
      publishUiChanges(uiTargets, { service }),
    ]);

    return buildState({
      ok: true,
      message: isSalida
        ? 'Salida registrada exitosamente.'
        : isFaltaInjustificada
          ? 'Falta registrada exitosamente.'
          : `Asistencia manual (${tipoRegistro.toLowerCase()}) registrada exitosamente.`,
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la asistencia.',
    });
  }
}
