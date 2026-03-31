import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type {
  Asignacion,
  Empleado,
  GeocercaPdv,
  Pdv,
  RutaAgendaEvento,
  RutaSemanal,
  RutaSemanalVisita,
  RutaVisitaPendienteReposicion,
} from '@/types/database'
import {
  getWeekDayLabel,
  getWeekDayShortLabel,
  getWeekEndIso,
  getWeekStartIso,
  isAssignmentActiveForWeek,
  sortWeeklyVisits,
} from '../lib/weeklyRoute'
import {
  parseRutaSemanalWorkflowMetadata,
  parseRutaVisitaWorkflowMetadata,
  type RutaApprovalState,
  type RutaChangeRequestType,
  type RutaChangeRequestTargetScope,
  type RutaChangeRequestState,
} from '../lib/routeWorkflow'
import { normalizeAgendaImpactMode } from '../lib/routeAgenda'
import {
  resolveAgendaOperativaSupervisorDia,
  type RutaAgendaBaseVisitInput,
  type RutaAgendaEventRecord,
  type RutaAgendaPendingRecord,
} from './rutaAgendaService'

type MaybeMany<T> = T | T[] | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type EmpleadoMiniRow = Pick<Empleado, 'id' | 'nombre_completo' | 'zona'>
type EmpleadoWarRoomRow = Pick<
  Empleado,
  'id' | 'nombre_completo' | 'puesto' | 'zona' | 'estatus_laboral' | 'supervisor_empleado_id'
>
type PdvMiniRow = Pick<
  Pdv,
  'id' | 'clave_btl' | 'nombre' | 'zona' | 'direccion' | 'estatus' | 'formato'
>
type PdvSupervisorRelacionRow = {
  id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  empleado: MaybeMany<EmpleadoMiniRow>
}
type PdvWarRoomRow = PdvMiniRow & {
  supervisor_pdv: MaybeMany<PdvSupervisorRelacionRow>
}
type GeocercaMiniRow = Pick<GeocercaPdv, 'pdv_id' | 'latitud' | 'longitud' | 'radio_tolerancia_metros'>
type AsignacionRutaRow = Pick<
  Asignacion,
  | 'id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'estado_publicacion'
  | 'horario_referencia'
>
type RutaQueryRow = Pick<
  RutaSemanal,
  | 'id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'semana_inicio'
  | 'estatus'
  | 'notas'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
> & {
  supervisor: MaybeMany<EmpleadoMiniRow>
}

type RutaVisitaQueryRow = Pick<
  RutaSemanalVisita,
  | 'id'
  | 'ruta_semanal_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'asignacion_id'
  | 'dia_semana'
  | 'orden'
  | 'estatus'
  | 'selfie_url'
  | 'evidencia_url'
  | 'checklist_calidad'
  | 'comentarios'
  | 'completada_en'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>

type SolicitudRutaRow = {
  id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  tipo: 'INCAPACIDAD' | 'VACACIONES' | 'PERMISO'
  estatus: string
  fecha_inicio: string
  fecha_fin: string
  motivo: string | null
  comentarios: string | null
}

type RutaAgendaEventoQueryRow = Pick<
  RutaAgendaEvento,
  | 'id'
  | 'ruta_semanal_id'
  | 'ruta_semanal_visita_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_operacion'
  | 'tipo_evento'
  | 'modo_impacto'
  | 'estatus_aprobacion'
  | 'estatus_ejecucion'
  | 'titulo'
  | 'descripcion'
  | 'sede'
  | 'hora_inicio'
  | 'hora_fin'
  | 'selfie_url'
  | 'evidencia_url'
  | 'check_in_en'
  | 'check_out_en'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>

type RutaPendienteReposicionQueryRow = Pick<
  RutaVisitaPendienteReposicion,
  | 'id'
  | 'ruta_semanal_id'
  | 'ruta_semanal_visita_id'
  | 'agenda_evento_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_origen'
  | 'semana_sugerida_inicio'
  | 'clasificacion'
  | 'motivo'
  | 'estado'
  | 'ruta_destino_id'
  | 'metadata'
>

export interface RutaSemanalResumen {
  totalRutas: number
  totalVisitas: number
  visitasPlanificadas: number
  visitasCompletadas: number
  pdvsAsignables: number
}

export interface RutaSemanalPdvOption {
  id: string
  asignacionId: string | null
  cuentaClienteId: string | null
  nombre: string
  claveBtl: string
  zona: string | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
  formato: string | null
  horarioReferencia: string | null
}

export interface RutaQuotaProgressItem {
  pdvId: string
  claveBtl: string
  nombre: string
  formato: string | null
  zona: string | null
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA'
  quotaMensual: number
  visitasRealizadas: number
  visitasPendientes: number
  cumplimientoPorcentaje: number
  latitud: number | null
  longitud: number | null
}

export interface RutaBlockedDayItem {
  solicitudId: string
  tipo: 'VACACIONES' | 'PERMISO' | 'INCAPACIDAD'
  fechaInicio: string
  fechaFin: string
  estatus: string
  label: string
}

export interface RutaReassignmentAlertItem {
  visitId: string
  diaLabel: string
  pdv: string | null
  motivo: string
}

export interface RutaSupervisorWarRoomItem {
  supervisorEmpleadoId: string
  supervisor: string
  zona: string | null
  rutaId: string | null
  weekStart: string
  rutaEstatus: RutaSemanalItem['estatus'] | null
  approvalState: RutaApprovalState
  minimumVisitsPerPdv: number | null
  monthlyVisitsCompleted: number
  expectedMonthlyVisits: number
  cumplimientoPorcentaje: number
  semaforo: 'OK' | 'RIESGO' | 'CRITICO'
  totalPdvsAsignados: number
  changeRequestsPendientes: number
  agendaApprovalsPendientes: number
  visitasPendientesReposicion: number
  blockedDays: RutaBlockedDayItem[]
  reassignmentAlerts: RutaReassignmentAlertItem[]
  quotaProgress: RutaQuotaProgressItem[]
}

export interface RutaPlanningStatusCount {
  key: 'TODAS' | RutaSemanalItem['estatus']
  label: string
  count: number
}

export interface RutaExceptionItem {
  routeId: string
  visitId: string
  supervisor: string | null
  pdv: string | null
  diaLabel: string
  motivo: string
  tone: 'amber' | 'rose' | 'sky'
}

export interface RutaSemanalWarRoomData {
  metadataColumnAvailable: boolean
  supervisors: RutaSupervisorWarRoomItem[]
  planningStatus: RutaPlanningStatusCount[]
  exceptions: RutaExceptionItem[]
}

export interface RutaSemanalVisitItem {
  id: string
  rutaId: string
  cuentaClienteId: string
  supervisorEmpleadoId: string
  pdvId: string
  asignacionId: string | null
  diaSemana: number
  diaLabel: string
  diaShortLabel: string
  orden: number
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA'
  pdv: string | null
  pdvClaveBtl: string | null
  zona: string | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
  geocercaRadioMetros: number | null
  selfieUrl: string | null
  evidenciaUrl: string | null
  checklistCalidad: Record<string, boolean>
  checklistComments: Record<string, string>
  checklistCompletion: number
  loveIsdinRecordsCount: number | null
  comentarios: string | null
  completadaEn: string | null
  checkInAt: string | null
  checkOutAt: string | null
  checkInGpsState: string | null
  checkOutGpsState: string | null
  checkInSelfieUrl: string | null
  checkOutSelfieUrl: string | null
  checkOutEvidenceUrl: string | null
}

export interface RutaAgendaEventoItem {
  id: string
  routeId: string
  sourceVisitId: string | null
  fechaOperacion: string
  dayLabel: string
  pdvId: string | null
  pdv: string | null
  zona: string | null
  tipoEvento:
    | 'VISITA_ADICIONAL'
    | 'OFICINA'
    | 'FIRMA_CONTRATO'
    | 'FORMACION'
    | 'ENTREGA_NUEVA_DC'
    | 'PRESENTACION_GERENTE'
    | 'VISITA_EMERGENCIA'
    | 'OTRO'
  tipoLabel: string
  modoImpacto: 'SUMA' | 'SOBREPONE_PARCIAL' | 'REEMPLAZA_TOTAL'
  impactoLabel: string
  estatusAprobacion: 'NO_REQUIERE' | 'PENDIENTE_COORDINACION' | 'APROBADO' | 'RECHAZADO'
  estatusEjecucion: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO'
  titulo: string
  descripcion: string | null
  sede: string | null
  horaInicio: string | null
  horaFin: string | null
  displacedVisitIds: string[]
  checkInAt: string | null
  checkOutAt: string | null
  createdAt: string
}

export interface RutaPendienteReposicionItem {
  id: string
  routeId: string
  visitId: string
  agendaEventId: string | null
  pdvId: string
  pdv: string | null
  zona: string | null
  fechaOrigen: string
  semanaSugeridaInicio: string | null
  clasificacion: 'JUSTIFICADA' | 'INJUSTIFICADA'
  motivo: string
  estado: 'PENDIENTE' | 'REPROGRAMADA' | 'DESCARTADA' | 'EJECUTADA'
  persisted: boolean
}

export interface RutaAgendaOperativaDia {
  fecha: string
  dayLabel: string
  planeadasCount: number
  ejecutadasCount: number
  cumplimientoIncompleto: boolean
  visitasPlaneadas: RutaSemanalVisitItem[]
  visitasActivas: RutaSemanalVisitItem[]
  visitasDesplazadas: RutaSemanalVisitItem[]
  eventos: RutaAgendaEventoItem[]
  pendientesReposicion: RutaPendienteReposicionItem[]
  pendientesJustificadasCount: number
  pendientesInjustificadasCount: number
}

export interface RutaChangeRequestProposedVisitItem {
  pdvId: string
  order: number
  pdv: string | null
  zona: string | null
}

export interface RutaSemanalItem {
  id: string
  cuentaClienteId: string
  supervisorEmpleadoId: string
  supervisor: string | null
  supervisorZona: string | null
  semanaInicio: string
  semanaFin: string
  estatus: 'BORRADOR' | 'PUBLICADA' | 'EN_PROGRESO' | 'CERRADA'
  notas: string | null
  approvalState: RutaApprovalState
  approvalNote: string | null
  approvalReviewedAt: string | null
  minimumVisitsPerPdv: number | null
  expectedMonthlyVisits: number | null
  pdvMonthlyQuotas: Record<string, number>
  monthlyVisitsCompleted: number
  changeRequestState: RutaChangeRequestState
  changeRequestNote: string | null
  changeRequestResolutionNote: string | null
  changeRequestType: RutaChangeRequestType
  changeRequestTargetScope: RutaChangeRequestTargetScope
  changeRequestTargetVisitId: string | null
  changeRequestTargetPdvId: string | null
  changeRequestTargetDayNumber: number | null
  changeRequestTargetDayLabel: string | null
  changeRequestProposedVisits: RutaChangeRequestProposedVisitItem[]
  changeRequestedAt: string | null
  createdAt: string
  updatedAt: string
  totalVisitas: number
  visitasCompletadas: number
  visitas: RutaSemanalVisitItem[]
  agendaEventosCount: number
  pendientesReposicionCount: number
}

export interface RutaSemanalPanelData {
  semanaActualInicio: string
  semanaActualFin: string
  puedeEditar: boolean
  resumen: RutaSemanalResumen
  rutas: RutaSemanalItem[]
  rutaSemanaActual: RutaSemanalItem | null
  visitasHoy: RutaSemanalVisitItem[]
  agendaSemanaActual: RutaAgendaOperativaDia[]
  agendaHoy: RutaAgendaOperativaDia | null
  agendaPendientesReposicion: RutaPendienteReposicionItem[]
  agendaEventosPendientesAprobacion: RutaAgendaEventoItem[]
  agendaInfrastructureAvailable: boolean
  agendaInfrastructureMessage?: string
  pdvsDisponibles: RutaSemanalPdvOption[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  warRoom: RutaSemanalWarRoomData
}

const EMPTY_DATA: RutaSemanalPanelData = {
  semanaActualInicio: getWeekStartIso(),
  semanaActualFin: getWeekEndIso(getWeekStartIso()),
  puedeEditar: false,
  resumen: {
    totalRutas: 0,
    totalVisitas: 0,
    visitasPlanificadas: 0,
    visitasCompletadas: 0,
    pdvsAsignables: 0,
  },
  rutas: [],
  rutaSemanaActual: null,
  visitasHoy: [],
  agendaSemanaActual: [],
  agendaHoy: null,
  agendaPendientesReposicion: [],
  agendaEventosPendientesAprobacion: [],
  agendaInfrastructureAvailable: true,
  pdvsDisponibles: [],
  infraestructuraLista: false,
  warRoom: {
    metadataColumnAvailable: true,
    supervisors: [],
    planningStatus: [
      { key: 'TODAS', label: 'Todas', count: 0 },
      { key: 'BORRADOR', label: 'Borrador', count: 0 },
      { key: 'PUBLICADA', label: 'Publicada', count: 0 },
      { key: 'EN_PROGRESO', label: 'En curso', count: 0 },
      { key: 'CERRADA', label: 'Completada', count: 0 },
    ],
    exceptions: [],
  },
}

function obtenerPrimero<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildInfrastructureError(message: string, puedeEditar: boolean): RutaSemanalPanelData {
  return {
    ...EMPTY_DATA,
    puedeEditar,
    infraestructuraLista: false,
    agendaInfrastructureAvailable: false,
    mensajeInfraestructura: message,
  }
}

function isRutaAgendaTableMissingError(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase()
  return (
    normalized.includes("public.ruta_agenda_evento") ||
    normalized.includes("public.ruta_visita_pendiente_reposicion") ||
    normalized.includes('ruta_agenda_evento') ||
    normalized.includes('ruta_visita_pendiente_reposicion')
  )
}

function dedupeAgendaPendings(
  persisted: RutaPendienteReposicionItem[],
  derived: RutaPendienteReposicionItem[]
) {
  const byKey = new Map<string, RutaPendienteReposicionItem>()

  for (const item of [...persisted, ...derived]) {
    const key = `${item.visitId}:${item.clasificacion}`
    const current = byKey.get(key)
    if (!current || (!current.persisted && item.persisted)) {
      byKey.set(key, item)
    }
  }

  return Array.from(byKey.values()).sort(
    (left, right) => right.fechaOrigen.localeCompare(left.fechaOrigen) || left.pdvId.localeCompare(right.pdvId)
  )
}

function isSupervisorPdvActiveForWeek(
  relation: Pick<PdvSupervisorRelacionRow, 'activo' | 'fecha_inicio' | 'fecha_fin'>,
  weekStart: string,
  weekEnd: string
) {
  if (!relation.activo) {
    return false
  }

  const relationStart = relation.fecha_inicio.slice(0, 10)
  const relationEnd = relation.fecha_fin ? relation.fecha_fin.slice(0, 10) : null
  const normalizedWeekStart = weekStart.slice(0, 10)
  const normalizedWeekEnd = weekEnd.slice(0, 10)

  if (relationStart > normalizedWeekEnd) {
    return false
  }

  if (relationEnd && relationEnd < normalizedWeekStart) {
    return false
  }

  return true
}

export async function obtenerPanelRutaSemanal(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  options?: {
    referenceDate?: string | Date
  }
): Promise<RutaSemanalPanelData> {
  const semanaActualInicio = getWeekStartIso(options?.referenceDate)
  const semanaActualFin = getWeekEndIso(semanaActualInicio)
  const puedeEditar = actor.puesto === 'SUPERVISOR'
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId

  const {
    result: rutasResult,
    metadataColumnAvailable,
  } = await fetchRutasWithWorkflowSupport(supabase, {
    actor,
    puedeEditar,
    allowGlobalScope,
  })

  const [
    visitasResult,
    pdvsResult,
    geocercasResult,
    asignacionesResult,
    solicitudesResult,
    empleadosResult,
    agendaEventosResult,
    pendientesReposicionResult,
  ] =
    await Promise.all([
      supabase
        .from('ruta_semanal_visita')
        .select(`
          id,
          ruta_semanal_id,
          cuenta_cliente_id,
          supervisor_empleado_id,
          pdv_id,
          asignacion_id,
          dia_semana,
          orden,
          estatus,
          selfie_url,
          evidencia_url,
          checklist_calidad,
          comentarios,
          completada_en,
          metadata,
          created_at,
          updated_at
        `)
        .order('dia_semana', { ascending: true })
        .limit(400),
      supabase
        .from('pdv')
        .select(`
          id,
          clave_btl,
          nombre,
          zona,
          direccion,
          estatus,
          formato,
          supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona))
        `)
        .order('nombre', { ascending: true })
        .limit(400),
      supabase
        .from('geocerca_pdv')
        .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
        .limit(500),
      buildAsignacionesQuery(supabase, actor, puedeEditar, allowGlobalScope),
      actor.puesto === 'COORDINADOR' || actor.puesto === 'ADMINISTRADOR'
        ? supabase
            .from('solicitud')
            .select('id, empleado_id, supervisor_empleado_id, tipo, estatus, fecha_inicio, fecha_fin, motivo, comentarios')
            .order('fecha_inicio', { ascending: false })
            .limit(240)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('empleado')
        .select('id, nombre_completo, puesto, zona, estatus_laboral, supervisor_empleado_id')
        .eq('estatus_laboral', 'ACTIVO')
        .order('nombre_completo', { ascending: true })
        .limit(400),
      supabase
        .from('ruta_agenda_evento')
        .select(
          'id, ruta_semanal_id, ruta_semanal_visita_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_operacion, tipo_evento, modo_impacto, estatus_aprobacion, estatus_ejecucion, titulo, descripcion, sede, hora_inicio, hora_fin, selfie_url, evidencia_url, check_in_en, check_out_en, metadata, created_at, updated_at'
        )
        .order('fecha_operacion', { ascending: true })
        .limit(400),
      supabase
        .from('ruta_visita_pendiente_reposicion')
        .select(
          'id, ruta_semanal_id, ruta_semanal_visita_id, agenda_evento_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_origen, semana_sugerida_inicio, clasificacion, motivo, estado, ruta_destino_id, metadata'
        )
        .order('fecha_origen', { ascending: false })
        .limit(400),
    ])

  const agendaInfrastructureMissing =
    isRutaAgendaTableMissingError(agendaEventosResult.error?.message) ||
    isRutaAgendaTableMissingError(pendientesReposicionResult.error?.message)

  const agendaInfrastructureMessage = agendaInfrastructureMissing
    ? 'La agenda operativa dinamica aun no esta disponible en esta base. Aplica la migracion 20260326213000_ruta_agenda_operativa.sql para habilitar eventos del dia y reposiciones.'
    : undefined

  const errorMessage =
    rutasResult.error?.message ??
    visitasResult.error?.message ??
    pdvsResult.error?.message ??
    geocercasResult.error?.message ??
    (asignacionesResult as { error?: { message?: string } | null }).error?.message ??
    (solicitudesResult as { error?: { message?: string } | null }).error?.message ??
    empleadosResult.error?.message ??
    (agendaInfrastructureMissing ? null : agendaEventosResult.error?.message) ??
    (agendaInfrastructureMissing ? null : pendientesReposicionResult.error?.message) ??
    null

  if (errorMessage) {
    return buildInfrastructureError(errorMessage, puedeEditar)
  }

  const rutasRaw = ((rutasResult.data ?? []) as RutaQueryRow[]).filter((item) => {
    if (allowGlobalScope) {
      return true
    }

    if (actor.cuentaClienteId) {
      return item.cuenta_cliente_id === actor.cuentaClienteId
    }

    return true
  })

  const rutaIds = new Set(rutasRaw.map((item) => item.id))
  const visitasRaw = ((visitasResult.data ?? []) as RutaVisitaQueryRow[]).filter((item) =>
    rutaIds.has(item.ruta_semanal_id)
  )
  const pdvsRaw = (pdvsResult.data ?? []) as PdvWarRoomRow[]
  const geocercasRaw = (geocercasResult.data ?? []) as GeocercaMiniRow[]
  const asignacionesRaw = ((asignacionesResult as { data?: unknown[] | null }).data ?? []) as AsignacionRutaRow[]
  const solicitudesRaw = ((solicitudesResult as { data?: unknown[] | null }).data ?? []) as SolicitudRutaRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoWarRoomRow[]
  const agendaEventosRaw = ((agendaInfrastructureMissing ? [] : agendaEventosResult.data ?? []) as RutaAgendaEventoQueryRow[]).filter((item) =>
    rutaIds.has(item.ruta_semanal_id)
  )
  const pendientesReposicionRaw = ((agendaInfrastructureMissing ? [] : pendientesReposicionResult.data ?? []) as RutaPendienteReposicionQueryRow[]).filter(
    (item) => rutaIds.has(item.ruta_semanal_id)
  )

  const pdvMap = new Map(
    pdvsRaw.map((item) => [
      item.id,
      {
        id: item.id,
        clave_btl: item.clave_btl,
        nombre: item.nombre,
        zona: item.zona,
        direccion: item.direccion,
        estatus: item.estatus,
        formato: item.formato,
      } satisfies PdvMiniRow,
    ])
  )
  const geocercaMap = new Map(geocercasRaw.map((item) => [item.pdv_id, item]))
  const visitasPorRuta = new Map<string, RutaSemanalVisitItem[]>()

  for (const visita of visitasRaw) {
    const pdv = pdvMap.get(visita.pdv_id)
    const geocerca = geocercaMap.get(visita.pdv_id)
    const current = visitasPorRuta.get(visita.ruta_semanal_id) ?? []
    const visitWorkflow = parseRutaVisitaWorkflowMetadata(visita.metadata)
    const checklistCalidad = (visita.checklist_calidad ?? {}) as Record<string, boolean>
    const checklistKeys = Object.keys(checklistCalidad)
    const checklistCompletion =
      checklistKeys.length === 0
        ? 0
        : Math.round(
            (checklistKeys.filter((key) => checklistCalidad[key]).length / checklistKeys.length) * 100
          )

    current.push({
      id: visita.id,
      rutaId: visita.ruta_semanal_id,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: visita.supervisor_empleado_id,
      pdvId: visita.pdv_id,
      asignacionId: visita.asignacion_id,
      diaSemana: visita.dia_semana,
      diaLabel: getWeekDayLabel(visita.dia_semana),
      diaShortLabel: getWeekDayShortLabel(visita.dia_semana),
      orden: visita.orden,
      estatus: visita.estatus,
      pdv: pdv?.nombre ?? null,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      zona: pdv?.zona ?? null,
      direccion: pdv?.direccion ?? null,
      latitud: geocerca?.latitud ?? null,
      longitud: geocerca?.longitud ?? null,
      geocercaRadioMetros: geocerca?.radio_tolerancia_metros ?? null,
      selfieUrl: visita.selfie_url,
      evidenciaUrl: visita.evidencia_url,
      checklistCalidad,
      checklistComments: visitWorkflow.checklistComments,
      checklistCompletion,
      loveIsdinRecordsCount: visitWorkflow.loveIsdinRecordsCount,
      comentarios: visita.comentarios,
      completadaEn: visita.completada_en,
      checkInAt: visitWorkflow.checkIn.at,
      checkOutAt: visitWorkflow.checkOut.at,
      checkInGpsState: visitWorkflow.checkIn.gpsState,
      checkOutGpsState: visitWorkflow.checkOut.gpsState,
      checkInSelfieUrl: visitWorkflow.checkIn.selfieUrl,
      checkOutSelfieUrl: visitWorkflow.checkOut.selfieUrl,
      checkOutEvidenceUrl: visitWorkflow.checkOut.evidenciaUrl,
    })

    visitasPorRuta.set(visita.ruta_semanal_id, current)
  }

  const agendaEventsByRoute = new Map<string, RutaAgendaEventRecord[]>()
  for (const event of agendaEventosRaw) {
    const pdv = event.pdv_id ? pdvMap.get(event.pdv_id) : null
    const current = agendaEventsByRoute.get(event.ruta_semanal_id) ?? []
    current.push({
      id: event.id,
      rutaId: event.ruta_semanal_id,
      sourceVisitId: event.ruta_semanal_visita_id,
      supervisorEmpleadoId: event.supervisor_empleado_id,
      fechaOperacion: event.fecha_operacion,
      pdvId: event.pdv_id,
      pdv: pdv?.nombre ?? null,
      zona: pdv?.zona ?? null,
      tipoEvento: event.tipo_evento,
      modoImpacto: normalizeAgendaImpactMode(event.modo_impacto),
      estatusAprobacion: event.estatus_aprobacion,
      estatusEjecucion: event.estatus_ejecucion,
      titulo: event.titulo,
      descripcion: event.descripcion,
      sede: event.sede,
      horaInicio: event.hora_inicio,
      horaFin: event.hora_fin,
      checkInAt: event.check_in_en,
      checkOutAt: event.check_out_en,
      metadata: event.metadata,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    })
    agendaEventsByRoute.set(event.ruta_semanal_id, current)
  }

  const pendingRepositionsByRoute = new Map<string, RutaAgendaPendingRecord[]>()
  for (const pending of pendientesReposicionRaw) {
    const pdv = pdvMap.get(pending.pdv_id)
    const current = pendingRepositionsByRoute.get(pending.ruta_semanal_id) ?? []
    current.push({
      id: pending.id,
      routeId: pending.ruta_semanal_id,
      visitId: pending.ruta_semanal_visita_id,
      agendaEventId: pending.agenda_evento_id,
      supervisorEmpleadoId: pending.supervisor_empleado_id,
      pdvId: pending.pdv_id,
      pdv: pdv?.nombre ?? null,
      zona: pdv?.zona ?? null,
      fechaOrigen: pending.fecha_origen,
      semanaSugeridaInicio: pending.semana_sugerida_inicio,
      clasificacion: pending.clasificacion,
      motivo: pending.motivo,
      estado: pending.estado,
      persisted: true,
    })
    pendingRepositionsByRoute.set(pending.ruta_semanal_id, current)
  }

  const rutas = rutasRaw.map((ruta) => {
    const supervisor = obtenerPrimero(ruta.supervisor)
    const visitas = sortWeeklyVisits(visitasPorRuta.get(ruta.id) ?? [])
    const routeEvents = agendaEventsByRoute.get(ruta.id) ?? []
    const routePendingRepositions = pendingRepositionsByRoute.get(ruta.id) ?? []
    const workflow = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    const monthPrefix = ruta.semana_inicio.slice(0, 7)
    const monthlyVisitsCompleted = visitasRaw.filter(
      (item) =>
        item.supervisor_empleado_id === ruta.supervisor_empleado_id &&
        item.cuenta_cliente_id === ruta.cuenta_cliente_id &&
        item.estatus === 'COMPLETADA' &&
        (item.completada_en ?? item.updated_at).slice(0, 7) === monthPrefix
    ).length

    return {
      id: ruta.id,
      cuentaClienteId: ruta.cuenta_cliente_id,
      supervisorEmpleadoId: ruta.supervisor_empleado_id,
      supervisor: supervisor?.nombre_completo ?? null,
      supervisorZona: supervisor?.zona ?? null,
      semanaInicio: ruta.semana_inicio,
      semanaFin: getWeekEndIso(ruta.semana_inicio),
      estatus: ruta.estatus,
      notas: ruta.notas,
      approvalState: workflow.approval.state,
      approvalNote: workflow.approval.note,
      approvalReviewedAt: workflow.approval.reviewedAt,
      minimumVisitsPerPdv: workflow.minimumVisitsPerPdv,
      expectedMonthlyVisits: workflow.expectedMonthlyVisits,
      pdvMonthlyQuotas: workflow.pdvMonthlyQuotas,
      monthlyVisitsCompleted,
      changeRequestState: workflow.changeRequest.status,
      changeRequestNote: workflow.changeRequest.note,
      changeRequestResolutionNote: workflow.changeRequest.resolutionNote,
      changeRequestType: workflow.changeRequest.requestType,
      changeRequestTargetScope: workflow.changeRequest.targetScope,
      changeRequestTargetVisitId: workflow.changeRequest.targetVisitId,
      changeRequestTargetPdvId: workflow.changeRequest.targetPdvId,
      changeRequestTargetDayNumber: workflow.changeRequest.targetDayNumber,
      changeRequestTargetDayLabel: workflow.changeRequest.targetDayLabel,
      changeRequestProposedVisits: workflow.changeRequest.proposedVisits.map((proposal) => {
        const proposalPdv = pdvMap.get(proposal.pdvId)

        return {
          pdvId: proposal.pdvId,
          order: proposal.order,
          pdv: proposalPdv?.nombre ?? null,
          zona: proposalPdv?.zona ?? null,
        } satisfies RutaChangeRequestProposedVisitItem
      }),
      changeRequestedAt: workflow.changeRequest.requestedAt,
      createdAt: ruta.created_at,
      updatedAt: ruta.updated_at,
      totalVisitas: visitas.length,
      visitasCompletadas: visitas.filter((item) => item.estatus === 'COMPLETADA').length,
      visitas,
      agendaEventosCount: routeEvents.length,
      pendientesReposicionCount: routePendingRepositions.length,
    } satisfies RutaSemanalItem
  })

  const activeAssignments = asignacionesRaw.filter((item) =>
    isAssignmentActiveForWeek(item, semanaActualInicio, semanaActualFin)
  )
  const pdvsDisponiblesMap = new Map<string, RutaSemanalPdvOption>()

  for (const item of activeAssignments) {
    const pdv = pdvMap.get(item.pdv_id)
    const geocerca = geocercaMap.get(item.pdv_id)

    if (!pdv || pdv.estatus !== 'ACTIVO') {
      continue
    }

    pdvsDisponiblesMap.set(item.pdv_id, {
      id: pdv.id,
      asignacionId: item.id,
      cuentaClienteId: item.cuenta_cliente_id,
      nombre: pdv.nombre,
      claveBtl: pdv.clave_btl,
      zona: pdv.zona,
      direccion: pdv.direccion,
      latitud: geocerca?.latitud ?? null,
      longitud: geocerca?.longitud ?? null,
      formato: pdv.formato,
      horarioReferencia: item.horario_referencia,
    })
  }

  if (puedeEditar) {
    for (const pdv of pdvsRaw) {
      if (pdv.estatus !== 'ACTIVO') {
        continue
      }

      const isOwnedBySupervisor = (Array.isArray(pdv.supervisor_pdv) ? pdv.supervisor_pdv : []).some((relation) => {
        const empleado = obtenerPrimero(relation.empleado)
        return (
          empleado?.id === actor.empleadoId &&
          isSupervisorPdvActiveForWeek(relation, semanaActualInicio, semanaActualFin)
        )
      })

      if (!isOwnedBySupervisor) {
        continue
      }

      const geocerca = geocercaMap.get(pdv.id)
      const current = pdvsDisponiblesMap.get(pdv.id)

      pdvsDisponiblesMap.set(pdv.id, {
        id: pdv.id,
        asignacionId: current?.asignacionId ?? null,
        cuentaClienteId: current?.cuentaClienteId ?? actor.cuentaClienteId,
        nombre: pdv.nombre,
        claveBtl: pdv.clave_btl,
        zona: pdv.zona,
        direccion: pdv.direccion,
        latitud: geocerca?.latitud ?? null,
        longitud: geocerca?.longitud ?? null,
        formato: pdv.formato,
        horarioReferencia: current?.horarioReferencia ?? null,
      })
    }
  }

  const pdvsDisponibles = Array.from(pdvsDisponiblesMap.values()).sort((left, right) =>
    left.nombre.localeCompare(right.nombre)
  )

  const warRoom = buildWarRoomData({
    actor,
    metadataColumnAvailable,
    rutas,
    agendaEventsByRoute,
    pendingRepositionsByRoute,
    pdvMap,
    pdvsWithSupervisors: pdvsRaw,
    geocercaMap,
    activeAssignments,
    employees: empleadosRaw,
    solicitudes: solicitudesRaw,
    weekStart: semanaActualInicio,
  })

  const rutaActivaSemanaActual =
    rutas.find(
      (item) =>
        item.semanaInicio === semanaActualInicio &&
        item.approvalState === 'APROBADA' &&
        (item.estatus === 'PUBLICADA' || item.estatus === 'EN_PROGRESO' || item.estatus === 'CERRADA')
    ) ?? null

  const rutaAgendaSemanaBase =
    rutaActivaSemanaActual ??
    rutas.find((item) => item.semanaInicio === semanaActualInicio) ??
    null

  const agendaSemanaActual: RutaAgendaOperativaDia[] = rutaAgendaSemanaBase
    ? Array.from({ length: 7 }, (_, index) => {
        const dayNumber = index + 1
        const fecha = addDaysToWeek(rutaAgendaSemanaBase.semanaInicio, dayNumber)
        const visitasPlaneadas = rutaAgendaSemanaBase.visitas.filter((item) => item.diaSemana === dayNumber)
        const agendaEventos = (agendaEventsByRoute.get(rutaAgendaSemanaBase.id) ?? []).filter(
          (item) => item.fechaOperacion === fecha
        )
        const pendientesPersistidos = (pendingRepositionsByRoute.get(rutaAgendaSemanaBase.id) ?? []).filter(
          (item) => item.fechaOrigen === fecha
        )

        const resolvedAgenda = resolveAgendaOperativaSupervisorDia({
          fecha,
          visitasPlaneadas: visitasPlaneadas as RutaAgendaBaseVisitInput[],
          agendaEventos,
          pendientesPersistidos,
          today:
            typeof options?.referenceDate === 'string'
              ? options.referenceDate.slice(0, 10)
              : options?.referenceDate instanceof Date
                ? options.referenceDate.toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10),
        })

        return {
          ...resolvedAgenda,
          visitasPlaneadas,
          visitasActivas: resolvedAgenda.visitasActivas as RutaSemanalVisitItem[],
          visitasDesplazadas: resolvedAgenda.visitasDesplazadas as RutaSemanalVisitItem[],
        } satisfies RutaAgendaOperativaDia
      })
    : []

  const agendaHoy = agendaSemanaActual.find(
    (item) => item.fecha === addDaysToWeek(semanaActualInicio, todayWeekdayNumber(options?.referenceDate))
  ) ?? null

  const agendaPendientesReposicion = dedupeAgendaPendings(
    [...pendingRepositionsByRoute.values()].flat().map((item) => ({
      ...item,
      persisted: true,
    })),
    agendaSemanaActual.flatMap((item) => item.pendientesReposicion)
  )

  const agendaEventosPendientesAprobacion = rutas
    .flatMap((route) => agendaEventsByRoute.get(route.id) ?? [])
    .filter((item) => item.estatusAprobacion === 'PENDIENTE_COORDINACION')
    .map((item) => resolveAgendaOperativaSupervisorDia({
      fecha: item.fechaOperacion,
      visitasPlaneadas: [],
      agendaEventos: [item],
      pendientesPersistidos: [],
    }).eventos[0]!)

  return {
    semanaActualInicio,
    semanaActualFin,
    puedeEditar,
    resumen: {
      totalRutas: rutas.length,
      totalVisitas: rutas.reduce((acc, item) => acc + item.totalVisitas, 0),
      visitasPlanificadas: rutas.reduce(
        (acc, item) => acc + item.visitas.filter((visita) => visita.estatus === 'PLANIFICADA').length,
        0
      ),
      visitasCompletadas: rutas.reduce((acc, item) => acc + item.visitasCompletadas, 0),
      pdvsAsignables: pdvsDisponibles.length,
    },
    rutas,
    rutaSemanaActual: rutaActivaSemanaActual,
    visitasHoy: sortWeeklyVisits(
      (rutaActivaSemanaActual?.visitas ?? []).filter(
        (item) => item.diaSemana === todayWeekdayNumber(options?.referenceDate)
      )
    ),
    agendaSemanaActual,
    agendaHoy,
    agendaPendientesReposicion,
    agendaEventosPendientesAprobacion,
    agendaInfrastructureAvailable: !agendaInfrastructureMissing,
    agendaInfrastructureMessage,
    pdvsDisponibles,
    infraestructuraLista: true,
    warRoom,
  }
}

function todayWeekdayNumber(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(`${value}T12:00:00`) : new Date()
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay()
}

function buildAsignacionesQuery(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  puedeEditar: boolean,
  allowGlobalScope: boolean
) {
  if (puedeEditar) {
    return supabase
      .from('asignacion')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, horario_referencia'
      )
      .eq('supervisor_empleado_id', actor.empleadoId)
      .order('created_at', { ascending: false })
      .limit(240)
  }

  let query = supabase
    .from('asignacion')
    .select(
      'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, horario_referencia'
    )
    .order('created_at', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  return query.limit(400)
}

async function fetchRutasWithWorkflowSupport(
  supabase: TypedSupabaseClient,
  {
    actor,
    puedeEditar,
    allowGlobalScope,
  }: {
    actor: ActorActual
    puedeEditar: boolean
    allowGlobalScope: boolean
  }
) {
  const run = (includeMetadata: boolean) => {
    const baseSelect = `
      id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      semana_inicio,
      estatus,
      notas,
      ${includeMetadata ? 'metadata,' : ''}
      created_at,
      updated_at,
      supervisor:supervisor_empleado_id(id, nombre_completo, zona)
    `

    const query = puedeEditar
      ? supabase
          .from('ruta_semanal')
          .select(baseSelect)
          .eq('supervisor_empleado_id', actor.empleadoId)
          .order('semana_inicio', { ascending: false })
          .limit(12)
      : supabase
          .from('ruta_semanal')
          .select(baseSelect)
          .order('semana_inicio', { ascending: false })
          .limit(24)

    return query
  }

  const result = await run(true)
  const message = result.error?.message ?? ''
  const metadataMissing =
    message.includes('ruta_semanal.metadata') ||
    (message.includes('column') && message.includes('metadata'))

  if (!metadataMissing) {
    return {
      result,
      metadataColumnAvailable: true,
    }
  }

  const fallback = await run(false)
  const filtered =
    (fallback.data ?? []).filter((item) => {
      const row = item as unknown as RutaQueryRow

      if (allowGlobalScope) {
        return true
      }

      if (actor.cuentaClienteId) {
        return row.cuenta_cliente_id === actor.cuentaClienteId
      }

      return true
    }) ?? []

  return {
    result: {
      data: filtered.map((item) => ({
        ...(item as unknown as RutaQueryRow),
        metadata: {},
      })) as RutaQueryRow[],
      error: null,
    },
    metadataColumnAvailable: false,
  }
}

function buildWarRoomData({
  actor,
  metadataColumnAvailable,
  rutas,
  agendaEventsByRoute,
  pendingRepositionsByRoute,
  pdvMap,
  pdvsWithSupervisors,
  geocercaMap,
  activeAssignments,
  employees,
  solicitudes,
  weekStart,
}: {
  actor: ActorActual
  metadataColumnAvailable: boolean
  rutas: RutaSemanalItem[]
  agendaEventsByRoute: Map<string, RutaAgendaEventRecord[]>
  pendingRepositionsByRoute: Map<string, RutaAgendaPendingRecord[]>
  pdvMap: Map<string, PdvMiniRow>
  pdvsWithSupervisors: PdvWarRoomRow[]
  geocercaMap: Map<string, GeocercaMiniRow>
  activeAssignments: AsignacionRutaRow[]
  employees: EmpleadoWarRoomRow[]
  solicitudes: SolicitudRutaRow[]
  weekStart: string
}): RutaSemanalWarRoomData {
  const monthPrefix = weekStart.slice(0, 7)
  const actorZone = employees.find((item) => item.id === actor.empleadoId)?.zona ?? null
  const rutasVisibles =
    actor.puesto === 'SUPERVISOR' ? rutas.filter((item) => item.supervisorEmpleadoId === actor.empleadoId) : rutas
  const assignmentMap = new Map<string, AsignacionRutaRow[]>()
  const pdvBaseMap = new Map<string, PdvMiniRow[]>()

  for (const assignment of activeAssignments) {
    if (!assignment.supervisor_empleado_id || assignment.estado_publicacion !== 'PUBLICADA') {
      continue
    }

    const current = assignmentMap.get(assignment.supervisor_empleado_id) ?? []
    current.push(assignment)
    assignmentMap.set(assignment.supervisor_empleado_id, current)
  }

  for (const pdv of pdvsWithSupervisors) {
    if (pdv.estatus !== 'ACTIVO') {
      continue
    }

    const supervisors = (Array.isArray(pdv.supervisor_pdv) ? pdv.supervisor_pdv : []).sort((left, right) => {
      if (left.activo !== right.activo) {
        return left.activo ? -1 : 1
      }

      return right.fecha_inicio.localeCompare(left.fecha_inicio)
    })
    const currentSupervisor = supervisors.find((item) => item.activo) ?? supervisors[0] ?? null
    const empleado = obtenerPrimero(currentSupervisor?.empleado ?? null)
    if (!empleado?.id) {
      continue
    }

    const current = pdvBaseMap.get(empleado.id) ?? []
    current.push({
      id: pdv.id,
      clave_btl: pdv.clave_btl,
      nombre: pdv.nombre,
      zona: pdv.zona,
      direccion: pdv.direccion,
      estatus: pdv.estatus,
      formato: pdv.formato,
    })
    pdvBaseMap.set(empleado.id, current)
  }

  const supervisorCatalog = employees
    .filter((item) => item.puesto === 'SUPERVISOR' && item.estatus_laboral === 'ACTIVO')
    .filter((item) => {
      if (actor.puesto === 'SUPERVISOR') {
        return item.id === actor.empleadoId
      }

      if (actor.puesto === 'COORDINADOR') {
        return true
      }

      return true
    })

  const supervisors = Array.from(
    new Set([
      ...supervisorCatalog.map((item) => item.id),
      ...rutasVisibles.map((item) => item.supervisorEmpleadoId),
      ...assignmentMap.keys(),
      ...pdvBaseMap.keys(),
    ])
  )
    .map((supervisorEmpleadoId) => {
      const supervisorProfile = supervisorCatalog.find((item) => item.id === supervisorEmpleadoId) ?? null
      const currentRoute =
        rutasVisibles.find((item) => item.supervisorEmpleadoId === supervisorEmpleadoId && item.semanaInicio === weekStart) ??
        rutasVisibles.find((item) => item.supervisorEmpleadoId === supervisorEmpleadoId) ??
        null
      const assignments = assignmentMap.get(supervisorEmpleadoId) ?? []
      const pdvsBase = pdvBaseMap.get(supervisorEmpleadoId) ?? []
      const blockedDays = solicitudes
        .filter((item) => item.empleado_id === supervisorEmpleadoId)
        .filter((item) => item.estatus !== 'RECHAZADA')
        .filter((item) => item.fecha_fin.slice(0, 7) === monthPrefix || item.fecha_inicio.slice(0, 7) === monthPrefix)
        .map((item) => ({
          solicitudId: item.id,
          tipo: item.tipo,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
          estatus: item.estatus,
          label: `${item.tipo === 'PERMISO' ? 'Cumpleanos' : item.tipo} ${item.fecha_inicio} - ${item.fecha_fin}`,
        }))

      const pdvCandidates = new Map<
        string,
        {
          pdv: PdvMiniRow
          hasActiveAssignment: boolean
        }
      >()

      for (const pdv of pdvsBase) {
        pdvCandidates.set(pdv.id, {
          pdv,
          hasActiveAssignment: false,
        })
      }

      for (const assignment of assignments) {
        const pdv = pdvMap.get(assignment.pdv_id)
        if (!pdv || pdv.estatus !== 'ACTIVO') {
          continue
        }

        pdvCandidates.set(assignment.pdv_id, {
          pdv,
          hasActiveAssignment: true,
        })
      }

      const quotaProgress = Array.from(pdvCandidates.values())
        .map(({ pdv }) => {
          const geocerca = geocercaMap.get(pdv.id)
          const visitsForPdv = rutas
            .flatMap((item) => item.visitas)
            .filter((visit) => visit.supervisorEmpleadoId === supervisorEmpleadoId && visit.pdvId === pdv.id)
          const visitasRealizadas = visitsForPdv.filter((visit) => visit.estatus === 'COMPLETADA').length
          const quotaMensual =
            currentRoute?.minimumVisitsPerPdv ??
            currentRoute?.pdvMonthlyQuotas[pdv.id] ??
            0
          const visitasPendientes = Math.max(quotaMensual - visitasRealizadas, 0)
          const cumplimientoPorcentaje = Math.min(
            100,
            quotaMensual > 0 ? Math.round((visitasRealizadas / quotaMensual) * 100) : 0
          )

          return {
            pdvId: pdv.id,
            claveBtl: pdv.clave_btl,
            nombre: pdv.nombre,
            formato: pdv.formato,
            zona: pdv.zona,
            prioridad:
              visitasPendientes >= 2 ? 'ALTA' : visitasPendientes === 1 ? 'MEDIA' : 'BAJA',
            quotaMensual,
            visitasRealizadas,
            visitasPendientes,
            cumplimientoPorcentaje,
            latitud: geocerca?.latitud ?? null,
            longitud: geocerca?.longitud ?? null,
          } satisfies RutaQuotaProgressItem
        })
        .filter((item): item is RutaQuotaProgressItem => Boolean(item))
        .sort((left, right) => right.visitasPendientes - left.visitasPendientes || left.nombre.localeCompare(right.nombre))

      const minimumVisitsPerPdv = currentRoute?.minimumVisitsPerPdv ?? null
      const expectedMonthlyVisits =
        currentRoute?.expectedMonthlyVisits ??
        (minimumVisitsPerPdv !== null
          ? Math.max(minimumVisitsPerPdv * quotaProgress.length, 0)
          : Math.max(quotaProgress.reduce((acc, item) => acc + item.quotaMensual, 0), 0))
      const monthlyVisitsCompleted =
        currentRoute?.monthlyVisitsCompleted ??
        rutas
          .flatMap((item) => item.visitas)
          .filter((visit) => visit.supervisorEmpleadoId === supervisorEmpleadoId)
          .filter((visit) => visit.estatus === 'COMPLETADA')
          .length
      const cumplimientoPorcentaje =
        expectedMonthlyVisits > 0
          ? Math.min(100, Math.round((monthlyVisitsCompleted / expectedMonthlyVisits) * 100))
          : 0

      const reassignmentAlerts = (currentRoute?.visitas ?? [])
        .filter((visit) => {
          const visitDate = addDaysToWeek(weekStart, visit.diaSemana)
          return blockedDays.some((blocked) => visitDate >= blocked.fechaInicio && visitDate <= blocked.fechaFin)
        })
        .map((visit) => ({
          visitId: visit.id,
          diaLabel: visit.diaLabel,
          pdv: visit.pdv,
          motivo: 'La persona tiene un dia bloqueado por solicitud aprobada o en curso.',
        }))

      return {
        supervisorEmpleadoId,
        supervisor:
          currentRoute?.supervisor ??
          supervisorProfile?.nombre_completo ??
          `Supervisor ${supervisorEmpleadoId.slice(0, 8)}`,
        zona: currentRoute?.supervisorZona ?? supervisorProfile?.zona ?? quotaProgress[0]?.zona ?? null,
        rutaId: currentRoute?.id ?? null,
        weekStart,
        rutaEstatus: currentRoute?.estatus ?? null,
        approvalState: currentRoute?.approvalState ?? 'PENDIENTE_COORDINACION',
        minimumVisitsPerPdv,
        monthlyVisitsCompleted,
        expectedMonthlyVisits,
        cumplimientoPorcentaje,
        semaforo:
          cumplimientoPorcentaje >= 85
            ? 'OK'
            : cumplimientoPorcentaje >= 60
              ? 'RIESGO'
              : 'CRITICO',
        totalPdvsAsignados: quotaProgress.length,
        changeRequestsPendientes: rutasVisibles.filter(
          (item) =>
            item.supervisorEmpleadoId === supervisorEmpleadoId &&
            item.changeRequestState === 'PENDIENTE'
        ).length,
        agendaApprovalsPendientes: rutas
          .flatMap((item) => agendaEventsByRoute.get(item.id) ?? [])
          .filter(
            (item) =>
              item.supervisorEmpleadoId === supervisorEmpleadoId &&
              item.estatusAprobacion === 'PENDIENTE_COORDINACION'
          ).length,
        visitasPendientesReposicion: rutas
          .flatMap((item) => pendingRepositionsByRoute.get(item.id) ?? [])
          .filter(
            (item) =>
              item.supervisorEmpleadoId === supervisorEmpleadoId &&
              item.estado !== 'DESCARTADA' &&
              item.estado !== 'EJECUTADA'
          ).length,
        blockedDays,
        reassignmentAlerts,
        quotaProgress,
      } satisfies RutaSupervisorWarRoomItem
    })
    .sort((left, right) => right.cumplimientoPorcentaje - left.cumplimientoPorcentaje)

  const planningStatus: RutaPlanningStatusCount[] = [
    { key: 'TODAS', label: 'Todas', count: rutasVisibles.length },
    { key: 'BORRADOR', label: 'Borrador', count: rutasVisibles.filter((item) => item.estatus === 'BORRADOR').length },
    { key: 'PUBLICADA', label: 'Publicada', count: rutasVisibles.filter((item) => item.estatus === 'PUBLICADA').length },
    { key: 'EN_PROGRESO', label: 'En curso', count: rutasVisibles.filter((item) => item.estatus === 'EN_PROGRESO').length },
    { key: 'CERRADA', label: 'Completada', count: rutasVisibles.filter((item) => item.estatus === 'CERRADA').length },
  ]

  const exceptions = rutasVisibles
    .flatMap((route) =>
      route.visitas
        .filter((visit) => visit.estatus !== 'COMPLETADA' || visit.checkInGpsState === 'FUERA_GEOCERCA')
        .map((visit) => ({
          routeId: route.id,
          visitId: visit.id,
          supervisor: route.supervisor,
          pdv: visit.pdv,
          diaLabel: visit.diaLabel,
          motivo:
            visit.checkInGpsState === 'FUERA_GEOCERCA'
              ? 'Check-in fuera de geocerca'
              : visit.checkInAt
                ? 'Visita abierta sin cierre completo'
                : route.changeRequestState === 'PENDIENTE'
                  ? 'Cambio de ruta pendiente de aprobacion'
                  : 'Tienda programada sin visita registrada',
          tone:
            visit.checkInGpsState === 'FUERA_GEOCERCA'
              ? 'rose'
              : route.changeRequestState === 'PENDIENTE'
                ? 'sky'
                : 'amber',
        } satisfies RutaExceptionItem))
    )
    .slice(0, 16)

  return {
    metadataColumnAvailable,
    supervisors,
    planningStatus,
    exceptions,
  }
}

function addDaysToWeek(weekStart: string, diaSemana: number) {
  const date = new Date(`${weekStart}T12:00:00`)
  date.setUTCDate(date.getUTCDate() + (diaSemana - 1))
  return date.toISOString().slice(0, 10)
}
