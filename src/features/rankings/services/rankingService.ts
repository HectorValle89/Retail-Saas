import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type { CuentaCliente, CuotaEmpleadoPeriodo, Empleado, LoveIsdin, Pdv, Puesto, Venta } from '@/types/database'
import {
  computeLoveQuotaProgress,
  fetchLoveQuotaTargetRows,
} from '@/features/love-isdin/lib/loveQuota'

const RANKING_CACHE_TTL_MS = 15 * 60 * 1000
const RANKING_QUERY_LIMIT = 1200
const SUPERVISOR_QUERY_LIMIT = 120

const rankingCache = new Map<string, { expiresAt: number; result: RankingPanelData }>()

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre' | 'identificador'>
type EmpleadoRelacion = Pick<Empleado, 'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>
type PdvRelacion = Pick<Pdv, 'zona' | 'nombre' | 'clave_btl'>
type SupervisorRelacion = Pick<Empleado, 'id' | 'nombre_completo'>

type VentaRankingRow = Pick<
  Venta,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'pdv_id' | 'fecha_utc' | 'total_unidades' | 'total_monto' | 'confirmada'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type LoveRankingRow = Pick<
  LoveIsdin,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'pdv_id' | 'fecha_utc' | 'estatus'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
}

type CuotaRankingRow = Pick<CuotaEmpleadoPeriodo, 'id' | 'periodo_id' | 'cuenta_cliente_id' | 'empleado_id' | 'cumplimiento_porcentaje' | 'estado'> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  periodo: MaybeMany<Pick<PeriodoNominaLike, 'clave'>>
}

type PeriodoNominaLike = { clave: string }

interface RankingQueryResult<T> {
  data: T[] | null
  error: { message: string } | null
}

interface RankingQueryBuilder<T> {
  select(columns: string): RankingQueryBuilder<T>
  eq(column: string, value: string): RankingQueryBuilder<T>
  gte(column: string, value: string): RankingQueryBuilder<T>
  lt(column: string, value: string): RankingQueryBuilder<T>
  order(column: string, options?: { ascending?: boolean }): RankingQueryBuilder<T>
  limit(count: number): Promise<RankingQueryResult<T>>
  in?(column: string, values: string[]): Promise<RankingQueryResult<T>> | RankingQueryBuilder<T>
}

interface RankingSupabaseClient {
  from(table: 'venta' | 'love_isdin' | 'empleado' | 'cuota_empleado_periodo'): RankingQueryBuilder<unknown>
}

export type RankingCorte = 'SEMANA' | 'MES' | 'ACUMULADO'

export interface RankingFilters {
  periodo: string
  corte: RankingCorte
  zona: string
  supervisorId: string
}

export interface RankingDcItem {
  posicion: number
  empleadoId: string
  empleado: string
  idNomina: string | null
  puesto: Puesto | null
  cuentaCliente: string | null
  zona: string
  supervisorId: string | null
  supervisorNombre: string
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  validasLove: number
  loveObjetivo: number
  lovePendiente: number
  cumplimientoLovePct: number
  scoreVentas: number
  scoreLove: number
  esActorActual: boolean
}

export interface RankingSupervisorItem {
  posicion: number
  supervisorId: string
  supervisorNombre: string
  cuentaCliente: string | null
  zona: string
  dcsActivos: number
  ventasConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  loveObjetivo: number
  lovePendiente: number
  cumplimientoLovePct: number
  scoreMixto: number
  esActorActual: boolean
}

export interface RankingZonaItem {
  posicion: number
  zona: string
  cuentaCliente: string | null
  dcsActivos: number
  supervisoresActivos: number
  ventasConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  loveObjetivo: number
  lovePendiente: number
  cumplimientoLovePct: number
  scoreMixto: number
}

export interface RankingQuotaZonaItem {
  posicion: number
  zona: string
  cuentaCliente: string | null
  dcsActivos: number
  supervisoresActivos: number
  cuotasTotales: number
  cuotasCumplidas: number
  cuotasEnRiesgo: number
  cumplimientoPromedio: number
}

export interface RankingPdvItem {
  posicion: number
  pdvId: string
  pdv: string
  claveBtl: string | null
  zona: string
  cuentaCliente: string | null
  dcsActivos: number
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
  scoreVentas: number
}

export interface RankingResumen {
  totalDcs: number
  totalSupervisores: number
  totalZonas: number
  totalPdvs: number
  miPosicionVentas: number | null
  miPosicionLove: number | null
}

export interface RankingFilterOptions {
  zonas: string[]
  supervisores: Array<{ id: string; nombre: string }>
}

export interface RankingPanelData {
  filtros: RankingFilters
  opcionesFiltro: RankingFilterOptions
  scopeLabel: string
  rangoEtiqueta: string
  resumen: RankingResumen
  ventasDcs: RankingDcItem[]
  loveDcs: RankingDcItem[]
  supervisores: RankingSupervisorItem[]
  zonas: RankingZonaItem[]
  cuotasZonas: RankingQuotaZonaItem[]
  pdvs: RankingPdvItem[]
  generatedAt: string | null
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

export interface RankingPublicDcItem {
  posicion: number
  colaboradora: string
  zona: string
  montoConfirmado: number
  unidadesConfirmadas: number
  afiliacionesLove: number
}

export interface RankingPublicPdvItem {
  posicion: number
  pdv: string
  zona: string
  montoConfirmado: number
  ventasConfirmadas: number
}

export interface RankingPublicPanelData {
  scopeLabel: string
  rangoEtiqueta: string
  generatedAt: string | null
  ventasDcs: RankingPublicDcItem[]
  loveDcs: RankingPublicDcItem[]
  pdvs: RankingPublicPdvItem[]
}

interface WindowRange {
  periodo: string
  startDate: string
  endDateExclusive: string
  startDateTime: string
  endDateTimeExclusive: string
  label: string
}

interface DcAccumulator {
  empleadoId: string
  empleado: string
  idNomina: string | null
  puesto: Puesto | null
  cuentaCliente: string | null
  zona: string
  supervisorId: string | null
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  validasLove: number
  loveObjetivo: number
}

interface SupervisorAccumulator {
  supervisorId: string
  supervisorNombre: string
  cuentaCliente: string | null
  zona: string
  dcsActivos: Set<string>
  ventasConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  loveObjetivo: number
}

interface ZonaAccumulator {
  zona: string
  cuentaCliente: string | null
  dcsActivos: Set<string>
  supervisoresActivos: Set<string>
  ventasConfirmadas: number
  montoConfirmado: number
  afiliacionesLove: number
  loveObjetivo: number
}

interface QuotaZonaAccumulator {
  zona: string
  cuentaCliente: string | null
  dcsActivos: Set<string>
  supervisoresActivos: Set<string>
  cuotasTotales: number
  cuotasCumplidas: number
  cuotasEnRiesgo: number
  cumplimientoTotal: number
}

interface PdvAccumulator {
  pdvId: string
  pdv: string
  claveBtl: string | null
  zona: string
  cuentaCliente: string | null
  dcsActivos: Set<string>
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

const RANKING_ALLOWED_ROLES = [
  'DERMOCONSEJERO',
  'SUPERVISOR',
  'COORDINADOR',
  'LOVE_IS',
  'VENTAS',
  'ADMINISTRADOR',
  'CLIENTE',
] as const

function getDefaultPeriod() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function normalizePeriodo(value?: string) {
  const candidate = value?.trim() ?? ''
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : getDefaultPeriod()
}

function normalizeCorte(value?: string): RankingCorte {
  return value === 'SEMANA' || value === 'ACUMULADO' ? value : 'MES'
}

function normalizeFilterValue(value?: string) {
  return value?.trim() ?? ''
}

function getInclusiveEndDate(endDateExclusive: string) {
  const date = new Date(`${endDateExclusive}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function buildWindowRange(periodo: string, corte: RankingCorte): WindowRange {
  const [yearRaw, monthRaw] = periodo.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const endOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0))

  let start = startOfMonth
  let end = endOfMonth

  if (corte === 'SEMANA') {
    const today = new Date()
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0))
    const endCandidate = todayUtc < endOfMonth ? new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000) : endOfMonth
    end = endCandidate
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (start < startOfMonth) {
      start = startOfMonth
    }
  }

  if (corte === 'ACUMULADO') {
    start = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  }

  return {
    periodo,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
    startDateTime: start.toISOString(),
    endDateTimeExclusive: end.toISOString(),
    label:
      corte === 'SEMANA'
        ? `Semana operativa de ${periodo}`
        : corte === 'ACUMULADO'
          ? `Acumulado ${year}`
          : `Mes ${periodo}`,
  }
}

function getScopeLabel(actor: ActorActual) {
  if (actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId) {
    return 'Vista global'
  }

  return actor.cuentaClienteId ? 'Cuenta cliente operativa' : 'Sin cuenta operativa'
}

function buildEmptyResponse(actor: ActorActual, filters: RankingFilters, message?: string): RankingPanelData {
  return {
    filtros: filters,
    opcionesFiltro: { zonas: [], supervisores: [] },
    scopeLabel: getScopeLabel(actor),
    rangoEtiqueta: buildWindowRange(filters.periodo, filters.corte).label,
    resumen: {
      totalDcs: 0,
      totalSupervisores: 0,
      totalZonas: 0,
      totalPdvs: 0,
      miPosicionVentas: null,
      miPosicionLove: null,
    },
    ventasDcs: [],
    loveDcs: [],
    supervisores: [],
    zonas: [],
    cuotasZonas: [],
    pdvs: [],
    generatedAt: null,
    infraestructuraLista: !message,
    mensajeInfraestructura: message,
  }
}

const obtenerPrimero = <T,>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildCacheKey(actor: ActorActual, filters: RankingFilters) {
  return [
    actor.puesto,
    actor.empleadoId,
    actor.cuentaClienteId ?? 'global',
    filters.periodo,
    filters.corte,
    filters.zona || 'all-zones',
    filters.supervisorId || 'all-supervisors',
  ].join('::')
}

function sanitizeCollaboratorName(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return 'Colaboradora anonima'
  }

  if (parts.length === 1) {
    return parts[0]
  }

  return `${parts[0]} ${parts[1][0] ?? ''}.`
}

function sanitizePdvName(value: string) {
  const normalized = value.trim()
  return normalized || 'PDV anonimo'
}

function inferSupervisorName(supervisorId: string | null, supervisors: Map<string, string>) {
  if (!supervisorId) {
    return 'Sin supervisor'
  }

  return supervisors.get(supervisorId) ?? supervisorId
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function compareVentas(left: DcAccumulator, right: DcAccumulator) {
  if (right.montoConfirmado !== left.montoConfirmado) {
    return right.montoConfirmado - left.montoConfirmado
  }

  if (right.ventasConfirmadas !== left.ventasConfirmadas) {
    return right.ventasConfirmadas - left.ventasConfirmadas
  }

  return right.unidadesConfirmadas - left.unidadesConfirmadas
}

function compareLove(left: DcAccumulator, right: DcAccumulator) {
  const leftProgress = computeLoveQuotaProgress(left.afiliacionesLove, left.loveObjetivo)
  const rightProgress = computeLoveQuotaProgress(right.afiliacionesLove, right.loveObjetivo)

  if (rightProgress.cumplimientoPct !== leftProgress.cumplimientoPct) {
    return rightProgress.cumplimientoPct - leftProgress.cumplimientoPct
  }

  if (right.afiliacionesLove !== left.afiliacionesLove) {
    return right.afiliacionesLove - left.afiliacionesLove
  }

  return right.validasLove - left.validasLove
}

function compareSupervisor(left: SupervisorAccumulator, right: SupervisorAccumulator) {
  const leftProgress = computeLoveQuotaProgress(left.afiliacionesLove, left.loveObjetivo)
  const rightProgress = computeLoveQuotaProgress(right.afiliacionesLove, right.loveObjetivo)

  if (rightProgress.cumplimientoPct !== leftProgress.cumplimientoPct) {
    return rightProgress.cumplimientoPct - leftProgress.cumplimientoPct
  }

  const leftScore = left.montoConfirmado + left.afiliacionesLove * 100
  const rightScore = right.montoConfirmado + right.afiliacionesLove * 100
  return rightScore - leftScore
}

function compareZona(left: ZonaAccumulator, right: ZonaAccumulator) {
  const leftProgress = computeLoveQuotaProgress(left.afiliacionesLove, left.loveObjetivo)
  const rightProgress = computeLoveQuotaProgress(right.afiliacionesLove, right.loveObjetivo)

  if (rightProgress.cumplimientoPct !== leftProgress.cumplimientoPct) {
    return rightProgress.cumplimientoPct - leftProgress.cumplimientoPct
  }

  const leftScore = left.montoConfirmado + left.afiliacionesLove * 100
  const rightScore = right.montoConfirmado + right.afiliacionesLove * 100
  return rightScore - leftScore
}

function compareQuotaZona(left: QuotaZonaAccumulator, right: QuotaZonaAccumulator) {
  if (right.cumplimientoTotal !== left.cumplimientoTotal) {
    return right.cumplimientoTotal - left.cumplimientoTotal
  }

  return right.cuotasCumplidas - left.cuotasCumplidas
}

function comparePdv(left: PdvAccumulator, right: PdvAccumulator) {
  if (right.montoConfirmado !== left.montoConfirmado) {
    return right.montoConfirmado - left.montoConfirmado
  }

  if (right.ventasConfirmadas !== left.ventasConfirmadas) {
    return right.ventasConfirmadas - left.ventasConfirmadas
  }

  return right.unidadesConfirmadas - left.unidadesConfirmadas
}

function makeDcItem(item: DcAccumulator, posicion: number, actor: ActorActual, supervisors: Map<string, string>): RankingDcItem {
  const loveProgress = computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo)

  return {
    posicion,
    empleadoId: item.empleadoId,
    empleado: item.empleado,
    idNomina: item.idNomina,
    puesto: item.puesto,
    cuentaCliente: item.cuentaCliente,
    zona: item.zona,
    supervisorId: item.supervisorId,
    supervisorNombre: inferSupervisorName(item.supervisorId, supervisors),
    ventasConfirmadas: item.ventasConfirmadas,
    unidadesConfirmadas: item.unidadesConfirmadas,
    montoConfirmado: round(item.montoConfirmado),
    afiliacionesLove: item.afiliacionesLove,
    validasLove: item.validasLove,
    loveObjetivo: loveProgress.objetivo,
    lovePendiente: loveProgress.restante,
    cumplimientoLovePct: loveProgress.cumplimientoPct,
    scoreVentas: round(item.montoConfirmado + item.unidadesConfirmadas * 10),
    scoreLove: loveProgress.cumplimientoPct,
    esActorActual: item.empleadoId === actor.empleadoId,
  }
}

function isRoleAllowed(puesto: Puesto) {
  return (RANKING_ALLOWED_ROLES as readonly Puesto[]).includes(puesto)
}

function matchesFilters(item: { zona: string; supervisorId: string | null }, filters: RankingFilters) {
  if (filters.zona && item.zona !== filters.zona) {
    return false
  }

  if (filters.supervisorId && item.supervisorId !== filters.supervisorId) {
    return false
  }

  return true
}

async function fetchSupervisors(supabase: RankingSupabaseClient, supervisorIds: string[]) {
  if (supervisorIds.length === 0) {
    return { data: [] as SupervisorRelacion[], error: null as { message: string } | null }
  }

  const query = supabase.from('empleado').select('id, nombre_completo')

  if (typeof query.in === 'function') {
    const result = await query.in('id', supervisorIds)
    if ('data' in result) {
      return {
        data: ((result.data ?? []) as SupervisorRelacion[]).slice(0, SUPERVISOR_QUERY_LIMIT),
        error: result.error,
      }
    }

    const limited = await result.limit(SUPERVISOR_QUERY_LIMIT)
    return {
      data: (limited.data ?? []) as SupervisorRelacion[],
      error: limited.error,
    }
  }

  const fallback = await query.limit(SUPERVISOR_QUERY_LIMIT)
  return {
    data: ((fallback.data ?? []) as SupervisorRelacion[]).filter((item) => supervisorIds.includes(item.id)),
    error: fallback.error,
  }
}

export function resetRankingCache() {
  rankingCache.clear()
}

export function buildPublicRankingPanel(data: RankingPanelData): RankingPublicPanelData {
  return {
    scopeLabel: 'Muro publico de ranking',
    rangoEtiqueta: data.rangoEtiqueta,
    generatedAt: data.generatedAt,
    ventasDcs: data.ventasDcs.slice(0, 10).map((item) => ({
      posicion: item.posicion,
      colaboradora: sanitizeCollaboratorName(item.empleado),
      zona: item.zona,
      montoConfirmado: item.montoConfirmado,
      unidadesConfirmadas: item.unidadesConfirmadas,
      afiliacionesLove: item.afiliacionesLove,
    })),
    loveDcs: data.loveDcs.slice(0, 10).map((item) => ({
      posicion: item.posicion,
      colaboradora: sanitizeCollaboratorName(item.empleado),
      zona: item.zona,
      montoConfirmado: item.montoConfirmado,
      unidadesConfirmadas: item.unidadesConfirmadas,
      afiliacionesLove: item.afiliacionesLove,
    })),
    pdvs: data.pdvs.slice(0, 10).map((item) => ({
      posicion: item.posicion,
      pdv: sanitizePdvName(item.pdv),
      zona: item.zona,
      montoConfirmado: item.montoConfirmado,
      ventasConfirmadas: item.ventasConfirmadas,
    })),
  }
}

export async function obtenerPanelRanking(
  actor: ActorActual,
  supabase: SupabaseClient | RankingSupabaseClient,
  options: {
    periodo?: string
    corte?: string
    zona?: string
    supervisorId?: string
  } = {}
): Promise<RankingPanelData> {
  if (!isRoleAllowed(actor.puesto)) {
    return buildEmptyResponse(actor, {
      periodo: normalizePeriodo(options.periodo),
      corte: normalizeCorte(options.corte),
      zona: '',
      supervisorId: '',
    }, 'El actor actual no tiene acceso al modulo de ranking.')
  }

  const filters: RankingFilters = {
    periodo: normalizePeriodo(options.periodo),
    corte: normalizeCorte(options.corte),
    zona: normalizeFilterValue(options.zona),
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : normalizeFilterValue(options.supervisorId),
  }
  const range = buildWindowRange(filters.periodo, filters.corte)
  const scopeLabel = getScopeLabel(actor)
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId

  if (!actor.cuentaClienteId && !allowGlobalScope) {
    return buildEmptyResponse(actor, filters, 'El usuario no tiene cuenta operativa para consolidar rankings.')
  }

  const cacheKey = buildCacheKey(actor, filters)
  const cached = rankingCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  let ventasQuery = (supabase as RankingSupabaseClient)
    .from('venta')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_utc,
      total_unidades,
      total_monto,
      confirmada,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id, id_nomina, nombre_completo, puesto, zona, supervisor_empleado_id),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_utc', range.startDateTime)
    .lt('fecha_utc', range.endDateTimeExclusive)
    .order('fecha_utc', { ascending: false })

  let loveQuery = (supabase as RankingSupabaseClient)
    .from('love_isdin')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_utc,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id, id_nomina, nombre_completo, puesto, zona, supervisor_empleado_id),
      pdv:pdv_id(zona, nombre, clave_btl)
    `)
    .gte('fecha_utc', range.startDateTime)
    .lt('fecha_utc', range.endDateTimeExclusive)
    .order('fecha_utc', { ascending: false })

  let quotaQuery = (supabase as RankingSupabaseClient)
    .from('cuota_empleado_periodo')
    .select(`
      id,
      periodo_id,
      cuenta_cliente_id,
      empleado_id,
      cumplimiento_porcentaje,
      estado,
      cuenta_cliente:cuenta_cliente_id(nombre, identificador),
      empleado:empleado_id(id, id_nomina, nombre_completo, puesto, zona, supervisor_empleado_id),
      periodo:periodo_id(clave)
    `)
    .order('cumplimiento_porcentaje', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    ventasQuery = ventasQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
    loveQuery = loveQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
    quotaQuery = quotaQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const [ventasResult, loveResult, quotaResult] = await Promise.all([
    ventasQuery.limit(RANKING_QUERY_LIMIT),
    loveQuery.limit(RANKING_QUERY_LIMIT),
    quotaQuery.limit(RANKING_QUERY_LIMIT),
  ])

  if (ventasResult.error || loveResult.error || quotaResult.error) {
    return buildEmptyResponse(
      actor,
      filters,
      ventasResult.error?.message ?? loveResult.error?.message ?? quotaResult.error?.message ?? 'No fue posible consolidar el ranking operativo.'
    )
  }

  const ventas = ((ventasResult.data ?? []) as VentaRankingRow[]).filter((item) => item.confirmada)
  const love = (loveResult.data ?? []) as LoveRankingRow[]
  const quotas = ((quotaResult.data ?? []) as CuotaRankingRow[]).filter((item) => {
    const periodo = obtenerPrimero(item.periodo)?.clave ?? ''
    return periodo.startsWith(filters.periodo)
  })
  const loveTargetResult = await fetchLoveQuotaTargetRows(supabase as never, {
    accountId: allowGlobalScope ? null : actor.cuentaClienteId ?? null,
    dateFrom: range.startDate,
    dateTo: getInclusiveEndDate(range.endDateExclusive),
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
  })

  if (loveTargetResult.error) {
    return buildEmptyResponse(actor, filters, loveTargetResult.error)
  }

  const accountNameById = new Map<string, string>()
  for (const item of ventas) {
    const cuenta = obtenerPrimero(item.cuenta_cliente)
    if (cuenta?.nombre) {
      accountNameById.set(item.cuenta_cliente_id, cuenta.nombre)
    }
  }
  for (const item of love) {
    const cuenta = obtenerPrimero(item.cuenta_cliente)
    if (cuenta?.nombre) {
      accountNameById.set(item.cuenta_cliente_id, cuenta.nombre)
    }
  }
  for (const item of quotas) {
    const cuenta = obtenerPrimero(item.cuenta_cliente)
    if (cuenta?.nombre) {
      accountNameById.set(item.cuenta_cliente_id, cuenta.nombre)
    }
  }

  const supervisorIds = new Set<string>()
  for (const item of ventas) {
    const empleado = obtenerPrimero(item.empleado)
    if (empleado?.supervisor_empleado_id) {
      supervisorIds.add(empleado.supervisor_empleado_id)
    }
  }
  for (const item of love) {
    const empleado = obtenerPrimero(item.empleado)
    if (empleado?.supervisor_empleado_id) {
      supervisorIds.add(empleado.supervisor_empleado_id)
    }
  }
  for (const item of quotas) {
    const empleado = obtenerPrimero(item.empleado)
    if (empleado?.supervisor_empleado_id) {
      supervisorIds.add(empleado.supervisor_empleado_id)
    }
  }


  const supervisorsResult = await fetchSupervisors(supabase as RankingSupabaseClient, Array.from(supervisorIds))
  if (supervisorsResult.error) {
    return buildEmptyResponse(actor, filters, supervisorsResult.error.message)
  }

  const supervisorsById = new Map(supervisorsResult.data.map((item) => [item.id, item.nombre_completo] as const))
  const dcMap = new Map<string, DcAccumulator>()
  const supervisorMap = new Map<string, SupervisorAccumulator>()
  const zonaMap = new Map<string, ZonaAccumulator>()
  const quotaZonaMap = new Map<string, QuotaZonaAccumulator>()
  const pdvMap = new Map<string, PdvAccumulator>()

  const ensureDc = (empleadoId: string, empleado: EmpleadoRelacion | null, cuentaCliente: string | null, zona: string) => {
    const key = `${empleadoId}::${cuentaCliente ?? 'sin-cuenta'}`
    const current = dcMap.get(key) ?? {
      empleadoId,
      empleado: empleado?.nombre_completo ?? 'Sin colaborador',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente,
      zona,
      supervisorId: empleado?.supervisor_empleado_id ?? null,
      ventasConfirmadas: 0,
      unidadesConfirmadas: 0,
      montoConfirmado: 0,
      afiliacionesLove: 0,
      validasLove: 0,
      loveObjetivo: 0,
    }
    dcMap.set(key, current)
    return current
  }

  const ensureSupervisor = (supervisorId: string, supervisorNombre: string, cuentaCliente: string | null, zona: string) => {
    const key = `${supervisorId}::${cuentaCliente ?? 'sin-cuenta'}::${zona}`
    const current = supervisorMap.get(key) ?? {
      supervisorId,
      supervisorNombre,
      cuentaCliente,
      zona,
      dcsActivos: new Set<string>(),
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      afiliacionesLove: 0,
      loveObjetivo: 0,
    }
    supervisorMap.set(key, current)
    return current
  }

  const ensureZona = (zona: string, cuentaCliente: string | null) => {
    const key = `${zona}::${cuentaCliente ?? 'sin-cuenta'}`
    const current = zonaMap.get(key) ?? {
      zona,
      cuentaCliente,
      dcsActivos: new Set<string>(),
      supervisoresActivos: new Set<string>(),
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      afiliacionesLove: 0,
      loveObjetivo: 0,
    }
    zonaMap.set(key, current)
    return current
  }

  const ensureQuotaZona = (zona: string, cuentaCliente: string | null) => {
    const key = `${zona}::${cuentaCliente ?? 'sin-cuenta'}`
    const current = quotaZonaMap.get(key) ?? {
      zona,
      cuentaCliente,
      dcsActivos: new Set<string>(),
      supervisoresActivos: new Set<string>(),
      cuotasTotales: 0,
      cuotasCumplidas: 0,
      cuotasEnRiesgo: 0,
      cumplimientoTotal: 0,
    }
    quotaZonaMap.set(key, current)
    return current
  }

  const ensurePdv = (pdvId: string, pdv: PdvRelacion | null, cuentaCliente: string | null, zona: string) => {
    const key = `${pdvId}::${cuentaCliente ?? 'sin-cuenta'}`
    const current = pdvMap.get(key) ?? {
      pdvId,
      pdv: pdv?.nombre ?? 'PDV sin nombre',
      claveBtl: pdv?.clave_btl ?? null,
      zona,
      cuentaCliente,
      dcsActivos: new Set<string>(),
      ventasConfirmadas: 0,
      unidadesConfirmadas: 0,
      montoConfirmado: 0,
    }
    pdvMap.set(key, current)
    return current
  }

  const visibleVentas = ventas.filter((item) => {
    const empleado = obtenerPrimero(item.empleado)
    const pdv = obtenerPrimero(item.pdv)
    const zona = pdv?.zona ?? empleado?.zona ?? 'Sin zona'
    const supervisorId = empleado?.supervisor_empleado_id ?? null

    if (actor.puesto === 'SUPERVISOR' && supervisorId !== actor.empleadoId) {
      return false
    }

    return matchesFilters({ zona, supervisorId }, filters)
  })

  const visibleQuotas = quotas.filter((item) => {
    const empleado = obtenerPrimero(item.empleado)
    const zona = empleado?.zona ?? 'Sin zona'
    const supervisorId = empleado?.supervisor_empleado_id ?? null

    if (actor.puesto === 'SUPERVISOR' && supervisorId !== actor.empleadoId) {
      return false
    }

    return matchesFilters({ zona, supervisorId }, filters)
  })

  const visibleLove = love.filter((item) => {
    const empleado = obtenerPrimero(item.empleado)
    const pdv = obtenerPrimero(item.pdv)
    const zona = pdv?.zona ?? empleado?.zona ?? 'Sin zona'
    const supervisorId = empleado?.supervisor_empleado_id ?? null

    if (actor.puesto === 'SUPERVISOR' && supervisorId !== actor.empleadoId) {
      return false
    }

    return matchesFilters({ zona, supervisorId }, filters)
  })

  const visibleLoveTargets = loveTargetResult.data.filter((item) =>
    matchesFilters({ zona: item.zona, supervisorId: item.supervisorId }, filters)
  )

  for (const item of visibleVentas) {
    const empleado = obtenerPrimero(item.empleado)
    if (!empleado) {
      continue
    }

    const cuentaCliente = obtenerPrimero(item.cuenta_cliente)?.nombre ?? null
    const pdv = obtenerPrimero(item.pdv)
    const zona = pdv?.zona ?? empleado.zona ?? 'Sin zona'
    const dc = ensureDc(item.empleado_id, empleado, cuentaCliente, zona)
    dc.ventasConfirmadas += 1
    dc.unidadesConfirmadas += item.total_unidades
    dc.montoConfirmado += item.total_monto

    const zonaAccumulator = ensureZona(zona, cuentaCliente)
    zonaAccumulator.dcsActivos.add(item.empleado_id)
    zonaAccumulator.ventasConfirmadas += 1
    zonaAccumulator.montoConfirmado += item.total_monto

    if (item.pdv_id) {
      const pdvAccumulator = ensurePdv(item.pdv_id, pdv, cuentaCliente, zona)
      pdvAccumulator.dcsActivos.add(item.empleado_id)
      pdvAccumulator.ventasConfirmadas += 1
      pdvAccumulator.unidadesConfirmadas += item.total_unidades
      pdvAccumulator.montoConfirmado += item.total_monto
    }

    if (empleado.supervisor_empleado_id) {
      zonaAccumulator.supervisoresActivos.add(empleado.supervisor_empleado_id)
      const supervisorAccumulator = ensureSupervisor(
        empleado.supervisor_empleado_id,
        inferSupervisorName(empleado.supervisor_empleado_id, supervisorsById),
        cuentaCliente,
        zona
      )
      supervisorAccumulator.dcsActivos.add(item.empleado_id)
      supervisorAccumulator.ventasConfirmadas += 1
      supervisorAccumulator.montoConfirmado += item.total_monto
    }
  }

  for (const item of visibleLoveTargets) {
    const cuentaCliente = accountNameById.get(item.cuentaClienteId) ?? item.cuentaClienteId
    const empleado = {
      id: item.empleadoId,
      id_nomina: item.idNomina,
      nombre_completo: item.empleadoLabel,
      puesto: 'DERMOCONSEJERO',
      zona: item.zona,
      supervisor_empleado_id: item.supervisorId,
    } as EmpleadoRelacion
    const dc = ensureDc(item.empleadoId, empleado, cuentaCliente, item.zona)
    dc.loveObjetivo += item.objetivo

    const zonaAccumulator = ensureZona(item.zona, cuentaCliente)
    zonaAccumulator.dcsActivos.add(item.empleadoId)
    zonaAccumulator.loveObjetivo += item.objetivo

    if (item.supervisorId) {
      zonaAccumulator.supervisoresActivos.add(item.supervisorId)
      const supervisorAccumulator = ensureSupervisor(
        item.supervisorId,
        item.supervisorLabel,
        cuentaCliente,
        item.zona
      )
      supervisorAccumulator.dcsActivos.add(item.empleadoId)
      supervisorAccumulator.loveObjetivo += item.objetivo
    }
  }

  for (const item of visibleLove) {
    const empleado = obtenerPrimero(item.empleado)
    if (!empleado) {
      continue
    }

    const cuentaCliente = obtenerPrimero(item.cuenta_cliente)?.nombre ?? null
    const pdv = obtenerPrimero(item.pdv)
    const zona = pdv?.zona ?? empleado.zona ?? 'Sin zona'
    const dc = ensureDc(item.empleado_id, empleado, cuentaCliente, zona)
    dc.afiliacionesLove += 1
    if (item.estatus === 'VALIDA') {
      dc.validasLove += 1
    }

    const zonaAccumulator = ensureZona(zona, cuentaCliente)
    zonaAccumulator.dcsActivos.add(item.empleado_id)
    zonaAccumulator.afiliacionesLove += 1

    if (empleado.supervisor_empleado_id) {
      zonaAccumulator.supervisoresActivos.add(empleado.supervisor_empleado_id)
      const supervisorAccumulator = ensureSupervisor(
        empleado.supervisor_empleado_id,
        inferSupervisorName(empleado.supervisor_empleado_id, supervisorsById),
        cuentaCliente,
        zona
      )
      supervisorAccumulator.dcsActivos.add(item.empleado_id)
      supervisorAccumulator.afiliacionesLove += 1
    }
  }

  for (const item of visibleQuotas) {
    const empleado = obtenerPrimero(item.empleado)
    if (!empleado) {
      continue
    }

    const cuentaCliente = obtenerPrimero(item.cuenta_cliente)?.nombre ?? null
    const zona = empleado.zona ?? 'Sin zona'
    const quotaZona = ensureQuotaZona(zona, cuentaCliente)
    quotaZona.dcsActivos.add(item.empleado_id)
    quotaZona.cuotasTotales += 1
    quotaZona.cumplimientoTotal += item.cumplimiento_porcentaje

    if (item.estado === 'CUMPLIDA') {
      quotaZona.cuotasCumplidas += 1
    }

    if (item.estado === 'RIESGO' || item.cumplimiento_porcentaje < 70) {
      quotaZona.cuotasEnRiesgo += 1
    }

    if (empleado.supervisor_empleado_id) {
      quotaZona.supervisoresActivos.add(empleado.supervisor_empleado_id)
    }
  }

  const zonasDisponibles = Array.from(new Set([
    ...visibleVentas.map((item) => obtenerPrimero(item.pdv)?.zona ?? obtenerPrimero(item.empleado)?.zona ?? 'Sin zona'),
    ...visibleLove.map((item) => obtenerPrimero(item.pdv)?.zona ?? obtenerPrimero(item.empleado)?.zona ?? 'Sin zona'),
    ...visibleQuotas.map((item) => obtenerPrimero(item.empleado)?.zona ?? 'Sin zona'),
  ])).sort((left, right) => left.localeCompare(right, 'es'))

  const supervisoresDisponibles = Array.from(new Map(
    Array.from(supervisorMap.values()).map((item) => [item.supervisorId, { id: item.supervisorId, nombre: item.supervisorNombre }])
  ).values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))

  const ventasDcs = Array.from(dcMap.values())
    .filter((item) => item.ventasConfirmadas > 0)
    .sort(compareVentas)
    .map((item, index) => makeDcItem(item, index + 1, actor, supervisorsById))

  const loveDcs = Array.from(dcMap.values())
    .filter((item) => item.afiliacionesLove > 0 || item.loveObjetivo > 0)
    .sort(compareLove)
    .map((item, index) => makeDcItem(item, index + 1, actor, supervisorsById))

  const supervisorItems = Array.from(supervisorMap.values())
    .sort(compareSupervisor)
    .map((item, index) => ({
      posicion: index + 1,
      supervisorId: item.supervisorId,
      supervisorNombre: item.supervisorNombre,
      cuentaCliente: item.cuentaCliente,
      zona: item.zona,
      dcsActivos: item.dcsActivos.size,
      ventasConfirmadas: item.ventasConfirmadas,
      montoConfirmado: round(item.montoConfirmado),
      afiliacionesLove: item.afiliacionesLove,
      loveObjetivo: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).objetivo,
      lovePendiente: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).restante,
      cumplimientoLovePct: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).cumplimientoPct,
      scoreMixto: round(item.montoConfirmado + item.afiliacionesLove * 100),
      esActorActual: item.supervisorId === actor.empleadoId,
    }))

  const zonaItems = Array.from(zonaMap.values())
    .sort(compareZona)
    .map((item, index) => ({
      posicion: index + 1,
      zona: item.zona,
      cuentaCliente: item.cuentaCliente,
      dcsActivos: item.dcsActivos.size,
      supervisoresActivos: item.supervisoresActivos.size,
      ventasConfirmadas: item.ventasConfirmadas,
      montoConfirmado: round(item.montoConfirmado),
      afiliacionesLove: item.afiliacionesLove,
      loveObjetivo: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).objetivo,
      lovePendiente: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).restante,
      cumplimientoLovePct: computeLoveQuotaProgress(item.afiliacionesLove, item.loveObjetivo).cumplimientoPct,
      scoreMixto: round(item.montoConfirmado + item.afiliacionesLove * 100),
    }))

  const cuotasZonas = Array.from(quotaZonaMap.values())
    .sort(compareQuotaZona)
    .map((item, index) => ({
      posicion: index + 1,
      zona: item.zona,
      cuentaCliente: item.cuentaCliente,
      dcsActivos: item.dcsActivos.size,
      supervisoresActivos: item.supervisoresActivos.size,
      cuotasTotales: item.cuotasTotales,
      cuotasCumplidas: item.cuotasCumplidas,
      cuotasEnRiesgo: item.cuotasEnRiesgo,
      cumplimientoPromedio: item.cuotasTotales === 0 ? 0 : round(item.cumplimientoTotal / item.cuotasTotales),
    }))

  const pdvItems = Array.from(pdvMap.values())
    .sort(comparePdv)
    .map((item, index) => ({
      posicion: index + 1,
      pdvId: item.pdvId,
      pdv: item.pdv,
      claveBtl: item.claveBtl,
      zona: item.zona,
      cuentaCliente: item.cuentaCliente,
      dcsActivos: item.dcsActivos.size,
      ventasConfirmadas: item.ventasConfirmadas,
      unidadesConfirmadas: item.unidadesConfirmadas,
      montoConfirmado: round(item.montoConfirmado),
      scoreVentas: round(item.montoConfirmado + item.unidadesConfirmadas * 10),
    }))

  const result: RankingPanelData = {
    filtros: filters,
    opcionesFiltro: {
      zonas: zonasDisponibles,
      supervisores: supervisoresDisponibles,
    },
    scopeLabel,
    rangoEtiqueta: range.label,
    resumen: {
      totalDcs: dcMap.size,
      totalSupervisores: supervisorItems.length,
      totalZonas: zonaItems.length,
      totalPdvs: pdvItems.length,
      miPosicionVentas: ventasDcs.find((item) => item.esActorActual)?.posicion ?? null,
      miPosicionLove: loveDcs.find((item) => item.esActorActual)?.posicion ?? null,
    },
    ventasDcs,
    loveDcs,
    supervisores: supervisorItems,
    zonas: zonaItems,
    cuotasZonas,
    pdvs: pdvItems,
    generatedAt: new Date().toISOString(),
    infraestructuraLista: true,
  }

  rankingCache.set(cacheKey, {
    expiresAt: Date.now() + RANKING_CACHE_TTL_MS,
    result,
  })

  return result
}
