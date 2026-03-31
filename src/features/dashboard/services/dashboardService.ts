import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { Database, Puesto } from '@/types/database'
import { deriveAttendanceDiscipline } from '@/features/asistencias/lib/attendanceDiscipline'
import type { AttendanceMissionCatalogItem } from '@/features/asistencias/lib/attendanceMission'
import {
  buildAssignmentEngineAlerts,
  resolveAssignmentsForDate,
  type AssignmentEngineNature,
  type AssignmentEngineRow,
} from '@/features/asignaciones/lib/assignmentEngine'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import { buildReportWindowHelperText, resolveReportWindow } from '@/lib/operations/reportWindow'
import { resolveEffectiveAssignmentForEmployeeDate } from '@/features/asignaciones/services/asignacionResolverService'
import {
  EMPTY_DASHBOARD_FILTERS,
  type DashboardFilterShape,
} from '@/features/dashboard/types/dashboardFilters'
import {
  formacionTargetsEmployee,
  normalizeFormacionAttendanceMetadata,
  normalizeFormacionTargetingMetadata,
} from '@/features/formaciones/lib/formacionTargeting'
import {
  computeLoveQuotaProgress,
  fetchLoveQuotaTargetRows,
  LOVE_DAILY_QUOTA_DEFAULT,
} from '@/features/love-isdin/lib/loveQuota'
import {
  type CampaignEvidenceKind,
  readCampaignEvidenceTemplate,
  readCampaignManualDocument,
  readCampaignProductGoals,
} from '@/features/campanas/lib/campaignProgress'
import { resolveLoveQrSignedUrl } from '@/features/love-isdin/lib/loveQrImport'

const DASHBOARD_REFRESH_MAX_AGE_MS = 5 * 60 * 1000
const DASHBOARD_KPI_CACHE_TTL_MS = 5 * 60 * 1000
const DASHBOARD_KPI_REVALIDATE_SECONDS = 60
const DASHBOARD_LIVE_ALERT_LIMIT = 8
const DASHBOARD_LIVE_QUERY_LIMIT = 250
const DASHBOARD_GEOFENCE_LIMIT = 500
const DASHBOARD_SUPERVISOR_LIMIT = 80

const dashboardKpiCache = new Map<string, { expiresAt: number; result: DashboardRowsResult }>()

interface DashboardQueryResult {
  data: unknown[] | null
  error: { message: string } | null
}

interface DashboardQueryBuilder {
  select(columns: string): DashboardQueryBuilder
  eq(column: string, value: string | number | boolean): DashboardQueryBuilder
  in?(column: string, values: string[]): DashboardQueryBuilder
  is?(column: string, value: null): DashboardQueryBuilder
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): DashboardQueryBuilder
  gte(column: string, value: string | number): DashboardQueryBuilder
  lte(column: string, value: string | number): DashboardQueryBuilder
  lt(column: string, value: string | number): DashboardQueryBuilder
  limit(count: number): Promise<DashboardQueryResult>
}

interface DashboardSupabaseClient {
  from(
    table:
      | 'dashboard_kpis'
      | 'asistencia'
      | 'geocerca_pdv'
      | 'empleado'
      | 'usuario'
      | 'asignacion'
      | 'solicitud'
      | 'configuracion'
      | 'cuota_empleado_periodo'
      | 'nomina_periodo'
      | 'pdv'
      | 'venta'
      | 'love_isdin'
      | 'love_isdin_qr_codigo'
      | 'love_isdin_qr_asignacion'
      | 'campana'
      | 'campana_pdv'
      | 'formacion_evento'
      | 'formacion_asistencia'
      | 'mensaje_interno'
      | 'mensaje_receptor'
      | 'mision_dia'
      | 'producto'
      | 'cadena'
      | 'asignacion_diaria_resuelta'
      | 'love_isdin_resumen_diario'
  ): DashboardQueryBuilder
}

interface DashboardRowsResult {
  data: DashboardKpiRow[]
  error: { message: string } | null
}


interface DashboardKpiRow {
  fecha_corte: string
  cuenta_cliente_id: string
  cuenta_cliente: string
  cuenta_cliente_identificador: string | null
  promotores_activos: number
  checkins_validos: number
  jornadas_pendientes: number
  alertas_operativas: number
  jornadas_operadas: number
  ventas_confirmadas: number
  monto_confirmado: number
  afiliaciones_love: number
  asistencia_porcentaje: number
  cuotas_cumplidas_periodo: number
  neto_nomina_periodo: number
  refreshed_at: string
}

interface DashboardLiveAsistenciaRow {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  empleado_nombre: string
  pdv_id: string
  pdv_clave_btl: string
  pdv_nombre: string
  fecha_operacion: string
  check_in_utc: string | null
  check_out_utc: string | null
  latitud_check_in: number | null
  longitud_check_in: number | null
  distancia_check_in_metros: number | null
  estado_gps: string
  estatus: string
  pdv_zona: string | null
  pdv_estado: string | null
}

interface DashboardGeocercaRow {
  pdv_id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number | null
}

interface DashboardPdvStateRow {
  id: string
  ciudad:
    | { estado: string | null; nombre?: string | null }
    | Array<{ estado: string | null; nombre?: string | null }>
    | null
}

interface DashboardSupervisorRow {
  id: string
  nombre: string
}

interface DashboardPendingImssRow {
  id: string
  nombre_completo: string
  expediente_estado: 'PENDIENTE_DOCUMENTOS' | 'EN_REVISION' | 'VALIDADO' | 'OBSERVADO' | null
  expediente_validado_en: string | null
  imss_estado: 'NO_INICIADO' | 'PENDIENTE_DOCUMENTOS' | 'EN_PROCESO' | 'ALTA_IMSS' | 'ERROR' | null
  imss_fecha_solicitud: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface DashboardAssignmentRow {
  id: string
  empleado_id: string
  cuenta_cliente_id: string | null
  supervisor_empleado_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  naturaleza: AssignmentEngineNature
  prioridad: number | null
  empleado:
    | { nombre_completo: string | null }
    | Array<{ nombre_completo: string | null }>
    | null
  pdv:
    | { nombre: string | null; clave_btl: string | null; zona: string | null }
    | Array<{ nombre: string | null; clave_btl: string | null; zona: string | null }>
    | null
}

interface DashboardSupervisorDailyAssignmentRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  dias_laborales: string | null
  dia_descanso: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  horario_referencia: string | null
  naturaleza: AssignmentEngineNature
  prioridad: number | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
  empleado:
    | { nombre_completo: string | null }
    | Array<{ nombre_completo: string | null }>
    | null
  pdv:
    | { nombre: string | null; clave_btl: string | null; zona: string | null }
    | Array<{ nombre: string | null; clave_btl: string | null; zona: string | null }>
    | null
}

interface DashboardSolicitudRow {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  fecha_inicio: string
  fecha_fin: string
  tipo: string
  estatus: string
  motivo: string | null
  comentarios: string | null
  justificante_url: string | null
  metadata: Record<string, unknown>
  empleado:
    | { nombre_completo: string | null }
    | Array<{ nombre_completo: string | null }>
    | null
  cuenta_cliente:
    | { nombre: string | null }
    | Array<{ nombre: string | null }>
    | null
}

interface DashboardConfigRow {
  clave: string
  valor: unknown
}

interface DashboardPeriodoRow {
  id: string
  estado: 'BORRADOR' | 'APROBADO' | 'DISPERSADO' | 'ABIERTO'
  fecha_inicio: string
  fecha_fin: string
}

interface DashboardQuotaRow {
  id: string
  periodo_id: string
  cuenta_cliente_id: string
  empleado_id: string
  cumplimiento_porcentaje: number
  estado: 'EN_CURSO' | 'CUMPLIDA' | 'RIESGO'
  empleado: { nombre_completo: string | null; supervisor_empleado_id: string | null } | Array<{ nombre_completo: string | null; supervisor_empleado_id: string | null }> | null
}

interface DashboardDermoAttendanceRow {
  id: string
  cuenta_cliente_id: string
  asignacion_id: string | null
  empleado_id: string
  pdv_id: string
  cadena_nombre: string | null
  fecha_operacion: string
  check_in_utc: string | null
  check_out_utc: string | null
  mision_dia_id: string | null
  pdv_nombre: string
  pdv_clave_btl: string
  mision_instruccion: string | null
  mision_codigo: string | null
}

interface DashboardDermoAssignmentRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  dias_laborales: string | null
  dia_descanso: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  horario_referencia: string | null
  naturaleza: AssignmentEngineNature
  prioridad: number | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

interface DashboardDermoPdvRow {
  id: string
  nombre: string
  direccion: string | null
  clave_btl: string
  zona: string | null
  ciudad:
    | { nombre: string | null; estado: string | null }
    | Array<{ nombre: string | null; estado: string | null }>
    | null
}

interface DashboardDermoGeocercaRow {
  pdv_id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number | null
  permite_checkin_con_justificacion: boolean
}

interface DashboardMissionCatalogRow {
  id: string
  codigo: string | null
  instruccion: string
  orden: number | null
  peso: number
}

interface DashboardDermoSaleRow {
  id: string
  empleado_id: string
  fecha_utc: string
  metadata: Record<string, unknown> | null
}

interface DashboardDermoLoveRow {
  id: string
  empleado_id: string
  fecha_utc: string
  metadata: Record<string, unknown> | null
}

interface DashboardDermoLoveQrAssignmentRow {
  id: string
  cuenta_cliente_id: string
  qr_codigo_id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
}

interface DashboardDermoLoveQrCodeRow {
  id: string
  codigo: string
  imagen_url: string | null
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
}

interface DashboardDermoCampaignRow {
  id: string
  campana_id: string
  cuenta_cliente_id: string
  pdv_id: string
  dc_empleado_id: string | null
}

interface DashboardDermoCampaignMetaRow {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  descripcion: string | null
  instrucciones: string | null
  productos_foco: string[]
  evidencias_requeridas: string[]
  cuota_adicional: number
  metadata: Record<string, unknown> | null
  estado: 'BORRADOR' | 'ACTIVA' | 'CERRADA' | 'CANCELADA'
}

interface DashboardDermoFormationRow {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'PENDIENTE' | 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA'
  sede: string | null
  tipo: string | null
  participantes: Array<Record<string, unknown>> | null
  metadata: Record<string, unknown> | null
}

interface DashboardFormationAttendanceRow {
  id: string
  evento_id: string
  empleado_id: string
  metadata: Record<string, unknown> | null
  estado: string
}

interface DashboardDermoNotificationRecipientRow {
  id: string
  mensaje_id: string
  empleado_id: string
  estado: 'PENDIENTE' | 'LEIDO' | 'RESPONDIDO'
  leido_en: string | null
  created_at: string
}

interface DashboardDermoNotificationMessageRow {
  id: string
  titulo: string
  cuerpo: string
  tipo: string
  created_at: string
  creado_por_usuario_id: string | null
}

interface DashboardDermoUserRow {
  id: string
  empleado_id: string
}

interface DashboardDermoEmployeeProfileRow {
  id: string
  nombre_completo: string
  puesto: Puesto
  zona: string | null
  correo_electronico: string | null
  telefono: string | null
  fecha_alta: string | null
  supervisor_empleado_id: string | null
}

interface DashboardDermoProductRow {
  id: string
  sku: string
  nombre: string
  nombre_corto: string
  activo: boolean
}

export interface DashboardStats {
  fechaCorte: string | null
  promotoresActivosHoy: number
  checkInsValidosHoy: number
  ventasConfirmadasHoy: number
  montoConfirmadoHoy: number
  afiliacionesLoveHoy: number
  asistenciaPorcentajeHoy: number
  alertasOperativas: number
  cuotasCumplidasPeriodo: number
  netoNominaPeriodo: number
  imssPendientes: number
}

export interface DashboardClienteItem {
  cuentaClienteId: string
  cuentaCliente: string
  identificador: string | null
  promotoresActivos: number
  checkInsValidos: number
  jornadasPendientes: number
  alertasOperativas: number
  ventasConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  asistenciaPorcentaje: number
  cuotasCumplidasPeriodo: number
  netoNominaPeriodo: number
}

export interface DashboardTrendItem {
  fecha: string
  ventasConfirmadas: number
  montoConfirmado: number
  checkInsValidos: number
  jornadasOperadas: number
  asistenciaPorcentaje: number
}

export interface DashboardLiveAlertItem {
  id: string
  tipo: 'GEOCERCA' | 'RETARDO' | 'CUOTA_BAJA' | 'IMSS_PENDIENTE' | 'MOVIMIENTO_POR_VENCER' | 'DC_SIN_PDV' | 'PDV_LIBRE'
  cuentaClienteId: string
  pdvId: string | null
  pdv: string
  pdvClaveBtl: string | null
  empleado: string
  fechaOperacion: string
  radioToleranciaMetros: number | null
  motivo: string
  estadoGps: string | null
  distanciaCheckInMetros: number | null
}

export interface DashboardMapItem {
  id: string
  pdvId: string
  pdv: string
  pdvClaveBtl: string
  empleado: string
  supervisorId: string | null
  supervisorNombre: string
  zona: string
  cuentaClienteId: string
  fechaOperacion: string
  latitud: number
  longitud: number
  radioToleranciaMetros: number | null
  estadoGps: string
  distanciaCheckInMetros: number | null
}

export interface DashboardFilterOptions {
  estados: string[]
  zonas: string[]
  supervisores: Array<{ id: string; nombre: string }>
}

export interface DashboardDermoconsejoStore {
  pdvId: string | null
  claveBtl: string | null
  nombre: string
  direccion: string | null
  zona: string | null
}

export interface DashboardDermoconsejoShift {
  attendanceId: string | null
  fechaOperacion: string
  isOpen: boolean
  canStart: boolean
  checkInUtc: string | null
  buttonLabel: 'Registrar Entrada' | 'Registrar Salida'
  buttonHref: string
  helper: string
  disabledReason: string | null
}

export interface DashboardDermoconsejoReportWindow {
  timezone: string
  stateName: string | null
  status: 'SIN_CHECKIN' | 'JORNADA_ACTIVA' | 'PENDIENTE_REPORTE' | 'VENTANA_CERRADA'
  canReportToday: boolean
  deadlineLocalTime: string
  helper: string
}

export interface DashboardDermoconsejoCounter {
  label: string
  value: number
  helper: string
}

export interface DashboardDermoconsejoCampaign {
  id: string
  campanaPdvId: string
  nombre: string
  fechaInicio: string
  fechaFin: string
  descripcion: string | null
  instrucciones: string | null
  productosFoco: string[]
  evidenciasRequeridas: string[]
  evidenceTemplate: Array<{ id: string; label: string; kind: CampaignEvidenceKind }>
  cuotaAdicional: number
  manualMercadeoUrl: string | null
  manualMercadeoNombre: string | null
  ctaHref: string
}

export interface DashboardDermoconsejoFormation {
  id: string
  nombre: string
  fechaInicio: string
  fechaFin: string
  sede: string | null
  tipo: string | null
  tipoEvento: 'FORMACION' | 'ISDINIZACION'
  modalidad: 'PRESENCIAL' | 'EN_LINEA'
  horarioInicio: string | null
  horarioFin: string | null
  supervisorNombre: string | null
  manualUrl: string | null
  manualNombre: string | null
  attendanceId: string | null
  attendanceStatus: 'PENDIENTE' | 'LLEGADA_REGISTRADA' | 'SALIDA_REGISTRADA' | 'COMPLETA'
  checkInUtc: string | null
  checkOutUtc: string | null
}

export interface DashboardDermoconsejoNotificationItem {
  id: string
  titulo: string
  cuerpo: string
  createdAt: string
  estado: 'PENDIENTE' | 'LEIDO' | 'RESPONDIDO'
  tipo: string
}

export interface DashboardDermoconsejoNotificationsSummary {
  unreadCount: number
  items: DashboardDermoconsejoNotificationItem[]
}

export interface DashboardDermoconsejoProfile {
  nombreCompleto: string
  puesto: Puesto
  zona: string | null
  correoElectronico: string | null
  telefono: string | null
  username: string | null
  fechaAlta: string | null
  supervisorNombre: string | null
  tiendaActual: string
}

export interface DashboardDermoconsejoContext {
  cuentaClienteId: string | null
  empleadoId: string
  supervisorEmpleadoId: string | null
  pdvId: string | null
  attendanceId: string | null
  fechaOperacion: string
}

export interface DashboardDermoconsejoCalendarAssignment {
  assignmentId: string
  pdvId: string
  claveBtl: string | null
  nombre: string
  direccion: string | null
  zona: string | null
  horario: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
}

export interface DashboardDermoconsejoCalendarDay {
  date: string
  weekdayLabel: string
  shortLabel: string
  isToday: boolean
  assignments: DashboardDermoconsejoCalendarAssignment[]
}

export interface DashboardDermoconsejoCalendar {
  week: DashboardDermoconsejoCalendarDay[]
  month: DashboardDermoconsejoCalendarDay[]
}

export interface DashboardDermoconsejoCheckInContext {
  cuentaClienteId: string | null
  assignmentId: string | null
  assignmentSchedule: string | null
  empleadoId: string
  empleadoNombre: string
  supervisorEmpleadoId: string | null
  pdvId: string | null
  pdvClaveBtl: string | null
  pdvNombre: string
  zona: string | null
  cadena: string | null
  fechaOperacion: string
  geocercaLatitud: number | null
  geocercaLongitud: number | null
  geocercaRadioMetros: number | null
  permiteCheckinConJustificacion: boolean
  previousMissionId: string | null
  previousMissionCodigo: string | null
  missions: AttendanceMissionCatalogItem[]
}

export interface DashboardDermoconsejoQuickAction {
  key:
    | 'calendario'
    | 'ventas'
    | 'love-isdin'
    | 'promocional'
    | 'justificacion-faltas'
    | 'comunicacion'
    | 'incidencias'
    | 'perfil'
    | 'incapacidad'
    | 'vacaciones'
    | 'permiso'
  label: string
  helper: string
  href: string
  accent: 'sky' | 'emerald' | 'amber' | 'rose' | 'slate' | 'orange' | 'purple'
  preferredSnap: 'partial' | 'expanded'
  badgeCount?: number
}

export interface DashboardDermoconsejoSolicitudStatusItem {
  id: string
  tipo:
    | 'INCAPACIDAD'
    | 'VACACIONES'
    | 'PERMISO'
    | 'AVISO_INASISTENCIA'
    | 'JUSTIFICACION_FALTA'
  estatus: string
  fechaInicio: string
  fechaFin: string
  motivo: string | null
  comentarios: string | null
  justificanteUrl: string | null
  metadata: Record<string, unknown>
}

export interface DashboardDermoconsejoProductItem {
  id: string
  sku: string
  nombre: string
  nombreCorto: string
}

export interface DashboardDermoconsejoData {
  greetingName: string
  todayLabel: string
  context: DashboardDermoconsejoContext
  checkIn: DashboardDermoconsejoCheckInContext
  profile: DashboardDermoconsejoProfile
  store: DashboardDermoconsejoStore
  shift: DashboardDermoconsejoShift
  reportWindow: DashboardDermoconsejoReportWindow
  loveQr: DashboardDermoconsejoLoveQr | null
  loveQuota: DashboardDermoconsejoLoveQuota
  counters: DashboardDermoconsejoCounter[]
  notifications: DashboardDermoconsejoNotificationsSummary
  activeCampaign: DashboardDermoconsejoCampaign | null
  activeFormation: DashboardDermoconsejoFormation | null
  quickActions: DashboardDermoconsejoQuickAction[]
  requestStatus: DashboardDermoconsejoSolicitudStatusItem[]
  catalogoProductos: DashboardDermoconsejoProductItem[]
  calendar: DashboardDermoconsejoCalendar
}

export interface DashboardDermoconsejoLoveQr {
  codigoId: string
  asignacionId: string
  codigo: string
  imageUrl: string | null
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
}

export interface DashboardDermoconsejoLoveQuota {
  objetivoDiario: number
  avanceHoy: number
  restanteHoy: number
  cumplimientoHoyPct: number
}

export interface DashboardSupervisorAuthorizationItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleadoId: string
  empleado: string
  tipo: string
  fechaInicio: string
  fechaFin: string
  motivo: string | null
  comentarios: string | null
  estatus: string
  siguienteActor: string
  justificanteUrl: string | null
  enviadaEn: string | null
  resolverAntesDe: string | null
  slaHours: number | null
  tiempoRestanteMinutos: number | null
  urgencyState: 'NORMAL' | 'URGENTE' | 'VENCIDA' | null
}

export type DashboardSupervisorRequestKind =
  | 'VACACIONES'
  | 'INCAPACIDAD'
  | 'CUMPLEANOS'
  | 'JUSTIFICACION_FALTA'

export interface DashboardSupervisorRequestItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleadoId: string
  empleado: string
  kind: DashboardSupervisorRequestKind
  tipo: string
  fechaInicio: string
  fechaFin: string
  motivo: string | null
  comentarios: string | null
  estatus: string
  siguienteActor: string | null
  actionable: boolean
  justificanteUrl: string | null
  enviadaEn: string | null
  resolverAntesDe: string | null
  slaHours: number | null
  tiempoRestanteMinutos: number | null
  urgencyState: 'NORMAL' | 'URGENTE' | 'VENCIDA' | null
}

export interface DashboardSupervisorRequestSummaryItem {
  key: 'TODAS' | DashboardSupervisorRequestKind
  label: string
  count: number
  actionableCount: number
}

export interface DashboardSupervisorRequestInbox {
  items: DashboardSupervisorRequestItem[]
  summaries: DashboardSupervisorRequestSummaryItem[]
}

export type DashboardSupervisorDailyStatus =
  | 'SIN_CHECKIN'
  | 'PENDIENTE_VALIDACION'
  | 'VALIDA'
  | 'RECHAZADA'
  | 'CERRADA'

export interface DashboardSupervisorDailyItem {
  assignmentId: string
  attendanceId: string | null
  cuentaClienteId: string | null
  empleadoId: string
  empleado: string
  pdvId: string
  pdv: string
  pdvClaveBtl: string | null
  zona: string | null
  horario: string | null
  tipoAsignacion: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  fechaOperacion: string
  checkInUtc: string | null
  checkOutUtc: string | null
  estadoAsistencia: DashboardSupervisorDailyStatus
  estadoGps: string | null
  distanciaCheckInMetros: number | null
  minutosRetardo: number | null
}

export interface DashboardSupervisorDailyBoard {
  date: string
  items: DashboardSupervisorDailyItem[]
}

export interface DashboardSupervisorLoveQuotaSummary {
  objetivoHoy: number
  avanceHoy: number
  restanteHoy: number
  cumplimientoHoyPct: number
  dcConMetaHoy: number
}

export type DashboardWidgetId =
  | 'dermoconsejo'
  | 'snapshot'
  | 'filtros'
  | 'metricas'
  | 'cartera'
  | 'mapa'
  | 'alertas'
  | 'pulso_comercial'
  | 'disciplina'
  | 'compacto_supervisor'
  | 'autorizaciones_supervisor'

export interface DashboardFilters extends DashboardFilterShape {}

export interface DashboardPanelData {
  stats: DashboardStats
  clientes: DashboardClienteItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  refreshedAt: string | null
  scopeLabel: string
  filtros: DashboardFilters
  opcionesFiltro: DashboardFilterOptions
  widgets: DashboardWidgetId[]
  dermoconsejo?: DashboardDermoconsejoData | null
  supervisorDailyBoard: DashboardSupervisorDailyBoard | null
  supervisorLoveQuota: DashboardSupervisorLoveQuotaSummary | null
  supervisorNotifications: DashboardDermoconsejoNotificationsSummary
  supervisorAuthorizations: DashboardSupervisorAuthorizationItem[]
  supervisorRequestInbox: DashboardSupervisorRequestInbox
  supervisorSelfRequestStatus: DashboardDermoconsejoSolicitudStatusItem[]
  supervisorActiveFormation: DashboardDermoconsejoFormation | null
}

export interface DashboardInsightsData {
  tendenciaSemana: DashboardTrendItem[]
  tendenciaMes: DashboardTrendItem[]
  alertasLive: DashboardLiveAlertItem[]
  mapaPromotores: DashboardMapItem[]
  filtros: DashboardFilters
  widgets: DashboardWidgetId[]
}

const EMPTY_STATS: DashboardStats = {
  fechaCorte: null,
  promotoresActivosHoy: 0,
  checkInsValidosHoy: 0,
  ventasConfirmadasHoy: 0,
  montoConfirmadoHoy: 0,
  afiliacionesLoveHoy: 0,
  asistenciaPorcentajeHoy: 0,
  alertasOperativas: 0,
  cuotasCumplidasPeriodo: 0,
  netoNominaPeriodo: 0,
  imssPendientes: 0,
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatLongDateLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T12:00:00`))
}

function parseIsoDateUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
}

function toIsoDateUtc(value: Date) {
  return value.toISOString().slice(0, 10)
}

function isMissingCiudadEstadoColumn(message: string | null | undefined) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return (
    normalized.includes('column ciudad.estado does not exist') ||
    normalized.includes('column ciudad_1.estado does not exist')
  )
}

function addDaysIso(value: string, days: number) {
  const date = parseIsoDateUtc(value)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDateUtc(date)
}

function formatCalendarWeekdayLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
  }).format(parseIsoDateUtc(value))
}

function formatCalendarShortLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(parseIsoDateUtc(value))
}

function formatShortTime(value: string | null) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function isIsoRangeActive(start: string, end: string | null, targetDate: string) {
  return start <= targetDate && (!end || end >= targetDate)
}

function getFirst<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeConfigNumber(rows: DashboardConfigRow[], key: string, fallback: number) {
  const row = rows.find((item) => item.clave === key)
  const parsed = typeof row?.valor === 'number' ? row.valor : Number(row?.valor)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildEmptyDashboard(scopeLabel: string, mensajeInfraestructura?: string): DashboardPanelData {
  return {
    stats: EMPTY_STATS,
    clientes: [],
    infraestructuraLista: !mensajeInfraestructura,
    mensajeInfraestructura,
    refreshedAt: null,
    scopeLabel,
    filtros: { ...EMPTY_DASHBOARD_FILTERS },
    opcionesFiltro: { estados: [], zonas: [], supervisores: [] },
      widgets: resolveDashboardWidgets('ADMINISTRADOR'),
      dermoconsejo: null,
      supervisorDailyBoard: null,
      supervisorLoveQuota: null,
      supervisorNotifications: {
        unreadCount: 0,
        items: [],
      },
        supervisorAuthorizations: [],
        supervisorRequestInbox: {
          items: [],
          summaries: [
            { key: 'TODAS', label: 'Todas', count: 0, actionableCount: 0 },
            { key: 'VACACIONES', label: 'Vacaciones', count: 0, actionableCount: 0 },
            { key: 'INCAPACIDAD', label: 'Incapacidades', count: 0, actionableCount: 0 },
            { key: 'CUMPLEANOS', label: 'Dia cumple', count: 0, actionableCount: 0 },
          ],
        },
        supervisorSelfRequestStatus: [],
      supervisorActiveFormation: null,
    }
}

export function resolveDashboardWidgets(puesto: Puesto): DashboardWidgetId[] {
  switch (puesto) {
    case 'DERMOCONSEJERO':
      return ['dermoconsejo']
    case 'SUPERVISOR':
      return [
        'snapshot',
        'filtros',
        'metricas',
        'compacto_supervisor',
        'autorizaciones_supervisor',
        'cartera',
        'mapa',
        'alertas',
        'pulso_comercial',
      ]
    case 'COORDINADOR':
    case 'ADMINISTRADOR':
      return [
        'snapshot',
        'filtros',
        'metricas',
        'cartera',
        'mapa',
        'alertas',
        'pulso_comercial',
        'disciplina',
      ]
    case 'NOMINA':
      return ['snapshot', 'filtros', 'metricas', 'cartera', 'alertas', 'pulso_comercial']
    default:
      return ['snapshot', 'filtros', 'metricas', 'cartera', 'pulso_comercial']
  }
}

function getScopeLabel(actor: ActorActual) {
  if (actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId) {
    return 'Vista global'
  }

  return actor.cuentaClienteId ? 'Cuenta cliente operativa' : 'Sin cuenta operativa'
}

function getLatestRefreshedAt(rows: DashboardKpiRow[]) {
  return rows.reduce<string | null>((latest, row) => {
    if (!latest || row.refreshed_at > latest) {
      return row.refreshed_at
    }

    return latest
  }, null)
}

async function fetchDermoconsejoAssignments(supabase: DashboardSupabaseClient, actor: ActorActual) {
  const result = await supabase
    .from('asignacion')
    .select(
      'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, tipo, horario_referencia, naturaleza, prioridad, estado_publicacion'
    )
    .eq('empleado_id', actor.empleadoId)
    .order('fecha_inicio', { ascending: false })
    .limit(40)

  return {
    data: (result.data ?? []) as DashboardDermoAssignmentRow[],
    error: result.error,
  }
}

async function fetchDermoconsejoAttendances(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  todayIso: string
) {
  const result = await supabase
    .from('asistencia')
    .select(
      'id, cuenta_cliente_id, asignacion_id, empleado_id, pdv_id, cadena_nombre, fecha_operacion, check_in_utc, check_out_utc, mision_dia_id, pdv_nombre, pdv_clave_btl, mision_instruccion, mision_codigo'
    )
    .eq('empleado_id', actor.empleadoId)
    .eq('fecha_operacion', todayIso)
    .order('created_at', { ascending: false })
    .limit(12)

  return {
    data: (result.data ?? []) as DashboardDermoAttendanceRow[],
    error: result.error,
  }
}

async function fetchDermoconsejoGeocerca(
  supabase: DashboardSupabaseClient,
  pdvId: string | null
) {
  if (!pdvId) {
    return {
      data: null as DashboardDermoGeocercaRow | null,
      error: null,
    }
  }

  const result = await supabase
    .from('geocerca_pdv')
    .select('pdv_id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion')
    .eq('pdv_id', pdvId)
    .limit(1)

  return {
    data: ((result.data ?? []) as DashboardDermoGeocercaRow[])[0] ?? null,
    error: result.error,
  }
}

async function fetchDermoconsejoMissionCatalog(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('mision_dia')
    .select('id, codigo, instruccion, orden, peso')
    .eq('activa', true)
    .order('orden', { ascending: true, nullsFirst: false })
    .order('peso', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(32)

  return {
    data: ((result.data ?? []) as DashboardMissionCatalogRow[]).map<AttendanceMissionCatalogItem>(
      (item) => ({
        id: item.id,
        codigo: item.codigo,
        instruccion: item.instruccion,
        orden: item.orden,
        peso: item.peso,
      })
    ),
    error: result.error,
  }
}

async function fetchDermoconsejoPdvs(supabase: DashboardSupabaseClient, pdvIds: string[]) {
  if (pdvIds.length === 0) {
    return {
      data: [] as DashboardDermoPdvRow[],
      error: null,
    }
  }

  const query = supabase
    .from('pdv')
    .select('id, nombre, direccion, clave_btl, zona, ciudad:ciudad_id(nombre, estado)')

  const result =
    typeof query.in === 'function'
      ? await query.in('id', pdvIds).limit(Math.max(pdvIds.length, 1))
      : await query.limit(Math.max(pdvIds.length, 1))

  return {
    data: (result.data ?? []) as DashboardDermoPdvRow[],
    error: result.error,
  }
}

function resolveOperationalDateFromMetadata(
  item: Pick<DashboardDermoSaleRow, 'fecha_utc' | 'metadata'> | Pick<DashboardDermoLoveRow, 'fecha_utc' | 'metadata'>
) {
  const metadata =
    item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata
      : {}

  if (typeof metadata.fecha_operativa === 'string' && metadata.fecha_operativa.trim()) {
    return metadata.fecha_operativa.trim()
  }

  return item.fecha_utc.slice(0, 10)
}

async function fetchDermoconsejoSales(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  todayIso: string
) {
  const result = await supabase
    .from('venta')
    .select('id, empleado_id, fecha_utc, metadata')
    .eq('empleado_id', actor.empleadoId)
    .order('fecha_utc', { ascending: false })
    .limit(80)

  return {
    data: ((result.data ?? []) as DashboardDermoSaleRow[]).filter(
      (item) => resolveOperationalDateFromMetadata(item) === todayIso
    ),
    error: result.error,
  }
}

async function fetchDermoconsejoLove(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  todayIso: string
) {
  const result = await supabase
    .from('love_isdin')
    .select('id, empleado_id, fecha_utc, metadata')
    .eq('empleado_id', actor.empleadoId)
    .order('fecha_utc', { ascending: false })
    .limit(80)

  return {
    data: ((result.data ?? []) as DashboardDermoLoveRow[]).filter(
      (item) => resolveOperationalDateFromMetadata(item) === todayIso
    ),
    error: result.error,
  }
}

async function fetchDermoconsejoCampaignRows(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  pdvId: string | null
) {
  if (!pdvId) {
    return {
      pdvRows: [] as DashboardDermoCampaignRow[],
      campaignRows: [] as DashboardDermoCampaignMetaRow[],
      error: null,
    }
  }

  const campanaPdvResult = await supabase
    .from('campana_pdv')
    .select('id, campana_id, cuenta_cliente_id, pdv_id, dc_empleado_id')
    .eq('pdv_id', pdvId)
    .limit(24)

  if (campanaPdvResult.error) {
    return {
      pdvRows: [] as DashboardDermoCampaignRow[],
      campaignRows: [] as DashboardDermoCampaignMetaRow[],
      error: campanaPdvResult.error,
    }
  }

  const pdvRows = ((campanaPdvResult.data ?? []) as DashboardDermoCampaignRow[]).filter(
    (item) => !item.dc_empleado_id || item.dc_empleado_id === actor.empleadoId
  )
  const campaignIds = Array.from(new Set(pdvRows.map((item) => item.campana_id)))

  if (campaignIds.length === 0) {
    return {
      pdvRows,
      campaignRows: [] as DashboardDermoCampaignMetaRow[],
      error: null,
    }
  }

  const query = supabase
    .from('campana')
    .select('id, nombre, fecha_inicio, fecha_fin, descripcion, instrucciones, productos_foco, evidencias_requeridas, cuota_adicional, metadata, estado')

  const campaignResult =
    typeof query.in === 'function'
      ? await query.in('id', campaignIds).limit(Math.max(campaignIds.length, 1))
      : await query.limit(Math.max(campaignIds.length, 1))

  return {
    pdvRows,
    campaignRows: (campaignResult.data ?? []) as DashboardDermoCampaignMetaRow[],
    error: campaignResult.error,
  }
}

async function fetchDermoconsejoLoveQr(
  supabase: DashboardSupabaseClient,
  actor: ActorActual
): Promise<{
  data: DashboardDermoconsejoLoveQr | null
  error: { message: string } | null
}> {
  let assignmentQuery = supabase
    .from('love_isdin_qr_asignacion')
    .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin')
    .eq('empleado_id', actor.empleadoId)

  if (actor.cuentaClienteId) {
    assignmentQuery = assignmentQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const scopedAssignmentQuery =
    typeof assignmentQuery.is === 'function'
      ? assignmentQuery.is('fecha_fin', null)
      : assignmentQuery
  const assignmentQueryResult = await scopedAssignmentQuery
    .order('fecha_inicio', { ascending: false })
    .limit(1)

  if (assignmentQueryResult.error) {
    return {
      data: null,
      error: assignmentQueryResult.error,
    }
  }

  const assignment = ((assignmentQueryResult.data ?? []) as DashboardDermoLoveQrAssignmentRow[])[0] ?? null

  if (!assignment) {
    return {
      data: null,
      error: null,
    }
  }

  const qrCodeResult = await supabase
    .from('love_isdin_qr_codigo')
    .select('id, codigo, imagen_url, estado')
    .eq('id', assignment.qr_codigo_id)
    .limit(1)

  if (qrCodeResult.error) {
    return {
      data: null,
      error: qrCodeResult.error,
    }
  }

  const qrCode = ((qrCodeResult.data ?? []) as DashboardDermoLoveQrCodeRow[])[0] ?? null

  if (!qrCode) {
    return {
      data: null,
      error: null,
    }
  }

  const signedImageUrl = await resolveLoveQrSignedUrl(
    supabase as unknown as SupabaseClient<any>,
    qrCode.imagen_url
  )

  return {
    data: {
      codigoId: qrCode.id,
      asignacionId: assignment.id,
      codigo: qrCode.codigo,
      imageUrl: signedImageUrl,
      estado: qrCode.estado,
    },
    error: null,
  }
}

async function fetchDermoconsejoActiveFormation(
  supabase: DashboardSupabaseClient,
  context: {
    empleadoId: string
    puesto: Puesto
    todayIso: string
    pdvIds?: string[]
  }
) {
  const [result, attendanceResult] = await Promise.all([
    supabase
      .from('formacion_evento')
      .select('id, nombre, fecha_inicio, fecha_fin, estado, sede, tipo, participantes, metadata')
      .order('fecha_inicio', { ascending: true })
      .limit(32),
    supabase
      .from('formacion_asistencia' as never)
      .select('id, evento_id, empleado_id, metadata, estado')
      .eq('empleado_id', context.empleadoId)
      .limit(64),
  ])

  const rows = (result.data ?? []) as DashboardDermoFormationRow[]
  const attendances = (attendanceResult.data ?? []) as DashboardFormationAttendanceRow[]
  const matchedEvent =
    rows.find((item) => {
      if (!['PROGRAMADA', 'EN_CURSO'].includes(item.estado)) {
        return false
      }

      if (!isIsoRangeActive(item.fecha_inicio, item.fecha_fin, context.todayIso)) {
        return false
      }

      return (
        formacionTargetsEmployee(
          {
            participantes: item.participantes,
            metadata: item.metadata,
          },
          {
            empleadoId: context.empleadoId,
            puesto: context.puesto,
            pdvId: context.pdvIds?.[0] ?? null,
          }
        ) ||
        (context.puesto === 'DERMOCONSEJERO' &&
          (context.pdvIds ?? []).some((pdvId) =>
            formacionTargetsEmployee(
              {
                participantes: item.participantes,
                metadata: item.metadata,
              },
              {
                empleadoId: context.empleadoId,
                puesto: context.puesto,
                pdvId,
              }
            )
          ))
      )
    }) ?? null
  const matchedAttendance = matchedEvent
    ? attendances.find((item) => item.evento_id === matchedEvent.id) ?? null
    : null
  const normalizedAttendance = normalizeFormacionAttendanceMetadata(matchedAttendance?.metadata ?? {})
  const rawAttendanceStatus =
    normalizedAttendance.checkOutUtc
      ? 'COMPLETA'
      : normalizedAttendance.checkInUtc
        ? 'LLEGADA_REGISTRADA'
        : 'PENDIENTE'

  return {
    data: matchedEvent
      ? {
          ...matchedEvent,
          attendance_id: matchedAttendance?.id ?? null,
          attendance_status: rawAttendanceStatus,
          attendance_check_in_utc: normalizedAttendance.checkInUtc,
          attendance_check_out_utc: normalizedAttendance.checkOutUtc,
        }
      : null,
    error: result.error ?? attendanceResult.error,
  }
}

async function fetchDermoconsejoNotifications(
  supabase: DashboardSupabaseClient,
  actor: ActorActual
) {
  const recipientResult = await supabase
    .from('mensaje_receptor')
    .select('id, mensaje_id, empleado_id, estado, leido_en, created_at')
    .eq('empleado_id', actor.empleadoId)
    .order('created_at', { ascending: false })
    .limit(24)

  if (recipientResult.error) {
    return {
      data: [] as DashboardDermoconsejoNotificationItem[],
      unreadCount: 0,
      error: recipientResult.error,
    }
  }

  const recipients = (recipientResult.data ?? []) as DashboardDermoNotificationRecipientRow[]
  const messageIds = Array.from(new Set(recipients.map((item) => item.mensaje_id).filter(Boolean)))

  if (messageIds.length === 0) {
    return {
      data: [] as DashboardDermoconsejoNotificationItem[],
      unreadCount: 0,
      error: null,
    }
  }

  const messageQuery = supabase
    .from('mensaje_interno')
    .select('id, titulo, cuerpo, tipo, created_at, creado_por_usuario_id')
  const messageResult =
    typeof messageQuery.in === 'function'
      ? await messageQuery.in('id', messageIds).limit(messageIds.length)
      : await messageQuery.limit(messageIds.length)

  if (messageResult.error) {
    return {
      data: [] as DashboardDermoconsejoNotificationItem[],
      unreadCount: 0,
      error: messageResult.error,
    }
  }

  const messages = (messageResult.data ?? []) as DashboardDermoNotificationMessageRow[]
  const creatorIds = Array.from(
    new Set(messages.map((item) => item.creado_por_usuario_id).filter((item): item is string => Boolean(item)))
  )

  let users: DashboardDermoUserRow[] = []
  if (creatorIds.length > 0) {
    const usersQuery = supabase.from('usuario').select('id, empleado_id')
    const usersResult =
      typeof usersQuery.in === 'function'
        ? await usersQuery.in('id', creatorIds).limit(creatorIds.length)
        : await usersQuery.limit(creatorIds.length)

    if (usersResult.error) {
      return {
        data: [] as DashboardDermoconsejoNotificationItem[],
        unreadCount: 0,
        error: usersResult.error,
      }
    }

    users = (usersResult.data ?? []) as DashboardDermoUserRow[]
  }

  const creatorEmployeeIds = Array.from(
    new Set(users.map((item) => item.empleado_id).filter((item): item is string => Boolean(item)))
  )

  let creators: DashboardDermoEmployeeProfileRow[] = []
  if (creatorEmployeeIds.length > 0) {
    const creatorsQuery = supabase
      .from('empleado')
      .select('id, nombre_completo, puesto, zona, correo_electronico, telefono, fecha_alta, supervisor_empleado_id')
    const creatorsResult =
      typeof creatorsQuery.in === 'function'
        ? await creatorsQuery.in('id', creatorEmployeeIds).limit(creatorEmployeeIds.length)
        : await creatorsQuery.limit(creatorEmployeeIds.length)

    if (creatorsResult.error) {
      return {
        data: [] as DashboardDermoconsejoNotificationItem[],
        unreadCount: 0,
        error: creatorsResult.error,
      }
    }

    creators = (creatorsResult.data ?? []) as DashboardDermoEmployeeProfileRow[]
  }

  const userById = new Map(users.map((item) => [item.id, item] as const))
  const creatorByEmployeeId = new Map(creators.map((item) => [item.id, item] as const))
  const messageById = new Map(messages.map((item) => [item.id, item] as const))

  const adminNotifications = recipients
    .map((recipient) => {
      const message = messageById.get(recipient.mensaje_id)
      if (!message) {
        return null
      }

      const creatorUser = message.creado_por_usuario_id
        ? userById.get(message.creado_por_usuario_id) ?? null
        : null
      const creatorEmployee = creatorUser
        ? creatorByEmployeeId.get(creatorUser.empleado_id) ?? null
        : null

      if (creatorEmployee?.puesto !== 'ADMINISTRADOR') {
        return null
      }

      return {
        id: recipient.id,
        titulo: message.titulo,
        cuerpo: message.cuerpo,
        createdAt: message.created_at,
        estado: recipient.estado,
        tipo: message.tipo,
      } satisfies DashboardDermoconsejoNotificationItem
    })
    .filter((item): item is DashboardDermoconsejoNotificationItem => Boolean(item))
    .slice(0, 8)

  return {
    data: adminNotifications,
    unreadCount: adminNotifications.filter((item) => item.estado === 'PENDIENTE').length,
    error: null,
  }
}

async function fetchDermoconsejoProfile(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  currentPdvName: string
) {
  const profileResult = await supabase
    .from('empleado')
    .select(
      'id, nombre_completo, puesto, zona, correo_electronico, telefono, fecha_alta, supervisor_empleado_id'
    )
    .eq('id', actor.empleadoId)
    .limit(1)

  if (profileResult.error) {
    return {
      data: null as DashboardDermoconsejoProfile | null,
      error: profileResult.error,
    }
  }

  const profileRow = ((profileResult.data ?? []) as DashboardDermoEmployeeProfileRow[])[0] ?? null

  if (!profileRow) {
    return {
      data: {
        nombreCompleto: actor.nombreCompleto,
        puesto: actor.puesto,
        zona: null,
        correoElectronico: actor.correoElectronico,
        telefono: null,
        username: actor.username,
        fechaAlta: null,
        supervisorNombre: null,
        tiendaActual: currentPdvName,
      } satisfies DashboardDermoconsejoProfile,
      error: null,
    }
  }

  let supervisorNombre: string | null = null
  if (profileRow.supervisor_empleado_id) {
    const supervisorResult = await supabase
      .from('empleado')
      .select(
        'id, nombre_completo, puesto, zona, correo_electronico, telefono, fecha_alta, supervisor_empleado_id'
      )
      .eq('id', profileRow.supervisor_empleado_id)
      .limit(1)

    if (!supervisorResult.error) {
      supervisorNombre =
        ((supervisorResult.data ?? []) as DashboardDermoEmployeeProfileRow[])[0]?.nombre_completo ??
        null
    }
  }

  return {
    data: {
      nombreCompleto: profileRow.nombre_completo,
      puesto: profileRow.puesto,
      zona: profileRow.zona,
      correoElectronico: profileRow.correo_electronico ?? actor.correoElectronico,
      telefono: profileRow.telefono,
      username: actor.username,
      fechaAlta: profileRow.fecha_alta,
      supervisorNombre,
      tiendaActual: currentPdvName,
    } satisfies DashboardDermoconsejoProfile,
    error: null,
  }
}

function buildDermoconsejoQuickActions() {
  return [
    {
      key: 'calendario',
      label: 'Calendario',
      helper: 'Ver tiendas asignadas de la semana y del mes',
      href: '/asignaciones',
      accent: 'sky',
      preferredSnap: 'expanded',
    },
    {
      key: 'ventas',
      label: 'Ventas',
      helper: 'Registrar transacciones del dia',
      href: '/ventas',
      accent: 'emerald',
      preferredSnap: 'expanded',
    },
    {
      key: 'love-isdin',
      label: 'Love ISDIN',
      helper: 'Capturar clientes y afiliaciones',
      href: '/love-isdin',
      accent: 'rose',
      preferredSnap: 'expanded',
    },
    {
      key: 'promocional',
      label: 'Promocional',
      helper: 'Recibe material y registra entregas en tu PDV',
      href: '/materiales',
      accent: 'emerald',
      preferredSnap: 'expanded',
    },
    {
      key: 'comunicacion',
      label: 'Comunicacion',
      helper: 'Reporta pagos, nomina, recibos o fallas a Coordinacion',
      href: '/mensajes?contexto=soporte',
      accent: 'amber',
      preferredSnap: 'expanded',
      badgeCount: 0,
    },
    {
      key: 'perfil',
      label: 'Perfil',
      helper: 'Consulta tus datos base',
      href: '/mi-perfil',
      accent: 'sky',
      preferredSnap: 'expanded',
    },
    {
      key: 'incidencias',
      label: 'Incidencias',
      helper: 'Retardo, no llegada, desabasto o aviso de inasistencia',
      accent: 'orange',
      href: '/mensajes?contexto=incidencia',
      preferredSnap: 'expanded',
    },
    {
      key: 'justificacion-faltas',
      label: 'Justificacion de faltas',
      helper: 'Justifica una falta con receta del IMSS',
      href: '/solicitudes?tipo=JUSTIFICACION_FALTA',
      accent: 'rose',
      preferredSnap: 'expanded',
    },
    {
      key: 'incapacidad',
      label: 'Incapacidad',
      helper: 'Enviar incapacidad directa a nomina',
      href: '/solicitudes?tipo=INCAPACIDAD',
      accent: 'rose',
      preferredSnap: 'expanded',
    },
    {
      key: 'vacaciones',
      label: 'Vacaciones',
      helper: 'Solicitar vacaciones',
      href: '/solicitudes?tipo=VACACIONES',
      accent: 'emerald',
      preferredSnap: 'expanded',
    },
    {
      key: 'permiso',
      label: 'Cumpleanos',
      helper: 'Solicitar dia de cumpleanos',
      href: '/solicitudes?tipo=PERMISO',
      accent: 'purple',
      preferredSnap: 'expanded',
    },
  ] satisfies DashboardDermoconsejoQuickAction[]
}

async function fetchDermoconsejoRequestStatus(
  supabase: DashboardSupabaseClient,
  actor: ActorActual
) {
  const result = await supabase
    .from('solicitud')
    .select('id, empleado_id, fecha_inicio, fecha_fin, tipo, estatus, motivo, comentarios, justificante_url, metadata')
    .eq('empleado_id', actor.empleadoId)
    .order('fecha_inicio', { ascending: false })
    .limit(24)

  return {
    data: ((result.data ?? []) as Array<{
      id: string
      empleado_id: string
      fecha_inicio: string
      fecha_fin: string
      tipo: string
      estatus: string
      motivo: string | null
      comentarios: string | null
      justificante_url: string | null
      metadata: unknown
    }>)
      .map((item) => {
        const tipo = String(item.tipo).trim().toUpperCase()

        if (!['INCAPACIDAD', 'VACACIONES', 'PERMISO', 'AVISO_INASISTENCIA', 'JUSTIFICACION_FALTA'].includes(tipo)) {
          return null
        }

        return {
          id: item.id,
          tipo: tipo as DashboardDermoconsejoSolicitudStatusItem['tipo'],
          estatus: item.estatus,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
          motivo: item.motivo,
          comentarios: item.comentarios,
          justificanteUrl: item.justificante_url ?? null,
          metadata:
            item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
              ? (item.metadata as Record<string, unknown>)
              : {},
        }
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null
      ),
    error: result.error,
  }
}

async function buildDermoconsejoData(
  supabase: DashboardSupabaseClient,
  actor: ActorActual
): Promise<DashboardDermoconsejoData> {
  const todayIso = getTodayIso()
  const [
    assignmentsResult,
    attendancesResult,
    salesResult,
    loveResult,
    loveQrResult,
    productCatalogResult,
    notificationsResult,
    requestStatusResult,
  ] = await Promise.all([
    fetchDermoconsejoAssignments(supabase, actor),
    fetchDermoconsejoAttendances(supabase, actor, todayIso),
    fetchDermoconsejoSales(supabase, actor, todayIso),
    fetchDermoconsejoLove(supabase, actor, todayIso),
    fetchDermoconsejoLoveQr(supabase, actor),
    fetchDermoconsejoProductCatalog(supabase),
    fetchDermoconsejoNotifications(supabase, actor),
    fetchDermoconsejoRequestStatus(supabase, actor),
  ])

  const activeAssignments = assignmentsResult.error
    ? []
    : resolveAssignmentsForDate(
        assignmentsResult.data.filter((item) => item.estado_publicacion === 'PUBLICADA'),
        todayIso
      )
  const openAttendance = attendancesResult.error
    ? null
    : attendancesResult.data.find((item) => item.check_in_utc && !item.check_out_utc) ?? null
  const latestAttendance = attendancesResult.error ? null : attendancesResult.data[0] ?? null
  const chosenPdvId =
    openAttendance?.pdv_id ??
    latestAttendance?.pdv_id ??
    activeAssignments[0]?.pdv_id ??
    null
  const pdvIds = Array.from(
    new Set(
      [
        chosenPdvId,
        ...(assignmentsResult.error ? [] : assignmentsResult.data.map((item) => item.pdv_id)),
        ...(attendancesResult.error ? [] : attendancesResult.data.map((item) => item.pdv_id)),
      ].filter((item): item is string => Boolean(item))
    )
  )
  const pdvsResult = await fetchDermoconsejoPdvs(supabase, pdvIds)
  const pdvMap = new Map(pdvsResult.data.map((item) => [item.id, item] as const))
  const chosenPdv = chosenPdvId ? pdvMap.get(chosenPdvId) ?? null : null
  const chosenPdvCity = chosenPdv ? getFirst(chosenPdv.ciudad) : null
  const chosenPdvState = chosenPdvCity?.estado ?? resolveMexicoStateFromCity(chosenPdvCity?.nombre ?? null) ?? null
  const [campaignsResult, geocercaResult, missionCatalogResult] = await Promise.all([
    fetchDermoconsejoCampaignRows(supabase, actor, chosenPdvId),
    fetchDermoconsejoGeocerca(supabase, chosenPdvId),
    fetchDermoconsejoMissionCatalog(supabase),
  ])
  const supportServiceForCampaign =
    (() => {
      try {
        return createServiceClient() as unknown as DashboardSupabaseClient
      } catch {
        return null
      }
    })()
  const productCatalogMap = new Map(
    (productCatalogResult.error ? [] : productCatalogResult.data).map((item) => [item.id, item] as const)
  )
  const activeFormationResult = await fetchDermoconsejoActiveFormation(supabase, {
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    todayIso,
    pdvIds: activeAssignments.map((item) => item.pdv_id),
  })

  const activeCampaignRows = campaignsResult.error
    ? []
    : await Promise.all(
        campaignsResult.pdvRows.map(async (row) => {
            const campaign = campaignsResult.campaignRows.find((item) => item.id === row.campana_id)
            if (!campaign || campaign.estado !== 'ACTIVA') {
              return null
            }

            if (!isIsoRangeActive(campaign.fecha_inicio, campaign.fecha_fin, todayIso)) {
              return null
            }

            const manualMercadeo = readCampaignManualDocument(campaign.metadata)
            const evidenceTemplate = readCampaignEvidenceTemplate(
              campaign.metadata,
              campaign.evidencias_requeridas ?? []
            )
            const productGoals = readCampaignProductGoals(campaign.metadata)
            const productLabels =
              productGoals.length > 0
                ? productGoals.map((goal) => {
                    const product = productCatalogMap.get(goal.productId)
                    const quotaLabel =
                      goal.goalType === 'EXHIBICION'
                        ? `${goal.quota.toFixed(0)} exhibiciones`
                        : `${goal.quota.toFixed(0)} ventas`
                    return product ? `${product.nombreCorto} · ${quotaLabel}` : `${goal.productId} · ${quotaLabel}`
                  })
                : (campaign.productos_foco ?? []).map((productId) => {
                    const product = productCatalogMap.get(productId)
                    return product ? product.nombreCorto : productId
                  })

            return {
              id: campaign.id,
              campanaPdvId: row.id,
              nombre: campaign.nombre,
              fechaInicio: campaign.fecha_inicio,
              fechaFin: campaign.fecha_fin,
              descripcion: campaign.descripcion,
              instrucciones: campaign.instrucciones,
              productosFoco: productLabels,
              evidenciasRequeridas: campaign.evidencias_requeridas ?? [],
              evidenceTemplate: evidenceTemplate.map((item) => ({
                id: item.id,
                label: item.label,
                kind: item.kind,
              })),
              cuotaAdicional: campaign.cuota_adicional ?? 0,
              manualMercadeoUrl:
                manualMercadeo && supportServiceForCampaign
                  ? await resolveLoveQrSignedUrl(
                      supportServiceForCampaign as unknown as SupabaseClient<any>,
                      manualMercadeo.url
                    )
                  : manualMercadeo?.url ?? null,
              manualMercadeoNombre: manualMercadeo?.fileName ?? null,
              ctaHref: '/campanas',
            } satisfies DashboardDermoconsejoCampaign
          })
      )
  const activeCampaign =
    activeCampaignRows.find((item): item is DashboardDermoconsejoCampaign => Boolean(item)) ?? null

  const shiftIsOpen = Boolean(openAttendance)
  const startedAt = formatShortTime(openAttendance?.check_in_utc ?? null)
  const reportWindow = resolveReportWindow({
    operationDate: todayIso,
    pdvState: chosenPdvState,
    checkInUtc: latestAttendance?.check_in_utc ?? null,
    checkOutUtc: latestAttendance?.check_out_utc ?? null,
  })
  const primaryAssignment = activeAssignments[0] ?? null
  const activeFormationTargeting = activeFormationResult.data
    ? normalizeFormacionTargetingMetadata(activeFormationResult.data.metadata)
    : null
  const activeFormation = activeFormationResult.error
    ? null
    : activeFormationResult.data
      ? {
          id: activeFormationResult.data.id,
          nombre: activeFormationResult.data.nombre,
          fechaInicio: activeFormationResult.data.fecha_inicio,
          fechaFin: activeFormationResult.data.fecha_fin,
          sede: activeFormationResult.data.sede,
          tipo: activeFormationResult.data.tipo,
          tipoEvento: activeFormationTargeting?.eventType ?? 'FORMACION',
          modalidad: activeFormationTargeting?.modality ?? 'PRESENCIAL',
          horarioInicio: activeFormationTargeting?.scheduleStart ?? null,
          horarioFin: activeFormationTargeting?.scheduleEnd ?? null,
          supervisorNombre: activeFormationTargeting?.supervisorName ?? null,
          manualUrl: activeFormationTargeting?.manualDocument?.url ?? null,
          manualNombre: activeFormationTargeting?.manualDocument?.fileName ?? null,
          attendanceId: (activeFormationResult.data as DashboardDermoFormationRow & { attendance_id?: string | null }).attendance_id ?? null,
          attendanceStatus:
            ((activeFormationResult.data as DashboardDermoFormationRow & { attendance_status?: DashboardDermoconsejoFormation['attendanceStatus'] }).attendance_status ??
              'PENDIENTE'),
          checkInUtc:
            (activeFormationResult.data as DashboardDermoFormationRow & { attendance_check_in_utc?: string | null }).attendance_check_in_utc ??
            null,
          checkOutUtc:
            (activeFormationResult.data as DashboardDermoFormationRow & { attendance_check_out_utc?: string | null }).attendance_check_out_utc ??
            null,
        }
      : null
  const effectiveDay = resolveEffectiveAssignmentForEmployeeDate(
    {
      empleadoId: actor.empleadoId,
      puesto: actor.puesto,
      pdvIds: Array.from(new Set(assignmentsResult.error ? [] : assignmentsResult.data.map((item) => item.pdv_id))),
    },
    todayIso,
    assignmentsResult.error ? [] : assignmentsResult.data.filter((item) => item.estado_publicacion === 'PUBLICADA'),
    requestStatusResult.error
      ? []
      : requestStatusResult.data.map((item) => ({
          id: item.id,
          empleadoId: actor.empleadoId,
          fechaInicio: item.fechaInicio,
          fechaFin: item.fechaFin,
          tipo: item.tipo,
          estatus: item.estatus,
          metadata: item.metadata,
        })),
    activeFormationResult.error || !activeFormationResult.data
      ? []
      : [
          {
            id: activeFormationResult.data.id,
            fechaInicio: activeFormationResult.data.fecha_inicio,
            fechaFin: activeFormationResult.data.fecha_fin,
            estado: activeFormationResult.data.estado,
            nombre: activeFormationResult.data.nombre ?? null,
            tipo: activeFormationResult.data.tipo ?? null,
            sede: activeFormationResult.data.sede ?? null,
            metadata:
              activeFormationResult.data.metadata &&
              typeof activeFormationResult.data.metadata === 'object' &&
              !Array.isArray(activeFormationResult.data.metadata)
                ? (activeFormationResult.data.metadata as Record<string, unknown>)
                : {},
            participantes: activeFormationResult.data.participantes,
          },
        ]
  )
  const canStartShift = Boolean(
    !activeFormation &&
      effectiveDay.estadoOperativo === 'ASIGNADA_PDV' &&
      effectiveDay.assignment?.id &&
      effectiveDay.assignment.pdv_id &&
      effectiveDay.assignment.horario_referencia
  )
  const disabledReason = shiftIsOpen
    ? null
    : activeFormation
      ? `Tienes formacion activa${activeFormation.sede ? ` en ${activeFormation.sede}` : ''}. Tu jornada en tienda queda exenta hoy.`
      : effectiveDay.estadoOperativo === 'INCAPACIDAD'
        ? 'Tu jornada en tienda queda suspendida por incapacidad aprobada.'
        : effectiveDay.estadoOperativo === 'VACACIONES'
          ? 'Tu jornada en tienda queda suspendida por vacaciones aprobadas.'
          : effectiveDay.estadoOperativo === 'FALTA_JUSTIFICADA'
            ? 'La falta de este dia ya fue justificada y no genera jornada operativa en tienda.'
            : canStartShift
              ? null
              : 'Necesitas una asignacion activa con PDV y horario para registrar la llegada.'
  const previousMissionId = latestAttendance?.mision_dia_id ?? null
  const previousMissionCodigo = latestAttendance?.mision_codigo ?? null
  const profileResult = await fetchDermoconsejoProfile(
    supabase,
    actor,
    chosenPdv?.nombre ?? latestAttendance?.pdv_nombre ?? 'Sin sucursal asignada hoy'
  )
  const quickActions = buildDermoconsejoQuickActions().map((item) =>
    item.key === 'comunicacion'
      ? { ...item, badgeCount: notificationsResult.unreadCount }
      : item
  )
  const calendar = buildDermoconsejoCalendar(assignmentsResult.error ? [] : assignmentsResult.data, pdvMap, todayIso)
  const loveQuotaResult = await fetchLoveQuotaTargetRows(supabase, {
    accountId: actor.cuentaClienteId ?? null,
    dateFrom: todayIso,
    dateTo: todayIso,
    employeeIds: [actor.empleadoId],
  })
  const loveQuota = computeLoveQuotaProgress(
    loveResult.error ? 0 : loveResult.data.length,
    loveQuotaResult.error
      ? LOVE_DAILY_QUOTA_DEFAULT
      : loveQuotaResult.data.length > 0
        ? loveQuotaResult.data.reduce((acc, item) => acc + item.objetivo, 0)
        : LOVE_DAILY_QUOTA_DEFAULT
  )

  return {
    greetingName: actor.nombreCompleto,
    todayLabel: formatLongDateLabel(todayIso),
    context: {
      cuentaClienteId:
        openAttendance?.cuenta_cliente_id ??
        latestAttendance?.cuenta_cliente_id ??
        primaryAssignment?.cuenta_cliente_id ??
        actor.cuentaClienteId ??
        null,
      empleadoId: actor.empleadoId,
      supervisorEmpleadoId: effectiveDay.supervisorEmpleadoId ?? primaryAssignment?.supervisor_empleado_id ?? null,
      pdvId: chosenPdv?.id ?? chosenPdvId ?? null,
      attendanceId: openAttendance?.id ?? latestAttendance?.id ?? null,
      fechaOperacion: todayIso,
    },
    checkIn: {
      cuentaClienteId:
        openAttendance?.cuenta_cliente_id ??
        latestAttendance?.cuenta_cliente_id ??
        effectiveDay.cuentaClienteId ??
        primaryAssignment?.cuenta_cliente_id ??
        actor.cuentaClienteId ??
        null,
      assignmentId: effectiveDay.assignment?.id ?? primaryAssignment?.id ?? openAttendance?.asignacion_id ?? null,
      assignmentSchedule: effectiveDay.assignment?.horario_referencia ?? primaryAssignment?.horario_referencia ?? null,
      empleadoId: actor.empleadoId,
      empleadoNombre: actor.nombreCompleto,
      supervisorEmpleadoId: effectiveDay.supervisorEmpleadoId ?? primaryAssignment?.supervisor_empleado_id ?? null,
      pdvId: chosenPdv?.id ?? chosenPdvId ?? null,
      pdvClaveBtl: chosenPdv?.clave_btl ?? latestAttendance?.pdv_clave_btl ?? null,
      pdvNombre: chosenPdv?.nombre ?? latestAttendance?.pdv_nombre ?? 'Sin sucursal asignada hoy',
      zona: chosenPdv?.zona ?? null,
      cadena:
        latestAttendance?.cadena_nombre ??
        (actor.cuentaClienteId ? 'ISDIN' : null),
      fechaOperacion: todayIso,
      geocercaLatitud: geocercaResult.data?.latitud ?? null,
      geocercaLongitud: geocercaResult.data?.longitud ?? null,
      geocercaRadioMetros: geocercaResult.data?.radio_tolerancia_metros ?? null,
      permiteCheckinConJustificacion:
        geocercaResult.data?.permite_checkin_con_justificacion ?? true,
      previousMissionId,
      previousMissionCodigo,
      missions: missionCatalogResult.error ? [] : missionCatalogResult.data,
    },
    profile:
      profileResult.data ?? {
        nombreCompleto: actor.nombreCompleto,
        puesto: actor.puesto,
        zona: null,
        correoElectronico: actor.correoElectronico,
        telefono: null,
        username: actor.username,
        fechaAlta: null,
        supervisorNombre: null,
        tiendaActual: chosenPdv?.nombre ?? latestAttendance?.pdv_nombre ?? 'Sin sucursal asignada hoy',
      },
    store: {
      pdvId: chosenPdv?.id ?? null,
      claveBtl: chosenPdv?.clave_btl ?? latestAttendance?.pdv_clave_btl ?? null,
      nombre: chosenPdv?.nombre ?? latestAttendance?.pdv_nombre ?? 'Sin sucursal asignada hoy',
      direccion: chosenPdv?.direccion ?? null,
      zona: chosenPdv?.zona ?? null,
    },
    shift: {
      attendanceId: openAttendance?.id ?? latestAttendance?.id ?? null,
      fechaOperacion: todayIso,
      isOpen: shiftIsOpen,
      canStart: canStartShift,
      checkInUtc: openAttendance?.check_in_utc ?? null,
      buttonLabel: shiftIsOpen ? 'Registrar Salida' : 'Registrar Entrada',
      buttonHref: '/asistencias',
      helper: shiftIsOpen
        ? `Jornada iniciada${startedAt ? ` a las ${startedAt}` : ''}.`
        : canStartShift
          ? 'Todavia no registras tu entrada de hoy.'
          : effectiveDay.mensajeOperativo ?? 'Sin asignacion operativa activa para iniciar jornada.',
      disabledReason,
    },
    reportWindow: {
      timezone: reportWindow.timezone,
      stateName: chosenPdvState,
      status: reportWindow.status,
      canReportToday: reportWindow.canReportToday,
      deadlineLocalTime: reportWindow.deadlineLocalTime,
      helper: buildReportWindowHelperText(reportWindow),
    },
    loveQr: loveQrResult.error ? null : loveQrResult.data,
    loveQuota: {
      objetivoDiario: loveQuota.objetivo,
      avanceHoy: loveQuota.actual,
      restanteHoy: loveQuota.restante,
      cumplimientoHoyPct: loveQuota.cumplimientoPct,
    },
    counters: [
      {
        label: 'Ventas',
        value: salesResult.error ? 0 : salesResult.data.length,
        helper: 'Registros de ventas de hoy',
      },
      {
        label: 'Capturas',
        value: loveResult.error ? 0 : loveResult.data.length,
        helper: 'Clientes capturados hoy',
      },
    ],
    notifications: {
      unreadCount: notificationsResult.unreadCount,
      items: notificationsResult.data,
    },
    activeCampaign,
    activeFormation,
    quickActions,
    requestStatus: requestStatusResult.error ? [] : requestStatusResult.data,
    catalogoProductos: productCatalogResult.error ? [] : productCatalogResult.data,
    calendar,
  }
}

async function buildSupervisorLoveQuotaSummary(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  dateIso: string
): Promise<DashboardSupervisorLoveQuotaSummary | null> {
  if (actor.puesto !== 'SUPERVISOR') {
    return null
  }

  const [targetResult, actualResult] = await Promise.all([
    fetchLoveQuotaTargetRows(supabase, {
      accountId: actor.cuentaClienteId ?? null,
      dateFrom: dateIso,
      dateTo: dateIso,
      supervisorId: actor.empleadoId,
    }),
    supabase
      .from('love_isdin_resumen_diario')
      .select('afiliaciones_total')
      .eq('fecha_operacion', dateIso)
      .eq('supervisor_empleado_id', actor.empleadoId)
      .limit(1000),
  ])

  if (targetResult.error || actualResult.error) {
    return null
  }

  const progress = computeLoveQuotaProgress(
    ((actualResult.data ?? []) as unknown as Array<{ afiliaciones_total: number }>).reduce(
      (acc, item) => acc + Number(item.afiliaciones_total ?? 0),
      0
    ),
    targetResult.data.reduce((acc, item) => acc + item.objetivo, 0)
  )

  return {
    objetivoHoy: progress.objetivo,
    avanceHoy: progress.actual,
    restanteHoy: progress.restante,
    cumplimientoHoyPct: progress.cumplimientoPct,
    dcConMetaHoy: new Set(targetResult.data.map((item) => item.empleadoId)).size,
  }
}

async function fetchDermoconsejoProductCatalog(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('producto')
    .select('id, sku, nombre, nombre_corto, activo')
    .eq('activo', true)
    .order('nombre_corto', { ascending: true })
    .limit(500)

  return {
    data: ((result.data ?? []) as DashboardDermoProductRow[]).map((item) => ({
      id: item.id,
      sku: item.sku,
      nombre: item.nombre,
      nombreCorto: item.nombre_corto,
    })),
    error: result.error,
  }
}

function buildDermoconsejoCalendar(
  assignments: DashboardDermoAssignmentRow[],
  pdvMap: Map<string, DashboardDermoPdvRow>,
  todayIso: string
): DashboardDermoconsejoCalendar {
  const publishedAssignments = assignments.filter((item) => item.estado_publicacion === 'PUBLICADA')

  const buildDay = (dateIso: string): DashboardDermoconsejoCalendarDay => ({
    date: dateIso,
    weekdayLabel: formatCalendarWeekdayLabel(dateIso),
    shortLabel: formatCalendarShortLabel(dateIso),
    isToday: dateIso === todayIso,
    assignments: resolveAssignmentsForDate(publishedAssignments, dateIso)
      .map((item) => {
        const pdv = pdvMap.get(item.pdv_id)

        return {
          assignmentId: item.id,
          pdvId: item.pdv_id,
          claveBtl: pdv?.clave_btl ?? null,
          nombre: pdv?.nombre ?? 'PDV sin catalogo',
          direccion: pdv?.direccion ?? null,
          zona: pdv?.zona ?? null,
          horario: item.horario_referencia,
          tipo: item.tipo,
        } satisfies DashboardDermoconsejoCalendarAssignment
      }),
  })

  return {
    week: Array.from({ length: 7 }, (_, index) => buildDay(addDaysIso(todayIso, index))),
    month: Array.from({ length: 30 }, (_, index) => buildDay(addDaysIso(todayIso, index))),
  }
}

function parseSupervisorScheduledStartMinutes(horario: string | null) {
  const normalized = String(horario ?? '').trim()
  if (!normalized) {
    return null
  }

  const match = normalized.match(/(\d{1,2}):(\d{2})/)
  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  return hours * 60 + minutes
}

function extractSupervisorLocalMinutes(isoValue: string | null) {
  if (!isoValue) {
    return null
  }

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  })
  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? Number.NaN)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? Number.NaN)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }

  return hour * 60 + minute
}

function buildSupervisorDailyBoard(
  actor: ActorActual,
  assignments: DashboardSupervisorDailyAssignmentRow[],
  attendances: DashboardLiveAsistenciaRow[],
  todayIso: string,
  toleranceMinutes: number
): DashboardSupervisorDailyBoard | null {
  if (actor.puesto !== 'SUPERVISOR') {
    return null
  }

  const attendanceByKey = new Map<string, DashboardLiveAsistenciaRow>()
  for (const attendance of attendances) {
    if (attendance.fecha_operacion !== todayIso) {
      continue
    }

    const key = `${attendance.empleado_id}::${attendance.pdv_id}::${attendance.fecha_operacion}`
    const current = attendanceByKey.get(key)
    if (!current) {
      attendanceByKey.set(key, attendance)
      continue
    }

    const nextTimestamp = attendance.check_in_utc ?? attendance.check_out_utc ?? ''
    const currentTimestamp = current.check_in_utc ?? current.check_out_utc ?? ''
    if (nextTimestamp > currentTimestamp) {
      attendanceByKey.set(key, attendance)
    }
  }

  const items = resolveAssignmentsForDate(
    assignments
    .filter((item) => item.estado_publicacion === 'PUBLICADA')
    .filter((item) => item.supervisor_empleado_id === actor.empleadoId),
    todayIso
  )
    .map<DashboardSupervisorDailyItem>((item) => {
      const attendance =
        attendanceByKey.get(`${item.empleado_id}::${item.pdv_id}::${todayIso}`) ?? null
      const empleado = getFirst(item.empleado)?.nombre_completo?.trim() || 'Sin dermoconsejero'
      const pdv = getFirst(item.pdv)
      const scheduledStart = parseSupervisorScheduledStartMinutes(item.horario_referencia)
      const actualStart = extractSupervisorLocalMinutes(attendance?.check_in_utc ?? null)
      const minutesLate =
        scheduledStart !== null && actualStart !== null
          ? Math.max(0, actualStart - scheduledStart)
          : null

      return {
        assignmentId: item.id,
        attendanceId: attendance?.id ?? null,
        cuentaClienteId: item.cuenta_cliente_id,
        empleadoId: item.empleado_id,
        empleado,
        pdvId: item.pdv_id,
        pdv: pdv?.nombre?.trim() || 'PDV sin catalogo',
        pdvClaveBtl: pdv?.clave_btl ?? null,
        zona: pdv?.zona ?? null,
        horario: item.horario_referencia,
        tipoAsignacion: item.tipo,
        fechaOperacion: todayIso,
        checkInUtc: attendance?.check_in_utc ?? null,
        checkOutUtc: attendance?.check_out_utc ?? null,
        estadoAsistencia: attendance
          ? (attendance.estatus as DashboardSupervisorDailyStatus)
          : 'SIN_CHECKIN',
        estadoGps: attendance?.estado_gps ?? null,
        distanciaCheckInMetros: attendance?.distancia_check_in_metros ?? null,
        minutosRetardo:
          minutesLate !== null && minutesLate > toleranceMinutes ? minutesLate : null,
      }
    })
    .sort((left, right) => {
      const pdvCompare = left.pdv.localeCompare(right.pdv, 'es')
      if (pdvCompare !== 0) {
        return pdvCompare
      }

      return left.empleado.localeCompare(right.empleado, 'es')
    })

  return {
    date: todayIso,
    items,
  }
}

async function fetchDashboardRows(
  supabase: DashboardSupabaseClient,
  cuentaClienteId: string | null
): Promise<DashboardRowsResult> {
  let query = supabase
    .from('dashboard_kpis')
    .select(`
      fecha_corte,
      cuenta_cliente_id,
      cuenta_cliente,
      cuenta_cliente_identificador,
      promotores_activos,
      checkins_validos,
      jornadas_pendientes,
      alertas_operativas,
      jornadas_operadas,
      ventas_confirmadas,
      monto_confirmado,
      afiliaciones_love,
      asistencia_porcentaje,
      cuotas_cumplidas_periodo,
      neto_nomina_periodo,
      refreshed_at
    `)
    .order('fecha_corte', { ascending: false })

  if (cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', cuentaClienteId)
  }

  const result = await query.limit(180)

  return {
    data: (result.data ?? []) as DashboardKpiRow[],
    error: result.error,
  }
}

const fetchCachedDashboardRows = unstable_cache(
  async (cuentaClienteId: string | null) => {
    const supabase = createServiceClient() as unknown as DashboardSupabaseClient
    return fetchDashboardRows(supabase, cuentaClienteId)
  },
  ['dashboard-kpis-rows'],
  {
    revalidate: DASHBOARD_KPI_REVALIDATE_SECONDS,
    tags: ['dashboard-kpis'],
  }
)

function getDashboardCacheKey(cuentaClienteId: string | null) {
  return cuentaClienteId ?? 'global'
}

async function fetchFreshDashboardRows(
  supabase: DashboardSupabaseClient,
  cuentaClienteId: string | null,
  allowCache: boolean
): Promise<DashboardRowsResult> {
  const cacheKey = getDashboardCacheKey(cuentaClienteId)

  if (allowCache) {
    const cached = dashboardKpiCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result
    }
  }

  const initial = allowCache
    ? await fetchCachedDashboardRows(cuentaClienteId)
    : await fetchDashboardRows(supabase, cuentaClienteId)

  if (initial.error) {
    return initial
  }

  const latestRefreshedAt = getLatestRefreshedAt(initial.data)
  const snapshotIsFresh =
    initial.data.length > 0 &&
    Boolean(latestRefreshedAt) &&
    Date.now() - Date.parse(latestRefreshedAt as string) <= DASHBOARD_REFRESH_MAX_AGE_MS

  const result = snapshotIsFresh
    ? initial
    : {
        data: initial.data,
        error: null,
      }

  if (allowCache) {
    dashboardKpiCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_KPI_CACHE_TTL_MS,
      result,
    })
  }

  return result
}
async function fetchLiveAssistances(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  allowGlobalScope: boolean
) {
  let query = supabase
    .from('asistencia')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      supervisor_empleado_id,
      empleado_nombre,
      pdv_id,
      pdv_clave_btl,
      pdv_nombre,
      fecha_operacion,
      check_in_utc,
      check_out_utc,
      latitud_check_in,
      longitud_check_in,
      distancia_check_in_metros,
      estado_gps,
      estatus,
      pdv_zona
    `)
    .order('fecha_operacion', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  if (actor.puesto === 'SUPERVISOR') {
    query = query.eq('supervisor_empleado_id', actor.empleadoId)
  }

  const result = await query.limit(DASHBOARD_LIVE_QUERY_LIMIT)
  const baseRows = ((result.data ?? []) as DashboardLiveAsistenciaRow[])
    .filter((item) => (allowGlobalScope ? true : item.cuenta_cliente_id === actor.cuentaClienteId))
    .filter((item) => (actor.puesto === 'SUPERVISOR' ? item.supervisor_empleado_id === actor.empleadoId : true))
  const pdvIds = Array.from(new Set(baseRows.map((item) => item.pdv_id).filter(Boolean)))
  let pdvStatesById = new Map<string, string | null>()

  if (pdvIds.length > 0) {
    const withStateQuery = supabase.from('pdv').select('id, ciudad:ciudad_id(nombre, estado)')
    const pdvStateResult =
      typeof withStateQuery.in === 'function'
        ? await withStateQuery.in('id', pdvIds).limit(DASHBOARD_LIVE_QUERY_LIMIT)
        : await withStateQuery.limit(DASHBOARD_LIVE_QUERY_LIMIT)

    let pdvStateData = pdvStateResult.data
    let pdvStateError = pdvStateResult.error

    if (isMissingCiudadEstadoColumn(pdvStateError?.message)) {
      const fallbackQuery = supabase.from('pdv').select('id, ciudad:ciudad_id(nombre)')
      const fallbackResult =
        typeof fallbackQuery.in === 'function'
          ? await fallbackQuery.in('id', pdvIds).limit(DASHBOARD_LIVE_QUERY_LIMIT)
          : await fallbackQuery.limit(DASHBOARD_LIVE_QUERY_LIMIT)

      pdvStateData = fallbackResult.data
      pdvStateError = fallbackResult.error
    }

    if (!pdvStateError) {
      pdvStatesById = new Map(
        ((pdvStateData ?? []) as DashboardPdvStateRow[])
          .filter((item) => pdvIds.includes(item.id))
          .map((item) => {
            const city = getFirst(item.ciudad)
            return [
              item.id,
              city?.estado ?? resolveMexicoStateFromCity(city?.nombre ?? null) ?? null,
            ] as const
          })
      )
    }
  }

  const data = baseRows.map((item) => ({
    ...item,
    pdv_estado: pdvStatesById.get(item.pdv_id) ?? null,
  }))

  return {
    data,
    error: result.error,
  }
}

async function fetchGeocercas(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('geocerca_pdv')
    .select('pdv_id, latitud, longitud, radio_tolerancia_metros')
    .limit(DASHBOARD_GEOFENCE_LIMIT)

  return {
    data: (result.data ?? []) as DashboardGeocercaRow[],
    error: result.error,
  }
}

async function fetchSupervisores(
  supabase: DashboardSupabaseClient,
  supervisorIds: string[]
) {
  if (supervisorIds.length === 0) {
    return {
      data: [] as DashboardSupervisorRow[],
      error: null,
    }
  }

  const query = supabase
    .from('empleado')
    .select('id, nombre')

  const result = typeof query.in === 'function'
    ? await query.in('id', supervisorIds).limit(DASHBOARD_SUPERVISOR_LIMIT)
    : await query.limit(DASHBOARD_SUPERVISOR_LIMIT)

  return {
    data: ((result.data ?? []) as DashboardSupervisorRow[]).filter((item) =>
      supervisorIds.includes(item.id)
    ),
    error: result.error,
  }
}

function normalizePeriodo(periodo: string | undefined) {
  if (!periodo) {
    return ''
  }

  const normalized = periodo.trim()
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeFilterValue(value: string | undefined) {
  return value?.trim() ?? ''
}

function matchesPeriodo(fecha: string, periodo: string) {
  return !periodo || fecha.startsWith(periodo)
}

function applyDashboardFilters(
  rows: DashboardKpiRow[],
  filters: DashboardFilters
) {
  return rows.filter((row) => matchesPeriodo(row.fecha_corte, filters.periodo))
}

function applyLiveFilters(
  rows: DashboardLiveAsistenciaRow[],
  filters: DashboardFilters
) {
  return rows.filter((row) => {
    if (filters.periodo && !matchesPeriodo(row.fecha_operacion, filters.periodo)) {
      return false
    }

    if (filters.estado && (row.pdv_estado ?? 'Sin estado') !== filters.estado) {
      return false
    }

    if (filters.zona && (row.pdv_zona ?? 'Sin zona') !== filters.zona) {
      return false
    }

    if (filters.supervisorId && row.supervisor_empleado_id !== filters.supervisorId) {
      return false
    }

    return true
  })
}

function aggregateTrend(rows: DashboardKpiRow[]) {
  const aggregated = new Map<string, DashboardTrendItem>()

  for (const row of rows) {
    const current = aggregated.get(row.fecha_corte) ?? {
      fecha: row.fecha_corte,
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      checkInsValidos: 0,
      jornadasOperadas: 0,
      asistenciaPorcentaje: 0,
    }

    current.ventasConfirmadas += row.ventas_confirmadas
    current.montoConfirmado += row.monto_confirmado
    current.checkInsValidos += row.checkins_validos
    current.jornadasOperadas += row.jornadas_operadas
    aggregated.set(row.fecha_corte, current)
  }

  return Array.from(aggregated.values())
    .sort((left, right) => left.fecha.localeCompare(right.fecha))
    .map((item) => ({
      ...item,
      montoConfirmado: roundToTwo(item.montoConfirmado),
      asistenciaPorcentaje:
        item.jornadasOperadas === 0
          ? 0
          : roundToTwo((item.checkInsValidos / item.jornadasOperadas) * 100),
    }))
}

function buildLiveAlerts(
  asistencias: DashboardLiveAsistenciaRow[],
  geocercas: DashboardGeocercaRow[],
  options: {
    assignments: DashboardAssignmentRow[]
    solicitudes: DashboardSolicitudRow[]
    quotas: DashboardQuotaRow[]
    activePeriods: DashboardPeriodoRow[]
    pendingImss: DashboardPendingImssRow[]
    toleranceMinutes: number
  }
) {
  const today = new Date().toISOString().slice(0, 10)
  const geocercaByPdv = new Map(
    geocercas.map((item) => [item.pdv_id, item.radio_tolerancia_metros] as const)
  )
  const assignmentAlerts = buildAssignmentEngineAlerts(
    options.assignments.map(
      (item) =>
        ({
          id: item.id,
          cuenta_cliente_id: item.cuenta_cliente_id,
          empleado_id: item.empleado_id,
          supervisor_empleado_id: item.supervisor_empleado_id,
          pdv_id: item.pdv_id,
          tipo: item.tipo,
          factor_tiempo: 1,
          dias_laborales: item.dias_laborales,
          dia_descanso: item.dia_descanso,
          horario_referencia: item.horario_referencia,
          fecha_inicio: item.fecha_inicio,
          fecha_fin: item.fecha_fin,
          estado_publicacion: 'PUBLICADA',
          naturaleza: item.naturaleza,
          prioridad: item.prioridad,
        }) satisfies AssignmentEngineRow
    ),
    today
  ).map<DashboardLiveAlertItem>((item) => {
    const matchingAssignment = options.assignments.find((assignment) => assignment.id === item.assignmentId) ?? null
    const empleadoLabel =
      getFirst(matchingAssignment?.empleado ?? null)?.nombre_completo?.trim() ||
      item.empleadoId ||
      'Sin dermoconsejera'
    const pdv = getFirst(matchingAssignment?.pdv ?? null)

    return {
      id: `assignment:${item.assignmentId ?? item.empleadoId ?? item.pdvId ?? 'global'}`,
      tipo:
        item.code === 'TEMPORAL_POR_VENCER'
          ? 'MOVIMIENTO_POR_VENCER'
          : item.code === 'DC_SIN_PDV_PROXIMO'
            ? 'DC_SIN_PDV'
            : 'PDV_LIBRE',
      cuentaClienteId: matchingAssignment?.cuenta_cliente_id ?? '',
      pdvId: item.pdvId ?? matchingAssignment?.pdv_id ?? null,
      pdv: pdv?.nombre?.trim() || item.pdvId || 'PDV sin catalogo',
      pdvClaveBtl: pdv?.clave_btl ?? null,
      empleado: empleadoLabel,
      fechaOperacion: today,
      radioToleranciaMetros: null,
      motivo: item.message,
      estadoGps: null,
      distanciaCheckInMetros: null,
    }
  })
  const geofenceAlerts = asistencias
    .filter((item) => item.fecha_operacion === today)
    .filter((item) => Boolean(item.check_in_utc) && !item.check_out_utc)
    .filter((item) => item.estatus !== 'RECHAZADA')
    .map((item) => {
      const radioToleranciaMetros = geocercaByPdv.get(item.pdv_id) ?? null

      if (radioToleranciaMetros === null || radioToleranciaMetros === undefined) {
        return null
      }

      if (radioToleranciaMetros >= 50 && radioToleranciaMetros <= 300) {
        return null
      }

      const motivo =
        radioToleranciaMetros < 50
          ? 'Geocerca menor a 50m con jornada activa.'
          : 'Geocerca mayor a 300m con jornada activa.'

      return {
        id: item.id,
        tipo: 'GEOCERCA',
        cuentaClienteId: item.cuenta_cliente_id,
        pdvId: item.pdv_id,
        pdv: item.pdv_nombre,
        pdvClaveBtl: item.pdv_clave_btl,
        empleado: item.empleado_nombre,
        fechaOperacion: item.fecha_operacion,
        radioToleranciaMetros,
        motivo,
        estadoGps: item.estado_gps,
        distanciaCheckInMetros: item.distancia_check_in_metros,
      } satisfies DashboardLiveAlertItem
    })
    .filter(Boolean) as DashboardLiveAlertItem[]

  const discipline = deriveAttendanceDiscipline({
    assignments: options.assignments.map((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      cuentaClienteId: item.cuenta_cliente_id,
      supervisorEmpleadoId: item.supervisor_empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      diasLaborales: item.dias_laborales,
      diaDescanso: item.dia_descanso,
      horarioReferencia: item.horario_referencia,
      naturaleza: item.naturaleza,
      prioridad: item.prioridad,
    })),
    attendances: asistencias.map((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      cuentaClienteId: item.cuenta_cliente_id,
      fechaOperacion: item.fecha_operacion,
      checkInUtc: item.check_in_utc,
      checkOutUtc: item.check_out_utc,
      estatus: item.estatus as 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA',
    })),
    solicitudes: options.solicitudes.map((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      estatus: item.estatus,
      metadata: item.metadata,
    })),
    toleranceMinutes: options.toleranceMinutes,
    payrollDeductionDays: 0,
    salaries: [],
    periodStart: today,
    periodEnd: today,
  })

  const tardyAlerts = discipline.records
    .filter((item) => item.fecha === today && item.estado === 'RETARDO' && item.attendanceId)
    .map((item) => {
      const asistencia = asistencias.find((candidate) => candidate.id === item.attendanceId)
      if (!asistencia) {
        return null
      }

      return {
        id: `retardo:${item.attendanceId}`,
        tipo: 'RETARDO',
        cuentaClienteId: asistencia.cuenta_cliente_id,
        pdvId: asistencia.pdv_id,
        pdv: asistencia.pdv_nombre,
        pdvClaveBtl: asistencia.pdv_clave_btl,
        empleado: asistencia.empleado_nombre,
        fechaOperacion: item.fecha,
        radioToleranciaMetros: null,
        motivo: `Check-in tardio: ${item.minutosRetardo ?? 0} min sobre ${item.horarioEsperado ?? 'sin horario'}.`,
        estadoGps: asistencia.estado_gps,
        distanciaCheckInMetros: asistencia.distancia_check_in_metros,
      } satisfies DashboardLiveAlertItem
    })
    .filter(Boolean) as DashboardLiveAlertItem[]

  const eligibleQuotaPeriodIds = new Set(
    options.activePeriods
      .filter((item) => item.estado === 'BORRADOR' || item.estado === 'ABIERTO')
      .filter((item) => {
        const start = new Date(item.fecha_inicio + 'T00:00:00Z')
        const end = new Date(item.fecha_fin + 'T23:59:59Z')
        const midpoint = start.getTime() + (end.getTime() - start.getTime()) / 2
        return Date.now() >= midpoint
      })
      .map((item) => item.id)
  )

  const quotaAlerts = options.quotas
    .filter((item) => eligibleQuotaPeriodIds.has(item.periodo_id))
    .filter((item) => item.estado !== 'CUMPLIDA' && item.cumplimiento_porcentaje < 70)
    .slice(0, DASHBOARD_LIVE_ALERT_LIMIT)
    .map((item) => ({
      id: `cuota:${item.id}`,
      tipo: 'CUOTA_BAJA',
      cuentaClienteId: item.cuenta_cliente_id,
      pdvId: null,
      pdv: 'Cuota del periodo',
      pdvClaveBtl: null,
      empleado: getFirst(item.empleado)?.nombre_completo ?? 'Sin colaborador',
      fechaOperacion: today,
      radioToleranciaMetros: null,
      motivo: `Ventas por debajo de cuota: ${roundToTwo(item.cumplimiento_porcentaje)}% de cumplimiento.`,
      estadoGps: null,
      distanciaCheckInMetros: null,
    } satisfies DashboardLiveAlertItem))

  const imssAlerts = options.pendingImss.map((item) => {
    const metadata =
      item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? item.metadata
        : {}
    const workflowStage = String(metadata.workflow_stage ?? '').trim()
    const fechaReferencia = item.expediente_validado_en ?? item.created_at
    const motivo =
      workflowStage === 'EN_FLUJO_IMSS'
        ? 'Alta IMSS iniciada por Nomina, pero todavia no cerrada.'
        : item.imss_estado === 'ERROR'
          ? 'Expediente con incidencia de IMSS. Requiere correccion y seguimiento.'
          : item.imss_estado === 'PENDIENTE_DOCUMENTOS'
            ? 'Expediente validado y pendiente de documentos para completar el alta IMSS.'
            : 'Expediente validado y listo para que Nomina procese el alta IMSS.'

    return {
      id: `imss:${item.id}`,
      tipo: 'IMSS_PENDIENTE',
      cuentaClienteId: '',
      pdvId: null,
      pdv: 'Alta IMSS pendiente',
      pdvClaveBtl: null,
      empleado: item.nombre_completo,
      fechaOperacion: fechaReferencia.slice(0, 10),
      radioToleranciaMetros: null,
      motivo,
      estadoGps: item.imss_estado,
      distanciaCheckInMetros: null,
    } satisfies DashboardLiveAlertItem
  })

  return [...assignmentAlerts, ...imssAlerts, ...geofenceAlerts, ...tardyAlerts, ...quotaAlerts].slice(0, DASHBOARD_LIVE_ALERT_LIMIT)
}

function buildFilterOptions(
  asistencias: DashboardLiveAsistenciaRow[],
  supervisores: DashboardSupervisorRow[]
): DashboardFilterOptions {
  const estados = Array.from(
    new Set(asistencias.map((item) => item.pdv_estado ?? 'Sin estado').filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, 'es'))

  const zonas = Array.from(
    new Set(asistencias.map((item) => item.pdv_zona ?? 'Sin zona').filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, 'es'))

  const supervisoresOptions = supervisores
    .map((item) => ({ id: item.id, nombre: item.nombre }))
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))

  return {
    estados,
    zonas,
    supervisores: supervisoresOptions,
  }
}

function buildMapItems(
  asistencias: DashboardLiveAsistenciaRow[],
  geocercas: DashboardGeocercaRow[],
  supervisorsById: Map<string, string>
) {
  const geocercaByPdv = new Map(geocercas.map((item) => [item.pdv_id, item] as const))

  return asistencias
    .filter((item) => Boolean(item.check_in_utc) && !item.check_out_utc)
    .map((item) => {
      const geocerca = geocercaByPdv.get(item.pdv_id)
      const latitud = item.latitud_check_in ?? geocerca?.latitud ?? null
      const longitud = item.longitud_check_in ?? geocerca?.longitud ?? null

      if (latitud === null || longitud === null) {
        return null
      }

      return {
        id: item.id,
        pdvId: item.pdv_id,
        pdv: item.pdv_nombre,
        pdvClaveBtl: item.pdv_clave_btl,
        empleado: item.empleado_nombre,
        supervisorId: item.supervisor_empleado_id,
        supervisorNombre: item.supervisor_empleado_id
          ? supervisorsById.get(item.supervisor_empleado_id) ?? item.supervisor_empleado_id
          : 'Sin supervisor',
        zona: item.pdv_zona ?? 'Sin zona',
        cuentaClienteId: item.cuenta_cliente_id,
        fechaOperacion: item.fecha_operacion,
        latitud,
        longitud,
        radioToleranciaMetros: geocerca?.radio_tolerancia_metros ?? null,
        estadoGps: item.estado_gps,
        distanciaCheckInMetros: item.distancia_check_in_metros,
      } satisfies DashboardMapItem
    })
    .filter((item): item is DashboardMapItem => Boolean(item))
}

function getDashboardSolicitudNextActor(item: DashboardSolicitudRow): string | null {
  const metadata =
    item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata
      : {}
  const approvalPath = Array.isArray(metadata.approval_path)
    ? metadata.approval_path.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : []

  if (item.estatus === 'BORRADOR' || item.estatus === 'ENVIADA') {
    return approvalPath[0] ?? 'SUPERVISOR'
  }

  if (item.estatus === 'VALIDADA_SUP') {
    return approvalPath[1] ?? 'COORDINADOR'
  }

  return null
}

function buildSupervisorAuthorizationItems(
  actor: ActorActual,
  solicitudes: DashboardSolicitudRow[]
): DashboardSupervisorAuthorizationItem[] {
  if (actor.puesto !== 'SUPERVISOR') {
    return []
  }

  const now = Date.now()

  return solicitudes
    .filter((item) => item.supervisor_empleado_id === actor.empleadoId)
    .map((item) => {
      const siguienteActor = getDashboardSolicitudNextActor(item)

      if (siguienteActor !== 'SUPERVISOR') {
        return null
      }

      const metadata =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {}
      const resolverAntesDe =
        typeof metadata.resolver_antes_de === 'string' ? metadata.resolver_antes_de : null
      const enviadaEn = typeof metadata.enviada_en === 'string' ? metadata.enviada_en : null
      const slaHours =
        typeof metadata.sla_hours === 'number'
          ? metadata.sla_hours
          : typeof metadata.sla_hours === 'string'
            ? Number(metadata.sla_hours)
            : null
      const tiempoRestanteMinutos = resolverAntesDe
        ? Math.round((new Date(resolverAntesDe).getTime() - now) / 60000)
        : null
      const urgencyState =
        tiempoRestanteMinutos === null
          ? null
          : tiempoRestanteMinutos < 0
            ? 'VENCIDA'
            : tiempoRestanteMinutos <= 12 * 60
              ? 'URGENTE'
              : 'NORMAL'

      return {
        id: item.id,
        cuentaClienteId: item.cuenta_cliente_id,
        cuentaCliente: getFirst(item.cuenta_cliente)?.nombre ?? null,
        empleadoId: item.empleado_id,
        empleado: getFirst(item.empleado)?.nombre_completo ?? 'Sin colaborador',
        tipo: item.tipo,
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
        motivo: item.motivo,
        comentarios: item.comentarios,
        estatus: item.estatus,
        siguienteActor,
        justificanteUrl: item.justificante_url ?? null,
        enviadaEn,
        resolverAntesDe,
        slaHours: Number.isFinite(slaHours) ? slaHours : null,
        tiempoRestanteMinutos,
        urgencyState,
      } satisfies DashboardSupervisorAuthorizationItem
    })
      .filter((item): item is DashboardSupervisorAuthorizationItem => Boolean(item))
}

function mapSupervisorRequestKind(
  tipo: string
): DashboardSupervisorRequestKind | null {
  const normalized = String(tipo).trim().toUpperCase()

  if (normalized === 'VACACIONES') {
    return 'VACACIONES'
  }

  if (normalized === 'INCAPACIDAD') {
    return 'INCAPACIDAD'
  }

  if (normalized === 'PERMISO') {
    return 'CUMPLEANOS'
  }

  if (normalized === 'JUSTIFICACION_FALTA') {
    return 'JUSTIFICACION_FALTA'
  }

  return null
}

function buildSupervisorRequestInbox(
  actor: ActorActual,
  solicitudes: DashboardSolicitudRow[]
): DashboardSupervisorRequestInbox {
  if (actor.puesto !== 'SUPERVISOR') {
    return {
      items: [],
      summaries: [
        { key: 'TODAS', label: 'Todas', count: 0, actionableCount: 0 },
        { key: 'VACACIONES', label: 'Vacaciones', count: 0, actionableCount: 0 },
        { key: 'INCAPACIDAD', label: 'Incapacidades', count: 0, actionableCount: 0 },
        { key: 'CUMPLEANOS', label: 'Dia cumple', count: 0, actionableCount: 0 },
        { key: 'JUSTIFICACION_FALTA', label: 'Justificacion', count: 0, actionableCount: 0 },
      ],
    }
  }

  const now = Date.now()
  const items = solicitudes
    .filter((item) => item.supervisor_empleado_id === actor.empleadoId)
    .map((item) => {
      const kind = mapSupervisorRequestKind(item.tipo)
      if (!kind) {
        return null
      }

      const siguienteActor = getDashboardSolicitudNextActor(item)
      const metadata =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {}
      const resolverAntesDe =
        typeof metadata.resolver_antes_de === 'string' ? metadata.resolver_antes_de : null
      const enviadaEn = typeof metadata.enviada_en === 'string' ? metadata.enviada_en : null
      const slaHours =
        typeof metadata.sla_hours === 'number'
          ? metadata.sla_hours
          : typeof metadata.sla_hours === 'string'
            ? Number(metadata.sla_hours)
            : null
      const tiempoRestanteMinutos = resolverAntesDe
        ? Math.round((new Date(resolverAntesDe).getTime() - now) / 60000)
        : null
      const urgencyState =
        tiempoRestanteMinutos === null
          ? null
          : tiempoRestanteMinutos < 0
            ? 'VENCIDA'
            : tiempoRestanteMinutos <= 12 * 60
              ? 'URGENTE'
              : 'NORMAL'

      return {
        id: item.id,
        cuentaClienteId: item.cuenta_cliente_id,
        cuentaCliente: getFirst(item.cuenta_cliente)?.nombre?.trim() || null,
        empleadoId: item.empleado_id,
        empleado: getFirst(item.empleado)?.nombre_completo?.trim() || 'Sin dermoconsejero',
        kind,
        tipo: item.tipo,
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
        motivo: item.motivo,
        comentarios: item.comentarios,
        estatus: item.estatus,
        siguienteActor,
        actionable: siguienteActor === 'SUPERVISOR',
        justificanteUrl: item.justificante_url ?? null,
        enviadaEn,
        resolverAntesDe,
        slaHours: Number.isFinite(slaHours) ? slaHours : null,
        tiempoRestanteMinutos,
        urgencyState,
      } satisfies DashboardSupervisorRequestItem
    })
    .filter((item): item is DashboardSupervisorRequestItem => Boolean(item))

  const buildSummary = (
    key: DashboardSupervisorRequestSummaryItem['key'],
    label: string
  ): DashboardSupervisorRequestSummaryItem => {
    const filtered = key === 'TODAS' ? items : items.filter((item) => item.kind === key)
    return {
      key,
      label,
      count: filtered.length,
      actionableCount: filtered.filter((item) => item.actionable).length,
    }
  }

  return {
    items,
    summaries: [
      buildSummary('TODAS', 'Todas'),
      buildSummary('VACACIONES', 'Vacaciones'),
      buildSummary('INCAPACIDAD', 'Incapacidades'),
      buildSummary('CUMPLEANOS', 'Dia cumple'),
      buildSummary('JUSTIFICACION_FALTA', 'Justificacion'),
    ],
  }
}

export interface DashboardPanelOptions {
  period?: string
  estado?: string
  zona?: string
  supervisorId?: string
}

async function resolveDashboardContext(
  actor: ActorActual,
  options: DashboardPanelOptions = {},
  customSupabase?: DashboardSupabaseClient
) {
  const scopeLabel = getScopeLabel(actor)
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId
  const filters: DashboardFilters = {
    periodo: normalizePeriodo(options.period),
    estado: normalizeFilterValue(options.estado),
    zona: normalizeFilterValue(options.zona),
    supervisorId: normalizeFilterValue(options.supervisorId),
  }

  if (!actor.cuentaClienteId && !allowGlobalScope) {
    return {
      scopeLabel,
      filters,
      empty: buildEmptyDashboard(
        scopeLabel,
        'El usuario no tiene `cuenta_cliente_id` operativa para consolidar indicadores.'
      ),
    }
  }

  let supabase: DashboardSupabaseClient

  try {
    supabase = customSupabase ?? (createServiceClient() as unknown as DashboardSupabaseClient)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear el cliente admin.'
    return {
      scopeLabel,
      filters,
      empty: buildEmptyDashboard(scopeLabel, message),
    }
  }

  const dermoconsejoData =
    actor.puesto === 'DERMOCONSEJERO' ? await buildDermoconsejoData(supabase, actor) : null
  const supervisorSelfRequestStatusResult =
    actor.puesto === 'SUPERVISOR'
      ? await fetchDermoconsejoRequestStatus(supabase, actor)
      : {
          data: [] as DashboardDermoconsejoSolicitudStatusItem[],
          error: null,
        }
  const supervisorActiveFormationResult =
    actor.puesto === 'SUPERVISOR'
      ? await fetchDermoconsejoActiveFormation(supabase, {
          empleadoId: actor.empleadoId,
          puesto: actor.puesto,
          todayIso: getTodayIso(),
          pdvIds: [],
        })
      : { data: null as DashboardDermoFormationRow | null, error: null }

  const [
    dashboardResult,
    liveAsistenciasResult,
    geocercasResult,
    assignmentsResult,
    supervisorDailyAssignmentsResult,
    solicitudesResult,
    configResult,
    periodsResult,
    quotasResult,
    pendingImssResult,
  ] = await Promise.all([
    fetchFreshDashboardRows(supabase, allowGlobalScope ? null : actor.cuentaClienteId, !customSupabase),
    fetchLiveAssistances(supabase, actor, allowGlobalScope),
    fetchGeocercas(supabase),
    fetchDashboardAssignments(supabase, actor, allowGlobalScope),
    fetchSupervisorDailyAssignments(supabase, actor, allowGlobalScope),
    fetchDashboardSolicitudes(supabase),
    fetchDashboardConfig(supabase),
    fetchDashboardPeriods(supabase),
    fetchDashboardQuotas(supabase, actor, allowGlobalScope),
    fetchDashboardPendingImss(supabase, actor),
  ])

  if (dashboardResult.error) {
    return {
      scopeLabel,
      filters,
      empty: buildEmptyDashboard(
        scopeLabel,
        dashboardResult.error.message ?? 'No fue posible consultar `dashboard_kpis`.'
      ),
    }
  }

  const filteredDashboardRows = applyDashboardFilters(dashboardResult.data, filters)
  const filteredLiveRows = liveAsistenciasResult.error
    ? []
    : applyLiveFilters(liveAsistenciasResult.data, filters)
  const supervisorIds = Array.from(
    new Set(filteredLiveRows.map((item) => item.supervisor_empleado_id).filter((item): item is string => Boolean(item)))
  )
  const supervisorsResult = await fetchSupervisores(supabase, supervisorIds)
  const supervisorsById = new Map(supervisorsResult.data.map((item) => [item.id, item.nombre] as const))
  const opcionesFiltro = buildFilterOptions(filteredLiveRows, supervisorsResult.data)
  const toleranceMinutes = normalizeConfigNumber(
    configResult.data,
    'asistencias.tolerancia_checkin_minutos',
    15
  )
  const activePeriods = periodsResult.data.filter(
    (item) => item.estado === 'BORRADOR' || item.estado === 'ABIERTO'
  )
  const alertasLive =
    liveAsistenciasResult.error ||
    geocercasResult.error ||
    assignmentsResult.error ||
    solicitudesResult.error ||
    configResult.error ||
    periodsResult.error ||
    quotasResult.error ||
    pendingImssResult.error
      ? []
      : buildLiveAlerts(filteredLiveRows, geocercasResult.data, {
          assignments: assignmentsResult.data,
          solicitudes: solicitudesResult.data,
          quotas: quotasResult.data,
          activePeriods,
          pendingImss: pendingImssResult.data,
          toleranceMinutes,
        })
  const mapaPromotores =
    liveAsistenciasResult.error || geocercasResult.error
      ? []
      : buildMapItems(filteredLiveRows, geocercasResult.data, supervisorsById)
  const supervisorAuthorizations = solicitudesResult.error
    ? []
    : buildSupervisorAuthorizationItems(actor, solicitudesResult.data)
  const supervisorRequestInbox = solicitudesResult.error
    ? buildSupervisorRequestInbox({ ...actor, puesto: actor.puesto }, [])
    : buildSupervisorRequestInbox(actor, solicitudesResult.data)
  const supervisorNotificationsResult =
    actor.puesto === 'SUPERVISOR'
      ? await fetchDermoconsejoNotifications(supabase, actor)
      : {
          data: [] as DashboardDermoconsejoNotificationItem[],
          unreadCount: 0,
          error: null,
        }
  const supervisorDailyBoard = supervisorDailyAssignmentsResult.error
    ? null
    : buildSupervisorDailyBoard(
        actor,
        supervisorDailyAssignmentsResult.data,
        liveAsistenciasResult.error ? [] : liveAsistenciasResult.data,
        getTodayIso(),
        toleranceMinutes
      )
  const supervisorLoveQuota =
    actor.puesto === 'SUPERVISOR'
      ? await buildSupervisorLoveQuotaSummary(supabase, actor, getTodayIso())
      : null

  if (filteredDashboardRows.length === 0) {
    return {
      scopeLabel,
      filters,
      empty: {
        ...buildEmptyDashboard(scopeLabel),
        stats: {
          ...EMPTY_STATS,
          imssPendientes: pendingImssResult.data.length,
        },
        filtros: filters,
        opcionesFiltro,
          widgets: resolveDashboardWidgets(actor.puesto),
          dermoconsejo: dermoconsejoData,
          supervisorDailyBoard,
          supervisorLoveQuota,
          supervisorNotifications: {
            unreadCount: supervisorNotificationsResult.unreadCount,
              items: supervisorNotificationsResult.data,
            },
            supervisorAuthorizations,
            supervisorRequestInbox,
            supervisorSelfRequestStatus: supervisorSelfRequestStatusResult.error
              ? []
              : supervisorSelfRequestStatusResult.data,
          },
        insights: {
          tendenciaSemana: [],
        tendenciaMes: [],
        alertasLive,
        mapaPromotores,
        filtros: filters,
        widgets: resolveDashboardWidgets(actor.puesto),
      },
    }
  }

  const latestDate = filteredDashboardRows.reduce((current, row) => {
    if (!current || row.fecha_corte > current) {
      return row.fecha_corte
    }

    return current
  }, '')
  const latestRows = filteredDashboardRows.filter((row) => row.fecha_corte === latestDate)
  const latestTotals = latestRows.reduce(
    (acc, row) => {
      acc.promotoresActivos += row.promotores_activos
      acc.checkInsValidos += row.checkins_validos
      acc.jornadasOperadas += row.jornadas_operadas
      acc.ventasConfirmadas += row.ventas_confirmadas
      acc.montoConfirmado += row.monto_confirmado
      acc.afiliacionesLove += row.afiliaciones_love
      acc.alertasOperativas += row.alertas_operativas
      acc.cuotasCumplidas += row.cuotas_cumplidas_periodo
      acc.netoNomina += row.neto_nomina_periodo
      return acc
    },
    {
      promotoresActivos: 0,
      checkInsValidos: 0,
      jornadasOperadas: 0,
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      afiliacionesLove: 0,
      alertasOperativas: 0,
      cuotasCumplidas: 0,
      netoNomina: 0,
    }
  )

  const tendenciaMes = aggregateTrend(filteredDashboardRows)
  const tendenciaSemana = tendenciaMes.slice(-7)

  return {
    scopeLabel,
    filters,
    empty: null,
    summary: {
      stats: {
        fechaCorte: latestDate,
        promotoresActivosHoy: latestTotals.promotoresActivos,
        checkInsValidosHoy: latestTotals.checkInsValidos,
        ventasConfirmadasHoy: latestTotals.ventasConfirmadas,
        montoConfirmadoHoy: roundToTwo(latestTotals.montoConfirmado),
        afiliacionesLoveHoy: latestTotals.afiliacionesLove,
        asistenciaPorcentajeHoy:
          latestTotals.jornadasOperadas === 0
            ? 0
            : roundToTwo((latestTotals.checkInsValidos / latestTotals.jornadasOperadas) * 100),
        alertasOperativas: latestTotals.alertasOperativas,
        cuotasCumplidasPeriodo: latestTotals.cuotasCumplidas,
        netoNominaPeriodo: roundToTwo(latestTotals.netoNomina),
        imssPendientes: pendingImssResult.data.length,
      },
      clientes: latestRows
        .map((row) => ({
          cuentaClienteId: row.cuenta_cliente_id,
          cuentaCliente: row.cuenta_cliente,
          identificador: row.cuenta_cliente_identificador,
          promotoresActivos: row.promotores_activos,
          checkInsValidos: row.checkins_validos,
          jornadasPendientes: row.jornadas_pendientes,
          alertasOperativas: row.alertas_operativas,
          ventasConfirmadas: row.ventas_confirmadas,
          montoConfirmado: roundToTwo(row.monto_confirmado),
          afiliacionesLove: row.afiliaciones_love,
          asistenciaPorcentaje: row.asistencia_porcentaje,
          cuotasCumplidasPeriodo: row.cuotas_cumplidas_periodo,
          netoNominaPeriodo: roundToTwo(row.neto_nomina_periodo),
        }))
        .sort((left, right) => right.montoConfirmado - left.montoConfirmado),
      infraestructuraLista: true,
      refreshedAt: getLatestRefreshedAt(filteredDashboardRows),
      scopeLabel:
        latestRows.length === 1
          ? latestRows[0].cuenta_cliente
          : scopeLabel,
      filtros: filters,
      opcionesFiltro,
        widgets: resolveDashboardWidgets(actor.puesto),
        dermoconsejo: dermoconsejoData,
        supervisorDailyBoard,
        supervisorLoveQuota,
          supervisorNotifications: {
            unreadCount: supervisorNotificationsResult.unreadCount,
            items: supervisorNotificationsResult.data,
          },
          supervisorAuthorizations,
          supervisorRequestInbox,
          supervisorSelfRequestStatus: supervisorSelfRequestStatusResult.error
            ? []
            : supervisorSelfRequestStatusResult.data,
          supervisorActiveFormation: supervisorActiveFormationResult.error
            ? null
            : supervisorActiveFormationResult.data
              ? (() => {
                  const targeting = normalizeFormacionTargetingMetadata(supervisorActiveFormationResult.data.metadata)
                  return {
                  id: supervisorActiveFormationResult.data.id,
                  nombre: supervisorActiveFormationResult.data.nombre,
                  fechaInicio: supervisorActiveFormationResult.data.fecha_inicio,
                  fechaFin: supervisorActiveFormationResult.data.fecha_fin,
                  sede: supervisorActiveFormationResult.data.sede,
                  tipo: supervisorActiveFormationResult.data.tipo,
                  tipoEvento: targeting.eventType,
                  modalidad: targeting.modality,
                  horarioInicio: targeting.scheduleStart,
                  horarioFin: targeting.scheduleEnd,
                  supervisorNombre: targeting.supervisorName,
                  manualUrl: targeting.manualDocument?.url ?? null,
                  manualNombre: targeting.manualDocument?.fileName ?? null,
                  attendanceId: (supervisorActiveFormationResult.data as DashboardDermoFormationRow & { attendance_id?: string | null }).attendance_id ?? null,
                  attendanceStatus:
                    ((supervisorActiveFormationResult.data as DashboardDermoFormationRow & { attendance_status?: DashboardDermoconsejoFormation['attendanceStatus'] }).attendance_status ??
                      'PENDIENTE'),
                  checkInUtc:
                    (supervisorActiveFormationResult.data as DashboardDermoFormationRow & { attendance_check_in_utc?: string | null }).attendance_check_in_utc ??
                    null,
                  checkOutUtc:
                    (supervisorActiveFormationResult.data as DashboardDermoFormationRow & { attendance_check_out_utc?: string | null }).attendance_check_out_utc ??
                    null,
                }
                })()
              : null,
        },
    insights: {
      tendenciaSemana,
      tendenciaMes,
      alertasLive,
      mapaPromotores,
      filtros: filters,
      widgets: resolveDashboardWidgets(actor.puesto),
    },
  }
}

async function fetchDashboardAssignments(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  allowGlobalScope: boolean
) {
  let query = supabase
    .from('asignacion')
    .select(
      'id, empleado_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, tipo, dias_laborales, dia_descanso, horario_referencia, naturaleza, prioridad, empleado:empleado_id(nombre_completo), pdv:pdv_id(nombre, clave_btl, zona)'
    )
    .order('fecha_inicio', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const result = await query.limit(400)
  return {
    data: ((result.data ?? []) as DashboardAssignmentRow[]).filter((item) =>
      allowGlobalScope || item.cuenta_cliente_id === actor.cuentaClienteId
    ),
    error: result.error,
  }
}

async function fetchSupervisorDailyAssignments(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  allowGlobalScope: boolean
) {
  let query = supabase
    .from('asignacion')
    .select(
      'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, tipo, horario_referencia, naturaleza, prioridad, estado_publicacion, empleado:empleado_id(nombre_completo), pdv:pdv_id(nombre, clave_btl, zona)'
    )
    .order('fecha_inicio', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  if (actor.puesto === 'SUPERVISOR') {
    query = query.eq('supervisor_empleado_id', actor.empleadoId)
  }

  const result = await query.limit(240)
  return {
    data: ((result.data ?? []) as DashboardSupervisorDailyAssignmentRow[]).filter((item) =>
      allowGlobalScope || item.cuenta_cliente_id === actor.cuentaClienteId
    ),
    error: result.error,
  }
}

async function fetchDashboardSolicitudes(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('solicitud')
    .select(
      'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, fecha_inicio, fecha_fin, tipo, estatus, motivo, comentarios, justificante_url, metadata, empleado:empleado_id(nombre_completo), cuenta_cliente:cuenta_cliente_id(nombre)'
    )
    .order('fecha_inicio', { ascending: false })
    .limit(240)

  return {
    data: (result.data ?? []) as DashboardSolicitudRow[],
    error: result.error,
  }
}

async function fetchDashboardConfig(supabase: DashboardSupabaseClient) {
  let query = supabase
    .from('configuracion')
    .select('clave, valor')

  if (typeof query.in === 'function') {
    query = query.in('clave', ['asistencias.tolerancia_checkin_minutos'])
  }

  const result = await query.limit(16)

  return {
    data: (result.data ?? []) as DashboardConfigRow[],
    error: result.error,
  }
}

async function fetchDashboardPeriods(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('nomina_periodo')
.select('id, estado, fecha_inicio, fecha_fin')
    .limit(32)

  return {
    data: (result.data ?? []) as DashboardPeriodoRow[],
    error: result.error,
  }
}

async function fetchDashboardQuotas(
  supabase: DashboardSupabaseClient,
  actor: ActorActual,
  allowGlobalScope: boolean
) {
  let query = supabase
    .from('cuota_empleado_periodo')
    .select(
      'id, periodo_id, cuenta_cliente_id, empleado_id, cumplimiento_porcentaje, estado, empleado:empleado_id(nombre_completo, supervisor_empleado_id)'
    )
    .order('cumplimiento_porcentaje', { ascending: true })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const result = await query.limit(320)

  return {
    data: (result.data ?? []) as DashboardQuotaRow[],
    error: result.error,
  }
}

async function fetchDashboardPendingImss(
  supabase: DashboardSupabaseClient,
  actor: ActorActual
) {
  if (actor.puesto !== 'NOMINA' && actor.puesto !== 'ADMINISTRADOR') {
    return {
      data: [] as DashboardPendingImssRow[],
      error: null,
    }
  }

  const result = await supabase
    .from('empleado')
    .select(
      'id, nombre_completo, expediente_estado, expediente_validado_en, imss_estado, imss_fecha_solicitud, metadata, created_at'
    )
    .order('expediente_validado_en', { ascending: true })
    .limit(160)

  return {
    data: ((result.data ?? []) as DashboardPendingImssRow[])
      .filter((item) => item.expediente_estado === 'VALIDADO')
      .filter((item) => item.imss_estado !== 'ALTA_IMSS')
      .sort((left, right) => {
        const leftDate = left.expediente_validado_en ?? left.created_at
        const rightDate = right.expediente_validado_en ?? right.created_at
        return leftDate.localeCompare(rightDate)
      }),
    error: result.error,
  }
}

export async function obtenerPanelDashboard(
  actor: ActorActual,
  options: DashboardPanelOptions = {},
  customSupabase?: DashboardSupabaseClient
): Promise<DashboardPanelData> {
  const context = await resolveDashboardContext(actor, options, customSupabase)

  if (context.empty) {
    return context.empty
  }

  return context.summary
}

export async function obtenerInsightsDashboard(
  actor: ActorActual,
  options: DashboardPanelOptions = {},
  customSupabase?: DashboardSupabaseClient
): Promise<DashboardInsightsData> {
  const context = await resolveDashboardContext(actor, options, customSupabase)

  return (
    context.insights ?? {
      tendenciaSemana: [],
      tendenciaMes: [],
      alertasLive: [],
      mapaPromotores: [],
      filtros: {
        ...EMPTY_DASHBOARD_FILTERS,
        periodo: normalizePeriodo(options.period),
        estado: normalizeFilterValue(options.estado),
        zona: normalizeFilterValue(options.zona),
        supervisorId: normalizeFilterValue(options.supervisorId),
      },
      widgets: resolveDashboardWidgets(actor.puesto),
    }
  )
}
