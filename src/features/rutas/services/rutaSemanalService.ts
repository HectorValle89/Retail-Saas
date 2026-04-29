import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { buildModuleCacheTags } from '@/lib/cache/moduleTags'
import { getIsoDateInMexicoCity, getWeekDayNumberInMexicoCity } from '@/lib/geo/mexicoStateTimezone'
import { createServiceClient } from '@/lib/supabase/server'
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
import { buildSupervisorRouteSlices, getEditableDayNumbersForRoute } from '../lib/routeTemporalSlices'
import {
  parseRutaSemanalWorkflowMetadata,
  parseRutaVisitaWorkflowMetadata,
  type RutaApprovalState,
  type RutaChangeRequestType,
  type RutaChangeRequestTargetScope,
  type RutaChangeRequestState,
} from '../lib/routeWorkflow'
import { normalizeAgendaImpactMode } from '../lib/routeAgenda'
import { calculateSupervisorChecklistCompletion } from '../lib/supervisorVisitChecklist'
import { isOperablePdvStatus } from '@/features/pdvs/lib/pdvStatus'
import {
  resolveAgendaOperativaSupervisorDia,
  type RutaAgendaBaseVisitInput,
  type RutaAgendaEventRecord,
  type RutaAgendaPendingRecord,
} from './rutaAgendaService'
import {
  buildVisiblePdvIds,
  collectRutaReferencePdvIds,
  resolveRutaPdvSnapshot,
} from './rutaSemanalPdvLookup'
import { getPlanningRouteForWeek } from '../lib/routeWorkspace'

type MaybeMany<T> = T | T[] | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

function getCurrentDayValue() {
  return getIsoDateInMexicoCity()
}

function mapPdvWarRoomRowToMiniRow(item: PdvWarRoomRow): PdvMiniRow {
  return {
    id: item.id,
    clave_btl: item.clave_btl,
    nombre: item.nombre,
    zona: item.zona,
    direccion: item.direccion,
    estatus: item.estatus,
    formato: item.formato,
    cadenaNombre: obtenerPrimero(item.cadena)?.nombre ?? null,
    cadenaCodigo: obtenerPrimero(item.cadena)?.codigo ?? null,
  }
}

type EmpleadoMiniRow = Pick<Empleado, 'id' | 'nombre_completo' | 'zona'>
type CadenaMiniRow = {
  id: string
  codigo: string | null
  nombre: string | null
}
type EmpleadoWarRoomRow = Pick<
  Empleado,
  'id' | 'nombre_completo' | 'puesto' | 'zona' | 'estatus_laboral' | 'supervisor_empleado_id'
>
type PdvMiniRow = Pick<
  Pdv,
  'id' | 'clave_btl' | 'nombre' | 'zona' | 'direccion' | 'estatus' | 'formato'
> & {
  cadenaNombre?: string | null
  cadenaCodigo?: string | null
}
type PdvSupervisorRelacionRow = {
  id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  empleado: MaybeMany<EmpleadoMiniRow>
}
type PdvWarRoomRow = PdvMiniRow & {
  cadena: MaybeMany<CadenaMiniRow>
  supervisor_pdv: MaybeMany<PdvSupervisorRelacionRow>
}
const PDV_LOOKUP_SELECT = `
  id,
  clave_btl,
  nombre,
  zona,
  direccion,
  estatus,
  formato,
  cadena:cadena_id(id, codigo, nombre),
  supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona))
`
type GeocercaMiniRow = Pick<GeocercaPdv, 'pdv_id' | 'latitud' | 'longitud' | 'radio_tolerancia_metros'>
type CuentaClientePdvRow = {
  pdv_id: string
  cuenta_cliente_id: string
  activo: boolean
  fecha_fin: string | null
}
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
> & {
  pdv?: MaybeMany<PdvMiniRow>
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
> & {
  pdv?: MaybeMany<PdvMiniRow>
}

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
> & {
  pdv?: MaybeMany<PdvMiniRow>
}

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

type PdvRotacionMaestraRutaRow = {
  pdv_id: string
  clasificacion_maestra: 'FIJO' | 'ROTATIVO'
  grupo_rotacion_codigo: string | null
}

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
  cadena: string | null
  cadenaCodigo: string | null
  formato: string | null
  zona: string | null
  clasificacionMaestra: 'FIJO' | 'ROTATIVO' | null
  grupoRotacionCodigo: string | null
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

export type VisitReachStoreTypeFilter = '' | 'FIJO' | 'ROTATIVO'

export interface VisitReachDashboardFilters {
  supervisorEmpleadoId: string
  weekStart: string
  cadenaCodigo: string
  storeType: VisitReachStoreTypeFilter
}

export interface VisitReachDashboardFilterOptions {
  supervisors: Array<{ id: string; nombre: string }>
  cadenas: Array<{ value: string; label: string }>
  storeTypes: Array<{ value: VisitReachStoreTypeFilter; label: string }>
}

export interface VisitReachPdvGapItem {
  pdvId: string
  claveBtl: string
  nombre: string
  cadena: string | null
  cadenaCodigo: string | null
  zona: string | null
  clasificacionMaestra: 'FIJO' | 'ROTATIVO' | null
  grupoRotacionCodigo: string | null
  monthlyTarget: number
  monthlyCompleted: number
  monthlyPending: number
  monthlyCompletionPct: number
  weeklyPlanned: number
  weeklyCompleted: number
  weeklyPending: number
  weeklyCompletionPct: number
}

export interface VisitReachSupervisorItem {
  supervisorEmpleadoId: string
  supervisor: string
  zona: string | null
  semaforo: 'OK' | 'RIESGO' | 'CRITICO'
  visibleStores: number
  monthlyTarget: number
  monthlyCompleted: number
  monthlyPending: number
  monthlyCompletionPct: number
  weeklyPlanned: number
  weeklyCompleted: number
  weeklyPending: number
  weeklyCompletionPct: number
  storesWithoutVisitMonth: number
  storesWithoutVisitWeek: number
  pdvGaps: VisitReachPdvGapItem[]
}

export interface VisitReachDashboardSummary {
  weekStart: string
  weekEnd: string
  filters: VisitReachDashboardFilters
  options: VisitReachDashboardFilterOptions
  monthlyTarget: number
  monthlyCompleted: number
  monthlyPending: number
  monthlyCompletionPct: number
  weeklyPlanned: number
  weeklyCompleted: number
  weeklyPending: number
  weeklyCompletionPct: number
  storesWithoutVisitMonth: number
  storesWithoutVisitWeek: number
  visibleSupervisors: number
  detailEnabled: boolean
  supervisors: VisitReachSupervisorItem[]
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
  selfieUrl: string | null
  evidenciaUrl: string | null
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
  editableDayNumbers: number[]
  hasEditableFutureDays: boolean
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
  rutasCorrecciones: RutaSemanalItem[]
  rutasHistoricasMesActual: RutaSemanalItem[]
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

export interface SupervisorTodayRouteData {
  semanaActualInicio: string
  semanaActualFin: string
  visitasHoy: RutaSemanalVisitItem[]
  eventosHoy: RutaAgendaEventoItem[]
  agendaInfrastructureAvailable: boolean
  agendaInfrastructureMessage?: string
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
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
  rutasCorrecciones: [],
  rutasHistoricasMesActual: [],
  rutaSemanaActual: null,
  visitasHoy: [],
  agendaSemanaActual: [],
  agendaHoy: null,
  agendaPendientesReposicion: [],
  agendaEventosPendientesAprobacion: [],
  agendaInfrastructureAvailable: true,
  pdvsDisponibles: [],
  infraestructuraLista: false,
  warRoom: buildEmptyWarRoomData(),
}

function buildEmptyWarRoomData(metadataColumnAvailable = true): RutaSemanalWarRoomData {
  return {
    metadataColumnAvailable,
    supervisors: [],
    planningStatus: [
      { key: 'TODAS', label: 'Todas', count: 0 },
      { key: 'BORRADOR', label: 'Borrador', count: 0 },
      { key: 'PUBLICADA', label: 'Publicada', count: 0 },
      { key: 'EN_PROGRESO', label: 'En curso', count: 0 },
      { key: 'CERRADA', label: 'Completada', count: 0 },
    ],
    exceptions: [],
  }
}

function buildRutaSemanalCacheKey(actor: ActorActual, referenceDate?: string | Date) {
  const weekStart = getWeekStartIso(referenceDate)
  return [
    'ruta-semanal-panel',
    actor.cuentaClienteId ?? 'global',
    actor.empleadoId,
    actor.puesto,
    weekStart,
  ]
}

function buildRutaSemanalCacheTags(actor: ActorActual, referenceDate?: string | Date) {
  return buildModuleCacheTags({
    module: 'ruta-semanal',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
    period: getWeekStartIso(referenceDate),
  })
}

function obtenerPrimero<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function mapRutaVisitaToItem(
  visita: RutaVisitaQueryRow,
  pdv: PdvMiniRow | null,
  geocerca: GeocercaMiniRow | null
): RutaSemanalVisitItem {
  const visitWorkflow = parseRutaVisitaWorkflowMetadata(visita.metadata)
  const checklistCalidad = (visita.checklist_calidad ?? {}) as Record<string, boolean>
  const checklistCompletion = calculateSupervisorChecklistCompletion(checklistCalidad).percentage

  return {
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
  }
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

function normalizeVisitReachStoreType(value: string | null | undefined): VisitReachStoreTypeFilter {
  return value === 'FIJO' || value === 'ROTATIVO' ? value : ''
}

function normalizeVisitReachFilters(
  value: {
    supervisorEmpleadoId?: string | null
    weekStart?: string | Date | null
    cadenaCodigo?: string | null
    storeType?: string | null
  } = {}
): VisitReachDashboardFilters {
  return {
    supervisorEmpleadoId: typeof value.supervisorEmpleadoId === 'string' ? value.supervisorEmpleadoId.trim() : '',
    weekStart: getWeekStartIso(value.weekStart ?? undefined),
    cadenaCodigo: typeof value.cadenaCodigo === 'string' ? value.cadenaCodigo.trim().toUpperCase() : '',
    storeType: normalizeVisitReachStoreType(value.storeType),
  }
}

function getVisitReachStoreTypeLabel(value: VisitReachStoreTypeFilter) {
  if (value === 'FIJO') {
    return 'Fijas'
  }

  if (value === 'ROTATIVO') {
    return 'Rotativas'
  }

  return 'Todas'
}

export async function obtenerResumenAlcanceVisitas(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  options?: {
    supervisorEmpleadoId?: string | null
    weekStart?: string | Date | null
    cadenaCodigo?: string | null
    storeType?: string | null
  }
): Promise<VisitReachDashboardSummary> {
  const filters = normalizeVisitReachFilters(options)
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId
  const weekStart = filters.weekStart
  const weekEnd = getWeekEndIso(weekStart)

  const { result: rutasResult, metadataColumnAvailable } = await fetchRutasWithWorkflowSupport(supabase, {
    actor,
    puedeEditar: false,
    allowGlobalScope,
    limit: 120,
    ensureWeekStart: weekStart,
  })

  const rutasRaw = ((rutasResult.data ?? []) as RutaQueryRow[]).filter((item) => {
    if (allowGlobalScope) {
      return true
    }

    if (actor.cuentaClienteId) {
      return item.cuenta_cliente_id === actor.cuentaClienteId
    }

    return true
  })

  const rutaIds = Array.from(new Set(rutasRaw.map((item) => item.id)))
  const visitasPromise =
    rutaIds.length === 0
      ? Promise.resolve({ data: [] as RutaVisitaQueryRow[], error: null })
      : supabase
          .from('ruta_semanal_visita')
          .select(
            'id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, asignacion_id, dia_semana, orden, estatus, selfie_url, evidencia_url, checklist_calidad, comentarios, completada_en, metadata, created_at, updated_at'
          )
          .in('ruta_semanal_id', rutaIds)
          .order('dia_semana', { ascending: true })
          .limit(1600)

  let rotationQuery = supabase
    .from('pdv_rotacion_maestra')
    .select('pdv_id, clasificacion_maestra, grupo_rotacion_codigo')
    .eq('vigente', true)

  if (actor.cuentaClienteId) {
    rotationQuery = rotationQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const [visitasResult, pdvsResult, asignacionesResult, empleadosResult, rotationResult] = await Promise.all([
    visitasPromise,
    supabase
      .from('pdv')
      .select(
        'id, clave_btl, nombre, zona, direccion, estatus, formato, cadena:cadena_id(id, codigo, nombre), supervisor_pdv(id, activo, fecha_inicio, fecha_fin, empleado:empleado_id(id, nombre_completo, zona))'
      )
      .order('nombre', { ascending: true })
      .limit(500),
    buildAsignacionesQuery(supabase, actor, false, allowGlobalScope),
    supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, zona, estatus_laboral, supervisor_empleado_id')
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true })
      .limit(400),
    rotationQuery.limit(700),
  ])

  const errorMessage =
    rutasResult.error?.message ??
    visitasResult.error?.message ??
    pdvsResult.error?.message ??
    (asignacionesResult as { error?: { message?: string } | null }).error?.message ??
    empleadosResult.error?.message ??
    (rotationResult as { error?: { message?: string } | null }).error?.message ??
    null

  if (errorMessage) {
    return {
      weekStart,
      weekEnd,
      filters,
      options: {
        supervisors: [],
        cadenas: [],
        storeTypes: [
          { value: '', label: getVisitReachStoreTypeLabel('') },
          { value: 'FIJO', label: getVisitReachStoreTypeLabel('FIJO') },
          { value: 'ROTATIVO', label: getVisitReachStoreTypeLabel('ROTATIVO') },
        ],
      },
      monthlyTarget: 0,
      monthlyCompleted: 0,
      monthlyPending: 0,
      monthlyCompletionPct: 0,
      weeklyPlanned: 0,
      weeklyCompleted: 0,
      weeklyPending: 0,
      weeklyCompletionPct: 0,
      storesWithoutVisitMonth: 0,
      storesWithoutVisitWeek: 0,
      visibleSupervisors: 0,
      detailEnabled: Boolean(filters.supervisorEmpleadoId),
      supervisors: [],
    }
  }

  const pdvsRaw = (pdvsResult.data ?? []) as PdvWarRoomRow[]
  const asignacionesRaw = ((asignacionesResult as { data?: unknown[] | null }).data ?? []) as AsignacionRutaRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoWarRoomRow[]
  const rotacionRaw = ((rotationResult as { data?: unknown[] | null }).data ?? []) as PdvRotacionMaestraRutaRow[]
  const visitasRaw = (visitasResult.data ?? []) as RutaVisitaQueryRow[]
  const pdvMap = new Map(
    pdvsRaw.map((item) => [
      item.id,
      mapPdvWarRoomRowToMiniRow(item),
    ])
  )

  const rotacionMap = new Map(rotacionRaw.map((item) => [item.pdv_id, item]))
  const visitasPorRuta = new Map<string, RutaSemanalVisitItem[]>()

  for (const visita of visitasRaw) {
    const pdv = pdvMap.get(visita.pdv_id)
    const current = visitasPorRuta.get(visita.ruta_semanal_id) ?? []
    const visitWorkflow = parseRutaVisitaWorkflowMetadata(visita.metadata)
    const checklistCalidad = (visita.checklist_calidad ?? {}) as Record<string, boolean>
    const checklistCompletion = calculateSupervisorChecklistCompletion(checklistCalidad).percentage

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
      latitud: null,
      longitud: null,
      geocercaRadioMetros: null,
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

  const todayIso = getCurrentDayValue()

  const rutas = rutasRaw.map((ruta) => {
    const supervisor = obtenerPrimero(ruta.supervisor)
    const visitas = sortWeeklyVisits(visitasPorRuta.get(ruta.id) ?? [])
    const workflow = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    const monthPrefix = ruta.semana_inicio.slice(0, 7)
    const editableDayNumbers = getEditableDayNumbersForRoute(
      {
        semanaInicio: ruta.semana_inicio,
        visitas,
      },
      todayIso
    )
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
      editableDayNumbers,
      hasEditableFutureDays: editableDayNumbers.length > 0,
      visitas,
      agendaEventosCount: 0,
      pendientesReposicionCount: 0,
    } satisfies RutaSemanalItem
  })

  const activeAssignments = asignacionesRaw.filter((item) => isAssignmentActiveForWeek(item, weekStart, weekEnd))
  const warRoom = buildWarRoomData({
    actor,
    metadataColumnAvailable,
    rutas,
    agendaEventsByRoute: new Map(),
    pendingRepositionsByRoute: new Map(),
    pdvMap,
    pdvsWithSupervisors: pdvsRaw,
    geocercaMap: new Map(),
    rotacionMap,
    activeAssignments,
    employees: empleadosRaw,
    weekStart,
  })

  const chainOptions = Array.from(
    warRoom.supervisors
      .flatMap((item) => item.quotaProgress)
      .reduce((map, item) => {
        const key = (item.cadenaCodigo ?? '').trim().toUpperCase()
        const label = (item.cadena ?? '').trim()

        if (key && label && !map.has(key)) {
          map.set(key, label)
        }

        return map
      }, new Map<string, string>())
      .entries()
  )
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label))

  const supervisors = warRoom.supervisors
    .map((item) => {
      const quotaProgress = item.quotaProgress.filter((pdvItem) => {
        const matchesChain =
          !filters.cadenaCodigo ||
          (pdvItem.cadenaCodigo ?? '').trim().toUpperCase() === filters.cadenaCodigo
        const matchesStoreType = !filters.storeType || pdvItem.clasificacionMaestra === filters.storeType
        return matchesChain && matchesStoreType
      })

      if (filters.supervisorEmpleadoId && item.supervisorEmpleadoId !== filters.supervisorEmpleadoId) {
        return null
      }

      const visiblePdvIds = new Set(quotaProgress.map((pdvItem) => pdvItem.pdvId))
      const monthPrefix = weekStart.slice(0, 7)
      const monthlyVisits = rutas
        .filter(
          (route) =>
            route.supervisorEmpleadoId === item.supervisorEmpleadoId &&
            route.semanaInicio.slice(0, 7) === monthPrefix
        )
        .flatMap((route) =>
          route.visitas.filter((visit) => visiblePdvIds.size === 0 || visiblePdvIds.has(visit.pdvId))
        )
      const weeklyRoutes = rutas.filter(
        (route) => route.supervisorEmpleadoId === item.supervisorEmpleadoId && route.semanaInicio === weekStart
      )
      const weeklyVisits = weeklyRoutes.flatMap((route) =>
        route.visitas.filter((visit) => visiblePdvIds.size === 0 || visiblePdvIds.has(visit.pdvId))
      )
      const monthlyCompletedByPdv = monthlyVisits.reduce((map, visit) => {
        if (visit.estatus !== 'COMPLETADA') {
          return map
        }

        map.set(visit.pdvId, (map.get(visit.pdvId) ?? 0) + 1)
        return map
      }, new Map<string, number>())
      const weeklyPlanned = weeklyVisits.length
      const weeklyCompleted = weeklyVisits.filter((visit) => visit.estatus === 'COMPLETADA').length
      const weeklyPending = Math.max(weeklyPlanned - weeklyCompleted, 0)
      const weeklyCompletionPct =
        weeklyPlanned > 0 ? Math.max(0, Math.min(100, Math.round((weeklyCompleted / weeklyPlanned) * 100))) : 0
      const monthlyTarget = quotaProgress.reduce((acc, pdvItem) => acc + pdvItem.quotaMensual, 0)
      const monthlyCompleted = quotaProgress.reduce(
        (acc, pdvItem) => acc + (monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0),
        0
      )
      const monthlyPending = quotaProgress.reduce(
        (acc, pdvItem) => acc + Math.max(pdvItem.quotaMensual - (monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0), 0),
        0
      )
      const monthlyCompletionPct =
        monthlyTarget > 0 ? Math.max(0, Math.min(100, Math.round((monthlyCompleted / monthlyTarget) * 100))) : 0
      const weeklyCompletedByPdv = weeklyVisits.reduce((map, visit) => {
        if (visit.estatus !== 'COMPLETADA') {
          return map
        }

        map.set(visit.pdvId, (map.get(visit.pdvId) ?? 0) + 1)
        return map
      }, new Map<string, number>())
      const storesWithoutVisitMonth = quotaProgress.filter(
        (pdvItem) => pdvItem.quotaMensual > 0 && (monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0) === 0
      ).length
      const storesWithoutVisitWeek = quotaProgress.filter(
        (pdvItem) => pdvItem.quotaMensual > 0 && (weeklyCompletedByPdv.get(pdvItem.pdvId) ?? 0) === 0
      ).length

      return {
        supervisorEmpleadoId: item.supervisorEmpleadoId,
        supervisor: item.supervisor,
        zona: item.zona,
        semaforo: monthlyCompletionPct >= 85 ? 'OK' : monthlyCompletionPct >= 60 ? 'RIESGO' : 'CRITICO',
        visibleStores: quotaProgress.length,
        monthlyTarget,
        monthlyCompleted,
        monthlyPending,
        monthlyCompletionPct,
        weeklyPlanned,
        weeklyCompleted,
        weeklyPending,
        weeklyCompletionPct,
        storesWithoutVisitMonth,
        storesWithoutVisitWeek,
        pdvGaps:
          filters.supervisorEmpleadoId && item.supervisorEmpleadoId === filters.supervisorEmpleadoId
            ? quotaProgress.map((pdvItem) => {
                const visitsForPdv = weeklyVisits.filter((visit) => visit.pdvId === pdvItem.pdvId)
                const pdvWeeklyPlanned = visitsForPdv.length
                const pdvWeeklyCompleted = visitsForPdv.filter((visit) => visit.estatus === 'COMPLETADA').length
                const pdvWeeklyPending = Math.max(pdvWeeklyPlanned - pdvWeeklyCompleted, 0)
                const pdvWeeklyCompletionPct =
                  pdvWeeklyPlanned > 0
                    ? Math.max(0, Math.min(100, Math.round((pdvWeeklyCompleted / pdvWeeklyPlanned) * 100)))
                    : 0

                return {
                  pdvId: pdvItem.pdvId,
                  claveBtl: pdvItem.claveBtl,
                  nombre: pdvItem.nombre,
                  cadena: pdvItem.cadena,
                  cadenaCodigo: pdvItem.cadenaCodigo,
                  zona: pdvItem.zona,
                  clasificacionMaestra: pdvItem.clasificacionMaestra,
                  grupoRotacionCodigo: pdvItem.grupoRotacionCodigo,
                  monthlyTarget: pdvItem.quotaMensual,
                  monthlyCompleted: monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0,
                  monthlyPending: Math.max(
                    pdvItem.quotaMensual - (monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0),
                    0
                  ),
                  monthlyCompletionPct:
                    pdvItem.quotaMensual > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round(((monthlyCompletedByPdv.get(pdvItem.pdvId) ?? 0) / pdvItem.quotaMensual) * 100)
                          )
                        )
                      : 0,
                  weeklyPlanned: pdvWeeklyPlanned,
                  weeklyCompleted: pdvWeeklyCompleted,
                  weeklyPending: pdvWeeklyPending,
                  weeklyCompletionPct: pdvWeeklyCompletionPct,
                } satisfies VisitReachPdvGapItem
              })
            : [],
      } satisfies VisitReachSupervisorItem
    })
    .filter((item): item is VisitReachSupervisorItem => Boolean(item))
    .sort((left, right) => right.monthlyCompletionPct - left.monthlyCompletionPct || left.supervisor.localeCompare(right.supervisor))

  const summary = supervisors.reduce(
    (acc, supervisor) => {
      acc.monthlyTarget += supervisor.monthlyTarget
      acc.monthlyCompleted += supervisor.monthlyCompleted
      acc.monthlyPending += supervisor.monthlyPending
      acc.weeklyPlanned += supervisor.weeklyPlanned
      acc.weeklyCompleted += supervisor.weeklyCompleted
      acc.weeklyPending += supervisor.weeklyPending
      acc.storesWithoutVisitMonth += supervisor.storesWithoutVisitMonth
      acc.storesWithoutVisitWeek += supervisor.storesWithoutVisitWeek
      return acc
    },
    {
      monthlyTarget: 0,
      monthlyCompleted: 0,
      monthlyPending: 0,
      weeklyPlanned: 0,
      weeklyCompleted: 0,
      weeklyPending: 0,
      storesWithoutVisitMonth: 0,
      storesWithoutVisitWeek: 0,
    }
  )

  return {
    weekStart,
    weekEnd,
    filters,
    options: {
      supervisors: warRoom.supervisors.map((item) => ({ id: item.supervisorEmpleadoId, nombre: item.supervisor })),
      cadenas: chainOptions,
      storeTypes: [
        { value: '', label: getVisitReachStoreTypeLabel('') },
        { value: 'FIJO', label: getVisitReachStoreTypeLabel('FIJO') },
        { value: 'ROTATIVO', label: getVisitReachStoreTypeLabel('ROTATIVO') },
      ],
    },
    monthlyTarget: summary.monthlyTarget,
    monthlyCompleted: summary.monthlyCompleted,
    monthlyPending: summary.monthlyPending,
    monthlyCompletionPct:
      summary.monthlyTarget > 0
        ? Math.max(0, Math.min(100, Math.round((summary.monthlyCompleted / summary.monthlyTarget) * 100)))
        : 0,
    weeklyPlanned: summary.weeklyPlanned,
    weeklyCompleted: summary.weeklyCompleted,
    weeklyPending: summary.weeklyPending,
    weeklyCompletionPct:
      summary.weeklyPlanned > 0
        ? Math.max(0, Math.min(100, Math.round((summary.weeklyCompleted / summary.weeklyPlanned) * 100)))
        : 0,
    storesWithoutVisitMonth: summary.storesWithoutVisitMonth,
    storesWithoutVisitWeek: summary.storesWithoutVisitWeek,
    visibleSupervisors: supervisors.length,
    detailEnabled: Boolean(filters.supervisorEmpleadoId),
    supervisors,
  }
}

export async function obtenerPanelRutaSemanal(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  options?: {
    referenceDate?: string | Date
    includePlanningCatalog?: boolean
  }
): Promise<RutaSemanalPanelData> {
  const semanaActualInicio = getWeekStartIso(options?.referenceDate)
  const semanaActualFin = getWeekEndIso(semanaActualInicio)
  const puedeEditar = actor.puesto === 'SUPERVISOR'
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId
  const shouldBuildWarRoom = actor.puesto !== 'SUPERVISOR'
  const shouldLoadPlanningCatalog = options?.includePlanningCatalog ?? true
  const shouldLoadPdvCatalog = shouldLoadPlanningCatalog || shouldBuildWarRoom

  const {
    result: rutasResult,
    metadataColumnAvailable,
  } = await fetchRutasWithWorkflowSupport(supabase, {
    actor,
    puedeEditar,
    allowGlobalScope,
    ensureWeekStart: semanaActualInicio,
  })

  const rutasRaw = ((rutasResult.data ?? []) as RutaQueryRow[]).filter((item) => {
    if (allowGlobalScope) {
      return true
    }

    if (actor.cuentaClienteId) {
      return item.cuenta_cliente_id === actor.cuentaClienteId
    }

    return true
  })

  const rutaIds = rutasRaw.map((item) => item.id)

  let rotationQuery = supabase
    .from('pdv_rotacion_maestra')
    .select('pdv_id, clasificacion_maestra, grupo_rotacion_codigo')
    .eq('vigente', true)

  if (actor.cuentaClienteId) {
    rotationQuery = rotationQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  rotationQuery = rotationQuery.limit(600)

  const cuentaPdvResult =
    !shouldLoadPdvCatalog || allowGlobalScope || !actor.cuentaClienteId
      ? { data: [] as CuentaClientePdvRow[], error: null as { message: string } | null }
      : await supabase
          .from('cuenta_cliente_pdv')
          .select('pdv_id, cuenta_cliente_id, activo, fecha_fin')
          .eq('cuenta_cliente_id', actor.cuentaClienteId)
          .eq('activo', true)
          .or(`fecha_fin.is.null,fecha_fin.gte.${getCurrentDayValue()}`)
          .limit(1000)

  const visiblePdvIds =
    !shouldLoadPdvCatalog || allowGlobalScope
      ? null
      : buildVisiblePdvIds(actor, (cuentaPdvResult.data ?? []) as CuentaClientePdvRow[])
  const visiblePdvIdList = visiblePdvIds ? Array.from(visiblePdvIds) : null

  const pdvsQuery = supabase
    .from('pdv')
    .select(PDV_LOOKUP_SELECT)
    .order('nombre', { ascending: true })
    .limit(1000)

  const geocercasQuery = supabase
    .from('geocerca_pdv')
    .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
    .limit(1000)

  const [
    visitasResult,
    pdvsResult,
    geocercasResult,
    asignacionesResult,
    rotationResult,
    empleadosResult,
    agendaEventosResult,
    pendientesReposicionResult,
  ] =
    await Promise.all([
      rutaIds.length > 0
        ? supabase
            .from('ruta_semanal_visita')
            .select(`
              id,
              ruta_semanal_id,
              cuenta_cliente_id,
              supervisor_empleado_id,
              pdv_id,
              pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus, formato),
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
            .in('ruta_semanal_id', rutaIds)
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      shouldLoadPdvCatalog
        ? visiblePdvIdList
          ? visiblePdvIdList.length > 0
            ? pdvsQuery.in('id', visiblePdvIdList)
            : Promise.resolve({ data: [], error: null })
          : pdvsQuery
        : Promise.resolve({ data: [], error: null }),
      shouldLoadPdvCatalog
        ? visiblePdvIdList
          ? visiblePdvIdList.length > 0
            ? geocercasQuery.in('pdv_id', visiblePdvIdList)
            : Promise.resolve({ data: [], error: null })
          : geocercasQuery
        : Promise.resolve({ data: [], error: null }),
      shouldLoadPdvCatalog
        ? buildAsignacionesQuery(supabase, actor, puedeEditar, allowGlobalScope)
        : Promise.resolve({ data: [], error: null }),
      shouldLoadPdvCatalog ? rotationQuery : Promise.resolve({ data: [], error: null }),
      shouldBuildWarRoom
        ? supabase
            .from('empleado')
            .select('id, nombre_completo, puesto, zona, estatus_laboral, supervisor_empleado_id')
            .eq('estatus_laboral', 'ACTIVO')
            .order('nombre_completo', { ascending: true })
            .limit(400)
        : Promise.resolve({ data: [], error: null }),
      rutaIds.length > 0
        ? supabase
            .from('ruta_agenda_evento')
            .select(
              'id, ruta_semanal_id, ruta_semanal_visita_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus, formato), fecha_operacion, tipo_evento, modo_impacto, estatus_aprobacion, estatus_ejecucion, titulo, descripcion, sede, hora_inicio, hora_fin, selfie_url, evidencia_url, check_in_en, check_out_en, metadata, created_at, updated_at'
            )
            .in('ruta_semanal_id', rutaIds)
            .limit(400)
        : Promise.resolve({ data: [], error: null }),
      rutaIds.length > 0
        ? supabase
            .from('ruta_visita_pendiente_reposicion')
            .select(
              'id, ruta_semanal_id, ruta_semanal_visita_id, agenda_evento_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus, formato), fecha_origen, semana_sugerida_inicio, clasificacion, motivo, estado, ruta_destino_id, metadata'
            )
            .in('ruta_semanal_id', rutaIds)
            .limit(400)
        : Promise.resolve({ data: [], error: null }),
    ])

  const agendaInfrastructureMissing =
    isRutaAgendaTableMissingError(agendaEventosResult.error?.message) ||
    isRutaAgendaTableMissingError(pendientesReposicionResult.error?.message)

  const agendaInfrastructureMessage = agendaInfrastructureMissing
    ? 'La agenda operativa dinamica aun no esta disponible en esta base. Aplica la migracion 20260326213000_ruta_agenda_operativa.sql para habilitar eventos del dia y reposiciones.'
    : undefined

  const errorMessage =
    cuentaPdvResult.error?.message ??
    rutasResult.error?.message ??
    visitasResult.error?.message ??
    pdvsResult.error?.message ??
    geocercasResult.error?.message ??
    (asignacionesResult as { error?: { message?: string } | null }).error?.message ??
    (shouldBuildWarRoom ? empleadosResult.error?.message : null) ??
    (agendaInfrastructureMissing ? null : agendaEventosResult.error?.message) ??
    (agendaInfrastructureMissing ? null : pendientesReposicionResult.error?.message) ??
    null

  if (errorMessage) {
    return buildInfrastructureError(errorMessage, puedeEditar)
  }

  const visitasRaw = (visitasResult.data ?? []) as RutaVisitaQueryRow[]
  const pdvsRaw = (pdvsResult.data ?? []) as PdvWarRoomRow[]
  const geocercasRaw = (geocercasResult.data ?? []) as GeocercaMiniRow[]
  const asignacionesRaw = ((asignacionesResult as { data?: unknown[] | null }).data ?? []) as AsignacionRutaRow[]
  const rotacionRaw = ((rotationResult as { data?: unknown[] | null }).data ?? []) as PdvRotacionMaestraRutaRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoWarRoomRow[]
  const agendaEventosRaw = (agendaInfrastructureMissing ? [] : agendaEventosResult.data ?? []) as RutaAgendaEventoQueryRow[]
  const pendientesReposicionRaw = (agendaInfrastructureMissing ? [] : pendientesReposicionResult.data ?? []) as RutaPendienteReposicionQueryRow[]

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
        cadenaNombre: obtenerPrimero(item.cadena)?.nombre ?? null,
        cadenaCodigo: obtenerPrimero(item.cadena)?.codigo ?? null,
      } satisfies PdvMiniRow,
    ])
  )
  const routeReferencePdvIds = Array.from(collectRutaReferencePdvIds(rutasRaw)).filter(
    (pdvId) => !pdvMap.has(pdvId)
  )

  if (routeReferencePdvIds.length > 0) {
    const { data: routeReferencePdvs, error: routeReferencePdvsError } = await supabase
      .from('pdv')
      .select(PDV_LOOKUP_SELECT)
      .in('id', routeReferencePdvIds)
      .limit(1000)

    if (routeReferencePdvsError) {
      return buildInfrastructureError(routeReferencePdvsError.message, puedeEditar)
    }

    for (const item of (routeReferencePdvs ?? []) as PdvWarRoomRow[]) {
      if (!pdvMap.has(item.id)) {
        pdvMap.set(item.id, {
          id: item.id,
          clave_btl: item.clave_btl,
          nombre: item.nombre,
          zona: item.zona,
          direccion: item.direccion,
          estatus: item.estatus,
          formato: item.formato,
          cadenaNombre: obtenerPrimero(item.cadena)?.nombre ?? null,
          cadenaCodigo: obtenerPrimero(item.cadena)?.codigo ?? null,
        })
      }
    }
  }

  const geocercaMap = new Map(geocercasRaw.map((item) => [item.pdv_id, item]))
  const rotacionMap = new Map(rotacionRaw.map((item) => [item.pdv_id, item]))
  const visitasPorRuta = new Map<string, RutaSemanalVisitItem[]>()

  for (const visita of visitasRaw) {
    const pdv = resolveRutaPdvSnapshot(visita.pdv, pdvMap.get(visita.pdv_id))
    const geocerca = geocercaMap.get(visita.pdv_id)
    const current = visitasPorRuta.get(visita.ruta_semanal_id) ?? []
    const visitWorkflow = parseRutaVisitaWorkflowMetadata(visita.metadata)
    const checklistCalidad = (visita.checklist_calidad ?? {}) as Record<string, boolean>
    const checklistCompletion = calculateSupervisorChecklistCompletion(checklistCalidad).percentage

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
    const pdv = resolveRutaPdvSnapshot(event.pdv, event.pdv_id ? pdvMap.get(event.pdv_id) : null)
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
      selfieUrl: event.selfie_url,
      evidenciaUrl: event.evidencia_url,
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
    const pdv = resolveRutaPdvSnapshot(pending.pdv, pdvMap.get(pending.pdv_id))
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

  const todayIso = options?.referenceDate !== undefined ? getIsoDateInMexicoCity(options.referenceDate) : getIsoDateInMexicoCity()

  // Optimizacion: Agrupar visitas por supervisor y mes para evitar .filter() masivo dentro del map de rutas
  const visitasPorSupervisorYMes = new Map<string, Map<string, number>>()
  for (const item of visitasRaw) {
    if (item.estatus !== 'COMPLETADA') continue
    const supervisorId = item.supervisor_empleado_id
    if (!supervisorId) continue

    const monthPrefix = (item.completada_en ?? item.updated_at).slice(0, 7)
    const supervisorMap = visitasPorSupervisorYMes.get(supervisorId) ?? new Map<string, number>()
    const currentCount = supervisorMap.get(monthPrefix) ?? 0
    supervisorMap.set(monthPrefix, currentCount + 1)
    visitasPorSupervisorYMes.set(supervisorId, supervisorMap)
  }

  const rutas = rutasRaw.map((ruta) => {
    const supervisor = obtenerPrimero(ruta.supervisor)
    const visitas = sortWeeklyVisits(visitasPorRuta.get(ruta.id) ?? [])
    const routeEvents = agendaEventsByRoute.get(ruta.id) ?? []
    const routePendingRepositions = pendingRepositionsByRoute.get(ruta.id) ?? []
    const workflow = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    const monthPrefix = ruta.semana_inicio.slice(0, 7)
    const editableDayNumbers = getEditableDayNumbersForRoute(
      {
        semanaInicio: ruta.semana_inicio,
        visitas,
      },
      todayIso
    )
    const monthlyVisitsCompleted = visitasPorSupervisorYMes.get(ruta.supervisor_empleado_id)?.get(monthPrefix) ?? 0

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
      editableDayNumbers,
      hasEditableFutureDays: editableDayNumbers.length > 0,
      visitas,
      agendaEventosCount: routeEvents.length,
      pendientesReposicionCount: routePendingRepositions.length,
    } satisfies RutaSemanalItem
  })

  const activeAssignments = asignacionesRaw.filter((item) =>
    isAssignmentActiveForWeek(item, semanaActualInicio, semanaActualFin)
  )
  const pdvsDisponiblesMap = new Map<string, RutaSemanalPdvOption>()

  if (shouldLoadPlanningCatalog) {
    for (const item of activeAssignments) {
      const pdv = pdvMap.get(item.pdv_id)
      const geocerca = geocercaMap.get(item.pdv_id)

      if (!pdv || !isOperablePdvStatus(pdv.estatus)) {
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
        if (!isOperablePdvStatus(pdv.estatus)) {
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
  }

  const pdvsDisponibles = shouldLoadPlanningCatalog
    ? Array.from(pdvsDisponiblesMap.values()).sort((left, right) => left.nombre.localeCompare(right.nombre))
    : []

  const warRoom = shouldBuildWarRoom
    ? buildWarRoomData({
        actor,
        metadataColumnAvailable,
        rutas,
        agendaEventsByRoute,
        pendingRepositionsByRoute,
        pdvMap,
        pdvsWithSupervisors: pdvsRaw,
        geocercaMap,
        rotacionMap,
        activeAssignments,
        employees: empleadosRaw,
        weekStart: semanaActualInicio,
      })
    : buildEmptyWarRoomData(metadataColumnAvailable)

  const rutaActivaSemanaActual = getPlanningRouteForWeek(rutas, semanaActualInicio)

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
          today: todayIso,
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

  const supervisorRouteSlices = buildSupervisorRouteSlices(rutas, todayIso)

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
    rutasCorrecciones: supervisorRouteSlices.rutasCorrecciones,
    rutasHistoricasMesActual: supervisorRouteSlices.rutasHistoricasMesActual,
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

export async function obtenerPanelRutaSemanalParaActor(
  actor: ActorActual,
  options?: {
    referenceDate?: string | Date
    serviceClient?: TypedSupabaseClient
    cacheBuster?: string | null
    includePlanningCatalog?: boolean
  }
): Promise<RutaSemanalPanelData> {
  const cacheKey = [
    ...buildRutaSemanalCacheKey(actor, options?.referenceDate),
    options?.includePlanningCatalog === false ? 'without-planning-catalog' : 'with-planning-catalog',
  ]
  const tags = buildRutaSemanalCacheTags(actor, options?.referenceDate)

  const read = unstable_cache(
    async () => {
      const service = options?.serviceClient ?? (createServiceClient() as TypedSupabaseClient)
      return obtenerPanelRutaSemanal(service, actor, {
        referenceDate: options?.referenceDate,
        includePlanningCatalog: options?.includePlanningCatalog,
      })
    },
    cacheKey,
    {
      revalidate: 60,
      tags,
    }
  )

  return read()
}

function buildSupervisorTodayRouteCacheKey(actor: ActorActual, referenceDate?: string | Date) {
  const weekStart = getWeekStartIso(referenceDate)
  const dayNumber = todayWeekdayNumber(referenceDate)
  return [
    'supervisor-today-route',
    actor.cuentaClienteId ?? 'global',
    actor.empleadoId,
    actor.puesto,
    weekStart,
    String(dayNumber),
  ]
}

export async function obtenerRutaHoySupervisor(
  supabase: TypedSupabaseClient,
  actor: ActorActual,
  options?: {
    referenceDate?: string | Date
  }
): Promise<SupervisorTodayRouteData> {
  const semanaActualInicio = getWeekStartIso(options?.referenceDate)
  const semanaActualFin = getWeekEndIso(semanaActualInicio)
  const diaSemana = todayWeekdayNumber(options?.referenceDate)

  let rutasQuery = supabase
    .from('ruta_semanal')
    .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, notas, metadata, created_at, updated_at')
    .eq('supervisor_empleado_id', actor.empleadoId)
    .eq('semana_inicio', semanaActualInicio)
    .in('estatus', ['PUBLICADA', 'EN_PROGRESO'])
    .order('updated_at', { ascending: false })
    .limit(5)

  if (actor.cuentaClienteId) {
    rutasQuery = rutasQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const { data: rutasData, error: rutasError } = await rutasQuery

  if (rutasError) {
    return {
      semanaActualInicio,
      semanaActualFin,
      visitasHoy: [],
      eventosHoy: [],
      agendaInfrastructureAvailable: true,
      infraestructuraLista: false,
      mensajeInfraestructura: rutasError.message,
    }
  }

  const rutaActiva = ((rutasData ?? []) as RutaQueryRow[]).find((ruta) => {
    const workflow = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    return workflow.approval.state === 'APROBADA'
  })

  if (!rutaActiva) {
    return {
      semanaActualInicio,
      semanaActualFin,
      visitasHoy: [],
      eventosHoy: [],
      agendaInfrastructureAvailable: true,
      infraestructuraLista: true,
    }
  }

  const fechaOperacion = addDaysToWeek(semanaActualInicio, diaSemana)

  const { data: visitasData, error: visitasError } = await supabase
    .from('ruta_semanal_visita')
    .select(`
      id,
      ruta_semanal_id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      pdv_id,
      pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus, formato),
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
    .eq('ruta_semanal_id', rutaActiva.id)
    .eq('dia_semana', diaSemana)
    .order('orden', { ascending: true })
    .limit(80)

  if (visitasError) {
    return {
      semanaActualInicio,
      semanaActualFin,
      visitasHoy: [],
      eventosHoy: [],
      agendaInfrastructureAvailable: true,
      infraestructuraLista: false,
      mensajeInfraestructura: visitasError.message,
    }
  }

  const {
    data: agendaEventosData,
    error: agendaEventosError,
  } = await supabase
    .from('ruta_agenda_evento')
    .select(`
      id,
      ruta_semanal_id,
      ruta_semanal_visita_id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      pdv_id,
      pdv:pdv_id(id, clave_btl, nombre, zona, direccion, estatus, formato),
      fecha_operacion,
      tipo_evento,
      modo_impacto,
      estatus_aprobacion,
      estatus_ejecucion,
      titulo,
      descripcion,
      sede,
      hora_inicio,
      hora_fin,
      selfie_url,
      evidencia_url,
      check_in_en,
      check_out_en,
      metadata,
      created_at,
      updated_at
    `)
    .eq('ruta_semanal_id', rutaActiva.id)
    .eq('fecha_operacion', fechaOperacion)
    .order('hora_inicio', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(40)

  const visitasRaw = (visitasData ?? []) as RutaVisitaQueryRow[]
  const pdvIds = Array.from(new Set(visitasRaw.map((visita) => visita.pdv_id).filter(Boolean)))
  const geocercaMap = new Map<string, GeocercaMiniRow>()
  const agendaInfrastructureAvailable =
    !agendaEventosError || isRutaAgendaTableMissingError(agendaEventosError.message)
  const agendaInfrastructureMessage = agendaEventosError
    ? isRutaAgendaTableMissingError(agendaEventosError.message)
      ? 'La agenda operativa dinamica aun no esta disponible en esta base.'
      : agendaEventosError.message
    : undefined

  if (agendaEventosError && !isRutaAgendaTableMissingError(agendaEventosError.message)) {
    return {
      semanaActualInicio,
      semanaActualFin,
      visitasHoy: [],
      eventosHoy: [],
      agendaInfrastructureAvailable: false,
      agendaInfrastructureMessage,
      infraestructuraLista: false,
      mensajeInfraestructura: agendaEventosError.message,
    }
  }

  if (pdvIds.length > 0) {
    const { data: geocercasData, error: geocercasError } = await supabase
      .from('geocerca_pdv')
      .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
      .in('pdv_id', pdvIds)
      .limit(80)

    if (geocercasError) {
      return {
        semanaActualInicio,
        semanaActualFin,
        visitasHoy: [],
        eventosHoy: [],
        agendaInfrastructureAvailable,
        agendaInfrastructureMessage,
        infraestructuraLista: false,
        mensajeInfraestructura: geocercasError.message,
      }
    }

    for (const geocerca of (geocercasData ?? []) as GeocercaMiniRow[]) {
      geocercaMap.set(geocerca.pdv_id, geocerca)
    }
  }

  const eventosHoy =
    agendaInfrastructureAvailable && agendaEventosData
      ? resolveAgendaOperativaSupervisorDia({
          fecha: fechaOperacion,
          visitasPlaneadas: [],
          agendaEventos: (agendaEventosData as RutaAgendaEventoQueryRow[])
            .filter(
              (event) => !(event.tipo_evento === 'VISITA_ADICIONAL' && Boolean(event.ruta_semanal_visita_id))
            )
            .map((event) => {
              const pdv = resolveRutaPdvSnapshot(event.pdv, null)
              return {
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
                selfieUrl: event.selfie_url,
                evidenciaUrl: event.evidencia_url,
                checkInAt: event.check_in_en,
                checkOutAt: event.check_out_en,
                metadata: event.metadata,
                createdAt: event.created_at,
                updatedAt: event.updated_at,
              } satisfies RutaAgendaEventRecord
            }),
          pendientesPersistidos: [],
          today: fechaOperacion,
        }).eventos
      : []

  return {
    semanaActualInicio,
    semanaActualFin,
    visitasHoy: sortWeeklyVisits(
      visitasRaw.map((visita) =>
        mapRutaVisitaToItem(
          visita,
          resolveRutaPdvSnapshot(visita.pdv, null),
          geocercaMap.get(visita.pdv_id) ?? null
        )
      )
    ),
    eventosHoy,
    agendaInfrastructureAvailable,
    agendaInfrastructureMessage,
    infraestructuraLista: true,
  }
}

export async function obtenerRutaHoySupervisorParaActor(
  actor: ActorActual,
  options?: {
    referenceDate?: string | Date
    serviceClient?: TypedSupabaseClient
    cacheBuster?: string | null
  }
): Promise<SupervisorTodayRouteData> {
  const cacheKey = [
    ...buildSupervisorTodayRouteCacheKey(actor, options?.referenceDate),
  ]
  const tags = buildRutaSemanalCacheTags(actor, options?.referenceDate)

  const read = unstable_cache(
    async () => {
      const service = options?.serviceClient ?? (createServiceClient() as TypedSupabaseClient)
      return obtenerRutaHoySupervisor(service, actor, { referenceDate: options?.referenceDate })
    },
    cacheKey,
    {
      revalidate: 30,
      tags,
    }
  )

  return read()
}

function todayWeekdayNumber(value?: string | Date) {
  return getWeekDayNumberInMexicoCity(value)
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
    limit,
    ensureWeekStart,
  }: {
    actor: ActorActual
    puedeEditar: boolean
    allowGlobalScope: boolean
    limit?: number
    ensureWeekStart?: string | null
  }
) {
  const queryLimit = limit ?? (puedeEditar ? 12 : 24)
  const asRutaRows = (value: unknown): RutaQueryRow[] => {
    if (!Array.isArray(value)) {
      return []
    }

    return value as unknown as RutaQueryRow[]
  }
  const mergeRows = (rows: RutaQueryRow[]) =>
    Array.from(new Map(rows.map((item) => [item.id, item])).values())
      .filter((item) => {
        if (allowGlobalScope) {
          return true
        }

        if (actor.cuentaClienteId) {
          return item.cuenta_cliente_id === actor.cuentaClienteId
        }

        return true
      })
      .sort((left, right) => {
        if (left.semana_inicio !== right.semana_inicio) {
          return right.semana_inicio.localeCompare(left.semana_inicio)
        }

        return right.updated_at.localeCompare(left.updated_at)
      })

  const run = (includeMetadata: boolean, weekStartFilter?: string | null) => {
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

    let query = puedeEditar
      ? supabase
          .from('ruta_semanal')
          .select(baseSelect)
          .eq('supervisor_empleado_id', actor.empleadoId)
      : supabase.from('ruta_semanal').select(baseSelect)

    if (weekStartFilter) {
      query = query
        .eq('semana_inicio', weekStartFilter)
        .order('updated_at', { ascending: false })
        .limit(Math.max(queryLimit, 160))
    } else {
      query = query.order('semana_inicio', { ascending: false }).limit(queryLimit)
    }

    return query
  }

  const result = await run(true)
  const message = result.error?.message ?? ''
  const metadataMissing =
    message.includes('ruta_semanal.metadata') ||
    (message.includes('column') && message.includes('metadata'))

  if (!metadataMissing) {
    const ensuredResult =
      ensureWeekStart && !puedeEditar ? await run(true, ensureWeekStart) : null

    return {
      result: {
        data: mergeRows([
          ...asRutaRows(result.data),
          ...asRutaRows(ensuredResult?.data),
        ]),
        error: result.error ?? ensuredResult?.error ?? null,
      },
      metadataColumnAvailable: true,
    }
  }

  const fallback = await run(false)
  const ensuredFallback =
    ensureWeekStart && !puedeEditar ? await run(false, ensureWeekStart) : null
  const filtered = mergeRows([
    ...asRutaRows(fallback.data),
    ...asRutaRows(ensuredFallback?.data),
  ])

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
  rotacionMap,
  activeAssignments,
  employees,
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
  rotacionMap: Map<string, PdvRotacionMaestraRutaRow>
  activeAssignments: AsignacionRutaRow[]
  employees: EmpleadoWarRoomRow[]
  weekStart: string
}): RutaSemanalWarRoomData {
  const rutasVisibles =
    actor.puesto === 'SUPERVISOR' ? rutas.filter((item) => item.supervisorEmpleadoId === actor.empleadoId) : rutas

  // Optimizacion: Mapas de búsqueda para evitar flatMap/filter dentro de bucles
  const visitasPorSupervisorYPdv = new Map<string, Map<string, RutaSemanalVisitItem[]>>()
  const visitasCompletadasPorSupervisor = new Map<string, number>()
  const rutasPorSupervisor = new Map<string, RutaSemanalItem[]>()
  
  for (const route of rutas) {
    const sId = route.supervisorEmpleadoId
    if (!sId) continue
    
    // Agrupar rutas por supervisor
    const sRutas = rutasPorSupervisor.get(sId) ?? []
    sRutas.push(route)
    rutasPorSupervisor.set(sId, sRutas)

    // Agrupar visitas
    const sVisitasMap = visitasPorSupervisorYPdv.get(sId) ?? new Map<string, RutaSemanalVisitItem[]>()
    let sTotalCompletadas = visitasCompletadasPorSupervisor.get(sId) ?? 0

    for (const visit of route.visitas) {
      const pdvVisits = sVisitasMap.get(visit.pdvId) ?? []
      pdvVisits.push(visit)
      sVisitasMap.set(visit.pdvId, pdvVisits)
      
      if (visit.estatus === 'COMPLETADA') {
        sTotalCompletadas++
      }
    }
    visitasPorSupervisorYPdv.set(sId, sVisitasMap)
    visitasCompletadasPorSupervisor.set(sId, sTotalCompletadas)
  }

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
    if (!isOperablePdvStatus(pdv.estatus)) {
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
    const cadena = obtenerPrimero(pdv.cadena)

    const current = pdvBaseMap.get(empleado.id) ?? []
    current.push({
      id: pdv.id,
      clave_btl: pdv.clave_btl,
      nombre: pdv.nombre,
      zona: pdv.zona,
      direccion: pdv.direccion,
      estatus: pdv.estatus,
      formato: pdv.formato,
      cadenaNombre: cadena?.nombre ?? null,
      cadenaCodigo: cadena?.codigo ?? null,
    })
    pdvBaseMap.set(empleado.id, current)
  }

  // Pre-calcular contadores por supervisor para el War Room
  const changeRequestsPorSupervisor = new Map<string, number>()
  const agendaApprovalsPorSupervisor = new Map<string, number>()
  const reposicionesPorSupervisor = new Map<string, number>()

  for (const route of rutas) {
    const sId = route.supervisorEmpleadoId
    if (!sId) continue

    if (route.changeRequestState === 'PENDIENTE') {
      changeRequestsPorSupervisor.set(sId, (changeRequestsPorSupervisor.get(sId) ?? 0) + 1)
    }

    const events = agendaEventsByRoute.get(route.id) ?? []
    for (const event of events) {
      if (event.estatusAprobacion === 'PENDIENTE_COORDINACION') {
        const evSId = event.supervisorEmpleadoId
        if (evSId) {
          agendaApprovalsPorSupervisor.set(evSId, (agendaApprovalsPorSupervisor.get(evSId) ?? 0) + 1)
        }
      }
    }

    const pendings = pendingRepositionsByRoute.get(route.id) ?? []
    for (const p of pendings) {
      if (p.estado !== 'DESCARTADA' && p.estado !== 'EJECUTADA') {
        const pSId = p.supervisorEmpleadoId
        if (pSId) {
          reposicionesPorSupervisor.set(pSId, (reposicionesPorSupervisor.get(pSId) ?? 0) + 1)
        }
      }
    }
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

  const routeHasMonthlyQuotaMetadata = (route: RutaSemanalItem) =>
    route.expectedMonthlyVisits !== null ||
    route.minimumVisitsPerPdv !== null ||
    Object.keys(route.pdvMonthlyQuotas).length > 0

  const pickSupervisorQuotaRoute = (supervisorEmpleadoId: string) => {
    const supervisorRoutes = rutasPorSupervisor.get(supervisorEmpleadoId) ?? []
    const sameWeekRoutes = supervisorRoutes.filter((item) => item.semanaInicio === weekStart)

    return (
      sameWeekRoutes.find((item) => routeHasMonthlyQuotaMetadata(item)) ??
      sameWeekRoutes[0] ??
      supervisorRoutes.find((item) => routeHasMonthlyQuotaMetadata(item)) ??
      supervisorRoutes[0] ??
      null
    )
  }

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
      const currentRoute = pickSupervisorQuotaRoute(supervisorEmpleadoId)
      const assignments = assignmentMap.get(supervisorEmpleadoId) ?? []
      const pdvsBase = pdvBaseMap.get(supervisorEmpleadoId) ?? []

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
        if (!pdv || !isOperablePdvStatus(pdv.estatus)) {
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
          const rotacion = rotacionMap.get(pdv.id)
          const visitsForPdv = visitasPorSupervisorYPdv.get(supervisorEmpleadoId)?.get(pdv.id) ?? []
          const visitasRealizadas = visitsForPdv.filter((visit) => visit.estatus === 'COMPLETADA').length
          const quotaMensual = currentRoute?.pdvMonthlyQuotas[pdv.id] ?? currentRoute?.minimumVisitsPerPdv ?? 0
          const visitasPendientes = Math.max(quotaMensual - visitasRealizadas, 0)
          const cumplimientoPorcentaje = Math.min(
            100,
            quotaMensual > 0 ? Math.round((visitasRealizadas / quotaMensual) * 100) : 0
          )

          return {
            pdvId: pdv.id,
            claveBtl: pdv.clave_btl,
            nombre: pdv.nombre,
            cadena: pdv.cadenaNombre ?? null,
            cadenaCodigo: pdv.cadenaCodigo ?? null,
            formato: pdv.formato,
            zona: pdv.zona,
            clasificacionMaestra: rotacion?.clasificacion_maestra ?? null,
            grupoRotacionCodigo: rotacion?.grupo_rotacion_codigo ?? null,
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
        visitasCompletadasPorSupervisor.get(supervisorEmpleadoId) ?? 0
      const cumplimientoPorcentaje =
        expectedMonthlyVisits > 0
          ? Math.min(100, Math.round((monthlyVisitsCompleted / expectedMonthlyVisits) * 100))
          : 0

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
        changeRequestsPendientes: changeRequestsPorSupervisor.get(supervisorEmpleadoId) ?? 0,
        agendaApprovalsPendientes: agendaApprovalsPorSupervisor.get(supervisorEmpleadoId) ?? 0,
        visitasPendientesReposicion: reposicionesPorSupervisor.get(supervisorEmpleadoId) ?? 0,
        blockedDays: [],
        reassignmentAlerts: [],
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
