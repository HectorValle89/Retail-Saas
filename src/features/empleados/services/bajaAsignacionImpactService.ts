import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueAndProcessMaterializedAssignments, resolveMaterializationImpactRange } from '@/features/asignaciones/services/asignacionMaterializationService'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import type {
  Asignacion,
  AsignacionBajaHistorialAccion,
  VacanteOperativaFuturaSeguimiento,
  VacanteOperativaFuturaTipo,
} from '@/types/database'

type TypedSupabaseClient = SupabaseClient<any>

interface BajaImpactAssignmentRow
  extends Pick<
    Asignacion,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'pdv_id'
    | 'supervisor_empleado_id'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'tipo'
    | 'naturaleza'
    | 'asignacion_base_id'
    | 'asignacion_origen_id'
    | 'motivo_movimiento'
    | 'observaciones'
    | 'metadata'
    | 'estado_publicacion'
  > {}

export interface BajaVacanteImpactSummary {
  id: string
  pdvId: string
  tipoVacante: VacanteOperativaFuturaTipo
  fechaVacanteDesde: string
  fechaBajaEfectiva: string
  motivo: string | null
  estadoSeguimiento: VacanteOperativaFuturaSeguimiento
  accionRecomendada: string | null
  asignacionOrigenId: string | null
  asignacionCanceladaId: string | null
}

export interface BajaMovimientoCanceladoSummary {
  asignacionId: string
  pdvId: string
  fechaInicio: string
  fechaFin: string | null
  accionAplicada: 'TRUNCADA_POR_BAJA' | 'CANCELADA_POR_BAJA'
  vacanteOperativaFuturaId: string | null
}

export interface ProcesarImpactoBajaEnAsignacionesResult {
  vacanteActual: BajaVacanteImpactSummary | null
  vacantesFuturas: BajaVacanteImpactSummary[]
  movimientosCancelados: BajaMovimientoCanceladoSummary[]
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function appendCancellationNote(observaciones: string | null, fechaBaja: string) {
  const marker = `CANCELADA_POR_BAJA ${fechaBaja}`
  if (!observaciones?.trim()) {
    return marker
  }

  return observaciones.includes(marker) ? observaciones : `${observaciones}\n${marker}`
}

function subtractOneDay(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function sortAssignmentsByStartDate(rows: BajaImpactAssignmentRow[]) {
  return [...rows].sort((left, right) => left.fecha_inicio.localeCompare(right.fecha_inicio))
}

function buildVacanteSummary(input: {
  id: string
  pdvId: string
  tipoVacante: VacanteOperativaFuturaTipo
  fechaVacanteDesde: string
  fechaBajaEfectiva: string
  motivo: string | null
  estadoSeguimiento?: VacanteOperativaFuturaSeguimiento
  accionRecomendada: string | null
  asignacionOrigenId: string | null
  asignacionCanceladaId: string | null
}): BajaVacanteImpactSummary {
  return {
    id: input.id,
    pdvId: input.pdvId,
    tipoVacante: input.tipoVacante,
    fechaVacanteDesde: input.fechaVacanteDesde,
    fechaBajaEfectiva: input.fechaBajaEfectiva,
    motivo: input.motivo,
    estadoSeguimiento: input.estadoSeguimiento ?? 'NUEVA',
    accionRecomendada: input.accionRecomendada,
    asignacionOrigenId: input.asignacionOrigenId,
    asignacionCanceladaId: input.asignacionCanceladaId,
  }
}

async function crearVacanteOperativaFutura(
  service: TypedSupabaseClient,
  input: {
    cuentaClienteId: string
    empleadoOrigenId: string
    asignacionOrigenId: string | null
    asignacionCanceladaId: string | null
    pdvId: string
    tipoVacante: VacanteOperativaFuturaTipo
    fechaVacanteDesde: string
    fechaBajaEfectiva: string
    motivo: string | null
    accionRecomendada: string | null
    metadata?: Record<string, unknown>
  }
) {
  const { data, error } = await service
    .from('vacante_operativa_futura')
    .insert({
      cuenta_cliente_id: input.cuentaClienteId,
      empleado_origen_id: input.empleadoOrigenId,
      asignacion_origen_id: input.asignacionOrigenId,
      asignacion_cancelada_id: input.asignacionCanceladaId,
      pdv_id: input.pdvId,
      tipo_vacante: input.tipoVacante,
      fecha_vacante_desde: input.fechaVacanteDesde,
      fecha_baja_efectiva: input.fechaBajaEfectiva,
      motivo: input.motivo,
      estado_seguimiento: 'NUEVA',
      accion_recomendada: input.accionRecomendada,
      metadata: input.metadata ?? {},
    })
    .select(
      'id, pdv_id, tipo_vacante, fecha_vacante_desde, fecha_baja_efectiva, motivo, estado_seguimiento, accion_recomendada, asignacion_origen_id, asignacion_cancelada_id'
    )
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible registrar la vacante operativa futura.')
  }

  return buildVacanteSummary({
    id: data.id,
    pdvId: data.pdv_id,
    tipoVacante: data.tipo_vacante as VacanteOperativaFuturaTipo,
    fechaVacanteDesde: data.fecha_vacante_desde,
    fechaBajaEfectiva: data.fecha_baja_efectiva,
    motivo: data.motivo,
    estadoSeguimiento: data.estado_seguimiento as VacanteOperativaFuturaSeguimiento,
    accionRecomendada: data.accion_recomendada,
    asignacionOrigenId: data.asignacion_origen_id,
    asignacionCanceladaId: data.asignacion_cancelada_id,
  })
}

async function registrarHistorialBaja(
  service: TypedSupabaseClient,
  input: {
    cuentaClienteId: string
    empleadoId: string
    asignacion: BajaImpactAssignmentRow
    pdvOrigenId?: string | null
    fechaBajaEfectiva: string
    usuarioActorId: string
    accionAplicada: AsignacionBajaHistorialAccion
    vacanteOperativaFuturaId: string | null
    motivo: string | null
    metadata?: Record<string, unknown>
  }
) {
  const { error } = await service.from('asignacion_baja_historial').insert({
    cuenta_cliente_id: input.cuentaClienteId,
    empleado_id: input.empleadoId,
    asignacion_id: input.asignacion.id,
    vacante_operativa_futura_id: input.vacanteOperativaFuturaId,
    pdv_origen_id: input.pdvOrigenId ?? null,
    pdv_destino_id: input.asignacion.pdv_id,
    fecha_inicio_original: input.asignacion.fecha_inicio,
    fecha_fin_original: input.asignacion.fecha_fin,
    fecha_baja_efectiva: input.fechaBajaEfectiva,
    accion_aplicada: input.accionAplicada,
    usuario_actor_id: input.usuarioActorId,
    motivo: input.motivo,
    metadata: input.metadata ?? {},
  })

  if (error) {
    throw new Error(error.message || 'No fue posible registrar el historial de baja de la asignacion.')
  }
}

async function marcarPdvActualComoVacante(
  service: TypedSupabaseClient,
  input: {
    cuentaClienteId: string
    empleadoId: string
    pdvId: string
    fechaBajaEfectiva: string
    usuarioActorId: string
    motivo: string | null
  }
) {
  const { error } = await service.from('pdv_cobertura_operativa').upsert(
    {
      cuenta_cliente_id: input.cuentaClienteId,
      pdv_id: input.pdvId,
      estado_operativo: 'VACANTE',
      motivo_operativo: 'SIN_DC',
      empleado_reservado_id: null,
      pdv_paso_id: null,
      acceso_pendiente_desde: null,
      proximo_recordatorio_at: null,
      observaciones: `VACANTE_ACTUAL_POR_BAJA ${input.fechaBajaEfectiva}`,
      metadata: {
        source_action: 'BAJA_EMPLEADO',
        empleado_origen_id: input.empleadoId,
        fecha_baja_efectiva: input.fechaBajaEfectiva,
        usuario_actor_id: input.usuarioActorId,
        motivo_baja: input.motivo,
      },
    },
    { onConflict: 'pdv_id' }
  )

  if (error) {
    throw new Error(error.message || 'No fue posible reflejar la vacante actual en pdv_cobertura_operativa.')
  }
}

export async function procesarImpactoBajaEnAsignaciones(
  service: TypedSupabaseClient,
  input: {
    empleadoId: string
    fechaBajaEfectiva: string
    usuarioActorId: string
    motivoBaja: string | null
    observacionesNomina: string | null
  }
): Promise<ProcesarImpactoBajaEnAsignacionesResult> {
  const { data: publishedRows, error } = await service
    .from('asignacion')
    .select(
      'id, cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id, fecha_inicio, fecha_fin, tipo, naturaleza, asignacion_base_id, asignacion_origen_id, motivo_movimiento, observaciones, metadata, estado_publicacion'
    )
    .eq('empleado_id', input.empleadoId)
    .eq('estado_publicacion', 'PUBLICADA')
    .order('fecha_inicio', { ascending: true })

  if (error) {
    throw new Error(error.message || 'No fue posible consultar las asignaciones publicadas del empleado.')
  }

  const assignments = sortAssignmentsByStartDate((publishedRows ?? []) as BajaImpactAssignmentRow[])
  const currentAssignment =
    [...assignments]
      .reverse()
      .find(
        (item) => item.fecha_inicio < input.fechaBajaEfectiva && (!item.fecha_fin || item.fecha_fin >= input.fechaBajaEfectiva)
      ) ?? null
  const futureAssignments = assignments.filter((item) => item.fecha_inicio >= input.fechaBajaEfectiva)
  const accountId =
    currentAssignment?.cuenta_cliente_id ??
    futureAssignments.find((item) => Boolean(item.cuenta_cliente_id))?.cuenta_cliente_id ??
    getSingleTenantAccountId()

  const vacantesFuturas: BajaVacanteImpactSummary[] = []
  const movimientosCancelados: BajaMovimientoCanceladoSummary[] = []
  let vacanteActual: BajaVacanteImpactSummary | null = null

  if (currentAssignment) {
    const fechaFinAjustada = subtractOneDay(input.fechaBajaEfectiva)
    const currentMetadata = normalizeMetadata(currentAssignment.metadata)
    const { error: truncateError } = await service
      .from('asignacion')
      .update({
        fecha_fin: fechaFinAjustada,
        observaciones: appendCancellationNote(currentAssignment.observaciones, input.fechaBajaEfectiva),
        metadata: {
          ...currentMetadata,
          baja_operativa: {
            tipo: 'TRUNCADA_POR_BAJA',
            fecha_baja_efectiva: input.fechaBajaEfectiva,
            usuario_actor_id: input.usuarioActorId,
            observaciones_nomina: input.observacionesNomina,
          },
        },
      })
      .eq('id', currentAssignment.id)

    if (truncateError) {
      throw new Error(truncateError.message || 'No fue posible ajustar la asignacion vigente por la baja.')
    }

    vacanteActual = await crearVacanteOperativaFutura(service, {
      cuentaClienteId: accountId,
      empleadoOrigenId: input.empleadoId,
      asignacionOrigenId: currentAssignment.id,
      asignacionCanceladaId: null,
      pdvId: currentAssignment.pdv_id,
      tipoVacante: 'VACANTE_ACTUAL_POR_BAJA',
      fechaVacanteDesde: input.fechaBajaEfectiva,
      fechaBajaEfectiva: input.fechaBajaEfectiva,
      motivo: input.motivoBaja,
      accionRecomendada: 'Validar cobertura inmediata del PDV actual.',
      metadata: {
        trigger: 'cerrarBajaEmpleadoNomina',
        asignacion_accion: 'TRUNCADA_POR_BAJA',
        observaciones_nomina: input.observacionesNomina,
      },
    })

    await registrarHistorialBaja(service, {
      cuentaClienteId: accountId,
      empleadoId: input.empleadoId,
      asignacion: currentAssignment,
      pdvOrigenId: currentAssignment.pdv_id,
      fechaBajaEfectiva: input.fechaBajaEfectiva,
      usuarioActorId: input.usuarioActorId,
      accionAplicada: 'VACANTE_ACTUAL_GENERADA',
      vacanteOperativaFuturaId: vacanteActual.id,
      motivo: input.motivoBaja,
      metadata: {
        asignacion_accion: 'TRUNCADA_POR_BAJA',
        observaciones_nomina: input.observacionesNomina,
      },
    })

    await marcarPdvActualComoVacante(service, {
      cuentaClienteId: accountId,
      empleadoId: input.empleadoId,
      pdvId: currentAssignment.pdv_id,
      fechaBajaEfectiva: input.fechaBajaEfectiva,
      usuarioActorId: input.usuarioActorId,
      motivo: input.motivoBaja,
    })
  }

  for (const assignment of futureAssignments) {
    const assignmentMetadata = normalizeMetadata(assignment.metadata)
    const { error: updateError } = await service
      .from('asignacion')
      .update({
        estado_publicacion: 'BORRADOR',
        observaciones: appendCancellationNote(assignment.observaciones, input.fechaBajaEfectiva),
        metadata: {
          ...assignmentMetadata,
          baja_operativa: {
            tipo: 'CANCELADA_POR_BAJA',
            fecha_baja_efectiva: input.fechaBajaEfectiva,
            usuario_actor_id: input.usuarioActorId,
            observaciones_nomina: input.observacionesNomina,
          },
        },
      })
      .eq('id', assignment.id)
      .eq('estado_publicacion', 'PUBLICADA')

    if (updateError) {
      throw new Error(updateError.message || 'No fue posible cancelar una asignacion futura por la baja.')
    }

    const vacanteFutura = await crearVacanteOperativaFutura(service, {
      cuentaClienteId: assignment.cuenta_cliente_id ?? accountId,
      empleadoOrigenId: input.empleadoId,
      asignacionOrigenId: currentAssignment?.id ?? assignment.asignacion_origen_id ?? assignment.asignacion_base_id ?? null,
      asignacionCanceladaId: assignment.id,
      pdvId: assignment.pdv_id,
      tipoVacante: 'VACANTE_FUTURA_POR_MOVIMIENTO_CANCELADO',
      fechaVacanteDesde: assignment.fecha_inicio,
      fechaBajaEfectiva: input.fechaBajaEfectiva,
      motivo: assignment.motivo_movimiento ?? input.motivoBaja,
      accionRecomendada: 'Abrir reasignacion con PDV y fecha objetivo prellenados.',
      metadata: {
        trigger: 'cerrarBajaEmpleadoNomina',
        asignacion_accion: 'CANCELADA_POR_BAJA',
        observaciones_nomina: input.observacionesNomina,
      },
    })

    vacantesFuturas.push(vacanteFutura)
    movimientosCancelados.push({
      asignacionId: assignment.id,
      pdvId: assignment.pdv_id,
      fechaInicio: assignment.fecha_inicio,
      fechaFin: assignment.fecha_fin,
      accionAplicada: 'CANCELADA_POR_BAJA',
      vacanteOperativaFuturaId: vacanteFutura.id,
    })

    await registrarHistorialBaja(service, {
      cuentaClienteId: assignment.cuenta_cliente_id ?? accountId,
      empleadoId: input.empleadoId,
      asignacion: assignment,
      pdvOrigenId: currentAssignment?.pdv_id ?? null,
      fechaBajaEfectiva: input.fechaBajaEfectiva,
      usuarioActorId: input.usuarioActorId,
      accionAplicada: 'MOVIMIENTO_CANCELADO',
      vacanteOperativaFuturaId: vacanteFutura.id,
      motivo: assignment.motivo_movimiento ?? input.motivoBaja,
      metadata: {
        asignacion_accion: 'CANCELADA_POR_BAJA',
        observaciones_nomina: input.observacionesNomina,
      },
    })
  }

  if (currentAssignment || futureAssignments.length > 0) {
    const rawImpactEnd = futureAssignments.reduce((max, item) => {
        const candidate = item.fecha_fin ?? item.fecha_inicio
        return candidate > max ? candidate : max
      }, input.fechaBajaEfectiva)
    const impactEnd = currentAssignment ? addDays(rawImpactEnd, 62) : rawImpactEnd
    const resolvedImpactRange = resolveMaterializationImpactRange(input.fechaBajaEfectiva, impactEnd)

    if (!resolvedImpactRange) {
      return {
        vacanteActual,
        vacantesFuturas,
        movimientosCancelados,
      }
    }

    const impactRange = resolvedImpactRange

    await enqueueAndProcessMaterializedAssignments([
      {
        empleadoId: input.empleadoId,
        fechaInicio: impactRange.fechaInicio,
        fechaFin: impactRange.fechaFin,
        motivo: 'BAJA_EMPLEADO_IMPACTO_ASIGNACIONES',
        payload: {
          fecha_baja_efectiva: input.fechaBajaEfectiva,
          vacante_actual_id: vacanteActual?.id ?? null,
          vacantes_futuras_ids: vacantesFuturas.map((item) => item.id),
        },
      },
    ])
  }

  return {
    vacanteActual,
    vacantesFuturas,
    movimientosCancelados,
  }
}
