import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { parseTurnosCatalogo } from '@/features/configuracion/configuracionCatalog'
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
import { rangesOverlap } from '../lib/assignmentPlanning'

type MaybeMany<T> = T | T[] | null

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

interface AsignacionQueryRow
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
    | 'estado_publicacion'
    | 'observaciones'
    | 'created_at'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

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
  coberturas: number
  conBloqueo: number
  conAlerta: number
  conAviso: number
  publicadasInvalidas: number
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

export interface AsignacionNoticeItem {
  code: string
  severity: AssignmentIssueSeverity
  label: string
  message: string
}

export interface AsignacionVistaDiaItem {
  id: string
  empleado: string | null
  pdv: string | null
  pdvClaveBtl: string | null
  supervisor: string | null
  horario: string | null
  fechaInicio: string
  fechaFin: string | null
  estadoPublicacion: string
  zona: string | null
}

export interface AsignacionesPanelData {
  resumen: AsignacionResumen
  asignaciones: AsignacionListadoItem[]
  empleadosDisponibles: AsignacionEmpleadoOption[]
  pdvsDisponibles: AsignacionPdvOption[]
  turnosDisponibles: AsignacionTurnoOption[]
  avisosGlobales: AsignacionNoticeItem[]
  vistaDia: AsignacionVistaDiaItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const EMPTY_DATA: AsignacionesPanelData = {
  resumen: {
    total: 0,
    borrador: 0,
    publicada: 0,
    coberturas: 0,
    conBloqueo: 0,
    conAlerta: 0,
    conAviso: 0,
    publicadasInvalidas: 0,
  },
  asignaciones: [],
  empleadosDisponibles: [],
  pdvsDisponibles: [],
  turnosDisponibles: [],
  avisosGlobales: [],
  vistaDia: [],
  infraestructuraLista: false,
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildComparableRow(row: AsignacionQueryRow): AssignmentComparableRow {
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

function buildVisiblePdvIds(
  actor: ActorActual,
  relations: CuentaClientePdvRow[]
) {
  if (!actor.cuentaClienteId) {
    return null
  }

  const cuentaClienteId = actor.cuentaClienteId
  const today = new Date().toISOString().slice(0, 10)

  return new Set(
    relations
      .filter(
        (item) => item.activo && (!item.fecha_fin || item.fecha_fin >= today) && item.cuenta_cliente_id === cuentaClienteId
      )
      .map((item) => item.pdv_id)
  )
}
function buildValidationEmployee(employee: EmpleadoRow | undefined): AssignmentValidationEmployee | null {
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

function buildValidationPdv(pdv: PdvRow | undefined): AssignmentValidationPdv | null {
  if (!pdv) {
    return null
  }

  const cadena = obtenerPrimero(pdv.cadena)
  const geocerca = obtenerPrimero(pdv.geocerca_pdv)

  return {
    id: pdv.id,
    estatus: pdv.estatus,
    radio_tolerancia_metros: geocerca?.radio_tolerancia_metros ?? null,
    cadena_codigo: cadena?.codigo ?? null,
    factor_cuota_default: cadena?.factor_cuota_default ?? null,
  }
}

function buildGlobalNotices(
  actor: ActorActual,
  assignments: AsignacionQueryRow[],
  employees: EmpleadoRow[],
  pdvs: PdvRow[]
): AsignacionNoticeItem[] {
  const notices: AsignacionNoticeItem[] = []
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
  const monthEnd = `${new Date().toISOString().slice(0, 7)}-31`
  const activeAssignments = assignments.filter((item) =>
    rangesOverlap(item.fecha_inicio, item.fecha_fin, monthStart, monthEnd)
  )

  const activePdvs = pdvs.filter((item) => item.estatus === 'ACTIVO')
  const activeDcs = employees.filter(
    (item) => item.puesto === 'DERMOCONSEJERO' && item.estatus_laboral === 'ACTIVO'
  )

  const uncoveredPdvs = activePdvs.filter(
    (pdv) => !activeAssignments.some((assignment) => assignment.pdv_id === pdv.id)
  )
  if (uncoveredPdvs.length > 0 && actor.puesto === 'ADMINISTRADOR') {
    notices.push({
      code: 'PDV_SIN_COBERTURA',
      severity: 'AVISO',
      label: 'PDVs sin cobertura',
      message: `${uncoveredPdvs.length} PDVs activos no tienen ninguna asignacion en el mes actual.`,
    })
  }

  const employeesWithoutAssignments = activeDcs.filter(
    (employee) => !activeAssignments.some((assignment) => assignment.empleado_id === employee.id)
  )
  if (employeesWithoutAssignments.length > 0 && actor.puesto === 'ADMINISTRADOR') {
    notices.push({
      code: 'DC_SIN_ASIGNACION',
      severity: 'AVISO',
      label: 'DCs sin asignacion',
      message: `${employeesWithoutAssignments.length} dermoconsejeros activos no tienen asignacion en el mes actual.`,
    })
  }

  return notices
}

function buildVistaDia(
  actor: ActorActual,
  assignments: AsignacionListadoItem[],
  employeeMap: Map<string, EmpleadoRow>,
  pdvMap: Map<string, PdvRow>
) {
  const today = new Date().toISOString().slice(0, 10)
  const actorZone = employeeMap.get(actor.empleadoId)?.zona ?? null

  return assignments
    .filter((item) => rangesOverlap(item.fechaInicio, item.fechaFin, today, today))
    .filter((item) => {
      if (actor.puesto === 'SUPERVISOR') {
        const assignment = employeeMap.get(item.empleadoId)
        return assignment?.supervisor_empleado_id === actor.empleadoId
      }

      if (actor.puesto === 'COORDINADOR' && actorZone) {
        return item.zona === actorZone || employeeMap.get(item.empleadoId)?.zona === actorZone
      }

      return true
    })
    .slice(0, 24)
    .map((item) => ({
      id: item.id,
      empleado: item.empleado,
      pdv: item.pdv,
      pdvClaveBtl: item.pdvClaveBtl,
      supervisor: employeeMap.get(item.empleadoId)?.supervisor_empleado_id
        ? employeeMap.get(employeeMap.get(item.empleadoId)?.supervisor_empleado_id ?? '')?.nombre_completo ?? null
        : null,
      horario: item.horario ?? pdvMap.get(item.pdvId)?.horario_entrada ?? null,
      fechaInicio: item.fechaInicio,
      fechaFin: item.fechaFin,
      estadoPublicacion: item.estadoPublicacion,
      zona: item.zona,
    }))
}

export async function obtenerPanelAsignaciones(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<AsignacionesPanelData> {
  const [
    asignacionesResult,
    empleadosResult,
    pdvsResult,
    supervisoresResult,
    cuentaPdvResult,
    turnCatalogResult,
    horariosResult,
  ] = await Promise.all([
    supabase
      .from('asignacion')
      .select(`
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
        observaciones,
        estado_publicacion,
        created_at,
        cuenta_cliente:cuenta_cliente_id(id, nombre)
      `)
      .order('created_at', { ascending: false })
      .limit(160),
    supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, estatus_laboral, telefono, correo_electronico, supervisor_empleado_id, zona')
      .order('nombre_completo', { ascending: true }),
    supabase
      .from('pdv')
      .select(`
        id,
        clave_btl,
        nombre,
        zona,
        estatus,
        horario_entrada,
        horario_salida,
        cadena:cadena_id(codigo, nombre, factor_cuota_default),
        geocerca_pdv(latitud, longitud, radio_tolerancia_metros)
      `)
      .order('nombre', { ascending: true }),
    supabase
      .from('supervisor_pdv')
      .select('pdv_id, activo, fecha_fin, empleado_id'),
    supabase
      .from('cuenta_cliente_pdv')
      .select('pdv_id, cuenta_cliente_id, activo, fecha_fin')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'asistencias.san_pablo.catalogo_turnos')
      .maybeSingle(),
    supabase.from('horario_pdv').select('pdv_id').eq('activo', true),
  ])

  const infraError = [
    asignacionesResult.error,
    empleadosResult.error,
    pdvsResult.error,
    supervisoresResult.error,
    cuentaPdvResult.error,
    turnCatalogResult.error,
    horariosResult.error,
  ]
    .filter(Boolean)
    .map((item) => item?.message)
    .join(' ')

  if (asignacionesResult.error || empleadosResult.error || pdvsResult.error) {
    return {
      ...EMPTY_DATA,
      mensajeInfraestructura:
        infraError ||
        'La base de asignaciones aun no esta completa para operar formulario y validaciones.',
    }
  }

  const employees = (empleadosResult.data ?? []) as EmpleadoRow[]
  const pdvs = (pdvsResult.data ?? []) as PdvRow[]
  const assignments = (asignacionesResult.data ?? []) as unknown as AsignacionQueryRow[]
  const supervisors = (supervisoresResult.data ?? []) as SupervisorAsignacionRow[]
  const accountRelations = (cuentaPdvResult.data ?? []) as CuentaClientePdvRow[]
  const horarioCounts = ((horariosResult.data ?? []) as HorarioPdvRow[]).reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.pdv_id] = (acc[item.pdv_id] ?? 0) + 1
      return acc
    },
    {}
  )

  const employeeMap = new Map(employees.map((item) => [item.id, item]))
  const pdvMap = new Map(pdvs.map((item) => [item.id, item]))
  const pdvsConGeocerca = new Set(
    pdvs
      .filter((item) => {
        const geocerca = obtenerPrimero(item.geocerca_pdv)
        return Boolean(
          geocerca &&
            geocerca.latitud !== null &&
            geocerca.longitud !== null &&
            geocerca.radio_tolerancia_metros !== null
        )
      })
      .map((item) => item.id)
  )
  const supervisorsByPdv = supervisors.reduce<Record<string, SupervisorAsignacionRow[]>>((acc, item) => {
    const current = acc[item.pdv_id] ?? []
    current.push(item)
    acc[item.pdv_id] = current
    return acc
  }, {})
  const comparableRows = assignments.map(buildComparableRow)
  const turnosDisponibles = parseTurnosCatalogo((turnCatalogResult.data as { valor: unknown } | null)?.valor)
    .map((item) => ({
      value: item.nomenclatura,
      label: buildTurnoLabel(item),
    }))
  const visiblePdvIds = buildVisiblePdvIds(actor, accountRelations)

  const pdvsDisponibles = pdvs
    .filter((item) => item.estatus === 'ACTIVO')
    .filter((item) => (visiblePdvIds ? visiblePdvIds.has(item.id) : true))
    .map((item) => ({
      id: item.id,
      nombre: item.nombre,
      claveBtl: item.clave_btl,
      cadena: obtenerPrimero(item.cadena)?.nombre ?? null,
      zona: item.zona,
    }))

  const empleadosDisponibles = employees
    .filter((item) => item.puesto === 'DERMOCONSEJERO' && item.estatus_laboral === 'ACTIVO')
    .map((item) => ({
      id: item.id,
      nombre: item.nombre_completo,
      zona: item.zona,
    }))

  const asignaciones = assignments.map((row) => {
    const employee = employeeMap.get(row.empleado_id)
    const pdv = pdvMap.get(row.pdv_id)
    const chain = obtenerPrimero(pdv?.cadena ?? null)
    const issues = evaluarReglasAsignacion(
      {
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
      },
      {
        employee: buildValidationEmployee(employee),
        pdv: buildValidationPdv(pdv),
        pdvsConGeocerca,
        supervisoresPorPdv: supervisorsByPdv,
        comparableAssignments: comparableRows,
        historicalAssignmentsForPdv: comparableRows
          .filter((item) => item.pdv_id === row.pdv_id)
          .sort((left, right) => right.fecha_inicio.localeCompare(left.fecha_inicio)),
        horariosPorPdv: horarioCounts,
      }
    )

    const resumenIssues = resumirIssuesAsignacion(issues)

    return {
      id: row.id,
      cuentaClienteId: row.cuenta_cliente_id,
      cuentaCliente: obtenerPrimero(row.cuenta_cliente)?.nombre ?? null,
      empleadoId: row.empleado_id,
      empleado: employee?.nombre_completo ?? null,
      pdvId: row.pdv_id,
      pdv: pdv?.nombre ?? null,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      tipo: row.tipo,
      horario: row.horario_referencia ?? null,
      diasLaborales: row.dias_laborales,
      diaDescanso: row.dia_descanso,
      fechaInicio: row.fecha_inicio,
      fechaFin: row.fecha_fin,
      zona: pdv?.zona ?? employee?.zona ?? null,
      cadena: chain?.nombre ?? null,
      estadoPublicacion: row.estado_publicacion,
      issues,
      bloqueada: issues.some((issue) => issue.severity === 'ERROR'),
      alertasCount: resumenIssues.alertas.length,
      requiereConfirmacionAlertas: resumenIssues.alertas.length > 0,
    }
  })

  return {
    resumen: {
      total: asignaciones.length,
      borrador: asignaciones.filter((item) => item.estadoPublicacion === 'BORRADOR').length,
      publicada: asignaciones.filter((item) => item.estadoPublicacion === 'PUBLICADA').length,
      coberturas: asignaciones.filter((item) => item.tipo === 'COBERTURA').length,
      conBloqueo: asignaciones.filter((item) => item.bloqueada).length,
      conAlerta: asignaciones.filter((item) => item.alertasCount > 0).length,
      conAviso: asignaciones.filter((item) => resumirIssuesAsignacion(item.issues).avisos.length > 0).length,
      publicadasInvalidas: asignaciones.filter(
        (item) => item.bloqueada && item.estadoPublicacion === 'PUBLICADA'
      ).length,
    },
    asignaciones,
    empleadosDisponibles,
    pdvsDisponibles,
    turnosDisponibles,
    avisosGlobales: buildGlobalNotices(actor, assignments, employees, pdvs),
    vistaDia: buildVistaDia(actor, asignaciones, employeeMap, pdvMap),
    infraestructuraLista: true,
  }
}


