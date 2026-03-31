'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SUPERVISOR_INHERITANCE_RULE_CODE,
  readSupervisorInheritanceRule,
  resolveSupervisorInheritance,
  type BusinessRuleRow,
} from '@/features/reglas/lib/businessRules'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Empleado, Pdv, UsuarioSistema } from '@/types/database'
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
import { parseTurnosCatalogo, TURNOS_CONFIG_KEY } from '@/features/configuracion/configuracionCatalog'
import { parseAssignmentCatalogWorkbook } from './lib/assignmentCatalogImport'
import { parseAssignmentWeeklyScheduleWorkbook } from './lib/assignmentWeeklyScheduleImport'
import {
  buildAssignmentTransitionPlan,
  type AssignmentEngineDraft,
  type AssignmentEngineTransitionPlan,
  type AssignmentEngineRow,
  type AssignmentEngineNature,
} from './lib/assignmentEngine'
import {
  enqueueAndProcessMaterializedAssignments,
  resolveMaterializationImpactRange,
} from './services/asignacionMaterializationService'
import {
  ESTADO_ASIGNACION_INICIAL,
  ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL,
  type ActualizarEstadoAsignacionState,
  type AssignmentImportConflict,
  type ImportarCatalogoAsignacionesState,
  type PublicarCatalogoAsignacionesState,
} from './state'

interface AsignacionEstadoRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  tipo: string
  factor_tiempo: number
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  fecha_inicio: string
  fecha_fin: string | null
  naturaleza: AssignmentEngineNature
  retorna_a_base: boolean
  asignacion_base_id: string | null
  asignacion_origen_id: string | null
  prioridad: number
  motivo_movimiento: string | null
  observaciones: string | null
  generado_automaticamente: boolean
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

type TypedSupabaseClient = SupabaseClient<any>

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

type EmpleadoImportRow = Pick<
  Empleado,
  | 'id'
  | 'id_nomina'
  | 'nombre_completo'
  | 'puesto'
  | 'estatus_laboral'
  | 'supervisor_empleado_id'
  | 'telefono'
  | 'correo_electronico'
>

type CadenaContextRow = {
  codigo: string | null
  factor_cuota_default: number | null
}

type UsuarioImportRow = Pick<UsuarioSistema, 'empleado_id' | 'username'>

interface PdvContextRow
  extends Pick<Pdv, 'id' | 'estatus'> {
  cadena: CadenaContextRow[] | null
}

interface PdvImportRow extends Pick<Pdv, 'id' | 'clave_btl' | 'estatus'> {
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

function buildImportState(
  partial: Partial<ImportarCatalogoAsignacionesState>
): ImportarCatalogoAsignacionesState {
  const baseState: ImportarCatalogoAsignacionesState = {
    ok: false,
    message: null,
    conflicts: [],
    summary: null,
  }

  return {
    ...baseState,
    ...partial,
    conflicts: partial.conflicts ?? baseState.conflicts,
    summary: partial.summary ?? baseState.summary,
  }
}

function buildPublishState(
  partial: Partial<PublicarCatalogoAsignacionesState>
): PublicarCatalogoAsignacionesState {
  const baseState: PublicarCatalogoAsignacionesState = {
    ...ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL,
  }

  return {
    ...baseState,
    ...partial,
    conflicts: partial.conflicts ?? baseState.conflicts,
    publishedRows: partial.publishedRows ?? baseState.publishedRows,
    materializedEmployees: partial.materializedEmployees ?? baseState.materializedEmployees,
    materializedWindowLabel: partial.materializedWindowLabel ?? baseState.materializedWindowLabel,
  }
}

function getCurrentMxMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function addUtcMonths(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset, 1)
  return date.toISOString().slice(0, 7)
}

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

function formatMonthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function buildOperationalWindowLabel(baseMonth = getCurrentMxMonth()) {
  return `${formatMonthLabel(baseMonth)} + ${formatMonthLabel(addUtcMonths(baseMonth, 1))}`
}

function buildMonthlyMaterializationRange(
  fechaInicio: string,
  fechaFin: string | null,
  month: string
) {
  const lowerBound = startOfMonth(month)
  const upperBound = endOfMonth(month)
  const normalizedStart = fechaInicio.slice(0, 10)
  const normalizedEnd = fechaFin ? fechaFin.slice(0, 10) : upperBound
  const effectiveStart = normalizedStart > lowerBound ? normalizedStart : lowerBound
  const effectiveEnd = normalizedEnd < upperBound ? normalizedEnd : upperBound

  if (effectiveStart > effectiveEnd) {
    return null
  }

  return {
    fechaInicio: effectiveStart,
    fechaFin: effectiveEnd,
  }
}

function isValidMonthInput(value: string) {
  return /^\d{4}-\d{2}$/.test(value)
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

function buildComparableRow(row: Pick<AsignacionEstadoRow, 'id' | 'empleado_id' | 'pdv_id' | 'supervisor_empleado_id' | 'tipo' | 'fecha_inicio' | 'fecha_fin' | 'dias_laborales'>): AssignmentComparableRow {
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



function normalizeAssignmentNature(value: FormDataEntryValue | null): AssignmentEngineNature {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (normalized === 'COBERTURA_TEMPORAL' || normalized === 'MOVIMIENTO') {
    return 'COBERTURA_TEMPORAL'
  }

  if (normalized === 'COBERTURA_PERMANENTE') {
    return 'COBERTURA_PERMANENTE'
  }

  return 'BASE'
}

function derivePriorityFromNature(naturaleza: AssignmentEngineNature) {
  if (naturaleza === 'COBERTURA_TEMPORAL' || naturaleza === 'MOVIMIENTO') {
    return 200
  }

  if (naturaleza === 'COBERTURA_PERMANENTE') {
    return 150
  }

  return 100
}

async function registrarEventoAudit(
  supabase: TypedSupabaseClient,
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
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, factor_tiempo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
      .eq('empleado_id', empleadoId),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, factor_tiempo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
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
    comparableRows: ((comparablesResult.data ?? []) as AsignacionEstadoRow[]).filter(
      (item) => item.id !== asignacionId
    ),
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
    const factorTiempo = 1
    const naturaleza = normalizeAssignmentNature(formData.get('naturaleza'))
    const retornaABase = String(formData.get('retorna_a_base') ?? '').trim() === 'true'
    const motivoMovimiento = normalizeOptionalText(formData.get('motivo_movimiento'))
    const prioridad = derivePriorityFromNature(naturaleza)

    if (naturaleza === 'BASE') {
      return buildState({ message: 'La base general se carga desde el catalogo maestro inicial.' })
    }

    if (naturaleza === 'COBERTURA_TEMPORAL' && !fechaFin) {
      return buildState({ message: 'La cobertura temporal requiere fecha fin.' })
    }

    if (naturaleza === 'COBERTURA_PERMANENTE' && fechaFin) {
      return buildState({ message: 'La cobertura permanente debe quedar sin fecha fin.' })
    }

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
      naturaleza,
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
      naturaleza,
      retorna_a_base: naturaleza === 'COBERTURA_TEMPORAL' ? retornaABase : false,
      prioridad,
      motivo_movimiento: motivoMovimiento,
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
        naturaleza,
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

function buildImportComparableKey(input: {
  empleadoId: string
  pdvId: string
  tipo: string
}) {
  return `${input.empleadoId}::${input.pdvId}::${input.tipo}`
}

async function refreshMaterializedAssignmentRanges(
  inputs: Array<{
    empleadoId: string
    fechaInicio: string
    fechaFin: string | null
    motivo: string
    payload?: Record<string, unknown>
  }>
) {
  const ranges = inputs.reduce<Array<{
    empleadoId: string
    fechaInicio: string
    fechaFin: string
    motivo: string
    payload?: Record<string, unknown>
  }>>((acc, item) => {
    const impact = resolveMaterializationImpactRange(item.fechaInicio, item.fechaFin)
    if (!impact) {
      return acc
    }

    acc.push({
      empleadoId: item.empleadoId,
      fechaInicio: impact.fechaInicio,
      fechaFin: impact.fechaFin,
      motivo: item.motivo,
      payload: item.payload,
    })

    return acc
  }, [])

  if (ranges.length === 0) {
    return
  }

  await enqueueAndProcessMaterializedAssignments(
    ranges,
    createServiceClient() as TypedSupabaseClient
  )
}
export async function importarCatalogoMaestroAsignaciones(
  _prevState: ImportarCatalogoAsignacionesState,
  formData: FormData
): Promise<ImportarCatalogoAsignacionesState> {
  const actor = await requerirAdministradorActivo()

  try {
    const uploadedFile = formData.get('catalogo_asignaciones_file')

    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
      return buildImportState({ message: 'Adjunta un archivo XLSX para importar el catalogo maestro.' })
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.xlsx')) {
      return buildImportState({ message: 'El catalogo maestro debe estar en formato XLSX.' })
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const parsed = parseAssignmentCatalogWorkbook(buffer)
    const service = createServiceClient() as TypedSupabaseClient
    const importDate = new Date().toISOString().slice(0, 10)
    const conflicts: AssignmentImportConflict[] = parsed.issues.map((issue) => ({
      rowNumber: issue.rowNumber,
      claveBtl: null,
      referenciaDc: null,
      tipo: null,
      severity: issue.severity,
      code: issue.code,
      label:
        issue.code === 'FILA_SIN_BTL'
          ? 'Fila sin BTL CVE'
          : issue.code === 'FILA_SIN_REFERENCIA_DC'
            ? 'Fila sin referencia de DC'
            : issue.code === 'FILA_DUPLICADA'
              ? 'Fila duplicada'
              : issue.code === 'DESCANSO_INVALIDO'
                ? 'Descanso invalido'
                : 'Dias laborales invalidos',
      message: issue.message,
      source: 'PARSER' as const,
    }))

    const pdvClaves = Array.from(new Set(parsed.rows.map((item) => item.claveBtl)))
    const nominaIds = Array.from(new Set(parsed.rows.map((item) => item.idNomina).filter(Boolean) as string[]))
    const usernames = Array.from(new Set(parsed.rows.map((item) => item.username).filter(Boolean) as string[]))
    const employeeNames = Array.from(new Set(parsed.rows.map((item) => item.nombreDc).filter(Boolean) as string[]))

    const [pdvsResult, employeesByNominaResult, employeesByNameResult, usersResult, supervisorRuleResult] = await Promise.all([
      service
        .from('pdv')
        .select('id, clave_btl, estatus, cadena:cadena_id(codigo, factor_cuota_default)')
        .in('clave_btl', pdvClaves),
      nominaIds.length > 0
        ? service
            .from('empleado')
            .select('id, id_nomina, nombre_completo, puesto, estatus_laboral, supervisor_empleado_id, telefono, correo_electronico')
            .in('id_nomina', nominaIds)
        : Promise.resolve({ data: [], error: null }),
      employeeNames.length > 0
        ? service
            .from('empleado')
            .select('id, id_nomina, nombre_completo, puesto, estatus_laboral, supervisor_empleado_id, telefono, correo_electronico')
            .in('nombre_completo', employeeNames)
        : Promise.resolve({ data: [], error: null }),
      usernames.length > 0
        ? service.from('usuario').select('empleado_id, username').in('username', usernames)
        : Promise.resolve({ data: [], error: null }),
      service
        .from('regla_negocio')
        .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
        .eq('codigo', SUPERVISOR_INHERITANCE_RULE_CODE)
        .maybeSingle(),
    ])

    const bulkInfraError =
      pdvsResult.error?.message ??
      employeesByNominaResult.error?.message ??
      employeesByNameResult.error?.message ??
      usersResult.error?.message ??
      supervisorRuleResult.error?.message

    if (bulkInfraError) {
      return buildImportState({ message: bulkInfraError, conflicts })
    }

    const pdvs = (pdvsResult.data ?? []) as PdvImportRow[]
    const employees = [
      ...((employeesByNominaResult.data ?? []) as EmpleadoImportRow[]),
      ...((employeesByNameResult.data ?? []) as EmpleadoImportRow[]),
    ]
    const users = (usersResult.data ?? []) as UsuarioImportRow[]
    const pdvByClave = new Map(pdvs.map((item) => [item.clave_btl, item]))
    const employeeByNomina = new Map(
      employees
        .filter((item) => item.id_nomina)
        .map((item) => [item.id_nomina as string, item])
    )
    const employeeByName = new Map(employees.map((item) => [item.nombre_completo, item]))
    const employeeIdByUsername = new Map(
      users.filter((item) => item.username).map((item) => [item.username as string, item.empleado_id])
    )
    const employeeById = new Map(employees.map((item) => [item.id, item]))
    const supervisorRule = readSupervisorInheritanceRule(
      (supervisorRuleResult.data as BusinessRuleRow | null) ?? null
    )

    const resolvedEmployeeIds = Array.from(
      new Set(
        parsed.rows
          .map((row) => {
            const employee =
              (row.idNomina ? employeeByNomina.get(row.idNomina) : null) ??
              (row.username ? employeeById.get(employeeIdByUsername.get(row.username) ?? '') : null) ??
              (row.nombreDc ? employeeByName.get(row.nombreDc) : null) ??
              null
            return employee?.id ?? null
          })
          .filter(Boolean) as string[]
      )
    )
    const pdvIds = pdvs.map((item) => item.id)

    const [supervisorsResult, cuentaPdvResult, geocercasResult, horariosResult, employeeAssignmentsResult, pdvAssignmentsResult] =
      await Promise.all([
        pdvIds.length > 0
          ? service
              .from('supervisor_pdv')
              .select('pdv_id, empleado_id, activo, fecha_fin')
              .in('pdv_id', pdvIds)
          : Promise.resolve({ data: [], error: null }),
        pdvIds.length > 0
          ? service
              .from('cuenta_cliente_pdv')
              .select('pdv_id, cuenta_cliente_id, activo, fecha_fin, fecha_inicio')
              .in('pdv_id', pdvIds)
          : Promise.resolve({ data: [], error: null }),
        pdvIds.length > 0
          ? service
              .from('geocerca_pdv')
              .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
              .in('pdv_id', pdvIds)
          : Promise.resolve({ data: [], error: null }),
        pdvIds.length > 0
          ? service.from('horario_pdv').select('id, pdv_id').in('pdv_id', pdvIds).eq('activo', true)
          : Promise.resolve({ data: [], error: null }),
        resolvedEmployeeIds.length > 0
          ? service
              .from('asignacion')
              .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, factor_tiempo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
              .in('empleado_id', resolvedEmployeeIds)
          : Promise.resolve({ data: [], error: null }),
        pdvIds.length > 0
          ? service
              .from('asignacion')
              .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, factor_tiempo, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, cuenta_cliente_id, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
              .in('pdv_id', pdvIds)
          : Promise.resolve({ data: [], error: null }),
      ])

    const relationInfraError =
      supervisorsResult.error?.message ??
      cuentaPdvResult.error?.message ??
      geocercasResult.error?.message ??
      horariosResult.error?.message ??
      employeeAssignmentsResult.error?.message ??
      pdvAssignmentsResult.error?.message

    if (relationInfraError) {
      return buildImportState({ message: relationInfraError, conflicts })
    }

    const supervisors = (supervisorsResult.data ?? []) as SupervisorResolucionRow[]
    const cuentaRelaciones = (cuentaPdvResult.data ?? []) as Array<CuentaClientePdvRow & { pdv_id: string }>
    const geocercas = (geocercasResult.data ?? []) as GeocercaAsignacionRow[]
    const horarios = (horariosResult.data ?? []) as Array<{ id: string; pdv_id: string }>
    const employeeAssignments = (employeeAssignmentsResult.data ?? []) as AsignacionEstadoRow[]
    const pdvAssignments = (pdvAssignmentsResult.data ?? []) as AsignacionEstadoRow[]

    const supervisorByPdv = supervisors.reduce<Record<string, SupervisorResolucionRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push(item)
      acc[item.pdv_id] = current
      return acc
    }, {})
    const cuentaByPdv = cuentaRelaciones.reduce<Record<string, CuentaClientePdvRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push({
        cuenta_cliente_id: item.cuenta_cliente_id,
        activo: item.activo,
        fecha_fin: item.fecha_fin,
      })
      acc[item.pdv_id] = current
      return acc
    }, {})
    const pdvsConGeocerca = new Set(
      geocercas
        .filter((item) => item.latitud !== null && item.longitud !== null && item.radio_tolerancia_metros !== null)
        .map((item) => item.pdv_id)
    )
    const horariosPorPdv = horarios.reduce<Record<string, number>>((acc, item) => {
      acc[item.pdv_id] = (acc[item.pdv_id] ?? 0) + 1
      return acc
    }, {})
    const employeeAssignmentsByEmployee = employeeAssignments.reduce<Record<string, AsignacionEstadoRow[]>>((acc, item) => {
      const current = acc[item.empleado_id] ?? []
      current.push(item)
      acc[item.empleado_id] = current
      return acc
    }, {})
    const historicalAssignmentsByPdv = pdvAssignments.reduce<Record<string, AsignacionEstadoRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push(item)
      acc[item.pdv_id] = current
      return acc
    }, {})
    const existingByKey = new Map(
      employeeAssignments
        .filter((item) => item.naturaleza === 'BASE')
        .map((item) => [
          buildImportComparableKey({
            empleadoId: item.empleado_id,
            pdvId: item.pdv_id,
            tipo: item.tipo,
          }),
          { id: item.id, fechaInicio: item.fecha_inicio },
        ])
    )

    const resolvedRows: Array<{
      parsedRow: (typeof parsed.rows)[number]
      employee: EmpleadoImportRow
      pdv: PdvImportRow
      existingAssignmentId: string | null
      effectiveFechaInicio: string
      supervisorEmpleadoId: string | null
      cuentaClienteId: string | null
      comparableId: string
      payload: Record<string, unknown>
    }> = []

    let unresolvedPdvs = 0
    let unresolvedEmployees = 0

    for (const row of parsed.rows) {
      const pdv = pdvByClave.get(row.claveBtl) ?? null
      const referenciaDc = row.idNomina ?? row.username ?? row.nombreDc ?? null
      if (!pdv) {
        unresolvedPdvs += 1
        conflicts.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          referenciaDc,
          tipo: row.tipo,
          severity: 'ERROR',
          code: 'PDV_NO_RESUELTO',
          label: 'PDV no resuelto',
          message: 'No existe un PDV activo en catalogo con esa clave BTL.',
          source: 'RESOLUCION',
        })
        continue
      }

      const employee =
        (row.idNomina ? employeeByNomina.get(row.idNomina) : null) ??
        (row.username ? employeeById.get(employeeIdByUsername.get(row.username) ?? '') : null) ??
        (row.nombreDc ? employeeByName.get(row.nombreDc) : null) ??
        null

      if (!employee) {
        unresolvedEmployees += 1
        conflicts.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          referenciaDc,
          tipo: row.tipo,
          severity: 'ERROR',
          code: 'EMPLEADO_NO_RESUELTO',
          label: 'DC no resuelta',
          message: 'No fue posible resolver la dermoconsejera por IDNOM, USUARIO o NOMBRE DC.',
          source: 'RESOLUCION',
        })
        continue
      }

      if (employee.puesto !== 'DERMOCONSEJERO' || employee.estatus_laboral !== 'ACTIVO') {
        unresolvedEmployees += 1
        conflicts.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          referenciaDc,
          tipo: row.tipo,
          severity: 'ERROR',
          code: 'EMPLEADO_NO_OPERATIVO',
          label: 'DC no operativa',
          message: 'La persona resuelta no es una dermoconsejera activa y no puede entrar al catalogo maestro.',
          source: 'RESOLUCION',
        })
        continue
      }

      const effectiveFechaInicio = row.fechaInicio ?? importDate
      const supervisorPdv = obtenerSupervisorVigente(supervisorByPdv[pdv.id] ?? [], effectiveFechaInicio)
      const supervisorResuelto = resolveSupervisorInheritance(
        [
          {
            source: 'PDV',
            supervisorEmpleadoId: supervisorPdv?.empleado_id ?? null,
            active: Boolean(supervisorPdv?.empleado_id),
          },
          {
            source: 'EMPLEADO',
            supervisorEmpleadoId: employee.supervisor_empleado_id ?? null,
            active: true,
          },
        ],
        supervisorRule
      )
      const cuentaRelacion = pickCuentaClienteOperativa(cuentaByPdv[pdv.id] ?? [], effectiveFechaInicio)
      const existingAssignment = existingByKey.get(
        buildImportComparableKey({
          empleadoId: employee.id,
          pdvId: pdv.id,
          tipo: row.tipo,
        })
      )

      resolvedRows.push({
        parsedRow: row,
        employee,
        pdv,
        existingAssignmentId: existingAssignment?.id ?? null,
        effectiveFechaInicio,
        supervisorEmpleadoId: supervisorResuelto.supervisorEmpleadoId,
        cuentaClienteId: actor.cuentaClienteId ?? cuentaRelacion?.cuenta_cliente_id ?? null,
        comparableId: existingAssignment?.id ?? `import-row-${row.rowNumber}`,
        payload: {
          cuenta_cliente_id: actor.cuentaClienteId ?? cuentaRelacion?.cuenta_cliente_id ?? null,
          empleado_id: employee.id,
          pdv_id: pdv.id,
          supervisor_empleado_id: supervisorResuelto.supervisorEmpleadoId,
          clave_btl: row.claveBtl,
          tipo: row.tipo,
          factor_tiempo: 1,
          dias_laborales: row.diasLaborales,
          dia_descanso: row.diaDescanso,
          horario_referencia: row.horarioReferencia,
          fecha_inicio: effectiveFechaInicio,
          fecha_fin: null,
          naturaleza: 'BASE',
          retorna_a_base: false,
          prioridad: 100,
          motivo_movimiento: null,
          observaciones: row.observaciones,
          estado_publicacion: 'BORRADOR',
          updated_at: new Date().toISOString(),
        },
      })
    }

    const importedComparableByEmployee = resolvedRows.reduce<Record<string, AssignmentComparableRow[]>>((acc, item) => {
      const current = acc[item.employee.id] ?? []
      current.push({
        id: item.comparableId,
        empleado_id: item.employee.id,
        pdv_id: item.pdv.id,
        supervisor_empleado_id: item.supervisorEmpleadoId,
        tipo: item.parsedRow.tipo,
        fecha_inicio: item.effectiveFechaInicio,
        fecha_fin: null,
        dias_laborales: item.parsedRow.diasLaborales,
      })
      acc[item.employee.id] = current
      return acc
    }, {})

    for (const item of resolvedRows) {
      const currentComparableRows = [
        ...(employeeAssignmentsByEmployee[item.employee.id] ?? []).map(buildComparableRow),
        ...((importedComparableByEmployee[item.employee.id] ?? []).filter((row) => row.id !== item.comparableId)),
      ]

      const issues = evaluarReglasAsignacion(
        {
          id: item.existingAssignmentId,
          cuenta_cliente_id: item.cuentaClienteId,
          empleado_id: item.employee.id,
          pdv_id: item.pdv.id,
          supervisor_empleado_id: item.supervisorEmpleadoId,
          tipo: item.parsedRow.tipo,
          fecha_inicio: item.effectiveFechaInicio,
          fecha_fin: null,
          dias_laborales: item.parsedRow.diasLaborales,
          dia_descanso: item.parsedRow.diaDescanso,
          horario_referencia: item.parsedRow.horarioReferencia,
        },
        {
          employee: buildValidationEmployee(item.employee),
          pdv: buildValidationPdv(item.pdv as unknown as PdvContextRow, geocercas.find((geo) => geo.pdv_id === item.pdv.id) ?? null),
          pdvsConGeocerca,
          supervisoresPorPdv: supervisorByPdv,
          comparableAssignments: currentComparableRows,
          historicalAssignmentsForPdv: (historicalAssignmentsByPdv[item.pdv.id] ?? []).map(buildComparableRow),
          horariosPorPdv,
        }
      )

      for (const issue of issues) {
        conflicts.push({
          rowNumber: item.parsedRow.rowNumber,
          claveBtl: item.parsedRow.claveBtl,
          referenciaDc: item.parsedRow.idNomina ?? item.parsedRow.username ?? item.parsedRow.nombreDc ?? null,
          tipo: item.parsedRow.tipo,
          severity: issue.severity,
          code: issue.code,
          label: issue.label,
          message: issue.message,
          source: 'VALIDACION',
        })
      }
    }

    const conflictCount = conflicts.filter((item) => item.severity === 'ERROR').length
    const alertCount = conflicts.filter((item) => item.severity === 'ALERTA').length
    const noticeCount = conflicts.filter((item) => item.severity === 'AVISO').length
    const summary = {
      parsedRows: parsed.rows.length,
      skippedRows: parsed.skippedRows,
      insertedRows: resolvedRows.filter((item) => !item.existingAssignmentId).length,
      updatedRows: resolvedRows.filter((item) => Boolean(item.existingAssignmentId)).length,
      unresolvedPdvs,
      unresolvedEmployees,
      conflictCount,
      alertCount,
      noticeCount,
    }

    if (conflictCount > 0) {
      return buildImportState({
        message: `Se detectaron ${conflictCount} conflicto(s) en el catalogo maestro. Corrige el archivo antes de importarlo.`,
        conflicts: conflicts.sort((left, right) => (left.rowNumber ?? 0) - (right.rowNumber ?? 0)),
        summary,
      })
    }

    const rowsToInsert = resolvedRows
      .filter((item) => !item.existingAssignmentId)
      .map((item) => item.payload)
    const rowsToUpdate = resolvedRows
      .filter((item) => Boolean(item.existingAssignmentId))
      .map((item) => ({
        id: item.existingAssignmentId as string,
        payload: {
          ...item.payload,
          fecha_inicio:
            existingByKey.get(
              buildImportComparableKey({
                empleadoId: item.employee.id,
                pdvId: item.pdv.id,
                tipo: item.parsedRow.tipo,
              })
            )?.fechaInicio ?? item.effectiveFechaInicio,
        },
      }))

    if (rowsToInsert.length > 0) {
      const { error } = await service.from('asignacion').insert(rowsToInsert)
      if (error) {
        return buildImportState({ message: error.message ?? 'No fue posible importar el catalogo maestro.', conflicts, summary })
      }
    }

    for (const update of rowsToUpdate) {
      const { error } = await service.from('asignacion').update(update.payload).eq('id', update.id)
      if (error) {
        return buildImportState({ message: error.message ?? 'No fue posible actualizar el catalogo maestro.', conflicts, summary })
      }
    }

    await registrarEventoAudit(service, {
      tabla: 'asignacion',
      registroId: 'catalogo-maestro-inicial',
      payload: {
        evento: 'asignacion_catalogo_maestro_importado',
        archivo: uploadedFile.name,
        filas_parseadas: parsed.rows.length,
        filas_insertadas: summary.insertedRows,
        filas_actualizadas: summary.updatedRows,
        filas_omitidas: parsed.skippedRows,
        pdvs_no_resueltos: unresolvedPdvs,
        empleados_no_resueltos: unresolvedEmployees,
        conflictos: conflictCount,
        alertas: alertCount,
        avisos: noticeCount,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: actor.cuentaClienteId,
    })

    revalidatePath('/asignaciones')
    revalidatePath('/dashboard')

    return buildImportState({
      ok: true,
      message: `Catalogo maestro procesado. Nuevas: ${summary.insertedRows}. Actualizadas: ${summary.updatedRows}. Alertas: ${alertCount}. Avisos: ${noticeCount}.`,
      conflicts: conflicts.sort((left, right) => (left.rowNumber ?? 0) - (right.rowNumber ?? 0)),
      summary,
    })
  } catch (error) {
    return buildImportState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible importar el catalogo maestro de asignaciones.',
    })
  }
}

function applyTransitionPlanToWorkingAssignments(
  assignments: AssignmentEngineRow[],
  draft: AssignmentEngineRow,
  enginePlan: AssignmentEngineTransitionPlan
) {
  const nextAssignments = assignments.map((item) => ({ ...item }))
  const draftIndex = nextAssignments.findIndex((item) => item.id === draft.id)

  if (draftIndex >= 0) {
    nextAssignments[draftIndex] = {
      ...nextAssignments[draftIndex],
      ...draft,
      estado_publicacion: 'PUBLICADA',
    }
  } else {
    nextAssignments.push({
      ...draft,
      estado_publicacion: 'PUBLICADA',
    })
  }

  for (const update of enginePlan.updates) {
    const index = nextAssignments.findIndex((item) => item.id === update.id)
    if (index >= 0) {
      nextAssignments[index] = {
        ...nextAssignments[index],
        ...update.patch,
      }
    }
  }

  if (enginePlan.continuationInsert) {
    nextAssignments.push({
      id: `auto-${draft.id}`,
      ...enginePlan.continuationInsert,
    })
  }

  return nextAssignments
}

export async function publicarCatalogoMaestroAsignaciones(
  _prevState: PublicarCatalogoAsignacionesState,
  _formData: FormData
): Promise<PublicarCatalogoAsignacionesState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = createServiceClient() as TypedSupabaseClient
    const { data: draftRowsRaw, error: draftRowsError } = await service
      .from('asignacion')
      .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
      .eq('cuenta_cliente_id', actor.cuentaClienteId)
      .eq('naturaleza', 'BASE')
      .eq('estado_publicacion', 'BORRADOR')
      .order('empleado_id', { ascending: true })
      .order('fecha_inicio', { ascending: true })

    if (draftRowsError) {
      return buildPublishState({ message: draftRowsError.message })
    }

    const draftRows = (draftRowsRaw ?? []) as AsignacionEstadoRow[]
    if (draftRows.length === 0) {
      return buildPublishState({
        ok: true,
        message: 'No hay asignaciones base en borrador pendientes por aprobar.',
      })
    }

    const employeeIds = Array.from(new Set(draftRows.map((item) => item.empleado_id)))
    const pdvIds = Array.from(new Set(draftRows.map((item) => item.pdv_id)))

    const [employeesResult, pdvsResult, supervisorsResult, cuentaPdvResult, geocercasResult, horariosResult, employeeAssignmentsResult, supervisorRuleResult] =
      await Promise.all([
        service
          .from('empleado')
          .select('id, id_nomina, nombre_completo, puesto, estatus_laboral, supervisor_empleado_id, telefono, correo_electronico')
          .in('id', employeeIds),
        service
          .from('pdv')
          .select('id, clave_btl, estatus, cadena:cadena_id(codigo, factor_cuota_default)')
          .in('id', pdvIds),
        service
          .from('supervisor_pdv')
          .select('pdv_id, empleado_id, activo, fecha_fin')
          .in('pdv_id', pdvIds),
        service
          .from('cuenta_cliente_pdv')
          .select('pdv_id, cuenta_cliente_id, activo, fecha_fin, fecha_inicio')
          .in('pdv_id', pdvIds),
        service
          .from('geocerca_pdv')
          .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
          .in('pdv_id', pdvIds),
        service.from('horario_pdv').select('id, pdv_id').in('pdv_id', pdvIds).eq('activo', true),
        service
          .from('asignacion')
          .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
          .in('empleado_id', employeeIds),
        service
          .from('regla_negocio')
          .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
          .eq('codigo', SUPERVISOR_INHERITANCE_RULE_CODE)
          .maybeSingle(),
      ])

    const infraError =
      employeesResult.error?.message ??
      pdvsResult.error?.message ??
      supervisorsResult.error?.message ??
      cuentaPdvResult.error?.message ??
      geocercasResult.error?.message ??
      horariosResult.error?.message ??
      employeeAssignmentsResult.error?.message ??
      supervisorRuleResult.error?.message

    if (infraError) {
      return buildPublishState({ message: infraError })
    }

    const employees = (employeesResult.data ?? []) as EmpleadoImportRow[]
    const pdvs = (pdvsResult.data ?? []) as PdvImportRow[]
    const supervisors = (supervisorsResult.data ?? []) as SupervisorResolucionRow[]
    const cuentaRelaciones = (cuentaPdvResult.data ?? []) as Array<CuentaClientePdvRow & { pdv_id: string }>
    const geocercas = (geocercasResult.data ?? []) as GeocercaAsignacionRow[]
    const horarios = (horariosResult.data ?? []) as Array<{ id: string; pdv_id: string }>
    const employeeAssignments = (employeeAssignmentsResult.data ?? []) as AsignacionEstadoRow[]
    const supervisorRule = readSupervisorInheritanceRule(
      (supervisorRuleResult.data as BusinessRuleRow | null) ?? null
    )

    const employeeById = new Map(employees.map((item) => [item.id, item]))
    const pdvById = new Map(pdvs.map((item) => [item.id, item]))
    const supervisorByPdv = supervisors.reduce<Record<string, SupervisorResolucionRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push(item)
      acc[item.pdv_id] = current
      return acc
    }, {})
    const cuentaByPdv = cuentaRelaciones.reduce<Record<string, CuentaClientePdvRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push({
        cuenta_cliente_id: item.cuenta_cliente_id,
        activo: item.activo,
        fecha_fin: item.fecha_fin,
      })
      acc[item.pdv_id] = current
      return acc
    }, {})
    const pdvsConGeocerca = new Set(
      geocercas
        .filter((item) => item.latitud !== null && item.longitud !== null && item.radio_tolerancia_metros !== null)
        .map((item) => item.pdv_id)
    )
    const horariosPorPdv = horarios.reduce<Record<string, number>>((acc, item) => {
      acc[item.pdv_id] = (acc[item.pdv_id] ?? 0) + 1
      return acc
    }, {})
    const geocercaByPdv = new Map(geocercas.map((item) => [item.pdv_id, item]))
    const historicalAssignmentsByPdv = employeeAssignments.reduce<Record<string, AsignacionEstadoRow[]>>((acc, item) => {
      const current = acc[item.pdv_id] ?? []
      current.push(item)
      acc[item.pdv_id] = current
      return acc
    }, {})
    const workingAssignmentsByEmployee = employeeAssignments.reduce<Record<string, AssignmentEngineRow[]>>((acc, item) => {
      const current = acc[item.empleado_id] ?? []
      current.push({ ...item })
      acc[item.empleado_id] = current
      return acc
    }, {})

    const conflicts: AssignmentImportConflict[] = []
    const approvalPlans: Array<{
      row: AsignacionEstadoRow
      supervisorEmpleadoId: string | null
      cuentaClienteId: string | null
      enginePlan: AssignmentEngineTransitionPlan
      employeeId: string
      materializationRange: { fechaInicio: string; fechaFin: string } | null
    }> = []

    for (const row of draftRows) {
      const employee = employeeById.get(row.empleado_id) ?? null
      const pdv = pdvById.get(row.pdv_id) ?? null

      if (!employee) {
        conflicts.push({
          rowNumber: null,
          claveBtl: null,
          referenciaDc: row.empleado_id,
          tipo: row.tipo,
          severity: 'ERROR',
          code: 'EMPLEADO_NO_RESUELTO',
          label: 'DC no resuelta',
          message: 'La asignacion en borrador apunta a una dermoconsejera inexistente o inaccesible.',
          source: 'RESOLUCION',
        })
        continue
      }

      if (!pdv) {
        conflicts.push({
          rowNumber: null,
          claveBtl: null,
          referenciaDc: employee.id_nomina ?? employee.nombre_completo,
          tipo: row.tipo,
          severity: 'ERROR',
          code: 'PDV_NO_RESUELTO',
          label: 'PDV no resuelto',
          message: 'La asignacion en borrador apunta a un PDV inexistente o inaccesible.',
          source: 'RESOLUCION',
        })
        continue
      }

      const supervisorPdv = obtenerSupervisorVigente(supervisorByPdv[pdv.id] ?? [], row.fecha_inicio)
      const supervisorResuelto = resolveSupervisorInheritance(
        [
          {
            source: 'PDV',
            supervisorEmpleadoId: supervisorPdv?.empleado_id ?? null,
            active: Boolean(supervisorPdv?.empleado_id),
          },
          {
            source: 'EMPLEADO',
            supervisorEmpleadoId: employee.supervisor_empleado_id ?? null,
            active: true,
          },
          {
            source: 'ASIGNACION',
            supervisorEmpleadoId: row.supervisor_empleado_id,
            active: true,
          },
        ],
        supervisorRule
      )
      const cuentaRelacion = pickCuentaClienteOperativa(cuentaByPdv[pdv.id] ?? [], row.fecha_inicio)
      const cuentaClienteId = row.cuenta_cliente_id ?? actor.cuentaClienteId ?? cuentaRelacion?.cuenta_cliente_id ?? null
      const workingRows = workingAssignmentsByEmployee[row.empleado_id] ?? []
      const draftForEngine: AssignmentEngineRow = {
        ...row,
        cuenta_cliente_id: cuentaClienteId,
        supervisor_empleado_id: supervisorResuelto.supervisorEmpleadoId,
      }
      const enginePlan = buildAssignmentTransitionPlan(draftForEngine, workingRows)

      const issues = evaluarReglasAsignacion(
        {
          ...row,
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: supervisorResuelto.supervisorEmpleadoId,
        },
        {
          employee: buildValidationEmployee(employee),
          pdv: buildValidationPdv(pdv as unknown as PdvContextRow, geocercaByPdv.get(pdv.id) ?? null),
          pdvsConGeocerca,
          supervisoresPorPdv: supervisorByPdv,
          comparableAssignments: workingRows
            .map(buildComparableRow)
            .filter((item) => !enginePlan.ignoredComparableIds.includes(item.id)),
          historicalAssignmentsForPdv: (historicalAssignmentsByPdv[pdv.id] ?? []).map(buildComparableRow),
          horariosPorPdv,
        }
      )

      for (const issue of issues) {
        conflicts.push({
          rowNumber: null,
          claveBtl: pdv.clave_btl ?? null,
          referenciaDc: employee.id_nomina ?? employee.nombre_completo,
          tipo: row.tipo,
          severity: issue.severity,
          code: issue.code,
          label: issue.label,
          message: issue.message,
          source: 'VALIDACION',
        })
      }

      if (issues.some((issue) => issue.severity === 'ERROR')) {
        continue
      }

      workingAssignmentsByEmployee[row.empleado_id] = applyTransitionPlanToWorkingAssignments(
        workingRows,
        draftForEngine,
        enginePlan
      )

      approvalPlans.push({
        row,
        supervisorEmpleadoId: supervisorResuelto.supervisorEmpleadoId,
        cuentaClienteId,
        enginePlan,
        employeeId: row.empleado_id,
        materializationRange: resolveMaterializationImpactRange(row.fecha_inicio, row.fecha_fin),
      })
    }

    const errorCount = conflicts.filter((item) => item.severity === 'ERROR').length
    if (errorCount > 0) {
      return buildPublishState({
        message: 'Se detectaron conflictos que bloquean la aprobacion del catalogo maestro. Corrige el catalogo antes de continuar.',
        conflicts,
      })
    }

    for (const plan of approvalPlans) {
      const { error: publishError } = await service
        .from('asignacion')
        .update({
          estado_publicacion: 'PUBLICADA',
          supervisor_empleado_id: plan.supervisorEmpleadoId,
          cuenta_cliente_id: plan.cuentaClienteId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.row.id)

      if (publishError) {
        return buildPublishState({ message: publishError.message, conflicts })
      }

      for (const update of plan.enginePlan.updates) {
        const { error } = await service
          .from('asignacion')
          .update({
            ...update.patch,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id)

        if (error) {
          return buildPublishState({ message: error.message, conflicts })
        }
      }

      if (plan.enginePlan.continuationInsert) {
        const { error } = await service.from('asignacion').insert({
          ...plan.enginePlan.continuationInsert,
          updated_at: new Date().toISOString(),
        })

        if (error) {
          return buildPublishState({ message: error.message, conflicts })
        }
      }
    }

    const materializationInputs = approvalPlans
      .filter((plan) => Boolean(plan.materializationRange))
      .map((plan) => ({
        empleadoId: plan.employeeId,
        fechaInicio: plan.materializationRange!.fechaInicio,
        fechaFin: plan.materializationRange!.fechaFin,
        motivo: 'CATALOGO_MAESTRO_APROBADO',
        payload: {
          asignacion_id: plan.row.id,
          origen: 'CATALOGO_MAESTRO_APROBADO',
        },
      }))

    if (materializationInputs.length > 0) {
      await enqueueAndProcessMaterializedAssignments(materializationInputs, service)
    }

    await registrarEventoAudit(service, {
      tabla: 'asignacion',
      registroId: 'catalogo-maestro-aprobado',
      payload: {
        evento: 'asignacion_catalogo_maestro_aprobado',
        asignaciones_publicadas: approvalPlans.length,
        empleados_materializados: Array.from(new Set(materializationInputs.map((item) => item.empleadoId))).length,
        alertas: conflicts.filter((item) => item.severity === 'ALERTA').length,
        avisos: conflicts.filter((item) => item.severity === 'AVISO').length,
        ventana_operativa: buildOperationalWindowLabel(),
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: actor.cuentaClienteId,
    })

    revalidatePath('/asignaciones')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

    return buildPublishState({
      ok: true,
      message: 'Catalogo maestro aprobado. Se publicaron las bases y se materializo la ventana operativa del mes actual y el siguiente.',
      conflicts,
      publishedRows: approvalPlans.length,
      materializedEmployees: Array.from(new Set(materializationInputs.map((item) => item.empleadoId))).length,
      materializedWindowLabel: buildOperationalWindowLabel(),
    })
  } catch (error) {
    return buildPublishState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible aprobar el catalogo maestro de asignaciones.',
    })
  }
}

export async function publicarOperacionMensualAsignaciones(
  _prevState: PublicarCatalogoAsignacionesState,
  formData: FormData
): Promise<PublicarCatalogoAsignacionesState> {
  const actor = await requerirAdministradorActivo()
  const monthRaw = String(formData.get('operational_month') ?? '').trim()
  const targetMonth = isValidMonthInput(monthRaw) ? monthRaw : getCurrentMxMonth()

  try {
    const service = createServiceClient() as TypedSupabaseClient
    const { data: publishedRowsRaw, error: publishedRowsError } = await service
      .from('asignacion')
      .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
      .eq('cuenta_cliente_id', actor.cuentaClienteId)
      .eq('naturaleza', 'BASE')
      .eq('estado_publicacion', 'PUBLICADA')
      .order('empleado_id', { ascending: true })
      .order('fecha_inicio', { ascending: true })

    if (publishedRowsError) {
      return buildPublishState({ message: publishedRowsError.message })
    }

    const publishedRows = (publishedRowsRaw ?? []) as AsignacionEstadoRow[]
    if (publishedRows.length === 0) {
      return buildPublishState({
        ok: true,
        message: 'No hay asignaciones base publicadas para generar la operacion mensual.',
        materializedWindowLabel: formatMonthLabel(targetMonth),
      })
    }

    const eligibleRows = publishedRows.filter((row) =>
      Boolean(buildMonthlyMaterializationRange(row.fecha_inicio, row.fecha_fin, targetMonth))
    )

    if (eligibleRows.length === 0) {
      return buildPublishState({
        ok: true,
        message: `No hay asignaciones base activas que intersecten con ${formatMonthLabel(targetMonth)}.`,
        materializedWindowLabel: formatMonthLabel(targetMonth),
      })
    }

    const employeeIds = Array.from(new Set(eligibleRows.map((row) => row.empleado_id)))
    const materializationRange = {
      fechaInicio: startOfMonth(targetMonth),
      fechaFin: endOfMonth(targetMonth),
    }
    const materializationInputs = employeeIds.map((empleadoId) => ({
      empleadoId,
      fechaInicio: materializationRange.fechaInicio,
      fechaFin: materializationRange.fechaFin,
      motivo: 'OPERACION_MENSUAL_PUBLICADA',
      payload: {
        month: targetMonth,
      },
    }))

    await enqueueAndProcessMaterializedAssignments(materializationInputs, service)

    await registrarEventoAudit(service, {
      tabla: 'asignacion',
      registroId: `operacion-mensual-${targetMonth}`,
      payload: {
        evento: 'asignacion_operacion_mensual_publicada',
        month: targetMonth,
        asignaciones_cubiertas: eligibleRows.length,
        empleados_materializados: employeeIds.length,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: actor.cuentaClienteId,
    })

    revalidatePath('/asignaciones')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

    return buildPublishState({
      ok: true,
      message: `Operacion mensual publicada para ${formatMonthLabel(targetMonth)}.`,
      publishedRows: eligibleRows.length,
      materializedEmployees: employeeIds.length,
      materializedWindowLabel: formatMonthLabel(targetMonth),
    })
  } catch (error) {
    return buildPublishState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible publicar la operacion mensual de asignaciones.',
      materializedWindowLabel: formatMonthLabel(targetMonth),
    })
  }
}
function normalizeTimeText(value: string | null) {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return normalized
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.slice(0, 5)
  }

  return null
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function importarHorariosSanPabloSemanales(
  _prevState: ImportarCatalogoAsignacionesState,
  formData: FormData
): Promise<ImportarCatalogoAsignacionesState> {
  const actor = await requerirAdministradorActivo()

  try {
    const uploadedFile = formData.get('horarios_san_pablo_file')

    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
      return buildImportState({ message: 'Adjunta un archivo XLSX para importar los horarios semanales.' })
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.xlsx')) {
      return buildImportState({ message: 'Los horarios semanales deben estar en formato XLSX.' })
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const parsed = parseAssignmentWeeklyScheduleWorkbook(buffer)
    const service = createServiceClient() as TypedSupabaseClient

    const pdvClaves = Array.from(new Set(parsed.rows.map((item) => item.claveBtl)))
    const [pdvsResult, turnCatalogResult] = await Promise.all([
      service
        .from('pdv')
        .select('id, clave_btl, cadena:cadena_id(codigo, nombre)')
        .in('clave_btl', pdvClaves),
      service.from('configuracion').select('valor').eq('clave', TURNOS_CONFIG_KEY).maybeSingle(),
    ])

    const infraError = pdvsResult.error?.message ?? turnCatalogResult.error?.message
    if (infraError) {
      return buildImportState({ message: infraError })
    }

    const pdvs = (pdvsResult.data ?? []) as Array<{
      id: string
      clave_btl: string
      cadena: Array<{ codigo: string | null; nombre: string | null }> | null
    }>
    const pdvByClave = new Map(pdvs.map((item) => [item.clave_btl, item]))
    const turnCatalog = parseTurnosCatalogo((turnCatalogResult.data as { valor: unknown } | null)?.valor)
    const turnByCode = new Map(turnCatalog.map((item) => [item.nomenclatura, item]))

    let unresolvedPdvs = 0
    let nonSanPabloPdvs = 0
    let invalidTurns = 0
    let skipped = parsed.skippedRows
    const rowsToInsert: Array<Record<string, unknown>> = []
    const affectedByPdv = new Map<string, Set<string>>()

    for (const row of parsed.rows) {
      const pdv = pdvByClave.get(row.claveBtl)
      if (!pdv) {
        unresolvedPdvs += 1
        skipped += 1
        continue
      }

      const cadena = Array.isArray(pdv.cadena) ? pdv.cadena[0] ?? null : pdv.cadena ?? null
      if (cadena?.codigo !== 'SAN_PABLO') {
        nonSanPabloPdvs += 1
        skipped += 1
        continue
      }

      const catalogTurn = row.codigoTurno ? turnByCode.get(row.codigoTurno) ?? null : null
      const horaEntrada = normalizeTimeText(row.horaEntrada ?? catalogTurn?.horaEntrada ?? null)
      const horaSalida = normalizeTimeText(row.horaSalida ?? catalogTurn?.horaSalida ?? null)

      if (!horaEntrada || !horaSalida) {
        invalidTurns += 1
        skipped += 1
        continue
      }

      rowsToInsert.push({
        pdv_id: pdv.id,
        nivel_prioridad: 1,
        fecha_especifica: row.fechaEspecifica,
        dia_semana: row.diaSemana,
        codigo_turno: row.codigoTurno,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        activo: true,
        observaciones: row.observaciones,
      })

      const affectedDates = affectedByPdv.get(pdv.id) ?? new Set<string>()
      affectedDates.add(row.fechaEspecifica)
      affectedByPdv.set(pdv.id, affectedDates)
    }

    const affectedPdvIds = Array.from(affectedByPdv.keys())
    if (affectedPdvIds.length > 0) {
      const { data: existingRows, error: existingError } = await service
        .from('horario_pdv')
        .select('id, pdv_id, fecha_especifica')
        .in('pdv_id', affectedPdvIds)
        .eq('activo', true)

      if (existingError) {
        return buildImportState({ message: existingError.message })
      }

      const idsToDeactivate = ((existingRows ?? []) as Array<{ id: string; pdv_id: string; fecha_especifica: string | null }>)
        .filter((item) => item.fecha_especifica && affectedByPdv.get(item.pdv_id)?.has(item.fecha_especifica))
        .map((item) => item.id)

      for (const idsChunk of chunkArray(idsToDeactivate, 200)) {
        const { error } = await service
          .from('horario_pdv')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .in('id', idsChunk)

        if (error) {
          return buildImportState({ message: error.message ?? 'No fue posible reemplazar horarios previos de la semana.' })
        }
      }
    }

    if (rowsToInsert.length > 0) {
      const { error } = await service.from('horario_pdv').insert(rowsToInsert)
      if (error) {
        return buildImportState({ message: error.message ?? 'No fue posible importar los horarios semanales.' })
      }
    }

    await registrarEventoAudit(service, {
      tabla: 'horario_pdv',
      registroId: 'horarios-san-pablo-semanales',
      payload: {
        evento: 'horarios_san_pablo_importados',
        archivo: uploadedFile.name,
        filas_parseadas: parsed.rows.length,
        filas_insertadas: rowsToInsert.length,
        filas_omitidas: skipped,
        pdvs_no_resueltos: unresolvedPdvs,
        pdvs_fuera_san_pablo: nonSanPabloPdvs,
        filas_sin_turno_valido: invalidTurns,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: actor.cuentaClienteId,
    })

    revalidatePath('/asignaciones')
    revalidatePath('/pdvs')
    revalidatePath('/dashboard')

    const detailMessage = unresolvedPdvs + nonSanPabloPdvs + invalidTurns > 0
      ? ' Sin resolver -> PDVs: ' + unresolvedPdvs + ', fuera de San Pablo: ' + nonSanPabloPdvs + ', filas sin turno valido: ' + invalidTurns + '.'
      : ''

    return buildImportState({
      ok: true,
      message: 'Horarios San Pablo procesados. Nuevos: ' + rowsToInsert.length + '. Omitidos: ' + skipped + '.' + detailMessage,
    })
  } catch (error) {
    return buildImportState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible importar los horarios semanales de San Pablo.',
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
    .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion')
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
  let enginePlan: AssignmentEngineTransitionPlan = {
    ignoredComparableIds: [] as string[],
    updates: [],
    continuationInsert: null,
  }

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

    enginePlan = buildAssignmentTransitionPlan(
      {
        id: asignacionActual.id,
        cuenta_cliente_id: asignacionActual.cuenta_cliente_id,
        empleado_id: asignacionActual.empleado_id,
        pdv_id: asignacionActual.pdv_id,
        supervisor_empleado_id: supervisorResueltoId,
        tipo: asignacionActual.tipo,
        factor_tiempo: asignacionActual.factor_tiempo,
        dias_laborales: asignacionActual.dias_laborales,
        dia_descanso: asignacionActual.dia_descanso,
        horario_referencia: asignacionActual.horario_referencia,
        fecha_inicio: asignacionActual.fecha_inicio,
        fecha_fin: asignacionActual.fecha_fin,
        naturaleza: asignacionActual.naturaleza,
        retorna_a_base: asignacionActual.retorna_a_base,
        asignacion_base_id: asignacionActual.asignacion_base_id,
        asignacion_origen_id: asignacionActual.asignacion_origen_id,
        prioridad: asignacionActual.prioridad,
        motivo_movimiento: asignacionActual.motivo_movimiento,
        observaciones: asignacionActual.observaciones,
      } satisfies AssignmentEngineDraft,
      contexto.comparableRows as AssignmentEngineRow[]
    )

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
        comparableAssignments: contexto.comparables.filter(
          (item) => !enginePlan.ignoredComparableIds.includes(item.id)
        ),
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

  if (estadoDestino === 'PUBLICADA') {
    for (const update of enginePlan.updates) {
      const { error } = await supabase
        .from('asignacion')
        .update({
          ...update.patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)

      if (error) {
        return buildState({ message: error.message })
      }
    }

    if (enginePlan.continuationInsert) {
      const { error } = await supabase.from('asignacion').insert({
        ...enginePlan.continuationInsert,
        supervisor_empleado_id: enginePlan.continuationInsert.supervisor_empleado_id,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        return buildState({ message: error.message })
      }
    }
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
      engine_updates: enginePlan.updates.map((item) => ({ id: item.id, patch: item.patch })),
      retorno_generado: Boolean(enginePlan.continuationInsert),
      issues: issues.map((item) => ({ code: item.code, severity: item.severity })),
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: asignacionActual.cuenta_cliente_id,
  })

  await refreshMaterializedAssignmentRanges([
    {
      empleadoId: asignacionActual.empleado_id,
      fechaInicio: asignacionActual.fecha_inicio,
      fechaFin: asignacionActual.fecha_fin,
      motivo: estadoDestino === 'PUBLICADA' ? 'ASIGNACION_PUBLICADA' : 'ASIGNACION_REGRESADA_BORRADOR',
      payload: {
        asignacion_id: asignacionId,
        estado_destino: estadoDestino,
      },
    },
  ])

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
