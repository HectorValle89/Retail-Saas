import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'

const DASHBOARD_REFRESH_MAX_AGE_MS = 5 * 60 * 1000
const DASHBOARD_LIVE_ALERT_LIMIT = 8
const DASHBOARD_LIVE_QUERY_LIMIT = 250
const DASHBOARD_GEOFENCE_LIMIT = 500

interface DashboardQueryResult {
  data: unknown[] | null
  error: { message: string } | null
}

interface DashboardRpcResult {
  error: { message: string } | null
}

interface DashboardQueryBuilder {
  select(columns: string): DashboardQueryBuilder
  eq(column: string, value: string): DashboardQueryBuilder
  order(column: string, options?: { ascending?: boolean }): DashboardQueryBuilder
  limit(count: number): Promise<DashboardQueryResult>
}

interface DashboardSupabaseClient {
  from(table: 'dashboard_kpis' | 'asistencia' | 'geocerca_pdv'): DashboardQueryBuilder
  rpc(fn: 'refresh_dashboard_kpis'): Promise<DashboardRpcResult>
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
  supervisor_empleado_id: string | null
  empleado_nombre: string
  pdv_id: string
  pdv_clave_btl: string
  pdv_nombre: string
  fecha_operacion: string
  check_in_utc: string | null
  check_out_utc: string | null
  distancia_check_in_metros: number | null
  estado_gps: string
  estatus: string
}

interface DashboardGeocercaRow {
  pdv_id: string
  radio_tolerancia_metros: number | null
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
  cuentaClienteId: string
  pdvId: string
  pdv: string
  pdvClaveBtl: string
  empleado: string
  fechaOperacion: string
  radioToleranciaMetros: number
  motivo: string
  estadoGps: string
  distanciaCheckInMetros: number | null
}

export interface DashboardPanelData {
  stats: DashboardStats
  clientes: DashboardClienteItem[]
  tendenciaSemana: DashboardTrendItem[]
  tendenciaMes: DashboardTrendItem[]
  alertasLive: DashboardLiveAlertItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  refreshedAt: string | null
  scopeLabel: string
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
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100
}

function buildEmptyDashboard(scopeLabel: string, mensajeInfraestructura?: string): DashboardPanelData {
  return {
    stats: EMPTY_STATS,
    clientes: [],
    tendenciaSemana: [],
    tendenciaMes: [],
    alertasLive: [],
    infraestructuraLista: !mensajeInfraestructura,
    mensajeInfraestructura,
    refreshedAt: null,
    scopeLabel,
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

async function fetchDashboardRows(
  supabase: DashboardSupabaseClient,
  cuentaClienteId: string | null
) {
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

async function fetchFreshDashboardRows(
  supabase: DashboardSupabaseClient,
  cuentaClienteId: string | null
) {
  const initial = await fetchDashboardRows(supabase, cuentaClienteId)

  if (initial.error) {
    return initial
  }

  const latestRefreshedAt = getLatestRefreshedAt(initial.data)
  const shouldRefresh =
    initial.data.length === 0 ||
    !latestRefreshedAt ||
    Date.now() - Date.parse(latestRefreshedAt) > DASHBOARD_REFRESH_MAX_AGE_MS

  if (!shouldRefresh) {
    return initial
  }

  const refreshResult = await supabase.rpc('refresh_dashboard_kpis')

  if (refreshResult.error) {
    return {
      data: initial.data,
      error: refreshResult.error,
    }
  }

  return fetchDashboardRows(supabase, cuentaClienteId)
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
      supervisor_empleado_id,
      empleado_nombre,
      pdv_id,
      pdv_clave_btl,
      pdv_nombre,
      fecha_operacion,
      check_in_utc,
      check_out_utc,
      distancia_check_in_metros,
      estado_gps,
      estatus
    `)
    .order('fecha_operacion', { ascending: false })

  if (!allowGlobalScope && actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  if (actor.puesto === 'SUPERVISOR') {
    query = query.eq('supervisor_empleado_id', actor.empleadoId)
  }

  const result = await query.limit(DASHBOARD_LIVE_QUERY_LIMIT)
  const data = ((result.data ?? []) as DashboardLiveAsistenciaRow[])
    .filter((item) => (allowGlobalScope ? true : item.cuenta_cliente_id === actor.cuentaClienteId))
    .filter((item) => (actor.puesto === 'SUPERVISOR' ? item.supervisor_empleado_id === actor.empleadoId : true))

  return {
    data,
    error: result.error,
  }
}

async function fetchGeocercas(supabase: DashboardSupabaseClient) {
  const result = await supabase
    .from('geocerca_pdv')
    .select('pdv_id, radio_tolerancia_metros')
    .limit(DASHBOARD_GEOFENCE_LIMIT)

  return {
    data: (result.data ?? []) as DashboardGeocercaRow[],
    error: result.error,
  }
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
  geocercas: DashboardGeocercaRow[]
) {
  const today = new Date().toISOString().slice(0, 10)
  const geocercaByPdv = new Map(
    geocercas.map((item) => [item.pdv_id, item.radio_tolerancia_metros] as const)
  )

  return asistencias
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
    .filter((item): item is DashboardLiveAlertItem => Boolean(item))
    .sort((left, right) => {
      const leftDeviation = left.radioToleranciaMetros < 50 ? 50 - left.radioToleranciaMetros : left.radioToleranciaMetros - 300
      const rightDeviation = right.radioToleranciaMetros < 50 ? 50 - right.radioToleranciaMetros : right.radioToleranciaMetros - 300
      return rightDeviation - leftDeviation
    })
    .slice(0, DASHBOARD_LIVE_ALERT_LIMIT)
}

export async function obtenerPanelDashboard(
  actor: ActorActual,
  customSupabase?: DashboardSupabaseClient
): Promise<DashboardPanelData> {
  const scopeLabel = getScopeLabel(actor)
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId

  if (!actor.cuentaClienteId && !allowGlobalScope) {
    return buildEmptyDashboard(
      scopeLabel,
      'El usuario no tiene `cuenta_cliente_id` operativa para consolidar indicadores.'
    )
  }

  let supabase: DashboardSupabaseClient

  try {
    supabase = customSupabase ?? (createServiceClient() as unknown as DashboardSupabaseClient)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear el cliente admin.'
    return buildEmptyDashboard(scopeLabel, message)
  }

  const [dashboardResult, liveAsistenciasResult, geocercasResult] = await Promise.all([
    fetchFreshDashboardRows(supabase, allowGlobalScope ? null : actor.cuentaClienteId),
    fetchLiveAssistances(supabase, actor, allowGlobalScope),
    fetchGeocercas(supabase),
  ])

  if (dashboardResult.error) {
    return buildEmptyDashboard(
      scopeLabel,
      dashboardResult.error.message ?? 'No fue posible consultar `dashboard_kpis`.'
    )
  }

  const alertasLive =
    liveAsistenciasResult.error || geocercasResult.error
      ? []
      : buildLiveAlerts(liveAsistenciasResult.data, geocercasResult.data)

  if (dashboardResult.data.length === 0) {
    return {
      ...buildEmptyDashboard(scopeLabel),
      infraestructuraLista: true,
      alertasLive,
    }
  }

  const latestDate = dashboardResult.data.reduce((current, row) => {
    if (!current || row.fecha_corte > current) {
      return row.fecha_corte
    }

    return current
  }, '')
  const latestRows = dashboardResult.data.filter((row) => row.fecha_corte === latestDate)
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

  const tendenciaMes = aggregateTrend(dashboardResult.data)
  const tendenciaSemana = tendenciaMes.slice(-7)

  return {
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
    tendenciaSemana,
    tendenciaMes,
    alertasLive,
    infraestructuraLista: true,
    refreshedAt: getLatestRefreshedAt(dashboardResult.data),
    scopeLabel:
      latestRows.length === 1
        ? latestRows[0].cuenta_cliente
        : scopeLabel,
  }
}