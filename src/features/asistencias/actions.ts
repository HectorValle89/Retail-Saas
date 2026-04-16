'use server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { publishUiChanges } from '@/lib/ui-change/server'
import {
  buildUiChangeScope,
  buildUiChangeTargetsFromBusinessEvent,
} from '@/lib/ui-change/types'
import { ESTADO_SUPERVISOR_ASISTENCIA_INICIAL, type SupervisorAttendanceActionState } from './state'

type TypedSupabaseClient = ReturnType<typeof createServiceClient>

function buildState(
  partial: Partial<SupervisorAttendanceActionState>
): SupervisorAttendanceActionState {
  return {
    ...ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
    ...partial,
  }
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized : null
}

function normalizeAttendanceResolution(value: FormDataEntryValue | null) {
  const status = normalizeRequiredText(value, 'Resolucion')
  if (status !== 'VALIDA' && status !== 'RECHAZADA') {
    throw new Error('La resolucion de asistencia no es valida.')
  }

  return status
}

function normalizeReviewTarget(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'CHECK_IN' || normalized === 'CHECK_OUT') {
    return normalized
  }

  throw new Error('El objetivo de revision no es valido.')
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
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
  })
}

export async function resolverAsistenciaSupervisor(
  _previousState: SupervisorAttendanceActionState,
  formData: FormData
): Promise<SupervisorAttendanceActionState> {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'SUPERVISOR'])
    const service = createServiceClient() as TypedSupabaseClient
    const asistenciaId = normalizeRequiredText(formData.get('asistencia_id'), 'Asistencia')
    const nextStatus = normalizeAttendanceResolution(formData.get('estatus'))
    const reviewTarget = normalizeReviewTarget(formData.get('review_target'))
    const comentarios = normalizeOptionalText(formData.get('comentarios'))

    const { data: asistencia, error } = await service
      .from('asistencia')
      .select(
        'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_operacion, check_in_utc, check_out_utc, estatus, metadata'
      )
      .eq('id', asistenciaId)
      .maybeSingle()

    if (error || !asistencia) {
      throw new Error(error?.message ?? 'No fue posible encontrar la asistencia solicitada.')
    }

    if (actor.puesto === 'SUPERVISOR' && asistencia.supervisor_empleado_id !== actor.empleadoId) {
      throw new Error('No puedes resolver una asistencia fuera de tu operacion diaria.')
    }

    if (reviewTarget === 'CHECK_IN' && !asistencia.check_in_utc) {
      throw new Error('La entrada todavia no tiene check-in registrado.')
    }

    if (reviewTarget === 'CHECK_OUT' && !asistencia.check_out_utc) {
      throw new Error('La salida todavia no tiene check-out registrado.')
    }

    if (reviewTarget === 'CHECK_IN' && asistencia.estatus === 'CERRADA') {
      throw new Error('La jornada ya esta cerrada y no admite cambios de supervision.')
    }

    const nextMetadata = normalizeMetadata(asistencia.metadata)
    const previousSupervision = normalizeMetadata(nextMetadata.supervision)
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
    }

    const persistedStatus =
      reviewTarget === 'CHECK_OUT' ? (nextStatus === 'VALIDA' ? 'CERRADA' : 'RECHAZADA') : nextStatus

    const { error: updateError } = await service
      .from('asistencia')
      .update({
        estatus: persistedStatus,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asistenciaId)

    if (updateError) {
      throw new Error(updateError.message)
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
    }

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
    })

    await Promise.all([
      registrarEventoAudit(
        service,
        actor.usuarioId,
        asistencia.cuenta_cliente_id,
        asistencia.id,
        auditPayload
      ),
      publishUiChanges(uiTargets, { service }),
    ])

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
    })
  } catch (error) {
    return buildState({
      message:
        error instanceof Error ? error.message : 'No fue posible resolver la entrada operativa.',
    })
  }
}
