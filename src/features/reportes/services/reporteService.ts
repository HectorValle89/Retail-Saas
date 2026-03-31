import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import {
  deriveAttendanceDiscipline,
  type AttendanceDisciplineAssignment,
  type AttendanceDisciplineFormation,
} from '@/features/asistencias/lib/attendanceDiscipline'
import { formacionTargetsEmployee } from '@/features/formaciones/lib/formacionTargeting'
import {
  obtenerPanelCampanas,
  type CampanaItem,
  type CampanasPanelData,
} from '@/features/campanas/services/campanaService'
import {
  computeLoveQuotaProgress,
  fetchLoveQuotaTargetRows,
} from '@/features/love-isdin/lib/loveQuota'
import type {
  Asignacion,
  Asistencia,
  ConfiguracionSistema,
  CuentaCliente,
  CuotaEmpleadoPeriodo,
  Empleado,
  FormacionEvento,
  Gasto,
  LoveIsdin,
  NominaLedger,
  Pdv,
  PeriodoNomina,
  Solicitud,
  Venta,
} from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre' | 'identificador'>
type EmpleadoRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>
type PdvRelacion = Pick<Pdv, 'zona' | 'nombre' | 'clave_btl'>
type PeriodoRelacion = Pick<PeriodoNomina, 'clave'>

type AsistenciaQueryRow = Pick<Asistencia, 'id' | 'cuenta_cliente_id' | 'empleado_id' | 'pdv_id' | 'fecha_operacion' | 'estatus'> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type VentaQueryRow = Pick<
  Venta,
  | 'id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'pdv_id'
  | 'producto_nombre'
  | 'total_monto'
  | 'total_unidades'
  | 'confirmada'
  | 'fecha_utc'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type CuotaQueryRow = Pick<
  CuotaEmpleadoPeriodo,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'cumplimiento_porcentaje' | 'bono_estimado' | 'estado'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
}

type LedgerQueryRow = Pick<
  NominaLedger,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'tipo_movimiento' | 'concepto' | 'monto' | 'referencia_tabla'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  periodo: MaybeMany<PeriodoRelacion>
}

type GastoQueryRow = Pick<
  Gasto,
  'id' | 'cuenta_cliente_id' | 'pdv_id' | 'tipo' | 'monto' | 'fecha_gasto' | 'estatus'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type LoveQueryRow = Pick<
  LoveIsdin,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'pdv_id' | 'fecha_utc' | 'estatus'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type AsignacionDisciplinaRow = Pick<
  Asignacion,
  | 'id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'tipo'
  | 'dias_laborales'
  | 'dia_descanso'
  | 'horario_referencia'
  | 'estado_publicacion'
  | 'naturaleza'
  | 'prioridad'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type SolicitudDisciplinaRow = Pick<
  Solicitud,
  'id' | 'empleado_id' | 'fecha_inicio' | 'fecha_fin' | 'tipo' | 'estatus' | 'metadata'
>

type FormacionDisciplinaRow = Pick<
  FormacionEvento,
  'id' | 'fecha_inicio' | 'fecha_fin' | 'nombre' | 'tipo' | 'estado' | 'participantes' | 'metadata'
>

type ConfiguracionReporteRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>

interface UsuarioAuditRelacion {
  username: string | null
}

interface AuditLogQueryRow {
  id: number
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'EVENTO'
  payload: Record<string, unknown>
  created_at: string
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  usuario: MaybeMany<UsuarioAuditRelacion>
}

export interface ReportesResumen {
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
  gastosReembolsados: number
}

export interface ReportesFiltros {
  periodo: string
  page: number
  pageSize: number
}

export interface ReportesPaginacion {
  page: number
  pageSize: number
  totalPages: number
  totalClientes: number
  totalAsistencias: number
  totalVentas: number
  totalRankingVentas: number
  totalRankingCuotas: number
  totalGastos: number
  totalLove: number
  totalNomina: number
  totalCampanas: number
  totalBitacora: number
}

export interface ClienteReporteItem {
  cuentaCliente: string
  identificador: string | null
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
}

export interface AsistenciaReporteItem {
  periodo: string
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  pdv: string
  jornadasValidas: number
  jornadasPendientes: number
  jornadasCerradas: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
  totalJornadas: number
}

export interface VentaReporteItem {
  periodo: string
  dc: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  pdv: string
  producto: string
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

export interface RankingVentasItem {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

export interface RankingCuotaItem {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  cuotaEstado: string
  cumplimiento: number
  bonoEstimado: number
  jornadasValidas: number
  jornadasPendientes: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
}

export interface BitacoraItem {
  id: number
  fecha: string
  tabla: string
  accion: string
  registroId: string | null
  cuentaCliente: string | null
  usuario: string | null
  resumen: string
}

export interface GastoReporteItem {
  periodo: string
  zona: string
  tipo: string
  registros: number
  montoSolicitado: number
  montoAprobado: number
  montoReembolsado: number
}

export interface LoveReporteItem {
  semanaInicio: string
  periodo: string
  dc: string
  supervisor: string
  zona: string
  cadena: string
  pdv: string
  afiliaciones: number
  objetivoSemanal: number
  restanteObjetivo: number
  cumplimientoPct: number
  validas: number
  pendientes: number
  duplicadas: number
}

export interface NominaReporteItem {
  periodo: string
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  percepciones: number
  deducciones: number
  neto: number
  jornadasValidas: number
  jornadasPendientes: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
  movimientos: number
}

export interface CampanaReporteItem {
  periodo: string
  campana: string
  pdv: string
  dc: string | null
  estatus: string
  avancePorcentaje: number
  tareasPendientes: number
  evidenciasPendientes: number
}

export interface ReportesPanelData {
  filtros: ReportesFiltros
  paginacion: ReportesPaginacion
  resumen: ReportesResumen
  clientes: ClienteReporteItem[]
  asistencias: AsistenciaReporteItem[]
  ventas: VentaReporteItem[]
  rankingVentas: RankingVentasItem[]
  rankingCuotas: RankingCuotaItem[]
  gastos: GastoReporteItem[]
  love: LoveReporteItem[]
  nomina: NominaReporteItem[]
  campanas: CampanaReporteItem[]
  bitacora: BitacoraItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface ClienteAcumulado {
  cuentaCliente: string
  identificador: string | null
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
}

interface AsistenciaAcumulado {
  periodo: string
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  pdv: string
  jornadasValidas: number
  jornadasPendientes: number
  jornadasCerradas: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
  totalJornadas: number
}

interface VentaAcumulado {
  periodo: string
  dc: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  pdv: string
  producto: string
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

interface RankingVentasAcumulado {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

interface CuotaAcumulado {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  cuotaEstado: string
  cumplimiento: number
  bonoEstimado: number
  jornadasValidas: number
  jornadasPendientes: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
}

interface GastoAcumulado {
  periodo: string
  zona: string
  tipo: string
  registros: number
  montoSolicitado: number
  montoAprobado: number
  montoReembolsado: number
}

interface LoveAcumulado {
  semanaInicio: string
  periodo: string
  dc: string
  supervisor: string
  zona: string
  cadena: string
  pdv: string
  afiliaciones: number
  objetivoSemanal: number
  restanteObjetivo: number
  cumplimientoPct: number
  validas: number
  pendientes: number
  duplicadas: number
}

interface NominaAcumulado {
  periodo: string
  empleadoId: string | null
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaClienteId: string | null
  cuentaCliente: string | null
  percepciones: number
  deducciones: number
  neto: number
  jornadasValidas: number
  jornadasPendientes: number
  retardos: number
  ausenciasJustificadas: number
  faltas: number
  movimientos: number
}

interface ObtenerPanelReportesOptions {
  actor?: ActorActual
  period?: string
  page?: number
  pageSize?: number
  campaignData?: Pick<CampanasPanelData, 'campanas'> | null
}

function getDefaultPeriod() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 25
  }

  return Math.min(100, Math.max(10, Math.floor(value)))
}

function buildMonthRange(period: string) {
  const [yearRaw, monthRaw] = period.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!year || !month || month < 1 || month > 12) {
    const fallback = getDefaultPeriod()
    return buildMonthRange(fallback)
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0))

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    startDate: start.toISOString().slice(0, 10),
    endDateInclusive: new Date(Date.UTC(year, month, 0, 0, 0, 0)).toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
    startDateTime: start.toISOString(),
    endDateTimeExclusive: end.toISOString(),
  }
}

function overlapsSelectedMonth(campaign: CampanaItem, range: ReturnType<typeof buildMonthRange>) {
  return campaign.fechaInicio < range.endDateExclusive && campaign.fechaFin >= range.startDate
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function obtenerResumenPayload(payload: Record<string, unknown>) {
  const resumen = payload.resumen
  if (typeof resumen === 'string' && resumen.trim()) {
    return resumen
  }

  const evento = payload.evento
  if (typeof evento === 'string' && evento.trim()) {
    return evento
  }

  const serialized = JSON.stringify(payload)
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized
}

function formatPeriodoLocal(fecha: string) {
  const safeDate = new Date(`${fecha}T00:00:00`)

  if (Number.isNaN(safeDate.getTime())) {
    return fecha.slice(0, 7)
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
  }).format(safeDate)
}

function formatPeriodoUtc(fecha: string) {
  const safeDate = new Date(fecha)

  if (Number.isNaN(safeDate.getTime())) {
    return fecha.slice(0, 7)
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(safeDate)
}

function getMexicoDateIsoFromUtc(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10))
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

function formatWeekPeriodLabel(weekStartIso: string) {
  const start = new Date(`${weekStartIso}T12:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  return `Semana ${new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(start)} - ${new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(end)}`
}
function buildEmptyResponse(message: string, filtros: ReportesFiltros): ReportesPanelData {
  return {
    filtros,
    paginacion: {
      page: filtros.page,
      pageSize: filtros.pageSize,
      totalPages: 1,
      totalClientes: 0,
      totalAsistencias: 0,
      totalVentas: 0,
      totalRankingVentas: 0,
      totalRankingCuotas: 0,
      totalGastos: 0,
      totalLove: 0,
      totalNomina: 0,
      totalCampanas: 0,
      totalBitacora: 0,
    },
    resumen: {
      jornadasValidas: 0,
      jornadasPendientes: 0,
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      cuotasCumplidas: 0,
      netoNominaEstimado: 0,
      gastosReembolsados: 0,
    },
    clientes: [],
    asistencias: [],
    ventas: [],
    rankingVentas: [],
    rankingCuotas: [],
    gastos: [],
    love: [],
    nomina: [],
    campanas: [],
    bitacora: [],
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

export async function obtenerPanelReportes(
  supabase: SupabaseClient,
  options: ObtenerPanelReportesOptions = {}
): Promise<ReportesPanelData> {
  const range = buildMonthRange(options.period ?? getDefaultPeriod())
  const filtros: ReportesFiltros = {
    periodo: range.period,
    page: normalizePage(options.page),
    pageSize: normalizePageSize(options.pageSize),
  }

  const asistenciasQuery = supabase
    .from('asistencia')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_operacion,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_operacion', range.startDate)
    .lt('fecha_operacion', range.endDateExclusive)
    .order('created_at', { ascending: false })
    .limit(400)

  const ventasQuery = supabase
    .from('venta')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      producto_nombre,
      total_monto,
      total_unidades,
      confirmada,
      fecha_utc,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_utc', range.startDateTime)
    .lt('fecha_utc', range.endDateTimeExclusive)
    .order('fecha_utc', { ascending: false })
    .limit(400)

  const cuotasQuery = supabase
    .from('cuota_empleado_periodo')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      cumplimiento_porcentaje,
      bono_estimado,
      estado,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto)
    `)
    .order('created_at', { ascending: false })
    .limit(120)

  const ledgerQuery = supabase
    .from('nomina_ledger')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      tipo_movimiento,
      concepto,
      monto,
      referencia_tabla,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto),
      periodo:periodo_id(clave)
    `)
    .order('created_at', { ascending: false })
    .limit(300)

  const gastosQuery = supabase
    .from('gasto')
    .select(`
      id,
      cuenta_cliente_id,
      pdv_id,
      tipo,
      monto,
      fecha_gasto,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_gasto', range.startDate)
    .lt('fecha_gasto', range.endDateExclusive)
    .order('fecha_gasto', { ascending: false })
    .limit(400)

  const loveQuery = supabase
    .from('love_isdin')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_utc,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_utc', range.startDateTime)
    .lt('fecha_utc', range.endDateTimeExclusive)
    .order('fecha_utc', { ascending: false })
    .limit(400)

  const auditQuery = supabase
    .from('audit_log')
    .select(`
      id,
      tabla,
      registro_id,
      accion,
      payload,
      created_at,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      usuario:usuario_id(username)
    `)
    .order('created_at', { ascending: false })
    .limit(60)

  const asignacionesQuery = supabase
    .from('asignacion')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      supervisor_empleado_id,
      pdv_id,
      fecha_inicio,
      fecha_fin,
      tipo,
      dias_laborales,
      dia_descanso,
      horario_referencia,
      estado_publicacion,
      naturaleza,
      prioridad,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id_nomina, nombre_completo, puesto),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .limit(500)

  const solicitudesQuery = supabase
    .from('solicitud')
    .select('id, empleado_id, fecha_inicio, fecha_fin, tipo, estatus, metadata')
    .limit(500)

  const formacionesQuery = supabase
    .from('formacion_evento')
    .select('id, fecha_inicio, fecha_fin, nombre, tipo, estado, participantes, metadata')
    .limit(200)

  const configuracionQuery = supabase
    .from('configuracion')
    .select('clave, valor')
    .limit(40)

  const [asistenciasResult, ventasResult, cuotasResult, ledgerResult, gastosResult, loveResult, auditResult, asignacionesResult, solicitudesResult, formacionesResult, configuracionResult] = await Promise.all([
    asistenciasQuery,
    ventasQuery,
    cuotasQuery,
    ledgerQuery,
    gastosQuery,
    loveQuery,
    auditQuery,
    asignacionesQuery,
    solicitudesQuery,
    formacionesQuery,
    configuracionQuery,
  ])

  if (
    asistenciasResult.error ||
    ventasResult.error ||
    cuotasResult.error ||
    ledgerResult.error ||
    gastosResult.error ||
    loveResult.error ||
    auditResult.error
  ) {
    return buildEmptyResponse(
      asistenciasResult.error?.message ??
        ventasResult.error?.message ??
        cuotasResult.error?.message ??
        ledgerResult.error?.message ??
        gastosResult.error?.message ??
        loveResult.error?.message ??
        auditResult.error?.message ??
        'No fue posible consolidar los reportes operativos.',
      filtros
    )
  }

  const asistencias = (asistenciasResult.data ?? []) as unknown as AsistenciaQueryRow[]
  const ventas = (ventasResult.data ?? []) as unknown as VentaQueryRow[]
  const cuotas = (cuotasResult.data ?? []) as unknown as CuotaQueryRow[]
  const ledger = ((ledgerResult.data ?? []) as unknown as LedgerQueryRow[]).filter((item) => {
    const periodoClave = obtenerPrimero(item.periodo)?.clave ?? ''
    return !periodoClave || periodoClave.includes(range.period)
  })
  const gastos = (gastosResult.data ?? []) as unknown as GastoQueryRow[]
  const love = (loveResult.data ?? []) as unknown as LoveQueryRow[]
  const audit = (auditResult.data ?? []) as unknown as AuditLogQueryRow[]

  const asignacionesDisciplina = !asignacionesResult.error
    ? ((asignacionesResult.data ?? []) as unknown as AsignacionDisciplinaRow[])
        .filter((item) => item.estado_publicacion === 'PUBLICADA')
        .filter((item) => item.fecha_inicio <= range.endDateInclusive)
        .filter((item) => !item.fecha_fin || item.fecha_fin >= range.startDate)
    : []
  const solicitudesDisciplina = !solicitudesResult.error
    ? ((solicitudesResult.data ?? []) as unknown as SolicitudDisciplinaRow[])
        .filter((item) => item.fecha_inicio <= range.endDateInclusive)
        .filter((item) => item.fecha_fin >= range.startDate)
    : []
  const formacionesDisciplina = !formacionesResult.error
    ? ((formacionesResult.data ?? []) as unknown as FormacionDisciplinaRow[])
        .filter((item) => item.fecha_inicio <= range.endDateInclusive)
        .filter((item) => item.fecha_fin >= range.startDate)
    : []
  const configuracionesDisciplina = !configuracionResult.error
    ? ((configuracionResult.data ?? []) as unknown as ConfiguracionReporteRow[])
    : []
  const disciplineClientCounts = new Map<string, { descriptor: CuentaClienteRelacion | null; jornadasValidas: number; jornadasPendientes: number }>()
  const disciplineRankingCounts = new Map<string, { jornadasValidas: number; jornadasPendientes: number; retardos: number; ausenciasJustificadas: number; faltas: number }>()
  const disciplineAttendanceCounts = new Map<string, AsistenciaAcumulado>()
  const disciplineOverlayAvailable =
    !asignacionesResult.error &&
    !solicitudesResult.error &&
    !formacionesResult.error &&
    !configuracionResult.error &&
    asignacionesDisciplina.length > 0

  if (disciplineOverlayAvailable) {
    const accountDescriptorById = new Map<string, CuentaClienteRelacion>()
    const employeeDescriptorById = new Map<string, EmpleadoRelacion>()
    const pdvLabelByAssignmentId = new Map<string, string>()
    const attendanceStatusById = new Map<string, AsistenciaQueryRow['estatus']>()
    for (const asistencia of asistencias) {
      const cuenta = obtenerPrimero(asistencia.cuenta_cliente)
      const empleado = obtenerPrimero(asistencia.empleado)
      if (cuenta && asistencia.cuenta_cliente_id) {
        accountDescriptorById.set(asistencia.cuenta_cliente_id, cuenta)
      }
      if (empleado) {
        employeeDescriptorById.set(asistencia.empleado_id, empleado)
      }
      attendanceStatusById.set(asistencia.id, asistencia.estatus)
    }
    for (const cuota of cuotas) {
      const cuenta = obtenerPrimero(cuota.cuenta_cliente)
      if (cuenta && cuota.cuenta_cliente_id) {
        accountDescriptorById.set(cuota.cuenta_cliente_id, cuenta)
      }
    }
    for (const asignacion of asignacionesDisciplina) {
      const cuenta = obtenerPrimero(asignacion.cuenta_cliente)
      const empleado = obtenerPrimero(asignacion.empleado)
      const pdv = obtenerPrimero(asignacion.pdv)
      if (cuenta && asignacion.cuenta_cliente_id) {
        accountDescriptorById.set(asignacion.cuenta_cliente_id, cuenta)
      }
      if (empleado) {
        employeeDescriptorById.set(asignacion.empleado_id, empleado)
      }
      if (pdv) {
        pdvLabelByAssignmentId.set(asignacion.id, pdv.clave_btl ?? pdv.nombre ?? 'Sin PDV')
      }
    }

    const disciplina = deriveAttendanceDiscipline({
      assignments: asignacionesDisciplina.map<AttendanceDisciplineAssignment>((item) => ({
        id: item.id,
        empleadoId: item.empleado_id,
        pdvId: item.pdv_id,
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
        checkInUtc: null,
        checkOutUtc: null,
        estatus: item.estatus as 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA',
      })),
      solicitudes: solicitudesDisciplina.map((item) => ({
        id: item.id,
        empleadoId: item.empleado_id,
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
        tipo: item.tipo,
        estatus: item.estatus,
        metadata: normalizeMetadata(item.metadata),
      })),
      formaciones: Array.from(
        new Map(
          formacionesDisciplina.flatMap((item) =>
            asignacionesDisciplina
              .filter((assignment) =>
                formacionTargetsEmployee(
                  {
                    participantes: item.participantes,
                    metadata: item.metadata,
                  },
                  {
                    empleadoId: assignment.empleado_id,
                    puesto: null,
                    pdvId: assignment.pdv_id,
                  }
                )
              )
              .map((assignment) => [
                item.id + '::' + assignment.empleado_id,
                {
                  id: item.id,
                  empleadoId: assignment.empleado_id,
                  fechaInicio: item.fecha_inicio,
                  fechaFin: item.fecha_fin,
                  nombre: item.nombre ?? null,
                  tipo: item.tipo,
                  estatus: item.estado,
                } satisfies AttendanceDisciplineFormation,
              ] as const)
          )
        ).values()
      ),
      toleranceMinutes: 15,
      payrollDeductionDays: 1,
      salaries: [],
      periodStart: range.startDate,
      periodEnd: range.endDateInclusive,
    })

    for (const record of disciplina.records) {
      const descriptor = record.cuentaClienteId
        ? accountDescriptorById.get(record.cuentaClienteId) ?? { nombre: record.cuentaClienteId, identificador: record.cuentaClienteId }
        : null
      const employee = employeeDescriptorById.get(record.empleadoId)
      const pdvLabel = pdvLabelByAssignmentId.get(record.assignmentId) ?? 'Sin PDV'
      const periodo = formatPeriodoLocal(record.fecha)
      const attendanceKey = `${periodo}::${employee?.id_nomina ?? record.empleadoId}::${pdvLabel}::${descriptor?.nombre ?? 'sin-cuenta'}`
      const attendanceCount = disciplineAttendanceCounts.get(attendanceKey) ?? {
        periodo,
        empleado: employee?.nombre_completo ?? 'Sin empleado',
        idNomina: employee?.id_nomina ?? null,
        puesto: employee?.puesto ?? null,
        cuentaCliente: descriptor?.nombre ?? null,
        pdv: pdvLabel,
        jornadasValidas: 0,
        jornadasPendientes: 0,
        jornadasCerradas: 0,
        retardos: 0,
        ausenciasJustificadas: 0,
        faltas: 0,
        totalJornadas: 0,
      }

      attendanceCount.totalJornadas += 1
      if (record.estado === 'ASISTENCIA' || record.estado === 'RETARDO') {
        attendanceCount.jornadasValidas += 1
      } else if (record.estado === 'PENDIENTE_VALIDACION') {
        attendanceCount.jornadasPendientes += 1
      } else if (record.estado === 'AUSENCIA_JUSTIFICADA') {
        attendanceCount.ausenciasJustificadas += 1
      } else if (record.estado === 'FALTA') {
        attendanceCount.faltas += 1
      }
      if (record.estado === 'RETARDO') {
        attendanceCount.retardos += 1
      }
      if (record.attendanceId && attendanceStatusById.get(record.attendanceId) === 'CERRADA') {
        attendanceCount.jornadasCerradas += 1
      }
      disciplineAttendanceCounts.set(attendanceKey, attendanceCount)

      const clientKey = descriptor?.identificador ?? descriptor?.nombre ?? 'sin-cuenta'
      const clientCount = disciplineClientCounts.get(clientKey) ?? {
        descriptor,
        jornadasValidas: 0,
        jornadasPendientes: 0,
      }

      if (record.estado === 'ASISTENCIA' || record.estado === 'RETARDO') {
        clientCount.jornadasValidas += 1
      } else if (record.estado === 'PENDIENTE_VALIDACION') {
        clientCount.jornadasPendientes += 1
      }
      disciplineClientCounts.set(clientKey, clientCount)

      const rankingKey = record.empleadoId + '::' + (record.cuentaClienteId ?? 'sin-cuenta')
      const rankingCount = disciplineRankingCounts.get(rankingKey) ?? {
        jornadasValidas: 0,
        jornadasPendientes: 0,
        retardos: 0,
        ausenciasJustificadas: 0,
        faltas: 0,
      }
      if (record.estado === 'ASISTENCIA' || record.estado === 'RETARDO') {
        rankingCount.jornadasValidas += 1
      } else if (record.estado === 'PENDIENTE_VALIDACION') {
        rankingCount.jornadasPendientes += 1
      } else if (record.estado === 'AUSENCIA_JUSTIFICADA') {
        rankingCount.ausenciasJustificadas += 1
      } else if (record.estado === 'FALTA') {
        rankingCount.faltas += 1
      }
      if (record.estado === 'RETARDO') {
        rankingCount.retardos += 1
      }
      disciplineRankingCounts.set(rankingKey, rankingCount)
    }
  }

  const campaignSource = options.campaignData ?? (options.actor ? await obtenerPanelCampanas(options.actor) : null)
  const campaignRows = (campaignSource?.campanas ?? [])
    .filter((campaign) => overlapsSelectedMonth(campaign, range))
    .flatMap((campaign) =>
      campaign.pdvs.map((item) => ({
        periodo: range.period,
        campana: campaign.nombre,
        pdv: `${item.claveBtl} - ${item.pdv}`,
        dc: item.dcNombre,
        estatus: item.estatus,
        avancePorcentaje: item.avancePorcentaje,
        tareasPendientes: item.tareasPendientes,
        evidenciasPendientes: Math.max(0, item.evidenciasRequeridas.length - item.evidenciasCargadas),
      }))
    )
    .sort((left, right) => right.avancePorcentaje - left.avancePorcentaje)

  const clientes = new Map<string, ClienteAcumulado>()
  const asistenciasReportadas = new Map<string, AsistenciaAcumulado>()
  const ventasReportadas = new Map<string, VentaAcumulado>()
  const rankingVentas = new Map<string, RankingVentasAcumulado>()
  const rankingCuotas = new Map<string, CuotaAcumulado>()
  const gastosReportados = new Map<string, GastoAcumulado>()
  const loveReportado = new Map<string, LoveAcumulado>()
  const nominaReportada = new Map<string, NominaAcumulado>()

  const ensureCliente = (cuenta: CuentaClienteRelacion | null) => {
    const key = cuenta?.identificador ?? cuenta?.nombre ?? 'sin-cuenta'
    const actual = clientes.get(key) ?? {
      cuentaCliente: cuenta?.nombre ?? 'Sin cliente',
      identificador: cuenta?.identificador ?? null,
      jornadasValidas: 0,
      jornadasPendientes: 0,
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      cuotasCumplidas: 0,
      netoNominaEstimado: 0,
    }
    clientes.set(key, actual)
    return actual
  }

  const ensureAsistencia = (
    periodo: string,
    empleado: string,
    idNomina: string | null,
    puesto: string | null,
    cuentaCliente: string | null,
    pdv: string
  ) => {
    const key = `${periodo}::${idNomina ?? empleado}::${pdv}::${cuentaCliente ?? 'sin-cuenta'}`
    const actual = asistenciasReportadas.get(key) ?? {
      periodo,
      empleado,
      idNomina,
      puesto,
      cuentaCliente,
      pdv,
      jornadasValidas: 0,
      jornadasPendientes: 0,
      jornadasCerradas: 0,
      retardos: 0,
      ausenciasJustificadas: 0,
      faltas: 0,
      totalJornadas: 0,
    }

    asistenciasReportadas.set(key, actual)
    return actual
  }

  const ensureVenta = (
    periodo: string,
    dc: string,
    idNomina: string | null,
    puesto: string | null,
    cuentaCliente: string | null,
    pdv: string,
    producto: string
  ) => {
    const key = `${periodo}::${idNomina ?? dc}::${pdv}::${producto}::${cuentaCliente ?? 'sin-cuenta'}`
    const actual = ventasReportadas.get(key) ?? {
      periodo,
      dc,
      idNomina,
      puesto,
      cuentaCliente,
      pdv,
      producto,
      ventasConfirmadas: 0,
      unidadesConfirmadas: 0,
      montoConfirmado: 0,
    }

    ventasReportadas.set(key, actual)
    return actual
  }

  const ensureGasto = (periodo: string, zona: string, tipo: string) => {
    const key = `${periodo}::${zona}::${tipo}`
    const actual = gastosReportados.get(key) ?? {
      periodo,
      zona,
      tipo,
      registros: 0,
      montoSolicitado: 0,
      montoAprobado: 0,
      montoReembolsado: 0,
    }

    gastosReportados.set(key, actual)
    return actual
  }

  const ensureLove = (
    key: string,
    input: {
      semanaInicio: string
      periodo: string
      dc: string
      supervisor: string
      zona: string
      cadena: string
      pdv: string
    }
  ) => {
    const actual = loveReportado.get(key) ?? {
      semanaInicio: input.semanaInicio,
      periodo: input.periodo,
      dc: input.dc,
      supervisor: input.supervisor,
      zona: input.zona,
      cadena: input.cadena,
      pdv: input.pdv,
      afiliaciones: 0,
      objetivoSemanal: 0,
      restanteObjetivo: 0,
      cumplimientoPct: 0,
      validas: 0,
      pendientes: 0,
      duplicadas: 0,
    }

    if (actual.supervisor === 'Sin supervisor' && input.supervisor !== 'Sin supervisor') {
      actual.supervisor = input.supervisor
    }
    if (actual.zona === 'Sin zona' && input.zona !== 'Sin zona') {
      actual.zona = input.zona
    }
    if (actual.cadena === 'Sin cadena' && input.cadena !== 'Sin cadena') {
      actual.cadena = input.cadena
    }

    loveReportado.set(key, actual)
    return actual
  }

  const ensureNomina = (
    periodo: string,
    empleadoId: string | null,
    empleado: string,
    idNomina: string | null,
    puesto: string | null,
    cuentaClienteId: string | null,
    cuentaCliente: string | null
  ) => {
    const key = `${periodo}::${idNomina ?? empleado}::${cuentaCliente ?? 'sin-cuenta'}`
    const actual = nominaReportada.get(key) ?? {
      periodo,
      empleadoId,
      empleado,
      idNomina,
      puesto,
      cuentaClienteId,
      cuentaCliente,
      percepciones: 0,
      deducciones: 0,
      neto: 0,
      jornadasValidas: 0,
      jornadasPendientes: 0,
      retardos: 0,
      ausenciasJustificadas: 0,
      faltas: 0,
      movimientos: 0,
    }

    nominaReportada.set(key, actual)
    return actual
  }

  if (!disciplineOverlayAvailable) {
    for (const asistencia of asistencias) {
      const cuenta = obtenerPrimero(asistencia.cuenta_cliente)
    const empleado = obtenerPrimero(asistencia.empleado)
    const pdv = obtenerPrimero(asistencia.pdv)
    const cliente = ensureCliente(cuenta)
    const periodo = formatPeriodoLocal(asistencia.fecha_operacion)
    const pdvLabel = pdv?.clave_btl ?? pdv?.nombre ?? 'Sin PDV'
    const agregado = ensureAsistencia(
      periodo,
      empleado?.nombre_completo ?? 'Sin empleado',
      empleado?.id_nomina ?? null,
      empleado?.puesto ?? null,
      cuenta?.nombre ?? null,
      pdvLabel
    )

    agregado.totalJornadas += 1

    if (asistencia.estatus === 'VALIDA') {
      cliente.jornadasValidas += 1
      agregado.jornadasValidas += 1
    } else if (asistencia.estatus === 'CERRADA') {
      cliente.jornadasValidas += 1
      agregado.jornadasCerradas += 1
    } else if (asistencia.estatus === 'PENDIENTE_VALIDACION') {
      cliente.jornadasPendientes += 1
      agregado.jornadasPendientes += 1
    }
  }
  }

  for (const venta of ventas) {
    const cuenta = obtenerPrimero(venta.cuenta_cliente)
    const empleado = obtenerPrimero(venta.empleado)
    const pdv = obtenerPrimero(venta.pdv)
    const cliente = ensureCliente(cuenta)
    const rankingKey = `${venta.empleado_id}::${venta.cuenta_cliente_id}`
    const periodo = formatPeriodoUtc(venta.fecha_utc)
    const pdvLabel = pdv?.clave_btl ?? pdv?.nombre ?? 'Sin PDV'
    const producto = venta.producto_nombre?.trim() || 'Sin producto'
    const agregado = ensureVenta(
      periodo,
      empleado?.nombre_completo ?? 'Sin empleado',
      empleado?.id_nomina ?? null,
      empleado?.puesto ?? null,
      cuenta?.nombre ?? null,
      pdvLabel,
      producto
    )
    const actual = rankingVentas.get(rankingKey) ?? {
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuenta?.nombre ?? null,
      ventasConfirmadas: 0,
      unidadesConfirmadas: 0,
      montoConfirmado: 0,
    }

    if (venta.confirmada) {
      agregado.ventasConfirmadas += 1
      agregado.unidadesConfirmadas += venta.total_unidades
      agregado.montoConfirmado += venta.total_monto
      actual.ventasConfirmadas += 1
      actual.unidadesConfirmadas += venta.total_unidades
      actual.montoConfirmado += venta.total_monto
      cliente.ventasConfirmadas += 1
      cliente.montoConfirmado += venta.total_monto
    }

    rankingVentas.set(rankingKey, actual)
  }

  for (const cuota of cuotas) {
    const cuenta = obtenerPrimero(cuota.cuenta_cliente)
    const empleado = obtenerPrimero(cuota.empleado)
    const cliente = ensureCliente(cuenta)
    const rankingKey = `${cuota.empleado_id}::${cuota.cuenta_cliente_id}`
    const actual = rankingCuotas.get(rankingKey) ?? {
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuenta?.nombre ?? null,
      cuotaEstado: cuota.estado,
      cumplimiento: cuota.cumplimiento_porcentaje,
      bonoEstimado: cuota.bono_estimado,
      jornadasValidas: 0,
      jornadasPendientes: 0,
      retardos: 0,
      ausenciasJustificadas: 0,
      faltas: 0,
    }

    actual.cuotaEstado = cuota.estado
    actual.cumplimiento = cuota.cumplimiento_porcentaje
    actual.bonoEstimado = cuota.bono_estimado

    if (cuota.estado === 'CUMPLIDA') {
      cliente.cuotasCumplidas += 1
    }

    rankingCuotas.set(rankingKey, actual)
  }

  if (!disciplineOverlayAvailable) {
    for (const asistencia of asistencias) {
      const rankingKey = `${asistencia.empleado_id}::${asistencia.cuenta_cliente_id}`
      const actual = rankingCuotas.get(rankingKey)
      if (!actual) {
        continue
      }

      if (asistencia.estatus === 'VALIDA' || asistencia.estatus === 'CERRADA') {
        actual.jornadasValidas += 1
      } else if (asistencia.estatus === 'PENDIENTE_VALIDACION') {
        actual.jornadasPendientes += 1
      }
    }
  }

  if (disciplineOverlayAvailable) {
    for (const [key, overlay] of disciplineClientCounts) {
      const cliente = ensureCliente(overlay.descriptor)
      cliente.jornadasValidas = overlay.jornadasValidas
      cliente.jornadasPendientes = overlay.jornadasPendientes
      clientes.set(key, cliente)
    }

    asistenciasReportadas.clear()
    for (const [key, overlay] of disciplineAttendanceCounts) {
      asistenciasReportadas.set(key, overlay)
    }

    for (const [key, overlay] of disciplineRankingCounts) {
      const actual = rankingCuotas.get(key)
      if (!actual) {
        continue
      }

      actual.jornadasValidas = overlay.jornadasValidas
      actual.jornadasPendientes = overlay.jornadasPendientes
      actual.retardos = overlay.retardos
      actual.ausenciasJustificadas = overlay.ausenciasJustificadas
      actual.faltas = overlay.faltas
    }
  }

  for (const gasto of gastos) {
    const cuenta = obtenerPrimero(gasto.cuenta_cliente)
    const pdv = obtenerPrimero(gasto.pdv)
    const periodo = formatPeriodoLocal(gasto.fecha_gasto)
    const zona = pdv?.zona ?? 'Sin zona'
    const agregado = ensureGasto(periodo, zona, gasto.tipo)

    ensureCliente(cuenta)
    agregado.registros += 1
    agregado.montoSolicitado += gasto.monto

    if (gasto.estatus === 'APROBADO' || gasto.estatus === 'REEMBOLSADO') {
      agregado.montoAprobado += gasto.monto
    }

    if (gasto.estatus === 'REEMBOLSADO') {
      agregado.montoReembolsado += gasto.monto
    }
  }

  const loveTargetResult = await fetchLoveQuotaTargetRows(supabase as never, {
    dateFrom: range.startDate,
    dateTo: range.endDateInclusive,
  })

  if (loveTargetResult.error) {
    return buildEmptyResponse(loveTargetResult.error, filtros)
  }

  for (const target of loveTargetResult.data) {
    const key = `${target.weekBucket}::${target.empleadoId}::${target.pdvId}`
    const agregado = ensureLove(key, {
      semanaInicio: target.weekBucket,
      periodo: formatWeekPeriodLabel(target.weekBucket),
      dc: target.empleadoLabel,
      supervisor: target.supervisorLabel,
      zona: target.zona,
      cadena: target.cadena,
      pdv: target.pdvLabel,
    })

    agregado.objetivoSemanal += target.objetivo
  }

  for (const afiliacion of love) {
    const empleado = obtenerPrimero(afiliacion.empleado)
    const pdv = obtenerPrimero(afiliacion.pdv)
    const dayIso = getMexicoDateIsoFromUtc(afiliacion.fecha_utc)
    const weekBucket = getWeekStartIso(dayIso)
    const key = `${weekBucket}::${afiliacion.empleado_id}::${afiliacion.pdv_id}`
    const agregado = ensureLove(key, {
      semanaInicio: weekBucket,
      periodo: formatWeekPeriodLabel(weekBucket),
      dc: empleado?.nombre_completo ?? 'Sin DC',
      supervisor: 'Sin supervisor',
      zona: pdv?.zona ?? 'Sin zona',
      cadena: 'Sin cadena',
      pdv: pdv?.clave_btl ?? pdv?.nombre ?? 'Sin PDV',
    })

    agregado.afiliaciones += 1

    if (afiliacion.estatus === 'VALIDA') {
      agregado.validas += 1
    } else if (afiliacion.estatus === 'PENDIENTE_VALIDACION') {
      agregado.pendientes += 1
    } else if (afiliacion.estatus === 'DUPLICADA') {
      agregado.duplicadas += 1
    }
  }

  for (const item of loveReportado.values()) {
    const progreso = computeLoveQuotaProgress(item.afiliaciones, item.objetivoSemanal)
    item.restanteObjetivo = progreso.restante
    item.cumplimientoPct = progreso.cumplimientoPct
  }

  for (const movimiento of ledger) {
    const cuenta = obtenerPrimero(movimiento.cuenta_cliente)
    const cliente = ensureCliente(cuenta)
    const empleado = obtenerPrimero(movimiento.empleado)
    const periodo = obtenerPrimero(movimiento.periodo)?.clave ?? 'Sin periodo'
    const nomina = ensureNomina(
      periodo,
      movimiento.empleado_id,
      empleado?.nombre_completo ?? 'Sin empleado',
      empleado?.id_nomina ?? null,
      empleado?.puesto ?? null,
      movimiento.cuenta_cliente_id,
      cuenta?.nombre ?? null
    )

    nomina.movimientos += 1

    if (movimiento.tipo_movimiento === 'DEDUCCION') {
      cliente.netoNominaEstimado -= movimiento.monto
      nomina.deducciones += movimiento.monto
      nomina.neto -= movimiento.monto
    } else {
      cliente.netoNominaEstimado += movimiento.monto
      nomina.percepciones += movimiento.monto
      nomina.neto += movimiento.monto
    }
  }

  if (disciplineOverlayAvailable) {
    for (const item of nominaReportada.values()) {
      const overlay = item.empleadoId ? disciplineRankingCounts.get(`${item.empleadoId}::${item.cuentaClienteId ?? 'sin-cuenta'}`) : null
      if (!overlay) {
        continue
      }

      item.jornadasValidas = overlay.jornadasValidas
      item.jornadasPendientes = overlay.jornadasPendientes
      item.retardos = overlay.retardos
      item.ausenciasJustificadas = overlay.ausenciasJustificadas
      item.faltas = overlay.faltas
    }
  }

  const clientesItems = Array.from(clientes.values()).sort((left, right) => right.montoConfirmado - left.montoConfirmado)
  const asistenciasItems = Array.from(asistenciasReportadas.values()).sort((left, right) => right.totalJornadas - left.totalJornadas)
  const ventasItems = Array.from(ventasReportadas.values())
    .filter((item) => item.ventasConfirmadas > 0)
    .sort((left, right) => right.montoConfirmado - left.montoConfirmado)
  const rankingVentasItems = Array.from(rankingVentas.values())
    .filter((item) => item.ventasConfirmadas > 0)
    .sort((left, right) => right.montoConfirmado - left.montoConfirmado)
  const rankingCuotasItems = Array.from(rankingCuotas.values()).sort((left, right) => right.cumplimiento - left.cumplimiento)
  const gastosItems = Array.from(gastosReportados.values()).sort((left, right) => right.montoSolicitado - left.montoSolicitado)
  const loveItems = Array.from(loveReportado.values()).sort((left, right) => {
    const weekDiff = right.semanaInicio.localeCompare(left.semanaInicio, 'es-MX')
    if (weekDiff !== 0) {
      return weekDiff
    }

    if (right.cumplimientoPct !== left.cumplimientoPct) {
      return right.cumplimientoPct - left.cumplimientoPct
    }

    if (right.afiliaciones !== left.afiliaciones) {
      return right.afiliaciones - left.afiliaciones
    }

    return left.dc.localeCompare(right.dc, 'es-MX')
  })
  const nominaItems = Array.from(nominaReportada.values()).sort((left, right) => right.neto - left.neto)
  const bitacoraItems = audit.map((item) => ({
    id: item.id,
    fecha: item.created_at,
    tabla: item.tabla,
    accion: item.accion,
    registroId: item.registro_id,
    cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
    usuario: obtenerPrimero(item.usuario)?.username ?? null,
    resumen: obtenerResumenPayload(item.payload ?? {}),
  }))

  const maxTotal = Math.max(
    clientesItems.length,
    asistenciasItems.length,
    ventasItems.length,
    rankingVentasItems.length,
    rankingCuotasItems.length,
    gastosItems.length,
    loveItems.length,
    nominaItems.length,
    campaignRows.length,
    bitacoraItems.length,
    1
  )
  const totalPages = Math.max(1, Math.ceil(maxTotal / filtros.pageSize))
  const safePage = Math.min(filtros.page, totalPages)

  return {
    filtros: {
      ...filtros,
      page: safePage,
    },
    paginacion: {
      page: safePage,
      pageSize: filtros.pageSize,
      totalPages,
      totalClientes: clientesItems.length,
      totalAsistencias: asistenciasItems.length,
      totalVentas: ventasItems.length,
      totalRankingVentas: rankingVentasItems.length,
      totalRankingCuotas: rankingCuotasItems.length,
      totalGastos: gastosItems.length,
      totalLove: loveItems.length,
      totalNomina: nominaItems.length,
      totalCampanas: campaignRows.length,
      totalBitacora: bitacoraItems.length,
    },
    resumen: {
      jornadasValidas: clientesItems.reduce((total, item) => total + item.jornadasValidas, 0),
      jornadasPendientes: clientesItems.reduce((total, item) => total + item.jornadasPendientes, 0),
      ventasConfirmadas: clientesItems.reduce((total, item) => total + item.ventasConfirmadas, 0),
      montoConfirmado: clientesItems.reduce((total, item) => total + item.montoConfirmado, 0),
      cuotasCumplidas: clientesItems.reduce((total, item) => total + item.cuotasCumplidas, 0),
      netoNominaEstimado: clientesItems.reduce((total, item) => total + item.netoNominaEstimado, 0),
      gastosReembolsados: gastosItems.reduce((total, item) => total + item.montoReembolsado, 0),
    },
    clientes: paginateItems(clientesItems, safePage, filtros.pageSize),
    asistencias: paginateItems(asistenciasItems, safePage, filtros.pageSize),
    ventas: paginateItems(ventasItems, safePage, filtros.pageSize),
    rankingVentas: paginateItems(rankingVentasItems, safePage, filtros.pageSize),
    rankingCuotas: paginateItems(rankingCuotasItems, safePage, filtros.pageSize),
    gastos: paginateItems(gastosItems, safePage, filtros.pageSize),
    love: paginateItems(loveItems, safePage, filtros.pageSize),
    nomina: paginateItems(nominaItems, safePage, filtros.pageSize),
    campanas: paginateItems(campaignRows, safePage, filtros.pageSize),
    bitacora: paginateItems(bitacoraItems, safePage, filtros.pageSize),
    infraestructuraLista: true,
  }
}
