'use server'

import { revalidatePath } from 'next/cache'
import { requerirOperadorNomina } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { NominaActionState } from './state'
import {
  getNominaPeriodoTransitionTargets,
  isNominaPeriodoMutable,
  type NominaPeriodoEstado,
} from './lib/periodState'

interface PeriodoNominaEstadoRow {
  id: string
  clave: string
  estado: NominaPeriodoEstado
  metadata: Record<string, unknown> | null
}

function getFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function normalizeMonto(raw: string) {
  const normalized = Number(raw.replace(/,/g, ''))
  return Number.isFinite(normalized) ? normalized : Number.NaN
}

function buildNominaRevalidationPaths() {
  return ['/nomina', '/dashboard', '/mi-nomina'] as const
}

function normalizeEntero(raw: string) {
  const normalized = Number(raw.replace(/,/g, ''))
  return Number.isFinite(normalized) ? Math.max(0, Math.round(normalized)) : Number.NaN
}

function normalizePorcentajeCumplimiento(objetivoMonto: number, avanceMonto: number, objetivoUnidades: number, avanceUnidades: number) {
  if (objetivoMonto > 0) {
    return Math.max(0, (avanceMonto / objetivoMonto) * 100)
  }

  if (objetivoUnidades > 0) {
    return Math.max(0, (avanceUnidades / objetivoUnidades) * 100)
  }

  return 0
}

function resolveQuotaState(cumplimiento: number): 'EN_CURSO' | 'CUMPLIDA' | 'RIESGO' {
  if (cumplimiento >= 100) {
    return 'CUMPLIDA'
  }

  if (cumplimiento < 70) {
    return 'RIESGO'
  }

  return 'EN_CURSO'
}

function revalidateNominaPaths() {
  for (const path of buildNominaRevalidationPaths()) {
    revalidatePath(path)
  }
}

export async function crearPeriodoNomina(
  _prevState: NominaActionState,
  formData: FormData
): Promise<NominaActionState> {
  const actor = await requerirOperadorNomina()

  const clave = getFormString(formData, 'clave')
  const fechaInicio = getFormString(formData, 'fecha_inicio')
  const fechaFin = getFormString(formData, 'fecha_fin')
  const observaciones = getFormString(formData, 'observaciones') || null

  if (!clave || !fechaInicio || !fechaFin) {
    return { ok: false, message: 'Clave, fecha inicial y fecha final son obligatorias.' }
  }

  if (fechaFin < fechaInicio) {
    return { ok: false, message: 'La fecha final no puede ser anterior al inicio.' }
  }

  const supabase = await createClient()

  const { data: borradorExistente, error: borradorError } = await supabase
    .from('nomina_periodo')
    .select('id, clave')
    .eq('estado', 'BORRADOR')
    .maybeSingle()

  if (borradorError) {
    return { ok: false, message: borradorError.message }
  }

  if (borradorExistente) {
    return {
      ok: false,
      message: `Ya existe un periodo en borrador: ${borradorExistente.clave}.`,
    }
  }

  const [asistenciasResult, ventasResult] = await Promise.all([
    supabase
      .from('asistencia')
      .select('empleado_id')
      .gte('fecha_operacion', fechaInicio)
      .lte('fecha_operacion', fechaFin),
    supabase
      .from('venta')
      .select('empleado_id')
      .gte('fecha_utc', `${fechaInicio}T00:00:00Z`)
      .lte('fecha_utc', `${fechaFin}T23:59:59Z`),
  ])

  if (asistenciasResult.error || ventasResult.error) {
    return {
      ok: false,
      message:
        asistenciasResult.error?.message ??
        ventasResult.error?.message ??
        'No fue posible estimar empleados incluidos para el periodo.',
    }
  }

  const empleadosIncluidos = new Set<string>()
  for (const row of (asistenciasResult.data ?? []) as Array<{ empleado_id: string | null }>) {
    if (typeof row.empleado_id === 'string' && row.empleado_id) {
      empleadosIncluidos.add(row.empleado_id)
    }
  }

  for (const row of (ventasResult.data ?? []) as Array<{ empleado_id: string | null }>) {
    if (typeof row.empleado_id === 'string' && row.empleado_id) {
      empleadosIncluidos.add(row.empleado_id)
    }
  }

  const { error: insertError } = await supabase.from('nomina_periodo').insert({
    clave,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    estado: 'BORRADOR',
    observaciones,
    metadata: {
      empleados_incluidos: empleadosIncluidos.size,
      creado_por_usuario_id: actor.usuarioId,
      creado_por_nombre: actor.nombreCompleto,
      creado_por_puesto: actor.puesto,
    },
  })

  if (insertError) {
    return { ok: false, message: insertError.message }
  }

  revalidateNominaPaths()

  return {
    ok: true,
    message: `Periodo ${clave} generado en borrador con ${empleadosIncluidos.size} colaboradoras incluidas.`,
  }
}

export async function actualizarEstadoPeriodoNomina(
  _prevState: NominaActionState,
  formData: FormData
): Promise<NominaActionState> {
  const actor = await requerirOperadorNomina()

  const periodoId = getFormString(formData, 'periodo_id')
  const estadoDestino = getFormString(formData, 'estado_destino') as NominaPeriodoEstado

  if (!periodoId) {
    return { ok: false, message: 'El periodo es obligatorio.' }
  }

  if (!['BORRADOR', 'APROBADO', 'DISPERSADO'].includes(estadoDestino)) {
    return { ok: false, message: 'El estado destino no es valido.' }
  }

  const supabase = await createClient()
  const { data: periodo, error: periodoError } = await supabase
    .from('nomina_periodo')
    .select('id, clave, estado, metadata')
    .eq('id', periodoId)
    .maybeSingle()

  if (periodoError || !periodo) {
    return {
      ok: false,
      message: periodoError?.message ?? 'No fue posible encontrar el periodo solicitado.',
    }
  }

  const periodoActual = periodo as PeriodoNominaEstadoRow

  if (periodoActual.estado === estadoDestino) {
    return { ok: true, message: 'El periodo ya tiene ese estado.' }
  }

  const allowedTargets = getNominaPeriodoTransitionTargets(periodoActual.estado)
  if (!allowedTargets.includes(estadoDestino)) {
    return {
      ok: false,
      message: `No se puede mover ${periodoActual.clave} de ${periodoActual.estado} a ${estadoDestino}.`,
    }
  }

  if (estadoDestino === 'BORRADOR') {
    const { data: borradorExistente, error: borradorError } = await supabase
      .from('nomina_periodo')
      .select('id, clave')
      .eq('estado', 'BORRADOR')
      .neq('id', periodoId)
      .maybeSingle()

    if (borradorError) {
      return { ok: false, message: borradorError.message }
    }

    if (borradorExistente) {
      return {
        ok: false,
        message: `Ya existe un periodo en borrador: ${borradorExistente.clave}.`,
      }
    }
  }

  const metadata = normalizeMetadata(periodoActual.metadata)
  const timestamp = new Date().toISOString()

  if (estadoDestino === 'APROBADO') {
    metadata.aprobado_at = timestamp
    metadata.aprobado_por_usuario_id = actor.usuarioId
    metadata.aprobado_por_nombre = actor.nombreCompleto
  }

  if (estadoDestino === 'DISPERSADO') {
    metadata.dispersado_at = timestamp
    metadata.dispersado_por_usuario_id = actor.usuarioId
    metadata.dispersado_por_nombre = actor.nombreCompleto
  }

  if (estadoDestino === 'BORRADOR') {
    metadata.reabierto_at = timestamp
    metadata.reabierto_por_usuario_id = actor.usuarioId
    metadata.reabierto_por_nombre = actor.nombreCompleto
  }

  const updatePayload = {
    estado: estadoDestino,
    fecha_cierre: estadoDestino === 'BORRADOR' ? null : timestamp,
    metadata,
    updated_at: timestamp,
  }

  const { error: updateError } = await supabase
    .from('nomina_periodo')
    .update(updatePayload)
    .eq('id', periodoId)

  if (updateError) {
    return { ok: false, message: updateError.message }
  }

  revalidateNominaPaths()

  const label =
    estadoDestino === 'APROBADO'
      ? 'aprobado'
      : estadoDestino === 'DISPERSADO'
        ? 'marcado como dispersado'
        : 'regresado a borrador'

  return {
    ok: true,
    message: `Periodo ${periodoActual.clave} ${label} correctamente.`,
  }
}

export async function registrarMovimientoManualNomina(
  _prevState: NominaActionState,
  formData: FormData
): Promise<NominaActionState> {
  const actor = await requerirOperadorNomina()

  const periodoId = getFormString(formData, 'periodo_id')
  const empleadoId = getFormString(formData, 'empleado_id')
  const cuentaClienteId = getFormString(formData, 'cuenta_cliente_id') || null
  const tipoMovimiento = getFormString(formData, 'tipo_movimiento')
  const concepto = getFormString(formData, 'concepto')
  const motivo = getFormString(formData, 'motivo')
  const notas = getFormString(formData, 'notas') || null
  const monto = normalizeMonto(getFormString(formData, 'monto'))

  if (!periodoId || !empleadoId || !concepto || !motivo || !Number.isFinite(monto) || monto <= 0) {
    return {
      ok: false,
      message: 'Periodo, colaboradora, monto, concepto y motivo son obligatorios.',
    }
  }

  if (!['PERCEPCION', 'DEDUCCION', 'AJUSTE'].includes(tipoMovimiento)) {
    return { ok: false, message: 'El tipo de movimiento no es valido.' }
  }

  const supabase = await createClient()
  const { data: periodo, error: periodoError } = await supabase
    .from('nomina_periodo')
    .select('id, clave, estado')
    .eq('id', periodoId)
    .maybeSingle()

  if (periodoError || !periodo) {
    return {
      ok: false,
      message: periodoError?.message ?? 'No fue posible encontrar el periodo solicitado.',
    }
  }

  if (!isNominaPeriodoMutable((periodo as PeriodoNominaEstadoRow).estado)) {
    return {
      ok: false,
      message: 'Solo se permiten ajustes manuales cuando el periodo esta en borrador.',
    }
  }

  const notasCompuestas = `Autor: ${actor.nombreCompleto}. Motivo: ${motivo}.${notas ? ` ${notas}` : ''}`

  const { error: insertError } = await supabase.from('nomina_ledger').insert({
    periodo_id: periodoId,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: empleadoId,
    tipo_movimiento: tipoMovimiento,
    concepto,
    monto,
    moneda: 'MXN',
    notas: notasCompuestas,
    metadata: {
      origen: 'AJUSTE_MANUAL_UI',
      autor_usuario_id: actor.usuarioId,
      autor_nombre: actor.nombreCompleto,
      autor_puesto: actor.puesto,
      motivo,
    },
  })

  if (insertError) {
    return { ok: false, message: insertError.message }
  }

  revalidateNominaPaths()

  return {
    ok: true,
    message: `Ajuste manual registrado en ${periodo.clave}.`,
  }
}
export async function guardarDefinicionCuotaNomina(
  _prevState: NominaActionState,
  formData: FormData
): Promise<NominaActionState> {
  const actor = await requerirOperadorNomina()

  const periodoId = getFormString(formData, 'periodo_id')
  const empleadoId = getFormString(formData, 'empleado_id')
  const cuentaClienteId = getFormString(formData, 'cuenta_cliente_id')
  const cadenaId = getFormString(formData, 'cadena_id') || null
  const objetivoMonto = normalizeMonto(getFormString(formData, 'objetivo_monto'))
  const objetivoUnidades = normalizeEntero(getFormString(formData, 'objetivo_unidades') || '0')
  const loveObjetivo = normalizeEntero(getFormString(formData, 'love_objetivo') || '0')
  const visitasObjetivo = normalizeEntero(getFormString(formData, 'visitas_objetivo') || '0')
  const factorCuota = normalizeMonto(getFormString(formData, 'factor_cuota') || '1')
  const bonoEstimado = normalizeMonto(getFormString(formData, 'bono_estimado') || '0')

  if (!periodoId || !empleadoId || !cuentaClienteId) {
    return { ok: false, message: 'Periodo, colaboradora y cuenta cliente son obligatorios.' }
  }

  if (![objetivoMonto, objetivoUnidades, loveObjetivo, visitasObjetivo, factorCuota, bonoEstimado].every((value) => Number.isFinite(value) && value >= 0)) {
    return { ok: false, message: 'Los objetivos, factor y bono deben ser numericos positivos.' }
  }

  if (factorCuota <= 0) {
    return { ok: false, message: 'El factor de cuota debe ser mayor a cero.' }
  }

  const supabase = await createClient()
  const { data: periodo, error: periodoError } = await supabase
    .from('nomina_periodo')
    .select('id, clave, estado')
    .eq('id', periodoId)
    .maybeSingle()

  if (periodoError || !periodo) {
    return { ok: false, message: periodoError?.message ?? 'No fue posible encontrar el periodo solicitado.' }
  }

  if (!isNominaPeriodoMutable((periodo as PeriodoNominaEstadoRow).estado)) {
    return { ok: false, message: 'Solo se permiten definir cuotas cuando el periodo esta en borrador.' }
  }

  const { data: cuotaActual, error: cuotaError } = await supabase
    .from('cuota_empleado_periodo')
    .select('id, avance_monto, avance_unidades, metadata')
    .eq('periodo_id', periodoId)
    .eq('empleado_id', empleadoId)
    .eq('cuenta_cliente_id', cuentaClienteId)
    .maybeSingle()

  if (cuotaError) {
    return { ok: false, message: cuotaError.message }
  }

  const avanceMonto = Number((cuotaActual?.avance_monto ?? 0) || 0)
  const avanceUnidades = Number((cuotaActual?.avance_unidades ?? 0) || 0)
  const cumplimiento = normalizePorcentajeCumplimiento(objetivoMonto, avanceMonto, objetivoUnidades, avanceUnidades)
  const metadata = normalizeMetadata(cuotaActual?.metadata)
  metadata.love_objetivo = loveObjetivo
  metadata.visitas_objetivo = visitasObjetivo
  metadata.definida_por_usuario_id = actor.usuarioId
  metadata.definida_por_nombre = actor.nombreCompleto
  metadata.definida_por_puesto = actor.puesto
  metadata.definida_at = new Date().toISOString()

  const payload = {
    periodo_id: periodoId,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: empleadoId,
    cadena_id: cadenaId,
    objetivo_monto: objetivoMonto,
    objetivo_unidades: objetivoUnidades,
    avance_monto: avanceMonto,
    avance_unidades: avanceUnidades,
    factor_cuota: factorCuota,
    cumplimiento_porcentaje: Number(cumplimiento.toFixed(2)),
    bono_estimado: bonoEstimado,
    estado: resolveQuotaState(cumplimiento),
    metadata,
  }

  const mutation = cuotaActual?.id
    ? supabase.from('cuota_empleado_periodo').update(payload).eq('id', cuotaActual.id)
    : supabase.from('cuota_empleado_periodo').insert(payload)

  const { error: upsertError } = await mutation

  if (upsertError) {
    return { ok: false, message: upsertError.message }
  }

  revalidateNominaPaths()

  return {
    ok: true,
    message: cuotaActual?.id ? 'Cuota comercial actualizada correctamente.' : `Cuota comercial registrada para ${periodo.clave}.`,
  }
}
