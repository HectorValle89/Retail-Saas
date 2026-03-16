'use server'

import { revalidatePath } from 'next/cache'
import {
  SUPERVISOR_INHERITANCE_RULE_CODE,
  readSupervisorInheritanceRule,
  resolveSupervisorInheritance,
  type BusinessRuleRow,
} from '@/features/reglas/lib/businessRules'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Empleado, Pdv } from '@/types/database'
import {
  evaluarReglasAsignacion,
  resumirIssuesAsignacion,
  requiereConfirmacionAlertas,
  type AssignmentComparableRow,
  type AssignmentIssue,
  type AssignmentValidationEmployee,
  type AssignmentValidationPdv,
  type SupervisorAsignacionRow,
} from './lib/assignmentValidation'
import {
  normalizeDiaLaboralCode,
  serializeDiasLaborales,
} from './lib/assignmentPlanning'

interface ActualizarEstadoAsignacionState {
  ok: boolean
  message: string | null
  issues: AssignmentIssue[]
}

export const ESTADO_ASIGNACION_INICIAL: ActualizarEstadoAsignacionState = {
  ok: false,
  message: null,
  issues: [],
}

interface AsignacionEstadoRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  tipo: string
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

interface GeocercaAsignacionRow {
  pdv_id: string
  latitud: number | null
  longitud: number | null
  radio_tolerancia_metros: number | null
}

interface SupervisorResolucionRow extends SupervisorAsignacionRow {
  empleado_id: string | null
}

interface CuentaClientePdvRow {
  cuenta_cliente_id: string
  activo: boolean
  fecha_fin: string | null
}

type EmpleadoContextRow = Pick<
  Empleado,
  | 'id'
  | 'nombre_completo'
  | 'puesto'
  | 'estatus_laboral'
  | 'telefono'
  | 'correo_electronico'
  | 'supervisor_empleado_id'
>

type CadenaContextRow = {
  codigo: string | null
  factor_cuota_default: number | null
}

interface PdvContextRow
  extends Pick<Pdv, 'id' | 'estatus'> {
  cadena: CadenaContextRow[] | null
}

function buildState(
  partial: Partial<ActualizarEstadoAsignacionState>
): ActualizarEstadoAsignacionState {
  return {
    ...ESTADO_ASIGNACION_INICIAL,
    ...partial,
    issues: partial.issues ?? [],
  }
}

function buildValidationEmployee(
  empleado: EmpleadoContextRow | null
): AssignmentValidationEmployee | null {
  if (!empleado) {
    return null
  }

  return {
    id: empleado.id,
    puesto: empleado.puesto,
    estatus_laboral: empleado.estatus_laboral,
    telefono: empleado.telefono,
    correo_electronico: empleado.correo_electronico,
  }
}

function buildValidationPdv(pdv: PdvContextRow | null, geocerca: GeocercaAsignacionRow | null): AssignmentValidationPdv | null {
  if (!pdv) {
    return null
  }

  const cadena = pdv.cadena?.[0] ?? null

  return {
    id: pdv.id,
    estatus: pdv.estatus,
    radio_tolerancia_metros: geocerca?.radio_tolerancia_metros ?? null,
    cadena_codigo: cadena?.codigo ?? null,
    factor_cuota_default: cadena?.factor_cuota_default ?? null,
  }
}

function buildComparableRow(row: AsignacionEstadoRow): AssignmentComparableRow {
  return {
    id: row.id,
    empleado_id: row.empleado_id,
    pdv_id: row.pdv_id,
    supervisor_empleado_id: row.supervisor_empleado_id,
    tipo: row.tipo,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    dias_laborales: row.dias_laborales,
  }
}

function obtenerSupervisorVigente(
  supervisores: SupervisorResolucionRow[],
  referencia: string
) {
  return (
    supervisores.find(
      (item) => item.activo && item.empleado_id && (!item.fecha_fin || item.fecha_fin >= referencia)
    ) ?? null
  )
}

function pickCuentaClienteOperativa(
  relaciones: CuentaClientePdvRow[],
  referencia: string
) {
  return (
    relaciones.find((item) => item.activo && (!item.fecha_fin || item.fecha_fin >= referencia)) ?? null
  )
}

function normalizeDate(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeFactorTiempo(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Factor tiempo invalido.')
  }

  return parsed
}

async function registrarEventoAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    tabla,
    registroId,
    payload,
    usuarioId,
    cuentaClienteId,
  }: {
    tabla: string
    registroId: string
    payload: Record<string, unknown>
    usuarioId: string
    cuentaClienteId: string | null
  }
) {
  await supabase.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function cargarContextoAsignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    asignacionId,
    empleadoId,
    pdvId,
  }: {
    asignacionId: string | null
    empleadoId: string
    pdvId: string
  }
) {
  const [
    empleadoResult,
    pdvResult,
    geocercaResult,
    supervisoresResult,
    relacionCuentaResult,
    comparablesResult,
    historialPdvResult,
    horariosResult,
    supervisorRuleResult,
  ] = await Promise.all([
    supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, estatus_laboral, telefono, correo_electronico, supervisor_empleado_id')
      .eq('id', empleadoId)
      .maybeSingle(),
    supabase
      .from('pdv')
      .select('id, estatus, cadena:cadena_id(codigo, factor_cuota_default)')
      .eq('id', pdvId)
      .maybeSingle(),
    supabase
      .from('geocerca_pdv')
      .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
      .eq('pdv_id', pdvId)
      .maybeSingle(),
    supabase
      .from('supervisor_pdv')
      .select('pdv_id, empleado_id, activo, fecha_fin')
      .eq('pdv_id', pdvId),
    supabase
      .from('cuenta_cliente_pdv')
      .select('cuenta_cliente_id, activo, fecha_fin')
      .eq('pdv_id', pdvId)
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, estado_publicacion')
      .eq('empleado_id', empleadoId),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, estado_publicacion')
      .eq('pdv_id', pdvId)
      .order('fecha_inicio', { ascending: false })
      .limit(20),
    supabase.from('horario_pdv').select('id').eq('pdv_id', pdvId).eq('activo', true),
    supabase
      .from('regla_negocio')
      .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
      .eq('codigo', SUPERVISOR_INHERITANCE_RULE_CODE)
      .maybeSingle(),
  ])

  return {
    empleado: (empleadoResult.data as EmpleadoContextRow | null) ?? null,
    pdv: (pdvResult.data as PdvContextRow | null) ?? null,
    geocerca: (geocercaResult.data as GeocercaAsignacionRow | null) ?? null,
    supervisores: (supervisoresResult.data ?? []) as SupervisorResolucionRow[],
    cuentaClienteRelaciones: (relacionCuentaResult.data ?? []) as CuentaClientePdvRow[],
    comparables: ((comparablesResult.data ?? []) as AsignacionEstadoRow[])
      .filter((item) => item.id !== asignacionId)
      .map(buildComparableRow),
    historialPdv: ((historialPdvResult.data ?? []) as AsignacionEstadoRow[])
      .filter((item) => item.id !== asignacionId)
      .map(buildComparableRow),
    horariosCount: horariosResult.data?.length ?? 0,
    supervisorRule: readSupervisorInheritanceRule(
      (supervisorRuleResult.data as BusinessRuleRow | null) ?? null
    ),
    error:
      empleadoResult.error?.message ??
      pdvResult.error?.message ??
      geocercaResult.error?.message ??
      supervisoresResult.error?.message ??
      relacionCuentaResult.error?.message ??
      comparablesResult.error?.message ??
      historialPdvResult.error?.message ??
      horariosResult.error?.message ??
      supervisorRuleResult.error?.message ??
      null,
  }
}

function buildDiasLaboralesFromForm(formData: FormData) {
  const dias = formData
    .getAll('dias_laborales')
    .map((value) => normalizeDiaLaboralCode(String(value)))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return serializeDiasLaborales(dias)
}

export async function guardarAsignacionPlanificada(
  _prevState: ActualizarEstadoAsignacionState,
  formData: FormData
): Promise<ActualizarEstadoAsignacionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const supabase = await createClient()
    const asignacionId = normalizeOptionalText(formData.get('asignacion_id'))
    const empleadoId = String(formData.get('empleado_id') ?? '').trim()
    const pdvId = String(formData.get('pdv_id') ?? '').trim()
    const tipo = String(formData.get('tipo') ?? '').trim()
    const fechaInicio = normalizeDate(formData.get('fecha_inicio'))
    const fechaFin = normalizeDate(formData.get('fecha_fin'))
    const horarioReferencia = normalizeOptionalText(formData.get('horario_referencia'))
    const diaDescanso = normalizeOptionalText(formData.get('dia_descanso'))
    const diasLaborales = buildDiasLaboralesFromForm(formData)
    const observaciones = normalizeOptionalText(formData.get('observaciones'))
    const factorTiempo = normalizeFactorTiempo(formData.get('factor_tiempo'))

    if (!empleadoId || !pdvId || !fechaInicio) {
      return buildState({
        message: 'Empleado, PDV y fecha inicio son obligatorios para guardar la asignacion.',
      })
    }

    if (tipo !== 'FIJA' && tipo !== 'ROTATIVA' && tipo !== 'COBERTURA') {
      return buildState({ message: 'El tipo de asignacion no es valido.' })
    }

    const contexto = await cargarContextoAsignacion(supabase, {
      asignacionId,
      empleadoId,
      pdvId,
    })

    if (contexto.error) {
      return buildState({ message: contexto.error })
    }

    const cuentaClienteRelacion = pickCuentaClienteOperativa(contexto.cuentaClienteRelaciones, fechaInicio)
    const cuentaClienteId = actor.cuentaClienteId ?? cuentaClienteRelacion?.cuenta_cliente_id ?? null

    if (actor.cuentaClienteId && cuentaClienteRelacion && actor.cuentaClienteId !== cuentaClienteRelacion.cuenta_cliente_id) {
      return buildState({
        message: 'El PDV seleccionado no pertenece a la cuenta cliente activa del administrador.',
      })
    }

    const supervisorPdv = obtenerSupervisorVigente(contexto.supervisores, fechaInicio)
    const supervisorResuelto = resolveSupervisorInheritance(
      [
        {
          source: 'PDV',
          supervisorEmpleadoId: supervisorPdv?.empleado_id ?? null,
          active: Boolean(supervisorPdv?.empleado_id),
        },
        {
          source: 'EMPLEADO',
          supervisorEmpleadoId: contexto.empleado?.supervisor_empleado_id ?? null,
          active: true,
        },
      ],
      contexto.supervisorRule
    )

    const draft = {
      id: asignacionId,
      cuenta_cliente_id: cuentaClienteId,
      empleado_id: empleadoId,
      pdv_id: pdvId,
      supervisor_empleado_id: supervisorResuelto.supervisorEmpleadoId,
      tipo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dias_laborales: diasLaborales,
      dia_descanso: diaDescanso,
      horario_referencia: horarioReferencia,
    }

    const issues = evaluarReglasAsignacion(draft, {
      employee: buildValidationEmployee(contexto.empleado),
      pdv: buildValidationPdv(contexto.pdv, contexto.geocerca),
      pdvsConGeocerca: contexto.geocerca ? new Set<string>([pdvId]) : new Set<string>(),
      supervisoresPorPdv: { [pdvId]: contexto.supervisores },
      comparableAssignments: contexto.comparables,
      historicalAssignmentsForPdv: contexto.historialPdv,
      horariosPorPdv: { [pdvId]: contexto.horariosCount },
    })
    const resumen = resumirIssuesAsignacion(issues)

    if (resumen.errores.length > 0) {
      return buildState({
        message: `No se pudo guardar la asignacion: ${resumen.errores.map((item) => item.label).join(', ')}.`,
        issues,
      })
    }

    const payload = {
      cuenta_cliente_id: cuentaClienteId,
      empleado_id: empleadoId,
      pdv_id: pdvId,
      supervisor_empleado_id: supervisorResuelto.supervisorEmpleadoId,
      clave_btl: null,
      tipo,
      factor_tiempo: factorTiempo,
      dias_laborales: diasLaborales,
      dia_descanso: diaDescanso,
      horario_referencia: horarioReferencia,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      observaciones,
      updated_at: new Date().toISOString(),
    }

    const query = asignacionId
      ? supabase.from('asignacion').update(payload).eq('id', asignacionId)
      : supabase.from('asignacion').insert({ ...payload, estado_publicacion: 'BORRADOR' })

    const { data, error } = await query
      .select('id, cuenta_cliente_id, estado_publicacion')
      .maybeSingle()

    if (error || !data) {
      return buildState({ message: error?.message ?? 'No fue posible guardar la asignacion.' })
    }

    await registrarEventoAudit(supabase, {
      tabla: 'asignacion',
      registroId: data.id,
      payload: {
        evento: asignacionId ? 'asignacion_actualizada' : 'asignacion_creada',
        tipo,
        pdv_id: pdvId,
        empleado_id: empleadoId,
        issues: issues.map((item) => ({ code: item.code, severity: item.severity })),
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: data.cuenta_cliente_id,
    })

    revalidatePath('/asignaciones')
    revalidatePath('/dashboard')
    revalidatePath('/pdvs')

    const nonBlocking = [...resumen.alertas, ...resumen.avisos]

    return buildState({
      ok: true,
      message:
        nonBlocking.length > 0
          ? `Asignacion guardada en borrador con ${nonBlocking.length} issue(s) no bloqueantes.`
          : 'Asignacion guardada en borrador.',
      issues,
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la asignacion.',
    })
  }
}

export async function actualizarEstadoPublicacionAsignacion(
  _prevState: ActualizarEstadoAsignacionState,
  formData: FormData
): Promise<ActualizarEstadoAsignacionState> {
  const actor = await requerirAdministradorActivo()

  const asignacionId = String(formData.get('asignacion_id') ?? '').trim()
  const estadoDestino = String(formData.get('estado_destino') ?? '').trim()

  if (!asignacionId) {
    return buildState({ message: 'La asignacion es obligatoria.' })
  }

  if (estadoDestino !== 'BORRADOR' && estadoDestino !== 'PUBLICADA') {
    return buildState({ message: 'El estado destino no es valido.' })
  }

  const confirmarAlertas = String(formData.get('confirmar_alertas') ?? '').trim() === 'true'
  const supabase = await createClient()
  const { data: asignacion, error: asignacionError } = await supabase
    .from('asignacion')
    .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, tipo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, estado_publicacion')
    .eq('id', asignacionId)
    .maybeSingle()

  if (asignacionError || !asignacion) {
    return buildState({
      message: asignacionError?.message ?? 'No fue posible encontrar la asignacion solicitada.',
    })
  }

  const asignacionActual = asignacion as AsignacionEstadoRow

  if (asignacionActual.estado_publicacion === estadoDestino) {
    return buildState({ ok: true, message: 'La asignacion ya tiene ese estado.' })
  }

  let supervisorResueltoId = asignacionActual.supervisor_empleado_id
  let issues: AssignmentIssue[] = []

  if (estadoDestino === 'PUBLICADA') {
    const contexto = await cargarContextoAsignacion(supabase, {
      asignacionId,
      empleadoId: asignacionActual.empleado_id,
      pdvId: asignacionActual.pdv_id,
    })

    if (contexto.error) {
      return buildState({ message: contexto.error })
    }

    const supervisorPdv = obtenerSupervisorVigente(contexto.supervisores, asignacionActual.fecha_inicio)
    const supervisorResuelto = resolveSupervisorInheritance(
      [
        {
          source: 'PDV',
          supervisorEmpleadoId: supervisorPdv?.empleado_id ?? null,
          active: Boolean(supervisorPdv?.empleado_id),
        },
        {
          source: 'EMPLEADO',
          supervisorEmpleadoId: contexto.empleado?.supervisor_empleado_id ?? null,
          active: true,
        },
        {
          source: 'ASIGNACION',
          supervisorEmpleadoId: asignacionActual.supervisor_empleado_id,
          active: true,
        },
      ],
      contexto.supervisorRule
    )

    supervisorResueltoId = supervisorResuelto.supervisorEmpleadoId

    issues = evaluarReglasAsignacion(
      {
        ...asignacionActual,
        supervisor_empleado_id: supervisorResueltoId,
      },
      {
        employee: buildValidationEmployee(contexto.empleado),
        pdv: buildValidationPdv(contexto.pdv, contexto.geocerca),
        pdvsConGeocerca: contexto.geocerca ? new Set<string>([asignacionActual.pdv_id]) : new Set<string>(),
        supervisoresPorPdv: { [asignacionActual.pdv_id]: contexto.supervisores },
        comparableAssignments: contexto.comparables,
        historicalAssignmentsForPdv: contexto.historialPdv,
        horariosPorPdv: { [asignacionActual.pdv_id]: contexto.horariosCount },
      }
    )

    const resumen = resumirIssuesAsignacion(issues)

    if (resumen.errores.length > 0) {
      return buildState({
        message: `No se puede publicar: ${resumen.errores.map((item) => item.label).join(', ')}.`,
        issues,
      })
    }

    if (requiereConfirmacionAlertas(issues) && !confirmarAlertas) {
      return buildState({
        message: `Confirma la publicacion con alertas: ${resumen.alertas.map((item) => item.label).join(', ')}.`,
        issues,
      })
    }
  }

  const { error: updateError } = await supabase
    .from('asignacion')
    .update({
      estado_publicacion: estadoDestino,
      supervisor_empleado_id: supervisorResueltoId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asignacionId)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(supabase, {
    tabla: 'asignacion',
    registroId: asignacionId,
    payload: {
      evento:
        estadoDestino === 'PUBLICADA'
          ? 'asignacion_publicada'
          : 'asignacion_regresada_borrador',
      estado_destino: estadoDestino,
      issues: issues.map((item) => ({ code: item.code, severity: item.severity })),
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: asignacionActual.cuenta_cliente_id,
  })

  revalidatePath('/asignaciones')
  revalidatePath('/dashboard')

  const resumen = resumirIssuesAsignacion(issues)
  const nonBlockingCount = resumen.alertas.length + resumen.avisos.length

  return buildState({
    ok: true,
    message:
      estadoDestino === 'PUBLICADA'
        ? nonBlockingCount > 0
          ? `Asignacion publicada con ${nonBlockingCount} issue(s) no bloqueantes${resumen.alertas.length > 0 ? ' y confirmacion explicita de alertas.' : '.'}`
          : 'Asignacion publicada correctamente.'
        : 'Asignacion regresada a borrador.',
    issues,
  })
}