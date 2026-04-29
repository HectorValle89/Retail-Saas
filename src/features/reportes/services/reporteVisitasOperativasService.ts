import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { buildModuleCacheTags } from '@/lib/cache/moduleTags'
import { createServiceClient } from '@/lib/supabase/server'
import type { Empleado, RutaSemanal, RutaSemanalVisita } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type RutaSupervisorRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>

type RutaVisitasOperativasRow = Pick<RutaSemanal, 'id' | 'cuenta_cliente_id' | 'supervisor_empleado_id' | 'semana_inicio' | 'estatus'> & {
  supervisor: MaybeMany<RutaSupervisorRelacion>
}

type RutaVisitaOperativaRow = Pick<RutaSemanalVisita, 'ruta_semanal_id' | 'estatus'>

export interface VisitasOperativasRankingItem {
  supervisorEmpleadoId: string
  supervisor: string
  idNomina: string | null
  puesto: string | null
  rutas: number
  visitasAsignadas: number
  visitasCompletadas: number
  visitasPendientes: number
  visitasCanceladas: number
  cumplimientoPct: number
}

export interface VisitasOperativasRankingResumen {
  supervisores: number
  rutas: number
  visitasAsignadas: number
  visitasCompletadas: number
  visitasPendientes: number
  visitasCanceladas: number
  cumplimientoPromedio: number
}

export interface VisitasOperativasRankingData {
  periodo: string
  top: number
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  resumen: VisitasOperativasRankingResumen
  items: VisitasOperativasRankingItem[]
}

interface RankingQueryRoute {
  routeId: string
  supervisorEmpleadoId: string
  supervisor: string
  idNomina: string | null
  puesto: string | null
  estatus: string
}

interface RankingQueryVisit {
  ruta_semanal_id: string
  estatus: string
}

interface ObtenerRankingVisitasOperativasOptions {
  periodo?: string
  top?: number
}

const VISITAS_REPORTE_REVALIDATE_SECONDS = 60

function getDefaultPeriod() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function normalizeTop(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 10
  }

  return Math.min(50, Math.max(5, Math.floor(value)))
}

export function buildMonthRange(periodo?: string) {
  const base = periodo ?? getDefaultPeriod()
  const [yearRaw, monthRaw] = base.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!year || !month || month < 1 || month > 12) {
    return buildMonthRange(getDefaultPeriod())
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0))

  return {
    periodo: `${year}-${String(month).padStart(2, '0')}`,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  }
}

function buildEmptyResponse(periodo: string, top: number, message?: string): VisitasOperativasRankingData {
  return {
    periodo,
    top,
    infraestructuraLista: message == null,
    mensajeInfraestructura: message,
    resumen: {
      supervisores: 0,
      rutas: 0,
      visitasAsignadas: 0,
      visitasCompletadas: 0,
      visitasPendientes: 0,
      visitasCanceladas: 0,
      cumplimientoPromedio: 0,
    },
    items: [],
  }
}

function buildCacheKey(actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>, options: ObtenerRankingVisitasOperativasOptions) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    periodo: options.periodo ?? null,
    top: normalizeTop(options.top),
  })
}

function buildCacheTags(actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>, options: ObtenerRankingVisitasOperativasOptions) {
  return buildModuleCacheTags({
    module: 'reportes',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
    period: options.periodo ?? null,
  })
}

export function buildVisitasOperativasRanking(
  routesRaw: RankingQueryRoute[],
  visitsRaw: RankingQueryVisit[],
  options: { periodo: string; top: number }
): VisitasOperativasRankingData {
  const visitCountsByRoute = new Map<string, { assigned: number; completed: number; pending: number; canceled: number }>()

  for (const visit of visitsRaw) {
    const current = visitCountsByRoute.get(visit.ruta_semanal_id) ?? {
      assigned: 0,
      completed: 0,
      pending: 0,
      canceled: 0,
    }

    if (visit.estatus === 'CANCELADA') {
      current.canceled += 1
    } else {
      current.assigned += 1
      if (visit.estatus === 'COMPLETADA') {
        current.completed += 1
      } else {
        current.pending += 1
      }
    }

    visitCountsByRoute.set(visit.ruta_semanal_id, current)
  }

  const rankingBySupervisor = new Map<string, VisitasOperativasRankingItem>()

  for (const route of routesRaw) {
    if (route.estatus === 'BORRADOR') {
      continue
    }

    const supervisorKey = route.supervisorEmpleadoId
    const current = rankingBySupervisor.get(supervisorKey) ?? {
      supervisorEmpleadoId: supervisorKey,
      supervisor: route.supervisor,
      idNomina: route.idNomina,
      puesto: route.puesto,
      rutas: 0,
      visitasAsignadas: 0,
      visitasCompletadas: 0,
      visitasPendientes: 0,
      visitasCanceladas: 0,
      cumplimientoPct: 0,
    }

    if (current.supervisor === 'Sin supervisor' && route.supervisor !== 'Sin supervisor') {
      current.supervisor = route.supervisor
    }
    if (current.idNomina == null && route.idNomina != null) {
      current.idNomina = route.idNomina
    }
    if (current.puesto == null && route.puesto != null) {
      current.puesto = route.puesto
    }

    current.rutas += 1
    const routeCounts = visitCountsByRoute.get(route.routeId)
    if (routeCounts) {
      current.visitasAsignadas += routeCounts.assigned
      current.visitasCompletadas += routeCounts.completed
      current.visitasPendientes += routeCounts.pending
      current.visitasCanceladas += routeCounts.canceled
    }

    rankingBySupervisor.set(supervisorKey, current)
  }

  const items = Array.from(rankingBySupervisor.values())
    .map((item) => {
      const cumplimientoPct =
        item.visitasAsignadas > 0 ? Math.min(100, (item.visitasCompletadas / item.visitasAsignadas) * 100) : 0

      return {
        ...item,
        cumplimientoPct,
      }
    })
    .sort((left, right) => {
      if (right.cumplimientoPct !== left.cumplimientoPct) {
        return right.cumplimientoPct - left.cumplimientoPct
      }

      if (right.visitasCompletadas !== left.visitasCompletadas) {
        return right.visitasCompletadas - left.visitasCompletadas
      }

      if (left.visitasPendientes !== right.visitasPendientes) {
        return left.visitasPendientes - right.visitasPendientes
      }

      return left.supervisor.localeCompare(right.supervisor, 'es-MX')
    })
    .slice(0, options.top)

  const resumen = items.reduce<VisitasOperativasRankingResumen>(
    (acc, item) => {
      acc.supervisores += 1
      acc.rutas += item.rutas
      acc.visitasAsignadas += item.visitasAsignadas
      acc.visitasCompletadas += item.visitasCompletadas
      acc.visitasPendientes += item.visitasPendientes
      acc.visitasCanceladas += item.visitasCanceladas
      acc.cumplimientoPromedio += item.cumplimientoPct
      return acc
    },
    {
      supervisores: 0,
      rutas: 0,
      visitasAsignadas: 0,
      visitasCompletadas: 0,
      visitasPendientes: 0,
      visitasCanceladas: 0,
      cumplimientoPromedio: 0,
    }
  )

  if (items.length > 0) {
    resumen.cumplimientoPromedio = resumen.cumplimientoPromedio / items.length
  }

  return {
    periodo: options.periodo,
    top: options.top,
    infraestructuraLista: true,
    resumen,
    items,
  }
}

async function obtenerRankingVisitasOperativasUncached(
  actor: ActorActual,
  supabase: SupabaseClient,
  options: ObtenerRankingVisitasOperativasOptions = {}
): Promise<VisitasOperativasRankingData> {
  const range = buildMonthRange(options.periodo)
  const top = normalizeTop(options.top)

  let routesQuery = supabase
    .from('ruta_semanal')
    .select(`
      id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      semana_inicio,
      estatus,
      supervisor:supervisor_empleado_id(id_nomina, nombre_completo, puesto)
    `)
    .gte('semana_inicio', range.startDate)
    .lt('semana_inicio', range.endDateExclusive)
    .order('semana_inicio', { ascending: true })
    .limit(600)

  if (actor.cuentaClienteId) {
    routesQuery = routesQuery.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  const { data: routesData, error: routesError } = await routesQuery
  if (routesError) {
    return buildEmptyResponse(range.periodo, top, routesError.message)
  }

  const routesRaw = (routesData ?? []) as RutaVisitasOperativasRow[]
  const routeIds = routesRaw.map((item) => item.id)

  const visitsResult =
    routeIds.length === 0
      ? { data: [] as RutaVisitaOperativaRow[], error: null }
      : await supabase
          .from('ruta_semanal_visita')
          .select('ruta_semanal_id, estatus')
          .in('ruta_semanal_id', routeIds)
          .limit(4000)

  if (visitsResult.error) {
    return buildEmptyResponse(range.periodo, top, visitsResult.error.message)
  }

  return buildVisitasOperativasRanking(
    routesRaw.map((route) => {
      const supervisor = Array.isArray(route.supervisor) ? route.supervisor[0] ?? null : route.supervisor
      return {
        routeId: route.id,
        supervisorEmpleadoId: route.supervisor_empleado_id,
        supervisor: supervisor?.nombre_completo ?? 'Sin supervisor',
        idNomina: supervisor?.id_nomina ?? null,
        puesto: supervisor?.puesto ?? null,
        estatus: route.estatus,
      }
    }),
    (visitsResult.data ?? []) as RutaVisitaOperativaRow[],
    {
      periodo: range.periodo,
      top,
    }
  )
}

export async function obtenerRankingVisitasOperativas(
  actor: ActorActual,
  options: ObtenerRankingVisitasOperativasOptions = {},
  customSupabase?: SupabaseClient
): Promise<VisitasOperativasRankingData> {
  if (customSupabase) {
    return obtenerRankingVisitasOperativasUncached(actor, customSupabase, options)
  }

  const cacheKey = buildCacheKey(actor, options)

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient
      return obtenerRankingVisitasOperativasUncached(actor, service, options)
    },
    ['reportes:visitas-operativas', cacheKey],
    {
      tags: buildCacheTags(actor, options),
      revalidate: VISITAS_REPORTE_REVALIDATE_SECONDS,
    }
  )()
}
