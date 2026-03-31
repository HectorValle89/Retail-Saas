'use server'

import { revalidatePath } from 'next/cache'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
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

    if (!asistencia.check_in_utc) {
      throw new Error('La entrada todavia no tiene check-in registrado.')
    }

    if (asistencia.estatus === 'CERRADA') {
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
    }

    const { error: updateError } = await service
      .from('asistencia')
      .update({
        estatus: nextStatus,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asistenciaId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    await registrarEventoAudit(
      service,
      actor.usuarioId,
      asistencia.cuenta_cliente_id,
      asistencia.id,
      {
        evento: nextStatus === 'VALIDA' ? 'supervisor_aprobo_entrada' : 'supervisor_rechazo_entrada',
        asistencia_id: asistencia.id,
        empleado_id: asistencia.empleado_id,
        pdv_id: asistencia.pdv_id,
        fecha_operacion: asistencia.fecha_operacion,
        comentarios,
      }
    )

    revalidatePath('/dashboard')
    revalidatePath('/asistencias')
    revalidatePath('/reportes')

    return buildState({
      ok: true,
      message:
        nextStatus === 'VALIDA'
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
