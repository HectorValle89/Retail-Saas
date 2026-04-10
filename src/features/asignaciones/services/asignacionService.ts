import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import { buildRecruitmentCoverageBoard, type PdvCoberturaBoardItem, type RecruitmentCoverageSummary } from '@/features/empleados/services/pdvCoberturaService'
import {
  buildPdvRotationMasterBoard,
  type PdvRotacionBoardData,
  type PdvRotacionFilter,
} from './pdvRotationMasterService'
import { parseTurnosCatalogo } from '@/features/configuracion/configuracionCatalog'
import { isOperablePdvStatus } from '@/features/pdvs/lib/pdvStatus'
import type { Asignacion, CuentaCliente, Empleado, Pdv } from '@/types/database'
import {
  evaluarReglasAsignacion,
  resumirIssuesAsignacion,
  type AssignmentComparableRow,
  type AssignmentIssue,
  type AssignmentIssueSeverity,
  type AssignmentValidationEmployee,
  type AssignmentValidationPdv,
  type SupervisorAsignacionRow,
} from '../lib/assignmentValidation'
import {
  evaluateRotationMasterImpact,
  loadAssignmentRotationValidationData,
} from '../lib/assignmentRotationValidation'
import { buildAssignmentScopeOrFilter } from '../lib/assignmentQuery'
import type { AssignmentEngineNature } from '../lib/assignmentEngine'
import {
  getMaterializedMonthlyCalendar,
  type MaterializedMonthlyCalendar,
  type MaterializedMonthlyFilters,
} from './asignacionMaterializationService'

type MaybeMany<T> = T | T[] | null
type TypedSupabaseClient = SupabaseClient<any>

export type AssignmentWorkspaceView = 'asignaciones' | 'pdvs' | 'calendario'
export type AssignmentWorkspaceModal = 'catalogo' | 'horarios' | 'manual' | null
export type AssignmentListState = 'BORRADOR' | 'PUBLICADA' | 'ACTIVAS'
export type AssignmentPdvBoardState = 'ALL' | 'ASIGNADOS' | 'RESERVADOS' | 'SIN_ASIGNACION' | 'INACTIVOS'
export type AssignmentPdvRotationState = PdvRotacionFilter
export type AssignmentPdvPanel = 'COBERTURA' | 'ROTACION'

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre'>

type EmpleadoRow = Pick<
  Empleado,
  | 'id'
  | 'nombre_completo'
  | 'puesto'
  | 'estatus_laboral'
  | 'telefono'
  | 'correo_electronico'
  | 'supervisor_empleado_id'
  | 'zona'
>

type CadenaRelacion = {
  codigo: string | null
  nombre: string | null
  factor_cuota_default: number | null
}

type GeocercaRelacion = {
  latitud: number | null
  longitud: number | null
  radio_tolerancia_metros: number | null
}

interface PdvRow
  extends Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'estatus' | 'horario_entrada' | 'horario_salida'> {
  cadena: MaybeMany<CadenaRelacion>
  geocerca_pdv: MaybeMany<GeocercaRelacion>
}

interface AsignacionListadoQueryRow
  extends Pick<
    Asignacion,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'pdv_id'
    | 'supervisor_empleado_id'
    | 'tipo'
    | 'factor_tiempo'
    | 'dias_laborales'
    | 'dia_descanso'
    | 'horario_referencia'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'naturaleza'
    | 'retorna_a_base'
    | 'asignacion_base_id'
    | 'asignacion_origen_id'
    | 'prioridad'
    | 'motivo_movimiento'
    | 'generado_automaticamente'
    | 'estado_publicacion'
    | 'observaciones'
    | 'created_at'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRow>
  pdv: MaybeMany<PdvRow>
}

interface AsignacionComparableRow
  extends Pick<
    Asignacion,
    | 'id'
    | 'empleado_id'
    | 'pdv_id'
    | 'supervisor_empleado_id'
    | 'tipo'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'dias_laborales'
  > {}

interface CuentaClientePdvRow {
  pdv_id: string
  cuenta_cliente_id: string
  activo: boolean
  fecha_fin: string | null
}

interface HorarioPdvRow {
  pdv_id: string
}

export interface AsignacionResumen {
  total: number
  borrador: number
  publicada: number
  activas: number
}

export interface AsignacionListadoItem {
  id: string
  cuentaClienteId: string | null
  cuentaCliente: string | null
  empleadoId: string
  empleado: string | null
  pdvId: string
  pdv: string | null
  pdvClaveBtl: string | null
  tipo: string
  horario: string | null
  diasLaborales: string | null
  diaDescanso: string | null
  fechaInicio: string
  fechaFin: string | null
  zona: string | null
  cadena: string | null
  estadoPublicacion: string
  naturaleza: AssignmentEngineNature
  retornaABase: boolean
  prioridad: number
  motivoMovimiento: string | null
  issues: AssignmentIssue[]
  bloqueada: boolean
  alertasCount: number
  requiereConfirmacionAlertas: boolean
}

export interface AsignacionEmpleadoOption {
  id: string
  nombre: string
  zona: string | null
}

export interface AsignacionPdvOption {
  id: string
  nombre: string
  claveBtl: string
  cadena: string | null
  zona: string | null
}

export interface AsignacionTurnoOption {
  value: string
  label: string
}

export interface AsignacionCalendarioFilters {
  month: string
  supervisorEmpleadoId: string | null
  estadoOperativo: MaterializedMonthlyFilters['estadoOperativo'] | null
}

export interface AsignacionSupervisorCalendarioOption {
  id: string
  nombre: string
}

export interface AsignacionesShellSummary {
  total: number
  borrador: number
  publicada: number
  activas: number
}

export interface AsignacionesAssignmentsTabData {
  estado: AssignmentListState
  page: number
  pageSize: number
  total: number
  items: AsignacionListadoItem[]
}

export interface AsignacionesModalCatalogData {
  draftBaseCount: number
  approvedBaseCount: number
}

export interface AsignacionesManualModalData {
  empleadosDisponibles: AsignacionEmpleadoOption[]
  pdvsDisponibles: AsignacionPdvOption[]
  turnosDisponibles: AsignacionTurnoOption[]
}

export interface AsignacionesPdvsBoardData {
  summary: RecruitmentCoverageSummary | null
  items: PdvCoberturaBoardItem[]
  estado: AssignmentPdvBoardState
  cadena: string
  ciudad: string
  zona: string
  cadenasDisponibles: string[]
  ciudadesDisponibles: string[]
  zonasDisponibles: string[]
  rotacion: PdvRotacionBoardData | null
  rotacionClasificacion: AssignmentPdvRotationState
  grupoRotacion: string
  panel: AssignmentPdvPanel
}

export interface AsignacionesCalendarData {
  calendarioMensual: MaterializedMonthlyCalendar | null
  filtros: AsignacionCalendarioFilters
  supervisores: AsignacionSupervisorCalendarioOption[]
  supervisorBloqueado: boolean
  mensaje?: string
}

export interface AsignacionesPanelData {
  activeView: AssignmentWorkspaceView
  activeModal: AssignmentWorkspaceModal
  shell: AsignacionesShellSummary
  resumen: AsignacionResumen
  puedeGestionar: boolean
  assignmentsView: AsignacionesAssignmentsTabData | null
  pdvsView: AsignacionesPdvsBoardData | null
  calendarView: AsignacionesCalendarData | null
  catalogModal: AsignacionesModalCatalogData | null
  manualModal: AsignacionesManualModalData | null
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const EMPTY_DATA: AsignacionesPanelData = {
  activeView: 'asignaciones',
  activeModal: null,
  shell: {
    total: 0,
    borrador: 0,
    publicada: 0,
    activas: 0,
  },
  resumen: {
    total: 0,
    borrador: 0,
    publicada: 0,
    activas: 0,
  },
  puedeGestionar: false,
  assignmentsView: null,
  pdvsView: null,
  calendarView: null,
  catalogModal: null,
  manualModal: null,
  infraestructuraLista: false,
}

const CALENDARIO_ESTADOS_OPERATIVOS = [
  'ASIGNADA_PDV',
  'FORMACION',
  'VACACIONES',
  'INCAPACIDAD',
  'FALTA_JUSTIFICADA',
  'SIN_ASIGNACION',
] as const satisfies ReadonlyArray<NonNullable<MaterializedMonthlyFilters['estadoOperativo']>>

interface ObtenerPanelAsignacionesOptions {
  view?: string | null
  modal?: string | null
  page?: number | null
  assignmentState?: string | null
  filters?: {
    month?: string | null
    supervisorEmpleadoId?: string | null
    estadoOperativo?: string | null
    pdvPanel?: string | null
    pdvState?: string | null
    cadena?: string | null
    ciudad?: string | null
    zona?: string | null
    rotacionClasificacion?: string | null
    grupoRotacion?: string | null
  }
}

function first<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildComparableRow(row: AsignacionComparableRow): AssignmentComparableRow {
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

function buildTurnoLabel(item: ReturnType<typeof parseTurnosCatalogo>[number]) {
  const parts = [item.nomenclatura]

  if (item.turno) {
    parts.push(item.turno)
  }

  if (item.horario) {
    parts.push(item.horario)
  } else if (item.horaEntrada && item.horaSalida) {
    parts.push(`${item.horaEntrada.slice(0, 5)}-${item.horaSalida.slice(0, 5)}`)
  }

  return parts.join(' - ')
}

function getCurrentMonthValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getCurrentDayValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function normalizeView(value: string | null | undefined): AssignmentWorkspaceView {
  return value === 'pdvs' || value === 'calendario' ? value : 'asignaciones'
}

function normalizeModal(value: string | null | undefined): AssignmentWorkspaceModal {
  return value === 'catalogo' || value === 'horarios' || value === 'manual' ? value : null
}

function normalizeAssignmentState(value: string | null | undefined): AssignmentListState {
  return value === 'PUBLICADA' || value === 'ACTIVAS' ? value : 'BORRADOR'
}

function normalizePdvBoardState(value: string | null | undefined): AssignmentPdvBoardState {
  if (
    value === 'ASIGNADOS' ||
    value === 'RESERVADOS' ||
    value === 'SIN_ASIGNACION' ||
    value === 'INACTIVOS'
  ) {
    return value
  }

  return 'ALL'
}

function normalizeRotationFilter(value: string | null | undefined): AssignmentPdvRotationState {
  if (value === 'FIJO' || value === 'ROTATIVO' || value === 'PENDIENTE' || value === 'INCOMPLETO') {
    return value
  }

  return 'ALL'
}

function normalizePdvPanel(value: string | null | undefined): AssignmentPdvPanel {
  return value === 'ROTACION' ? 'ROTACION' : 'COBERTURA'
}


function normalizeTextFilter(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalizePositiveInt(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function normalizeCalendarMonth(value: string | null | undefined) {
  return /^\d{4}-\d{2}$/.test(String(value ?? '').trim()) ? String(value).trim() : getCurrentMonthValue()
}

function normalizeCalendarEstadoOperativo(
  value: string | null | undefined
): MaterializedMonthlyFilters['estadoOperativo'] | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) {
    return null
  }

  return CALENDARIO_ESTADOS_OPERATIVOS.includes(
    normalized as (typeof CALENDARIO_ESTADOS_OPERATIVOS)[number]
  )
    ? (normalized as MaterializedMonthlyFilters['estadoOperativo'])
    : null
}

function applyAccountScope<TQuery extends { eq: (...args: any[]) => TQuery }>(
  query: TQuery,
  actor: ActorActual
) {
  if (!actor.cuentaClienteId) {
    return query
  }

  return query.eq('cuenta_cliente_id', actor.cuentaClienteId)
}

function buildValidationEmployee(employee: EmpleadoRow | null): AssignmentValidationEmployee | null {
  if (!employee) {
    return null
  }

  return {
    id: employee.id,
    puesto: employee.puesto,
    estatus_laboral: employee.estatus_laboral,
    telefono: employee.telefono,
    correo_electronico: employee.correo_electronico,
  }
}

function buildValidationPdv(pdv: PdvRow | null): AssignmentValidationPdv | null {
  if (!pdv) {
    return null
  }

  const cadena = first(pdv.cadena)
  const geocerca = first(pdv.geocerca_pdv)

  return {
    id: pdv.id,
    estatus: pdv.estatus,
    radio_tolerancia_metros: geocerca?.radio_tolerancia_metros ?? null,
    cadena_codigo: cadena?.codigo ?? null,
    factor_cuota_default: cadena?.factor_cuota_default ?? null,
  }
}

function buildVisiblePdvIds(actor: ActorActual, relations: CuentaClientePdvRow[]) {
  if (!actor.cuentaClienteId) {
    return null
  }

  const today = getCurrentDayValue()
  return new Set(
    relations
      .filter(
        (item) =>
          item.activo &&
          item.cuenta_cliente_id === actor.cuentaClienteId &&
          (!item.fecha_fin || item.fecha_fin >= today)
      )
      .map((item) => item.pdv_id)
  )
}

async function countAssignments(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  mutate?: (query: any) => any
) {
  let query: any = supabase.from('asignacion').select('id', {
    count: 'exact',
    head: true,
  })

  if (actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  if (mutate) {
    query = mutate(query)
  }

  const result = await query
  return result.error ? 0 : result.count ?? 0
}

async function loadShellSummary(supabase: TypedSupabaseClient, actor: ActorActual): Promise<AsignacionesShellSummary> {
  const today = getCurrentDayValue()
  const [total, publicada, activas] = await Promise.all([
    countAssignments(supabase, actor),
    countAssignments(supabase, actor, (query) => query.eq('estado_publicacion', 'PUBLICADA')),
    countAssignments(
      supabase,
      actor,
      (query) =>
        query
          .eq('estado_publicacion', 'PUBLICADA')
          .lte('fecha_inicio', today)
          .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
    ),
  ])

  return {
    total,
    publicada,
    activas,
    borrador: Math.max(total - publicada, 0),
  }
}

async function loadCatalogModalData(supabase: TypedSupabaseClient, actor: ActorActual): Promise<AsignacionesModalCatalogData> {
  const [draftBaseCount, approvedBaseCount] = await Promise.all([
    countAssignments(
      supabase,
      actor,
      (query) => query.eq('naturaleza', 'BASE').eq('estado_publicacion', 'BORRADOR')
    ),
    countAssignments(
      supabase,
      actor,
      (query) => query.eq('naturaleza', 'BASE').eq('estado_publicacion', 'PUBLICADA')
    ),
  ])

  return {
    draftBaseCount,
    approvedBaseCount,
  }
}

async function loadManualModalData(
  supabase: TypedSupabaseClient,
  actor: ActorActual
): Promise<AsignacionesManualModalData> {
  const today = getCurrentDayValue()
  const scopedCuentaPdvQuery = actor.cuentaClienteId
    ? supabase
        .from('cuenta_cliente_pdv')
        .select('pdv_id, cuenta_cliente_id, activo, fecha_fin')
        .eq('cuenta_cliente_id', actor.cuentaClienteId)
        .eq('activo', true)
        .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
    : Promise.resolve({ data: null, error: null })

  const [empleadosResult, cuentaPdvResult, turnCatalogResult] = await Promise.all([
    supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, estatus_laboral, zona')
      .eq('puesto', 'DERMOCONSEJERO')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true }),
    scopedCuentaPdvQuery,
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'asistencias.san_pablo.catalogo_turnos')
      .maybeSingle(),
  ])

  const employees = (empleadosResult.data ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'estatus_laboral' | 'zona'>>
  const accountRelations = (cuentaPdvResult.data ?? []) as CuentaClientePdvRow[]
  const visiblePdvIds = buildVisiblePdvIds(actor, accountRelations)

  const pdvsQuery = supabase
    .from('pdv')
    .select('id, clave_btl, nombre, zona, estatus, cadena:cadena_id(codigo, nombre, factor_cuota_default)')
    .order('nombre', { ascending: true })

  const pdvsResult = visiblePdvIds
    ? visiblePdvIds.size > 0
      ? await pdvsQuery.in('id', Array.from(visiblePdvIds))
      : { data: [], error: null }
    : await pdvsQuery

  if (pdvsResult.error) {
    throw new Error(pdvsResult.error.message)
  }

  const pdvs = (pdvsResult.data ?? []) as Array<
    Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'estatus'> & { cadena: MaybeMany<CadenaRelacion> }
  >

  return {
    empleadosDisponibles: employees.map((item) => ({
      id: item.id,
      nombre: item.nombre_completo,
      zona: item.zona,
    })),
    pdvsDisponibles: pdvs
      .filter((item) => isOperablePdvStatus(item.estatus))
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        claveBtl: item.clave_btl,
        cadena: first(item.cadena)?.nombre ?? null,
        zona: item.zona,
      })),
    turnosDisponibles: parseTurnosCatalogo((turnCatalogResult.data as { valor: unknown } | null)?.valor).map(
      (item) => ({
        value: item.nomenclatura,
        label: buildTurnoLabel(item),
      })
    ),
  }
}

async function loadAssignmentsView(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  assignmentState: AssignmentListState,
  page: number
): Promise<AsignacionesAssignmentsTabData> {
  const pageSize = 24
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const today = getCurrentDayValue()

  let query: any = supabase
    .from('asignacion')
    .select(
      `
        id,
        cuenta_cliente_id,
        empleado_id,
        pdv_id,
        supervisor_empleado_id,
        tipo,
        factor_tiempo,
        dias_laborales,
        dia_descanso,
        horario_referencia,
        fecha_inicio,
        fecha_fin,
        naturaleza,
        retorna_a_base,
        asignacion_base_id,
        asignacion_origen_id,
        prioridad,
        motivo_movimiento,
        generado_automaticamente,
        observaciones,
        estado_publicacion,
        created_at,
        cuenta_cliente:cuenta_cliente_id(id, nombre),
        empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral, telefono, correo_electronico, supervisor_empleado_id, zona),
        pdv:pdv_id(id, clave_btl, nombre, zona, estatus, horario_entrada, horario_salida, cadena:cadena_id(codigo, nombre, factor_cuota_default), geocerca_pdv(latitud, longitud, radio_tolerancia_metros))
      `,
      { count: 'exact' }
    )

  if (actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }
  if (assignmentState === 'BORRADOR') {
    query = query.eq('estado_publicacion', 'BORRADOR')
  } else if (assignmentState === 'PUBLICADA') {
    query = query.eq('estado_publicacion', 'PUBLICADA')
  } else {
    query = query
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', today)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
  }

  const listResult = await query.order('created_at', { ascending: false }).range(from, to)

  if (listResult.error) {
    throw new Error(listResult.error.message)
  }

  const rows = (listResult.data ?? []) as unknown as AsignacionListadoQueryRow[]
  const employeeIds = Array.from(new Set(rows.map((item) => item.empleado_id)))
  const pdvIds = Array.from(new Set(rows.map((item) => item.pdv_id)))
  const rowIds = new Set(rows.map((item) => item.id))

  const relatedAssignmentsFilter = buildAssignmentScopeOrFilter({
    empleadoIds: employeeIds,
    pdvIds,
  })
  const visibleFechaInicio = rows.reduce(
    (current, item) => (item.fecha_inicio < current ? item.fecha_inicio : current),
    rows[0]?.fecha_inicio ?? today
  )
  const visibleFechaFin = rows.some((item) => !item.fecha_fin)
    ? null
    : rows.reduce<string | null>((current, item) => {
        if (!item.fecha_fin) {
          return current
        }

        if (!current || item.fecha_fin > current) {
          return item.fecha_fin
        }

        return current
      }, null)

  const [relatedAssignmentsResult, supervisorsResult, horariosResult] = await Promise.all([
    !relatedAssignmentsFilter
      ? Promise.resolve({ data: [], error: null })
      : (applyAccountScope(
          supabase
            .from('asignacion')
            .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, dias_laborales') as any,
          actor
        ) as any)
          .or(relatedAssignmentsFilter)
          .order('fecha_inicio', { ascending: false }),
    pdvIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('supervisor_pdv').select('pdv_id, activo, fecha_fin, empleado_id').in('pdv_id', pdvIds),
    pdvIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('horario_pdv').select('pdv_id').in('pdv_id', pdvIds).eq('activo', true),
  ])

  if (relatedAssignmentsResult.error || supervisorsResult.error || horariosResult.error) {
    throw new Error(
      relatedAssignmentsResult.error?.message ??
        supervisorsResult.error?.message ??
        horariosResult.error?.message ??
        'No fue posible completar el contexto de validacion de asignaciones.'
    )
  }

  const relatedAssignments = ((relatedAssignmentsResult.data ?? []) as AsignacionComparableRow[]).map(buildComparableRow)
  const comparableRowsByEmployee = relatedAssignments.reduce<Record<string, AssignmentComparableRow[]>>((acc, item) => {
    if (rowIds.has(item.id)) {
      return acc
    }

    const current = acc[item.empleado_id] ?? []
    current.push(item)
    acc[item.empleado_id] = current
    return acc
  }, {})
  const historicalRowsByPdv = relatedAssignments.reduce<Record<string, AssignmentComparableRow[]>>((acc, item) => {
    const current = acc[item.pdv_id] ?? []
    current.push(item)
    acc[item.pdv_id] = current
    return acc
  }, {})
  const supervisors = (supervisorsResult.data ?? []) as SupervisorAsignacionRow[]
  const horarioCounts = ((horariosResult.data ?? []) as HorarioPdvRow[]).reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.pdv_id] = (acc[item.pdv_id] ?? 0) + 1
      return acc
    },
    {}
  )
  const supervisorsByPdv = supervisors.reduce<Record<string, SupervisorAsignacionRow[]>>((acc, item) => {
    const current = acc[item.pdv_id] ?? []
    current.push(item)
    acc[item.pdv_id] = current
    return acc
  }, {})
  const rotationAccountId = actor?.cuentaClienteId ?? rows[0]?.cuenta_cliente_id ?? getSingleTenantAccountId()
  const rotationValidationData = rows.length > 0
    ? await loadAssignmentRotationValidationData(supabase, {
        accountId: rotationAccountId,
        pdvIds,
        fechaInicio: visibleFechaInicio,
        fechaFin: visibleFechaFin,
      })
    : null

  const items = rows.map((row) => {
    const employee = first(row.empleado)
    const pdv = first(row.pdv)
    const chain = first(pdv?.cadena ?? null)

    const rowValidation = {
      id: row.id,
      cuenta_cliente_id: row.cuenta_cliente_id,
      empleado_id: row.empleado_id,
      pdv_id: row.pdv_id,
      supervisor_empleado_id: row.supervisor_empleado_id,
      tipo: row.tipo,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      dias_laborales: row.dias_laborales,
      dia_descanso: row.dia_descanso,
      horario_referencia: row.horario_referencia,
    }
    const issues = [
      ...evaluarReglasAsignacion(
        rowValidation,
        {
          employee: buildValidationEmployee(employee),
          pdv: buildValidationPdv(pdv),
          pdvsConGeocerca: pdv && first(pdv.geocerca_pdv) ? new Set<string>([pdv.id]) : new Set<string>(),
          supervisoresPorPdv: pdv ? { [pdv.id]: supervisorsByPdv[pdv.id] ?? [] } : {},
          comparableAssignments: comparableRowsByEmployee[row.empleado_id] ?? [],
          historicalAssignmentsForPdv: (historicalRowsByPdv[row.pdv_id] ?? []).filter((item) => item.id !== row.id),
          horariosPorPdv: pdv ? { [pdv.id]: horarioCounts[pdv.id] ?? 0 } : {},
        }
      ),
      ...evaluateRotationMasterImpact(rowValidation, {
        rotationData: rotationValidationData,
      }),
    ]
    const resumenIssues = resumirIssuesAsignacion(issues)

    return {
      id: row.id,
      cuentaClienteId: row.cuenta_cliente_id,
      cuentaCliente: first(row.cuenta_cliente)?.nombre ?? null,
      empleadoId: row.empleado_id,
      empleado: employee?.nombre_completo ?? null,
      pdvId: row.pdv_id,
      pdv: pdv?.nombre ?? null,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      tipo: row.tipo,
      horario: row.horario_referencia ?? pdv?.horario_entrada ?? null,
      diasLaborales: row.dias_laborales,
      diaDescanso: row.dia_descanso,
      fechaInicio: row.fecha_inicio,
      fechaFin: row.fecha_fin,
      zona: pdv?.zona ?? employee?.zona ?? null,
      cadena: chain?.nombre ?? null,
      estadoPublicacion: row.estado_publicacion,
      naturaleza: row.naturaleza ?? 'BASE',
      retornaABase: row.retorna_a_base ?? false,
      prioridad: row.prioridad ?? 100,
      motivoMovimiento: row.motivo_movimiento ?? null,
      issues,
      bloqueada: issues.some((issue) => issue.severity === 'ERROR'),
      alertasCount: resumenIssues.alertas.length,
      requiereConfirmacionAlertas: resumenIssues.alertas.length > 0,
    } satisfies AsignacionListadoItem
  })

  return {
    estado: assignmentState,
    page,
    pageSize,
    total: listResult.count ?? items.length,
    items,
  }
}

function mapPdvState(item: PdvCoberturaBoardItem): AssignmentPdvBoardState {
  switch (item.semaforo) {
    case 'VERDE':
      return 'ASIGNADOS'
    case 'AMARILLO':
      return 'RESERVADOS'
    case 'ROJO':
      return 'INACTIVOS'
    default:
      return 'SIN_ASIGNACION'
  }
}

async function loadPdvView(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  filters: {
    pdvState?: string | null
    cadena?: string | null
    ciudad?: string | null
    zona?: string | null
    rotacionClasificacion?: string | null
    grupoRotacion?: string | null
    pdvPanel?: string | null
  }
): Promise<AsignacionesPdvsBoardData> {
  const panel = normalizePdvPanel(filters.pdvPanel)
  const coverageBoard = panel === 'COBERTURA' ? await buildRecruitmentCoverageBoard(supabase, { actor }) : null
  const rotationBoard = panel === 'ROTACION' ? await buildPdvRotationMasterBoard(supabase, { actor }) : null
  const estado = normalizePdvBoardState(filters.pdvState)
  const cadena = normalizeTextFilter(filters.cadena)
  const ciudad = normalizeTextFilter(filters.ciudad)
  const zona = normalizeTextFilter(filters.zona)
  const rotacionClasificacion = normalizeRotationFilter(filters.rotacionClasificacion)
  const grupoRotacion = normalizeTextFilter(filters.grupoRotacion)

  const sourceItems = coverageBoard?.items ?? rotationBoard?.items ?? []

  const matchesLocation = (item: { cadena: string | null; ciudad: string | null; zona: string | null }) => {
    if (cadena && item.cadena !== cadena) {
      return false
    }

    if (ciudad && item.ciudad !== ciudad) {
      return false
    }

    if (zona && item.zona !== zona) {
      return false
    }

    return true
  }

  const items = (coverageBoard?.items ?? []).filter((item) => {
    if (estado !== 'ALL' && mapPdvState(item) !== estado) {
      return false
    }

    return matchesLocation(item)
  })

  const rotationItems = (rotationBoard?.items ?? []).filter((item) => {
    if (!matchesLocation(item)) {
      return false
    }

    if (rotacionClasificacion === 'FIJO' && item.clasificacionMaestra !== 'FIJO') {
      return false
    }

    if (rotacionClasificacion === 'ROTATIVO' && item.clasificacionMaestra !== 'ROTATIVO') {
      return false
    }

    if (rotacionClasificacion === 'PENDIENTE' && !item.pendienteRevision) {
      return false
    }

    if (rotacionClasificacion === 'INCOMPLETO' && !item.grupoIncompleto) {
      return false
    }

    if (grupoRotacion && item.grupoRotacionCodigo !== grupoRotacion) {
      return false
    }

    return true
  })

  const allowedPdvIds = new Set(rotationItems.map((item) => item.pdvId))
  const rotationGroups = (rotationBoard?.groups ?? [])
    .map((group) => ({
      ...group,
      miembros: group.miembros.filter((member) => allowedPdvIds.has(member.pdvId)),
    }))
    .filter((group) => group.miembros.length > 0)

  return {
    summary: coverageBoard?.summary ?? null,
    items,
    estado,
    cadena,
    ciudad,
    zona,
    cadenasDisponibles: Array.from(new Set(sourceItems.map((item) => item.cadena).filter(Boolean))).sort(
      (left, right) => String(left).localeCompare(String(right), 'es-MX')
    ) as string[],
    ciudadesDisponibles: Array.from(new Set(sourceItems.map((item) => item.ciudad).filter(Boolean))).sort(
      (left, right) => String(left).localeCompare(String(right), 'es-MX')
    ) as string[],
    zonasDisponibles: Array.from(new Set(sourceItems.map((item) => item.zona).filter(Boolean))).sort(
      (left, right) => String(left).localeCompare(String(right), 'es-MX')
    ) as string[],
    rotacion: rotationBoard
      ? {
          summary: {
            operables: rotationItems.length,
            fijos: rotationItems.filter((item) => item.clasificacionMaestra === 'FIJO').length,
            rotativos: rotationItems.filter((item) => item.clasificacionMaestra === 'ROTATIVO').length,
            pendientes: rotationItems.filter((item) => item.pendienteRevision).length,
            gruposIncompletos: rotationGroups.filter((group) => !group.completo).length,
          },
          items: rotationItems,
          groups: rotationGroups,
        }
      : null,
    rotacionClasificacion,
    grupoRotacion,
    panel,
  }
}

async function loadCalendarView(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  filters: {
    month?: string | null
    supervisorEmpleadoId?: string | null
    estadoOperativo?: string | null
  }
): Promise<AsignacionesCalendarData> {
  const month = normalizeCalendarMonth(filters.month)
  const supervisorEmpleadoId =
    actor.puesto === 'SUPERVISOR' ? actor.empleadoId : normalizeTextFilter(filters.supervisorEmpleadoId) || null
  const estadoOperativo = normalizeCalendarEstadoOperativo(filters.estadoOperativo)

  const [actorEmployeeResult, supervisorsResult] = await Promise.all([
    supabase.from('empleado').select('zona').eq('id', actor.empleadoId).maybeSingle(),
    supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, estatus_laboral, zona')
      .eq('puesto', 'SUPERVISOR')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true }),
  ])

  const actorZone = (actorEmployeeResult.data as { zona: string | null } | null)?.zona ?? null
  const supervisors = ((supervisorsResult.data ?? []) as Array<
    Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'estatus_laboral' | 'zona'>
  >)
    .filter((item) => {
      if (actor.puesto === 'SUPERVISOR') {
        return item.id === actor.empleadoId
      }

      if (actor.puesto === 'COORDINADOR' && actorZone) {
        return item.zona === actorZone
      }

      return true
    })
    .map((item) => ({ id: item.id, nombre: item.nombre_completo }))

  let calendarioMensual: MaterializedMonthlyCalendar | null = null
  let mensaje: string | undefined

  try {
    calendarioMensual = await getMaterializedMonthlyCalendar({
      month,
      supervisorEmpleadoId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : supervisorEmpleadoId ?? undefined,
      coordinadorEmpleadoId: actor.puesto === 'COORDINADOR' ? actor.empleadoId : undefined,
      cuentaClienteId: actor.cuentaClienteId ?? undefined,
      zona: actor.puesto === 'COORDINADOR' ? actorZone ?? undefined : undefined,
      estadoOperativo: estadoOperativo ?? undefined,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'No fue posible cargar el calendario mensual.'
    mensaje =
      detail.includes('asignacion_diaria_resuelta') || detail.includes('schema cache')
        ? 'La vista mensual operativa estara disponible cuando la base termine de materializar asignacion_diaria_resuelta.'
        : detail
  }

  return {
    calendarioMensual,
    filtros: {
      month,
      supervisorEmpleadoId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : supervisorEmpleadoId,
      estadoOperativo,
    },
    supervisores: supervisors,
    supervisorBloqueado: actor.puesto === 'SUPERVISOR',
    mensaje,
  }
}

export async function obtenerPanelAsignaciones(
  supabase: SupabaseClient,
  actor: ActorActual,
  options: ObtenerPanelAsignacionesOptions = {}
): Promise<AsignacionesPanelData> {
  const typedSupabase = supabase as TypedSupabaseClient
  const activeView = normalizeView(options.view)
  const activeModal = normalizeModal(options.modal)
  const page = normalizePositiveInt(options.page, 1)
  const assignmentState = normalizeAssignmentState(options.assignmentState)

  const shell = await loadShellSummary(typedSupabase, actor)
  const response: AsignacionesPanelData = {
    ...EMPTY_DATA,
    activeView,
    activeModal,
    shell,
    resumen: shell,
    puedeGestionar: actor.puesto === 'ADMINISTRADOR',
    infraestructuraLista: true,
  }

  try {
    if (activeView === 'asignaciones') {
      response.assignmentsView = await loadAssignmentsView(typedSupabase, actor, assignmentState, page)
    }

    if (activeView === 'pdvs') {
      response.pdvsView = await loadPdvView(typedSupabase, actor, {
        pdvPanel: options.filters?.pdvPanel,
        pdvState: options.filters?.pdvState,
        cadena: options.filters?.cadena,
        ciudad: options.filters?.ciudad,
        zona: options.filters?.zona,
        rotacionClasificacion: options.filters?.rotacionClasificacion,
        grupoRotacion: options.filters?.grupoRotacion,
      })
    }

    if (activeView === 'calendario') {
      response.calendarView = await loadCalendarView(typedSupabase, actor, {
        month: options.filters?.month,
        supervisorEmpleadoId: options.filters?.supervisorEmpleadoId,
        estadoOperativo: options.filters?.estadoOperativo,
      })
    }

    if (activeModal === 'catalogo') {
      response.catalogModal = await loadCatalogModalData(typedSupabase, actor)
    }

    if (activeModal === 'manual') {
      response.manualModal = await loadManualModalData(typedSupabase, actor)
    }
  } catch (error) {
    return {
      ...response,
      infraestructuraLista: false,
      mensajeInfraestructura:
        error instanceof Error
          ? error.message
          : 'La base de asignaciones aun no esta completa para operar esta vista.',
    }
  }

  return response
}





