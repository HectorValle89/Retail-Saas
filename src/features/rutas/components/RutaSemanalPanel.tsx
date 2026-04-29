'use client'

import { startTransition, useActionState, useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap'
import { ModalPanel } from '@/components/ui/modal-panel'
import { PremiumLineIcon } from '@/components/ui/premium-icons'
import { Select } from '@/components/ui/select'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import {
  calcularHashArchivo,
  captureAttendancePosition,
  stampAttendanceSelfie,
  type AttendanceGpsState,
  type CapturedPosition,
} from '@/features/asistencias/lib/attendanceCapture'
import type { ActorActual } from '@/lib/auth/session'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { useScopedWidgetData } from '@/lib/ui-change/client'
import { getUiChangeScopeKeysForActor, type UiChangeVersionRow } from '@/lib/ui-change/types'
import {
  actualizarControlRutaSemanal,
  guardarPlaneacionRutaSemanalCanvas,
  registrarEvidenciaEventoAgendaRutaSemanal,
  registrarEventoAgendaRutaSemanal,
  registrarInicioVisitaRutaSemanal,
  registrarSalidaVisitaRutaSemanal,
  resolverEventoAgendaRutaSemanal,
  resolverSolicitudCambioRutaSemanal,
  solicitarCambioRutaSemanal,
} from '../actions'
import { SupervisorTodayRouteSheet } from './SupervisorTodayRouteSheet'
import {
  getWeekStartIso,
  getWeekDayLabel,
  getWeekEndIso,
  normalizeWeekStart,
  WEEK_DAY_OPTIONS,
} from '../lib/weeklyRoute'
import {
  getCoordinatorInitialWeekStart,
  getCurrentOrFutureRoutes,
  getPlanningRouteForWeek,
  isApprovedOperationalRoute,
} from '../lib/routeWorkspace'
import type { RutaApprovalState } from '../lib/routeWorkflow'
import { ESTADO_RUTA_INICIAL } from '../state'
import type {
  RutaAgendaEventoItem,
  RutaAgendaOperativaDia,
  RutaExceptionItem,
  RutaPendienteReposicionItem,
  RutaQuotaProgressItem,
  RutaSemanalItem,
  RutaSemanalPanelData,
  RutaSemanalVisitItem,
  RutaSupervisorWarRoomItem,
} from '../services/rutaSemanalService'

type WarRoomTab = 'quotas' | 'routes' | 'coverage' | 'reach'
type SupervisorRouteTab = 'agenda' | 'planning' | 'corrections' | 'history'
type CoordinatorKanbanColumnKey = 'ENVIADAS' | 'AJUSTES' | 'PUBLICADAS' | 'CERRADAS'

type UnifiedDayEditorMode = 'CHANGE' | 'EVENT'

function scheduleEffectStateUpdate(update: () => void) {
  let cancelled = false
  const run = () => {
    if (!cancelled) {
      startTransition(update)
    }
  }

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run)
    return () => {
      cancelled = true
    }
  }

  const timeoutId = window.setTimeout(run, 0)
  return () => {
    cancelled = true
    window.clearTimeout(timeoutId)
  }
}

interface AgendaEventEvidenceDraft {
  file: File
  previewUrl: string
  hash: string
  capturedAt: string
  position: CapturedPosition
  gpsState: AttendanceGpsState
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Pendiente'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function addDaysToWeek(weekStart: string, diaSemana: number) {
  const date = new Date(`${weekStart}T12:00:00`)
  date.setUTCDate(date.getUTCDate() + (diaSemana - 1))
  return date.toISOString().slice(0, 10)
}

function shiftWeekStart(weekStart: string, weeks: number) {
  const date = new Date(`${weekStart}T12:00:00`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return normalizeWeekStart(date.toISOString().slice(0, 10))
}

function getRouteTone(estatus: RutaSemanalItem['estatus']) {
  if (estatus === 'CERRADA') return 'bg-emerald-100 text-emerald-700'
  if (estatus === 'EN_PROGRESO') return 'bg-sky-100 text-sky-700'
  if (estatus === 'PUBLICADA') return 'bg-violet-100 text-violet-700'
  return 'bg-slate-100 text-slate-700'
}

function getVisitTone(estatus: RutaSemanalVisitItem['estatus']) {
  if (estatus === 'COMPLETADA') return 'bg-emerald-100 text-emerald-700'
  if (estatus === 'CANCELADA') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function getSemaforoTone(semaforo: RutaSupervisorWarRoomItem['semaforo']) {
  if (semaforo === 'OK') return 'bg-emerald-100 text-emerald-700'
  if (semaforo === 'RIESGO') return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}

function getExceptionTone(tone: RutaExceptionItem['tone']) {
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-900'
  if (tone === 'sky') return 'border-sky-200 bg-sky-50 text-sky-900'
  return 'border-amber-200 bg-amber-50 text-amber-900'
}

function normalizeFilterText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

let routeDraftIdSequence = 0

function createRouteDraftClientId(prefix: string) {
  const randomUuid = globalThis.crypto?.randomUUID?.()

  if (randomUuid) {
    return `${prefix}-${randomUuid}`
  }

  routeDraftIdSequence += 1
  return `${prefix}-${Date.now()}-${routeDraftIdSequence}-${Math.random().toString(36).slice(2, 10)}`
}

function getWorkloadLabel(route: RutaSemanalItem) {
  const pending = route.totalVisitas - route.visitasCompletadas
  const spread = new Set(route.visitas.map((visit) => visit.diaSemana)).size
  if (route.totalVisitas >= 10 && spread <= 3) return 'Riesgo logistico'
  if (route.totalVisitas <= 2) return 'Tiempos muertos'
  if (pending > 0 && route.estatus === 'PUBLICADA') return 'Lista para salir'
  return 'Balanceada'
}

function getRouteChangeTypeLabel(type: RutaSemanalItem['changeRequestType']) {
  if (type === 'CANCELACION_DIA') return 'Cancelacion del dia'
  if (type === 'CAMBIO_TIENDA') return 'Cambio de tienda en ruta'
  return 'Cambio de tiendas del dia'
}

function getAgendaApprovalTone(state: RutaAgendaEventoItem['estatusAprobacion']) {
  if (state === 'APROBADO' || state === 'NO_REQUIERE') return 'bg-emerald-100 text-emerald-700'
  if (state === 'RECHAZADO') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-800'
}

function getAgendaExecutionTone(state: RutaAgendaEventoItem['estatusEjecucion']) {
  if (state === 'COMPLETADO') return 'bg-emerald-100 text-emerald-700'
  if (state === 'EN_CURSO') return 'bg-sky-100 text-sky-700'
  if (state === 'CANCELADO') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function getCoordinatorKanbanColumn(route: RutaSemanalItem): CoordinatorKanbanColumnKey {
  if (route.estatus === 'CERRADA') {
    return 'CERRADAS'
  }

  if (route.approvalState === 'APROBADA' && route.estatus !== 'BORRADOR') {
    return 'PUBLICADAS'
  }

  if (route.approvalState === 'CAMBIOS_SOLICITADOS') {
    return 'AJUSTES'
  }

  return 'ENVIADAS'
}

function getCoordinatorKanbanColumnLabel(column: CoordinatorKanbanColumnKey) {
  if (column === 'ENVIADAS') return 'Enviadas'
  if (column === 'AJUSTES') return 'Rechazadas / cambios'
  if (column === 'PUBLICADAS') return 'Aprobadas'
  return 'Cerradas'
}

function getCoordinatorApprovalStateForColumn(
  column: CoordinatorKanbanColumnKey
): RutaApprovalState | null {
  if (column === 'ENVIADAS') return 'PENDIENTE_COORDINACION'
  if (column === 'AJUSTES') return 'CAMBIOS_SOLICITADOS'
  if (column === 'PUBLICADAS') return 'APROBADA'
  return null
}

function getProgressBarWidth(value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
  return `${Math.max(normalized > 0 ? 8 : 0, normalized)}%`
}

function metricValueClass(value: string) {
  return value.length >= 12 ? 'text-lg sm:text-xl' : 'text-2xl'
}

function normalizeWarRoomTab(value: WarRoomTab | SupervisorRouteTab | undefined): WarRoomTab {
  return value === 'routes' || value === 'coverage' || value === 'quotas' || value === 'reach'
    ? value
    : 'quotas'
}

function normalizeSupervisorRouteTab(
  value: WarRoomTab | SupervisorRouteTab | undefined
): SupervisorRouteTab {
  return value === 'agenda' || value === 'planning' || value === 'corrections' || value === 'history'
    ? value
    : 'agenda'
}

export function RutaSemanalPanel({
  actor,
  data: initialData,
  actorPuesto,
  initialTab = 'quotas',
  hideSupervisorTabs = false,
}: {
  actor: ActorActual
  data: RutaSemanalPanelData
  actorPuesto: string
  initialTab?: WarRoomTab | SupervisorRouteTab
  hideSupervisorTabs?: boolean
}) {
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor])
  const fetcher = useCallback(async (signal: AbortSignal, _change: UiChangeVersionRow) => {
    void _change

    const response = await fetch('/api/ruta-semanal/panel', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    })
    const payload = (await response.json()) as { data?: RutaSemanalPanelData; message?: string }

    if (!response.ok || !payload.data) {
      throw new Error(payload.message ?? 'No fue posible refrescar la ruta semanal.')
    }

    return payload.data
  }, [])

  const { data } = useScopedWidgetData({
    initialData,
    module: 'ruta-semanal',
    surfaces: ['panel'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 5000,
    refreshOnMount: false,
  })

  if (actorPuesto === 'COORDINADOR' || actorPuesto === 'ADMINISTRADOR') {
    return (
      <CoordinatorWarRoom
        data={data}
        actorPuesto={actorPuesto}
        initialTab={normalizeWarRoomTab(initialTab)}
      />
    )
  }

  return (
    <SupervisorRouteOperations
      data={data}
      actorPuesto={actorPuesto}
      initialTab={normalizeSupervisorRouteTab(initialTab)}
      hideTabs={hideSupervisorTabs}
    />
  )
}

function CoordinatorWarRoom({
  data,
  actorPuesto,
  initialTab,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
  initialTab: WarRoomTab
}) {
  const minimumVisibleWeekStart = normalizeWeekStart(data.semanaActualInicio)
  const visibleCoordinatorRoutes = useMemo(
    () => getCurrentOrFutureRoutes(data.rutas, minimumVisibleWeekStart),
    [data.rutas, minimumVisibleWeekStart]
  )
  const coordinatorDefaultWeekStart = useMemo(
    () => getCoordinatorInitialWeekStart(visibleCoordinatorRoutes, minimumVisibleWeekStart),
    [visibleCoordinatorRoutes, minimumVisibleWeekStart]
  )
  const [activeTab, setActiveTab] = useState<WarRoomTab>(initialTab)
  const [quotaFilters, setQuotaFilters] = useState({
    supervisorEmpleadoId: data.warRoom.supervisors[0]?.supervisorEmpleadoId ?? '',
    cadena: 'TODAS',
    storeType: 'TODOS',
  })
  const [appliedQuotaFilters, setAppliedQuotaFilters] = useState({
    supervisorEmpleadoId: '',
    cadena: 'TODAS',
    storeType: 'TODOS',
    applied: false,
  })
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(coordinatorDefaultWeekStart)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedCoverageSupervisorId, setSelectedCoverageSupervisorId] = useState<string>(
    data.warRoom.supervisors[0]?.supervisorEmpleadoId ?? ''
  )
  const [expandedCoverageRouteId, setExpandedCoverageRouteId] = useState<string | null>(null)
  const [selectedCoverageDayNumber, setSelectedCoverageDayNumber] = useState<number | null>(null)
  const [selectedCoverageVisitId, setSelectedCoverageVisitId] = useState<string | null>(null)
  const [selectedReachSupervisorId, setSelectedReachSupervisorId] = useState<string>('')
  const [quotaOverridesBySupervisor, setQuotaOverridesBySupervisor] = useState<
    Record<string, Record<string, number>>
  >({})

  const supervisors = data.warRoom.supervisors
  const quotaSupervisor =
    supervisors.find((item) => item.supervisorEmpleadoId === appliedQuotaFilters.supervisorEmpleadoId) ?? null
  const quotaChainOptions = useMemo(() => {
    const source =
      supervisors.find((item) => item.supervisorEmpleadoId === quotaFilters.supervisorEmpleadoId)?.quotaProgress ??
      supervisors.flatMap((item) => item.quotaProgress)

    return Array.from(new Set(source.map((item) => item.cadena).filter((item): item is string => Boolean(item)))).sort(
      (left, right) => left.localeCompare(right, 'es')
    )
  }, [supervisors, quotaFilters.supervisorEmpleadoId])
  const filteredQuotaItems = useMemo(() => {
    if (!appliedQuotaFilters.applied || !quotaSupervisor) {
      return [] as RutaQuotaProgressItem[]
    }

    return quotaSupervisor.quotaProgress.filter((item) => {
      const matchesChain =
        appliedQuotaFilters.cadena === 'TODAS' || (item.cadena ?? 'Sin cadena') === appliedQuotaFilters.cadena
      const matchesStoreType =
        appliedQuotaFilters.storeType === 'TODOS' ||
        (appliedQuotaFilters.storeType === 'FIJO' && item.clasificacionMaestra === 'FIJO') ||
        (appliedQuotaFilters.storeType === 'ROTATIVO' && item.clasificacionMaestra === 'ROTATIVO')

      return matchesChain && matchesStoreType
    })
  }, [appliedQuotaFilters, quotaSupervisor])
  const effectiveFilteredQuotaItems = useMemo(() => {
    if (!quotaSupervisor) {
      return filteredQuotaItems
    }

    const quotaOverrides = quotaOverridesBySupervisor[quotaSupervisor.supervisorEmpleadoId]
    if (!quotaOverrides) {
      return filteredQuotaItems
    }

    return filteredQuotaItems.map((item) => ({
      ...item,
      quotaMensual: quotaOverrides[item.pdvId] ?? item.quotaMensual,
    }))
  }, [filteredQuotaItems, quotaOverridesBySupervisor, quotaSupervisor])
  const coverageSupervisor =
    supervisors.find((item) => item.supervisorEmpleadoId === selectedCoverageSupervisorId) ??
    supervisors[0] ??
    null

  const filteredRoutes = useMemo(
    () => visibleCoordinatorRoutes.filter((route) => route.semanaInicio === selectedWeekStart),
    [visibleCoordinatorRoutes, selectedWeekStart]
  )
  const routeBoardRoutes = useMemo(
    () => filteredRoutes.filter((route) => route.totalVisitas > 0),
    [filteredRoutes]
  )
  const coverageRoutes = useMemo(
    () =>
      filteredRoutes.filter((route) =>
        isApprovedOperationalRoute(route) &&
        (coverageSupervisor ? route.supervisorEmpleadoId === coverageSupervisor.supervisorEmpleadoId : true)
      ),
    [filteredRoutes, coverageSupervisor]
  )
  const reachVisibleSupervisors = useMemo(
    () =>
      supervisors.filter((item) =>
        selectedReachSupervisorId ? item.supervisorEmpleadoId === selectedReachSupervisorId : true
      ),
    [selectedReachSupervisorId, supervisors]
  )

  const selectedRoute =
    routeBoardRoutes.find((route) => route.id === selectedRouteId) ?? routeBoardRoutes[0] ?? null
  const expandedCoverageRoute =
    coverageRoutes.find((route) => route.id === expandedCoverageRouteId) ?? coverageRoutes[0] ?? null

  useEffect(() => {
    if (!routeBoardRoutes.some((route) => route.id === selectedRouteId)) {
      return scheduleEffectStateUpdate(() => {
        setSelectedRouteId(routeBoardRoutes[0]?.id ?? null)
      })
    }
  }, [routeBoardRoutes, selectedRouteId])

  useEffect(() => {
    if (selectedWeekStart < minimumVisibleWeekStart) {
      return scheduleEffectStateUpdate(() => {
        setSelectedWeekStart(minimumVisibleWeekStart)
      })
    }

    const selectedWeekHasVisibleRoutes = visibleCoordinatorRoutes.some(
      (route) => route.semanaInicio === selectedWeekStart && route.totalVisitas > 0
    )

    if (!selectedWeekHasVisibleRoutes && selectedWeekStart !== coordinatorDefaultWeekStart) {
      return scheduleEffectStateUpdate(() => {
        setSelectedWeekStart(coordinatorDefaultWeekStart)
      })
    }
  }, [coordinatorDefaultWeekStart, minimumVisibleWeekStart, selectedWeekStart, visibleCoordinatorRoutes])

  useEffect(() => {
    if (!coverageRoutes.some((route) => route.id === expandedCoverageRouteId)) {
      return scheduleEffectStateUpdate(() => {
        setExpandedCoverageRouteId(coverageRoutes[0]?.id ?? null)
        setSelectedCoverageDayNumber(null)
        setSelectedCoverageVisitId(null)
      })
    }
  }, [coverageRoutes, expandedCoverageRouteId])

  useEffect(() => {
    const visibleDays = expandedCoverageRoute
      ? Array.from(new Set(expandedCoverageRoute.visitas.map((visit) => visit.diaSemana))).sort((left, right) => left - right)
      : []

    if (visibleDays.length === 0) {
      if (selectedCoverageDayNumber !== null || selectedCoverageVisitId !== null) {
        return scheduleEffectStateUpdate(() => {
          setSelectedCoverageDayNumber(null)
          setSelectedCoverageVisitId(null)
        })
      }
      return
    }

    if (selectedCoverageDayNumber === null || !visibleDays.includes(selectedCoverageDayNumber)) {
      return scheduleEffectStateUpdate(() => {
        setSelectedCoverageDayNumber(visibleDays[0] ?? null)
        setSelectedCoverageVisitId(null)
      })
    }
  }, [expandedCoverageRoute, selectedCoverageDayNumber, selectedCoverageVisitId])

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.warRoom.metadataColumnAvailable && (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">War Room en modo compatible</p>
          <p className="mt-2 text-sm">
            La lectura ya funciona aunque la base local aun no tenga `ruta_semanal.metadata`. La aprobacion
            de quotas y cambios de ruta quedara habilitada al aplicar la migracion de workflow.
          </p>
        </Card>
      )}

      {!data.agendaInfrastructureAvailable && data.agendaInfrastructureMessage && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Agenda dinamica en modo compatible</p>
          <p className="mt-2 text-sm">{data.agendaInfrastructureMessage}</p>
        </Card>
      )}

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">Planeacion operativa</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Ruta semanal para {actorPuesto.toLowerCase()}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Organiza cuotas mensuales, tablero semanal de rutas y cobertura de visitas sin saturar la pantalla.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <WarRoomTabButton active={activeTab === 'quotas'} icon="reports" label="Cuotas" onClick={() => setActiveTab('quotas')} />
            <WarRoomTabButton active={activeTab === 'routes'} icon="calendar" label="Tablero de rutas" onClick={() => setActiveTab('routes')} />
            <WarRoomTabButton active={activeTab === 'coverage'} icon="route" label="Cobertura y tiendas sin visita" onClick={() => setActiveTab('coverage')} />
            <WarRoomTabButton active={activeTab === 'reach'} icon="reports" label="Alcance mensual" onClick={() => setActiveTab('reach')} />
          </div>
        </div>
      </Card>

      {activeTab === 'quotas' ? (
        <section className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Filtros de cuotas</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Selecciona supervisor, cadena y tipo de tienda. Las tiendas solo aparecen cuando aplicas filtros.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Select
                label="Supervisor"
                value={quotaFilters.supervisorEmpleadoId}
                onChange={(event) =>
                  setQuotaFilters((current) => ({
                    ...current,
                    supervisorEmpleadoId: event.target.value,
                    cadena: 'TODAS',
                  }))
                }
                options={[
                  { value: '', label: 'Selecciona un supervisor...' },
                  ...supervisors.map((item) => ({
                    value: item.supervisorEmpleadoId,
                    label: `${item.supervisor} · ${item.zona ?? 'Sin zona'}`,
                  })),
                ]}
              />
              <Select
                label="Cadena"
                value={quotaFilters.cadena}
                onChange={(event) =>
                  setQuotaFilters((current) => ({
                    ...current,
                    cadena: event.target.value,
                  }))
                }
                options={[
                  { value: 'TODAS', label: 'Todas' },
                  ...quotaChainOptions.map((item) => ({ value: item, label: item })),
                  { value: 'Sin cadena', label: 'Sin cadena' },
                ]}
              />
              <Select
                label="Tipo de tienda"
                value={quotaFilters.storeType}
                onChange={(event) =>
                  setQuotaFilters((current) => ({
                    ...current,
                    storeType: event.target.value,
                  }))
                }
                options={[
                  { value: 'TODOS', label: 'Todas' },
                  { value: 'FIJO', label: 'Fijas' },
                  { value: 'ROTATIVO', label: 'Rotativas' },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() =>
                  setAppliedQuotaFilters({
                    ...quotaFilters,
                    applied: true,
                  })
                }
              >
                Aplicar filtros
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const next = {
                    supervisorEmpleadoId: '',
                    cadena: 'TODAS',
                    storeType: 'TODOS',
                  }
                  setQuotaFilters(next)
                  setAppliedQuotaFilters({ ...next, applied: false })
                }}
              >
                Limpiar
              </Button>
            </div>
          </Card>

          <Card className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {quotaSupervisor?.supervisor ?? 'Cuotas por supervisor'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Configura las visitas mensuales por tienda y revisa el mapa de calor solo sobre el subconjunto filtrado.
                </p>
              </div>
              {appliedQuotaFilters.applied && quotaSupervisor && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSemaforoTone(quotaSupervisor.semaforo)}`}>
                  {quotaSupervisor.semaforo}
                </span>
              )}
            </div>

            {appliedQuotaFilters.applied && quotaSupervisor ? (
              <>
                <QuotaSummary supervisor={quotaSupervisor} items={effectiveFilteredQuotaItems} />
                <QuotaProgressList
                  key={`${quotaSupervisor.supervisorEmpleadoId}-${appliedQuotaFilters.cadena}-${appliedQuotaFilters.storeType}`}
                  supervisor={quotaSupervisor}
                  items={effectiveFilteredQuotaItems}
                  metadataEnabled={data.warRoom.metadataColumnAvailable}
                  onPersistedQuotasChange={(quotas) =>
                    setQuotaOverridesBySupervisor((current) => ({
                      ...current,
                      [quotaSupervisor.supervisorEmpleadoId]: quotas,
                    }))
                  }
                />
              </>
            ) : (
              <EmptyState copy="Selecciona un supervisor y aplica filtros para revisar sus tiendas fijas, rotativas y sus cuotas mensuales." />
            )}
          </Card>
        </section>
      ) : activeTab === 'routes' ? (
        <section className="space-y-6">
          <CoordinatorRouteKanban
            routes={routeBoardRoutes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            selectedWeekStart={selectedWeekStart}
            onPreviousWeek={() =>
              setSelectedWeekStart((current) =>
                current <= minimumVisibleWeekStart ? minimumVisibleWeekStart : shiftWeekStart(current, -1)
              )
            }
            onNextWeek={() => setSelectedWeekStart((current) => shiftWeekStart(current, 1))}
            canGoToPreviousWeek={selectedWeekStart > minimumVisibleWeekStart}
          />

          <Card className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{selectedRoute?.supervisor ?? 'Selecciona una ruta'}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Aqui solo aparecen las rutas semanales que el supervisor ya programo y envio para revision.
                </p>
              </div>
              {selectedRoute && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteTone(selectedRoute.estatus)}`}>
                  {selectedRoute.estatus}
                </span>
              )}
            </div>
            {selectedRoute ? (
              <>
                <RouteWorkflowCard route={selectedRoute} canReview={data.warRoom.metadataColumnAvailable || !data.puedeEditar} />
                <RouteMapByDay route={selectedRoute} />
                <AgendaApprovalsCard
                  route={selectedRoute}
                  events={data.agendaEventosPendientesAprobacion.filter((item) => item.routeId === selectedRoute.id)}
                  pendingRepositions={data.agendaPendientesReposicion.filter((item) => item.routeId === selectedRoute.id)}
                  agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
                  agendaInfrastructureMessage={data.agendaInfrastructureMessage}
                />
              </>
            ) : (
              <EmptyState copy="Todavia no hay rutas semanales enviadas por supervisores en esta semana. Las cuotas base no aparecen en este tablero." />
            )}
          </Card>
        </section>
      ) : activeTab === 'reach' ? (
        <section className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Alcance mensual</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Lectura ejecutiva y visual del avance de visitas por supervisor contra la cuota mensual vigente.
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Mes visible {formatMonthLabel(selectedWeekStart)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-1">
                <Select
                  label="Supervisor"
                  value={selectedReachSupervisorId}
                  onChange={(event) => setSelectedReachSupervisorId(event.target.value)}
                  options={[
                    { value: '', label: 'Todos los supervisores' },
                    ...supervisors.map((item) => ({
                      value: item.supervisorEmpleadoId,
                      label: `${item.supervisor} · ${item.zona ?? 'Sin zona'}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </Card>

          <CoordinatorReachWorkspace supervisors={reachVisibleSupervisors} />
        </section>
      ) : (
        <section className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Cobertura y tiendas sin visita</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Filtra supervisor y semana para revisar solo la ruta activa aprobada, su cumplimiento semanal y el detalle diario de visitas.
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Semana visible {formatDate(selectedWeekStart)} - {formatDate(getWeekEndIso(selectedWeekStart))}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="Supervisor"
                  value={coverageSupervisor?.supervisorEmpleadoId ?? ''}
                  onChange={(event) => setSelectedCoverageSupervisorId(event.target.value)}
                  options={
                    supervisors.length === 0
                      ? [{ value: '', label: 'Sin supervisores' }]
                      : supervisors.map((item) => ({
                          value: item.supervisorEmpleadoId,
                          label: `${item.supervisor} · ${item.zona ?? 'Sin zona'}`,
                        }))
                  }
                />
                <div className="flex gap-3 self-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setSelectedWeekStart((current) =>
                        current <= minimumVisibleWeekStart ? minimumVisibleWeekStart : shiftWeekStart(current, -1)
                      )
                    }
                    disabled={selectedWeekStart <= minimumVisibleWeekStart}
                  >
                    Semana anterior
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSelectedWeekStart((current) => shiftWeekStart(current, 1))}>
                    Semana siguiente
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <CoordinatorCoverageWorkspace
            supervisor={coverageSupervisor}
            routes={coverageRoutes}
            selectedWeekStart={selectedWeekStart}
            expandedRouteId={expandedCoverageRouteId}
            onExpandRoute={(routeId) => {
              setExpandedCoverageRouteId(routeId)
              setSelectedCoverageDayNumber(null)
              setSelectedCoverageVisitId(null)
            }}
            selectedDayNumber={selectedCoverageDayNumber}
            onSelectDay={(dayNumber) => {
              setSelectedCoverageDayNumber(dayNumber)
              setSelectedCoverageVisitId(null)
            }}
            selectedVisitId={selectedCoverageVisitId}
            onSelectVisit={setSelectedCoverageVisitId}
          />
        </section>
      )}
    </div>
  )
}

function SupervisorRouteOperations({
  data,
  actorPuesto,
  initialTab,
  hideTabs,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
  initialTab: SupervisorRouteTab
  hideTabs: boolean
}) {
  const [activeTab, setActiveTab] = useState<SupervisorRouteTab>(initialTab)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(
    data.rutaSemanaActual?.id ?? data.rutas[0]?.id ?? null
  )
  const [selectedCorrectionRouteId, setSelectedCorrectionRouteId] = useState<string | null>(
    data.rutasCorrecciones[0]?.id ?? null
  )
  const [selectedHistoryRouteId, setSelectedHistoryRouteId] = useState<string | null>(
    data.rutasHistoricasMesActual[0]?.id ?? null
  )
  const [activeModal, setActiveModal] = useState<SupervisorRouteTab | 'today' | null>(null)
  const [operationNotice, setOperationNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const selectedRoute =
    data.rutas.find((item) => item.id === selectedRouteId) ??
    data.rutaSemanaActual ??
    data.rutas[0] ??
    null
  const selectedCorrectionRoute =
    data.rutasCorrecciones.find((item) => item.id === selectedCorrectionRouteId) ??
    data.rutasCorrecciones[0] ??
    null
  const selectedHistoryRoute =
    data.rutasHistoricasMesActual.find((item) => item.id === selectedHistoryRouteId) ??
    data.rutasHistoricasMesActual[0] ??
    null

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!data.rutas.some((item) => item.id === selectedRouteId)) {
      setSelectedRouteId(data.rutaSemanaActual?.id ?? data.rutas[0]?.id ?? null)
    }
  }, [data.rutaSemanaActual?.id, data.rutas, selectedRouteId])

  useEffect(() => {
    if (!data.rutasCorrecciones.some((item) => item.id === selectedCorrectionRouteId)) {
      setSelectedCorrectionRouteId(data.rutasCorrecciones[0]?.id ?? null)
    }
  }, [data.rutasCorrecciones, selectedCorrectionRouteId])

  useEffect(() => {
    if (!data.rutasHistoricasMesActual.some((item) => item.id === selectedHistoryRouteId)) {
      setSelectedHistoryRouteId(data.rutasHistoricasMesActual[0]?.id ?? null)
    }
  }, [data.rutasHistoricasMesActual, selectedHistoryRouteId])

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.warRoom.metadataColumnAvailable && (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">Workflow parcial en modo compatible</p>
          <p className="mt-2 text-sm">
            Puedes planificar y ejecutar visitas. La solicitud formal de cambio de ruta quedara
            activa cuando la base local tenga la columna `metadata`.
          </p>
        </Card>
      )}

      {!data.puedeEditar && (
        <Card className="border-slate-200 bg-slate-50 text-slate-700">
          <p className="font-medium">Vista solo lectura</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actorPuesto}</span>. Solo
            SUPERVISOR puede planificar o cerrar visitas; COORDINADOR y ADMINISTRADOR consultan la
            semana y el cumplimiento.
          </p>
        </Card>
      )}

      {operationNotice ? (
        <Card
          className={`border ${
            operationNotice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="text-sm font-semibold">{operationNotice.message}</p>
        </Card>
      ) : null}

      {!hideTabs ? (
        <>
          <SupervisorOperationsHub
            data={data}
            actorPuesto={actorPuesto}
            onOpen={(target) => {
              setOperationNotice(null)
              setActiveModal(target)
            }}
          />

          <SupervisorWorkspaceModal
            open={activeModal === 'today'}
            onClose={() => setActiveModal(null)}
            title="Mi Ruta Hoy"
            subtitle="Ruta aprobada del dia, llegada, checklist opcional y cierre de visitas."
          >
          <SupervisorTodayRouteSheet
            data={{
              semanaActualInicio: data.semanaActualInicio,
              semanaActualFin: data.semanaActualFin,
              visitasHoy: data.visitasHoy,
              eventosHoy: data.agendaHoy?.eventos ?? [],
              agendaInfrastructureAvailable: data.agendaInfrastructureAvailable,
              agendaInfrastructureMessage: data.agendaInfrastructureMessage,
              infraestructuraLista: data.infraestructuraLista,
              mensajeInfraestructura: data.mensajeInfraestructura,
            }}
            onSuccess={(message) => setOperationNotice({ tone: 'success', message })}
            onError={(message) => setOperationNotice({ tone: 'error', message })}
            dayEventActionSlot={
              data.agendaHoy ? (
                <AgendaOperativaOverviewCard
                  routeId={selectedRoute?.id ?? data.rutaSemanaActual?.id ?? null}
                  agendaHoy={data.agendaHoy}
                  pdvsDisponibles={data.pdvsDisponibles}
                  agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
                  agendaInfrastructureMessage={data.agendaInfrastructureMessage}
                />
              ) : null
            }
          />
        </SupervisorWorkspaceModal>

          <SupervisorWorkspaceModal
            open={activeModal === 'planning'}
            onClose={() => setActiveModal(null)}
            title="Modificar Ruta Del Dia"
            subtitle="Fuerza mayor y ajustes operativos sin aprobacion previa, con notificacion a coordinacion."
          >
            {data.puedeEditar && selectedRoute ? (
              <UnifiedDayEditorCard
                route={selectedRoute}
                agendaHoy={data.agendaHoy}
                agendaEvents={data.agendaSemanaActual
                  .flatMap((day) => day.eventos)
                  .filter((item) => item.routeId === selectedRoute.id)}
                pendingRepositions={data.agendaPendientesReposicion}
                agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
                agendaInfrastructureMessage={data.agendaInfrastructureMessage}
                metadataEnabled={data.warRoom.metadataColumnAvailable}
                pdvsDisponibles={data.pdvsDisponibles}
              />
            ) : data.puedeEditar ? (
              <EmptyState copy="No hay ruta aprobada seleccionada para modificar el dia operativo." />
            ) : (
              <EmptyState copy="Solo el supervisor puede modificar su ruta del dia." />
            )}
          </SupervisorWorkspaceModal>

          <SupervisorWorkspaceModal
            open={activeModal === 'corrections'}
            onClose={() => setActiveModal(null)}
            title="Correcciones"
            subtitle="Rutas aprobadas que aun no estan en progreso y pueden corregirse con trazabilidad."
          >
            <SupervisorCorrectionsWorkspace
              data={data}
              selectedRouteId={selectedCorrectionRouteId}
              onSelectRoute={setSelectedCorrectionRouteId}
              selectedRoute={selectedCorrectionRoute}
            />
          </SupervisorWorkspaceModal>

          <SupervisorWorkspaceModal
            open={activeModal === 'history'}
            onClose={() => setActiveModal(null)}
            title="Historicos Del Mes"
            subtitle="Visitas normales y eventos no comunes registrados durante el mes actual."
          >
            <SupervisorHistoryWorkspace
              data={data}
              selectedRouteId={selectedHistoryRouteId}
              onSelectRoute={setSelectedHistoryRouteId}
              selectedRoute={selectedHistoryRoute}
            />
          </SupervisorWorkspaceModal>
        </>
      ) : activeTab === 'agenda' ? (
        <SupervisorAgendaWorkspace data={data} selectedRoute={selectedRoute} />
      ) : activeTab === 'planning' ? (
        data.puedeEditar ? (
          <PlanificarRutaCard
            data={data}
            onOpenCorrections={(routeId) => {
              setSelectedCorrectionRouteId(routeId)
              setActiveTab('corrections')
            }}
            onOpenHistory={(routeId) => {
              setSelectedHistoryRouteId(routeId)
              setActiveTab('history')
            }}
          />
        ) : (
          <EmptyState copy="Solo el supervisor puede definir la ruta semanal desde esta pestaña." />
        )
      ) : activeTab === 'corrections' ? (
        <SupervisorCorrectionsWorkspace
          data={data}
          selectedRouteId={selectedCorrectionRouteId}
          onSelectRoute={setSelectedCorrectionRouteId}
          selectedRoute={selectedCorrectionRoute}
        />
      ) : (
        <SupervisorHistoryWorkspace
          data={data}
          selectedRouteId={selectedHistoryRouteId}
          onSelectRoute={setSelectedHistoryRouteId}
          selectedRoute={selectedHistoryRoute}
        />
      )}
    </div>
  )
}

function SupervisorWorkspaceModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidthClassName="max-w-[min(1180px,calc(100vw-24px))]"
    >
      <div className="min-h-[68vh]">{children}</div>
    </ModalPanel>
  )
}

function SupervisorOperationsHub({
  data,
  actorPuesto,
  onOpen,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
  onOpen: (target: SupervisorRouteTab | 'today') => void
}) {
  const todayCompleted = data.visitasHoy.filter((visit) => visit.estatus === 'COMPLETADA').length
  const currentMonthVisits = data.rutasHistoricasMesActual.reduce((count, route) => count + route.totalVisitas, 0)
  const activeEvents = data.agendaHoy?.eventos.length ?? 0

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Centro operativo para {actorPuesto.toLowerCase()}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Supervisor en campo</h2>
          <p className="mt-2 text-sm text-slate-500">
            Abre cada flujo en su propia ventana para revisar la ruta aprobada, atender fuerza mayor, corregir
            semanas vigentes y consultar historicos sin saturar la pantalla principal.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
          <MiniStat label="Hoy" value={`${todayCompleted}/${data.visitasHoy.length}`} />
          <MiniStat label="Eventos" value={String(activeEvents)} />
          <MiniStat label="Mes" value={String(currentMonthVisits)} />
        </div>
      </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SupervisorHubButton
            title="Mi Ruta Hoy"
            description="Ver ruta aprobada, abrir tiendas y cerrar visitas."
            icon="route"
            metric={`${data.visitasHoy.length} visita(s)`}
            onClick={() => onOpen('today')}
          />
        <SupervisorHubButton
          title="Modificar Ruta"
          description="Registrar fuerza mayor sin aprobacion previa."
          icon="route"
          metric="Notifica coordinacion"
          onClick={() => onOpen('planning')}
        />
        <SupervisorHubButton
          title="Correcciones"
          description="Ajustar rutas aprobadas que aun no inician."
          icon="reports"
          metric={`${data.rutasCorrecciones.length} editable(s)`}
          onClick={() => onOpen('corrections')}
        />
        <SupervisorHubButton
          title="Historicos"
          description="Consultar visitas y eventos no comunes del mes."
          icon="reports"
          metric={`${data.rutasHistoricasMesActual.length} semana(s)`}
          onClick={() => onOpen('history')}
        />
      </div>
    </Card>
  )
}

function SupervisorHubButton({
  title,
  description,
  icon,
  metric,
  onClick,
}: {
  title: string
  description: string
  icon: 'reports' | 'calendar' | 'route'
  metric: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[180px] flex-col justify-between rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--module-border)] hover:bg-white hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--module-text)] shadow-sm">
        <PremiumLineIcon name={icon} className="h-5 w-5" strokeWidth={2} />
      </span>
      <span>
        <span className="block text-base font-semibold text-slate-950">{title}</span>
        <span className="mt-2 block text-sm leading-5 text-slate-500">{description}</span>
      </span>
      <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
        {metric}
      </span>
    </button>
  )
}

function SupervisorAgendaWorkspace({
  data,
  selectedRoute,
}: {
  data: RutaSemanalPanelData
  selectedRoute: RutaSemanalItem | null
}) {
  const selectedAgendaEvents = selectedRoute
    ? data.agendaSemanaActual.flatMap((day) => day.eventos).filter((item) => item.routeId === selectedRoute.id)
    : []

  return (
    <div className="space-y-6">
      <AgendaDigestCard agendaHoy={data.agendaHoy} pendientes={data.agendaPendientesReposicion} />
      <TodayRouteStrip visits={data.visitasHoy} />
      <AgendaOperativaOverviewCard
        routeId={selectedRoute?.id ?? null}
        agendaHoy={data.agendaHoy}
        pdvsDisponibles={data.pdvsDisponibles}
        agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
        agendaInfrastructureMessage={data.agendaInfrastructureMessage}
      />

      {selectedRoute ? (
        <Card className="overflow-hidden p-0">
          <div className="space-y-5 px-6 py-5">
            <RouteWorkflowCard route={selectedRoute} canReview={false} />
            {selectedAgendaEvents.length > 0 ? (
              <AgendaTimelineCard events={selectedAgendaEvents} />
            ) : null}
            <RouteMapByDay route={selectedRoute} />
          </div>
        </Card>
      ) : (
        <EmptyState copy="Cuando exista una ruta visible para la semana actual, aqui veras su ejecucion operativa." />
      )}
    </div>
  )
}

function SupervisorCorrectionsWorkspace({
  data,
  selectedRouteId,
  onSelectRoute,
  selectedRoute,
}: {
  data: RutaSemanalPanelData
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  selectedRoute: RutaSemanalItem | null
}) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
              Correcciones
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Rutas publicadas con ajustes vigentes</h2>
            <p className="mt-2 text-sm text-slate-500">
              Solo ves semanas aprobadas que todavia tienen dias operativos de hoy en adelante para modificar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {data.rutasCorrecciones.length} ruta(s) editables
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Correcciones</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">Semanas publicadas</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {data.rutasCorrecciones.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {data.rutasCorrecciones.length === 0 ? (
              <EmptyState copy="No hay rutas publicadas con dias vigentes para modificar en este momento." />
            ) : (
              data.rutasCorrecciones.map((ruta) => (
                <button
                  key={ruta.id}
                  type="button"
                  onClick={() => onSelectRoute(ruta.id)}
                  className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                    selectedRouteId === ruta.id
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{ruta.supervisor ?? 'Supervisor sin nombre'}</p>
                      <p className={`mt-1 text-xs ${selectedRouteId === ruta.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {formatDate(ruta.semanaInicio)} - {formatDate(ruta.semanaFin)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        selectedRouteId === ruta.id ? 'bg-white/10 text-white' : getRouteTone(ruta.estatus)
                      }`}
                    >
                      {ruta.estatus}
                    </span>
                  </div>
                  <div className={`mt-3 text-sm ${selectedRouteId === ruta.id ? 'text-slate-200' : 'text-slate-600'}`}>
                    {ruta.visitasCompletadas}/{ruta.totalVisitas} visitas completadas
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedRouteId === ruta.id ? 'bg-white/10 text-white' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {ruta.editableDayNumbers.length} dia(s) editable(s)
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        selectedRouteId === ruta.id ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      Modificar ruta
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {selectedRoute ? (
            <>
              <RouteWorkflowCard route={selectedRoute} canReview={false} />
              <RouteChangeRequestCard
                route={selectedRoute}
                enabled={data.warRoom.metadataColumnAvailable}
                pdvsDisponibles={data.pdvsDisponibles}
              />
              <RouteMapByDay route={selectedRoute} />
            </>
          ) : (
            <EmptyState copy="Selecciona una ruta publicada para abrir el flujo de modificacion sobre dias vigentes." />
          )}
        </div>
      </div>
    </div>
  )
}

function SupervisorHistoryWorkspace({
  data,
  selectedRouteId,
  onSelectRoute,
  selectedRoute,
}: {
  data: RutaSemanalPanelData
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  selectedRoute: RutaSemanalItem | null
}) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
              Historicos
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Rutas del mes actual</h2>
            <p className="mt-2 text-sm text-slate-500">
              Aqui solo ves el corte del mes vigente en modo lectura, sin reposiciones ni formularios de cambio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {data.rutasHistoricasMesActual.length} ruta(s) del mes
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Corte mensual</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">Semanas visibles</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {data.rutasHistoricasMesActual.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {data.rutasHistoricasMesActual.length === 0 ? (
              <EmptyState copy="Todavia no hay rutas del mes actual para mostrar en historicos." />
            ) : (
              data.rutasHistoricasMesActual.map((ruta) => (
                <button
                  key={ruta.id}
                  type="button"
                  onClick={() => onSelectRoute(ruta.id)}
                  className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                    selectedRouteId === ruta.id
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{ruta.supervisor ?? 'Supervisor sin nombre'}</p>
                      <p className={`mt-1 text-xs ${selectedRouteId === ruta.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {formatDate(ruta.semanaInicio)} - {formatDate(ruta.semanaFin)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        selectedRouteId === ruta.id ? 'bg-white/10 text-white' : getRouteTone(ruta.estatus)
                      }`}
                    >
                      {ruta.estatus}
                    </span>
                  </div>
                  <div className={`mt-3 text-sm ${selectedRouteId === ruta.id ? 'text-slate-200' : 'text-slate-600'}`}>
                    {ruta.visitasCompletadas}/{ruta.totalVisitas} visitas completadas
                  </div>
                  {ruta.notas ? (
                    <p className={`mt-2 text-xs ${selectedRouteId === ruta.id ? 'text-slate-300' : 'text-slate-500'}`}>
                      {ruta.notas}
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {selectedRoute ? (
            <>
              <RouteWorkflowCard route={selectedRoute} canReview={false} />
              <RouteMapByDay route={selectedRoute} />
            </>
          ) : (
            <EmptyState copy="Selecciona una ruta del mes para revisar su detalle en modo lectura." />
          )}
        </div>
      </div>
    </div>
  )
}

function WarRoomTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: 'reports' | 'calendar' | 'route'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
          : 'border-slate-200 bg-white text-slate-600 hover:border-[var(--module-border)] hover:text-slate-950'
      }`}
    >
      <PremiumLineIcon name={icon} className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  )
}

function AgendaDigestCard({
  agendaHoy,
  pendientes,
}: {
  agendaHoy: RutaAgendaOperativaDia | null
  pendientes: RutaPendienteReposicionItem[]
}) {
  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
              Eventos del dia
            </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {agendaHoy ? `${agendaHoy.dayLabel} en ejecucion` : 'Sin agenda del dia'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            La ruta semanal sigue como base, pero aqui vemos lo que realmente vive hoy.
          </p>
        </div>
        <span className="rounded-full bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
          {pendientes.length} por reponer
        </span>
      </div>

      {agendaHoy ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Planeadas" value={String(agendaHoy.planeadasCount)} />
          <MiniStat label="Ejecutadas" value={String(agendaHoy.ejecutadasCount)} />
          <MiniStat label="Eventos" value={String(agendaHoy.eventos.length)} />
          <MiniStat
            label="Sin visita"
            value={String(
              agendaHoy.pendientesJustificadasCount + agendaHoy.pendientesInjustificadasCount
            )}
          />
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState copy="Cuando exista una ruta visible para hoy, aqui se resumira la agenda real del supervisor." />
        </div>
      )}
    </Card>
  )
}

function AgendaTimelineCard({ events }: { events: RutaAgendaEventoItem[] }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Eventos en seguimiento</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Eventos y reposiciones de la semana</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {events.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {events.length === 0 ? (
          <EmptyState copy="No hay eventos operativos registrados para esta ruta." />
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{event.titulo}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.fechaOperacion} · {event.tipoLabel} · {event.impactoLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgendaApprovalTone(event.estatusAprobacion)}`}>
                    {event.estatusAprobacion}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgendaExecutionTone(event.estatusEjecucion)}`}>
                    {event.estatusEjecucion}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {event.pdv ?? event.sede ?? event.zona ?? 'Sin detalle operativo'}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RouteMapByDay({ route }: { route: RutaSemanalItem }) {
  const dayOptions = useMemo(
    () => {
      const counts = new Map<number, number>()
      for (const visit of route.visitas) {
        counts.set(visit.diaSemana, (counts.get(visit.diaSemana) ?? 0) + 1)
      }

      return WEEK_DAY_OPTIONS.filter((option) => counts.has(option.value)).map((option) => ({
        value: option.value,
        label: `${option.label} · ${counts.get(option.value) ?? 0} visita(s)`,
        shortLabel: option.shortLabel,
      }))
    },
    [route.visitas]
  )
  const [selectedDayNumber, setSelectedDayNumber] = useState<number | null>(route.visitas[0]?.diaSemana ?? null)

  const resolvedSelectedDayNumber = useMemo(() => {
    if (selectedDayNumber !== null && dayOptions.some((option) => option.value === selectedDayNumber)) {
      return selectedDayNumber
    }

    return dayOptions[0]?.value ?? null
  }, [dayOptions, selectedDayNumber])

  const selectedDayIndex = useMemo(
    () => dayOptions.findIndex((option) => option.value === resolvedSelectedDayNumber),
    [dayOptions, resolvedSelectedDayNumber]
  )

  const selectedDayOption = dayOptions[selectedDayIndex] ?? dayOptions[0] ?? null

  const goToPreviousDay = () => {
    if (selectedDayIndex <= 0) {
      return
    }

    setSelectedDayNumber(dayOptions[selectedDayIndex - 1]?.value ?? resolvedSelectedDayNumber)
  }

  const goToNextDay = () => {
    if (selectedDayIndex < 0 || selectedDayIndex >= dayOptions.length - 1) {
      return
    }

    setSelectedDayNumber(dayOptions[selectedDayIndex + 1]?.value ?? resolvedSelectedDayNumber)
  }

  const dayVisits = route.visitas
    .filter((visit) => visit.diaSemana === resolvedSelectedDayNumber)
    .sort((left, right) => left.orden - right.orden)

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mapa del dia</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Ruta programada por dia</h3>
          <p className="mt-2 text-sm text-slate-500">
            Usa anterior y siguiente para recorrer solo la secuencia programada de cada dia con visitas.
          </p>
        </div>
        <div className="w-full max-w-md">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)] gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToPreviousDay}
              disabled={dayOptions.length === 0 || selectedDayIndex <= 0}
              className="w-full justify-center rounded-[16px] border-slate-200 bg-white"
              leftIcon={<span aria-hidden="true">{'<'}</span>}
            >
              Anterior
            </Button>
            <div className="flex min-w-0 flex-col items-center justify-center rounded-[16px] border border-dashed border-slate-200 bg-white px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">DIA</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-950" aria-live="polite">
                {selectedDayOption?.label ?? 'Sin visitas'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToNextDay}
              disabled={dayOptions.length === 0 || selectedDayIndex < 0 || selectedDayIndex >= dayOptions.length - 1}
              className="w-full justify-center rounded-[16px] border-slate-200 bg-white"
              rightIcon={<span aria-hidden="true">{'>'}</span>}
            >
              Siguiente
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Los botones recorren solo los dias con visitas cargadas en esta ruta.
          </p>
        </div>
      </div>
      <div className="mt-5">
        <RouteMap visits={dayVisits} />
      </div>

      {dayVisits.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Secuencia de tiendas</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {dayVisits.map((visit, idx) => (
              <div key={visit.id} className="flex items-center gap-4 rounded-[20px] border border-slate-100 bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-base font-bold text-white">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{visit.pdv ?? 'Tienda sin nombre'}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{visit.direccion ?? 'Sin dirección registrada'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getVisitTone(visit.estatus)}`}>
                  {visit.estatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CoordinatorRouteKanban({
  routes,
  selectedRouteId,
  onSelectRoute,
  selectedWeekStart,
  onPreviousWeek,
  onNextWeek,
  canGoToPreviousWeek,
}: {
  routes: RutaSemanalItem[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  selectedWeekStart: string
  onPreviousWeek: () => void
  onNextWeek: () => void
  canGoToPreviousWeek: boolean
}) {
  const [activeColumn, setActiveColumn] = useState<CoordinatorKanbanColumnKey | null>(null)

  const grouped = useMemo(() => {
    const initial: Record<CoordinatorKanbanColumnKey, RutaSemanalItem[]> = {
      ENVIADAS: [],
      AJUSTES: [],
      PUBLICADAS: [],
      CERRADAS: [],
    }

    for (const route of routes) {
      initial[getCoordinatorKanbanColumn(route)].push(route)
    }

    return initial
  }, [routes])

  const columns: CoordinatorKanbanColumnKey[] = ['ENVIADAS', 'AJUSTES', 'PUBLICADAS', 'CERRADAS']

  return (
    <>
      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
              Tablero Kanban
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">Rutas de supervisores</h3>
            <p className="mt-2 text-sm text-slate-500">
              Selecciona una categoria para ver y gestionar las rutas enviadas por los supervisores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <button
                type="button"
                onClick={onPreviousWeek}
                disabled={!canGoToPreviousWeek}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-300"
                aria-label="Semana anterior"
              >
                ‹
              </button>
              <span className="min-w-[220px] text-center text-sm font-semibold text-slate-900">
                {formatDate(selectedWeekStart)} - {formatDate(getWeekEndIso(selectedWeekStart))}
              </span>
              <button
                type="button"
                onClick={onNextWeek}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white"
                aria-label="Semana siguiente"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => {
          const count = grouped[column].length
          const isActive = activeColumn === column
          const colorClass = 
            column === 'PUBLICADAS' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
            column === 'AJUSTES' ? 'bg-amber-50 border-amber-200 text-amber-900' :
            column === 'ENVIADAS' ? 'bg-sky-50 border-sky-200 text-sky-900' :
            'bg-slate-50 border-slate-200 text-slate-900'

          return (
            <button
              key={column}
              type="button"
              onClick={() => setActiveColumn(column)}
              className={`flex flex-col items-start gap-1 rounded-[24px] border p-5 text-left transition hover:shadow-md ${colorClass} ${isActive ? 'ring-2 ring-slate-950 ring-offset-2' : ''}`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                {getCoordinatorKanbanColumnLabel(column)}
              </span>
              <div className="flex w-full items-center justify-between">
                <span className="text-3xl font-bold">{count}</span>
                <span className="text-xl opacity-30">
                  {column === 'ENVIADAS' ? '📨' : column === 'AJUSTES' ? '✏️' : column === 'PUBLICADAS' ? '✅' : '📁'}
                </span>
              </div>
              <p className="mt-2 text-xs opacity-70">
                {count === 1 ? '1 ruta disponible' : `${count} rutas disponibles`}
              </p>
            </button>
          )
        })}
      </div>

      <ModalPanel
        open={Boolean(activeColumn)}
        onClose={() => setActiveColumn(null)}
        title={`Rutas: ${getCoordinatorKanbanColumnLabel(activeColumn ?? 'ENVIADAS')}`}
        subtitle={`Total de ${grouped[activeColumn ?? 'ENVIADAS'].length} rutas en este estado.`}
      >
        <div className="mt-4 space-y-3">
          {grouped[activeColumn ?? 'ENVIADAS'].length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-500">No hay rutas en esta categoría.</p>
            </div>
          ) : (
            grouped[activeColumn ?? 'ENVIADAS'].map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => {
                  onSelectRoute(route.id)
                  setActiveColumn(null)
                }}
                className={`w-full rounded-[24px] border p-5 text-left transition ${
                  selectedRouteId === route.id
                    ? 'border-slate-950 bg-slate-950 text-white shadow-lg'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-base font-bold">{route.supervisor ?? 'Supervisor sin nombre'}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className={`text-xs ${selectedRouteId === route.id ? 'text-slate-300' : 'text-slate-500'}`}>
                        {formatDate(route.semanaInicio)} - {formatDate(route.semanaFin)}
                      </p>
                      <span className="h-1 w-1 rounded-full bg-slate-400 opacity-30" />
                      <p className={`text-xs font-medium ${selectedRouteId === route.id ? 'text-slate-200' : 'text-slate-600'}`}>
                        {route.totalVisitas} visitas
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                      selectedRouteId === route.id ? 'bg-white/10 text-white' : getRouteTone(route.estatus)
                    }`}
                  >
                    {route.estatus}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </ModalPanel>
    </Card>
    </>
  )
}

function UnifiedDayEditorCard({
  route,
  agendaHoy,
  agendaEvents,
  pendingRepositions,
  agendaInfrastructureAvailable,
  agendaInfrastructureMessage,
  metadataEnabled,
  pdvsDisponibles,
}: {
  route: RutaSemanalItem
  agendaHoy: RutaAgendaOperativaDia | null
  agendaEvents: RutaAgendaEventoItem[]
  pendingRepositions: RutaPendienteReposicionItem[]
  agendaInfrastructureAvailable: boolean
  agendaInfrastructureMessage?: string
  metadataEnabled: boolean
  pdvsDisponibles: RutaSemanalPanelData['pdvsDisponibles']
}) {
  const [mode, setMode] = useState<UnifiedDayEditorMode>('CHANGE')
  const [changeState, changeAction] = useActionState(solicitarCambioRutaSemanal, ESTADO_RUTA_INICIAL)
  const [eventState, eventAction] = useActionState(registrarEventoAgendaRutaSemanal, ESTADO_RUTA_INICIAL)
  const visitsByDay = useMemo(
    () =>
      route.visitas.reduce<Map<number, RutaSemanalVisitItem[]>>((acc, visit) => {
        const current = acc.get(visit.diaSemana) ?? []
        current.push(visit)
        acc.set(visit.diaSemana, current)
        return acc
      }, new Map<number, RutaSemanalVisitItem[]>()),
    [route.visitas]
  )
  const dayOptions = Array.from(
    new Map(
      route.visitas.map((visit) => [
        visit.diaSemana,
        {
          value: String(visit.diaSemana),
          label: `${visit.diaLabel} · ${route.visitas.filter((item) => item.diaSemana === visit.diaSemana).length} visita(s)`,
        },
      ])
    ).values()
  )
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(
    route.changeRequestTargetDayNumber ?? route.visitas[0]?.diaSemana ?? 1
  )
  const [changeType, setChangeType] = useState<RutaSemanalItem['changeRequestType']>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA'
  )
  const [selectedVisitId, setSelectedVisitId] = useState<string>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : ''
  )
  const [storeSearch, setStoreSearch] = useState('')
  const [isStorePickerOpen, setIsStorePickerOpen] = useState(false)
  const [eventType, setEventType] = useState<RutaAgendaEventoItem['tipoEvento']>('VISITA_ADICIONAL')
  const [impactMode, setImpactMode] = useState<RutaAgendaEventoItem['modoImpacto']>('SUMA')
  const [selectedDisplacedVisitIds, setSelectedDisplacedVisitIds] = useState<string[]>([])

  const buildDraftForDay = useCallback((dayNumber: number, sourceRoute = route) => {
    if (
      sourceRoute.changeRequestState === 'PENDIENTE' &&
      sourceRoute.changeRequestTargetDayNumber === dayNumber &&
      sourceRoute.changeRequestProposedVisits.length > 0
    ) {
      return sourceRoute.changeRequestProposedVisits.map((proposal) => ({
        clientId: `proposal-${proposal.order}-${proposal.pdvId}`,
        pdvId: proposal.pdvId,
        label: proposal.pdv ?? 'PDV sin nombre',
        subtitle: proposal.zona ?? 'Sin zona',
      }))
    }

    return (visitsByDay.get(dayNumber) ?? []).map((visit, index) => ({
      clientId: visit.id ?? `${dayNumber}-${visit.pdvId}-${index}`,
      pdvId: visit.pdvId,
      label: visit.pdv ?? 'PDV sin nombre',
      subtitle: visit.zona ?? 'Sin zona',
    }))
  }, [route, visitsByDay])

  const [draftRoute, setDraftRoute] = useState(() => buildDraftForDay(selectedDayNumber))

  useEffect(() => {
    const nextDay = route.changeRequestTargetDayNumber ?? route.visitas[0]?.diaSemana ?? 1
    return scheduleEffectStateUpdate(() => {
      setSelectedDayNumber(nextDay)
      setSelectedVisitId(route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : '')
      setChangeType(route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA')
      setDraftRoute(buildDraftForDay(nextDay, route))
    })
  }, [buildDraftForDay, route])

  const operationDate = addDaysToWeek(route.semanaInicio, selectedDayNumber)
  const currentDayVisits = (visitsByDay.get(selectedDayNumber) ?? []).sort((left, right) => left.orden - right.orden)
  const currentDayEvents = agendaEvents.filter((item) => item.fechaOperacion === operationDate)
  const currentDayPendings = pendingRepositions.filter((item) => item.fechaOrigen === operationDate)
  const targetVisitOptions = currentDayVisits.map((visit) => ({
    value: visit.id,
    label: visit.pdv ?? 'PDV sin nombre',
  }))
  const filteredPdvs = pdvsDisponibles.filter((pdv) =>
    normalizeFilterText(`${pdv.nombre} ${pdv.zona ?? ''}`).includes(normalizeFilterText(storeSearch))
  )
  const serializedProposal = JSON.stringify(
    draftRoute.map((item, index) => ({
      pdvId: item.pdvId,
      order: index + 1,
    }))
  )

  const resetDraftForDay = (dayNumber: number, nextType: RutaSemanalItem['changeRequestType']) => {
    setSelectedDayNumber(dayNumber)
    setSelectedVisitId((visitsByDay.get(dayNumber) ?? [])[0]?.id ?? '')
    setDraftRoute(nextType === 'CANCELACION_DIA' ? [] : buildDraftForDay(dayNumber))
    setSelectedDisplacedVisitIds([])
  }

  const addStoreToDraft = (pdvId: string) => {
    if (!pdvId || draftRoute.some((item) => item.pdvId === pdvId)) {
      return
    }

    const pdv = pdvsDisponibles.find((item) => item.id === pdvId)
    if (!pdv) {
      return
    }

    setDraftRoute((current) => [
      ...current,
      {
        clientId: createRouteDraftClientId(`draft-${selectedDayNumber}-${pdvId}`),
        pdvId,
        label: pdv.nombre,
        subtitle: pdv.zona ?? pdv.formato ?? 'Sin zona',
      },
    ])
  }

  const removeStoreFromDraft = (clientId: string) => {
    setDraftRoute((current) => current.filter((item) => item.clientId !== clientId))
  }

  const moveStoreWithinDraft = (clientId: string, direction: 'up' | 'down') => {
    setDraftRoute((current) => {
      const currentIndex = current.findIndex((item) => item.clientId === clientId)
      if (currentIndex === -1) {
        return current
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  const activeState = mode === 'CHANGE' ? changeState : eventState

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Edicion del dia</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Modificar ruta o agregar evento</h3>
          <p className="mt-2 text-sm text-slate-500">
            Un solo flujo para cambiar tiendas del dia o registrar un evento operativo extraordinario.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('CHANGE')}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              mode === 'CHANGE'
                ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            Solicitud de modificacion
          </button>
          <button
            type="button"
            onClick={() => setMode('EVENT')}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              mode === 'EVENT'
                ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            Evento del dia
          </button>
        </div>
      </div>

      <form className="mt-5 space-y-4">
        <input type="hidden" name="ruta_id" value={route.id} />
        <input type="hidden" name="target_day_number" value={String(selectedDayNumber)} />
        <input type="hidden" name="fecha_operacion" value={operationDate} />
        <input type="hidden" name="change_request_route_json" value={serializedProposal} />
        <input type="hidden" name="displaced_visit_ids_json" value={JSON.stringify(selectedDisplacedVisitIds)} />

        <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
          <div className="rounded-[20px] border border-slate-200 bg-white p-4">
            <Select
              label="Dia"
              value={String(selectedDayNumber)}
              onChange={(event) => resetDraftForDay(Number(event.target.value), changeType)}
              options={dayOptions.length === 0 ? [{ value: '', label: 'Sin visitas' }] : dayOptions}
            />
            <div className="mt-4 grid gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-center font-semibold text-slate-700">
                {operationDate}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-center font-semibold text-slate-700">
                {currentDayVisits.length} visita(s) base
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-center font-semibold text-slate-700">
                {currentDayEvents.length} evento(s)
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-4">
            {mode === 'CHANGE' ? (
              <div className="space-y-4">
                {!metadataEnabled ? (
                  <div className="rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    La solicitud formal de cambio sigue en modo compatible mientras la base local no tenga `metadata`.
                  </div>
                ) : null}
                <Select
                  label="Tipo de cambio"
                  name="change_request_type"
                  value={changeType}
                  onChange={(event) => {
                    const nextType = event.target.value as RutaSemanalItem['changeRequestType']
                    setChangeType(nextType)
                    if (nextType === 'CANCELACION_DIA') {
                      setDraftRoute([])
                    } else if (draftRoute.length === 0) {
                      setDraftRoute(buildDraftForDay(selectedDayNumber))
                    }
                  }}
                  options={[
                    { value: 'CAMBIO_DIA', label: 'Cambio de tiendas en un dia' },
                    { value: 'CANCELACION_DIA', label: 'Cancelacion de ruta del dia' },
                    { value: 'CAMBIO_TIENDA', label: 'Cambio de tienda en ruta' },
                  ]}
                />
                {changeType === 'CAMBIO_TIENDA' ? (
                  <Select
                    label="Tienda afectada"
                    name="target_visit_id"
                    value={selectedVisitId}
                    onChange={(event) => setSelectedVisitId(event.target.value)}
                    options={[{ value: '', label: 'Selecciona una tienda...' }, ...targetVisitOptions]}
                  />
                ) : (
                  <input type="hidden" name="target_visit_id" value="" />
                )}
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Nueva ruta propuesta</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Si la dejas vacia, el sistema entiende cancelacion total del dia.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setIsStorePickerOpen(true)}>
                      Definir tiendas del dia
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftRoute.length === 0 ? (
                      <div className="rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-400">
                        Este dia quedara sin tiendas en la ruta.
                      </div>
                    ) : (
                      draftRoute.map((item, index) => (
                        <div key={item.clientId} className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</p>
                            </div>
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                              #{index + 1}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => moveStoreWithinDraft(item.clientId, 'up')}>
                                Subir
                              </Button>
                              <Button type="button" variant="ghost" size="sm" disabled={index === draftRoute.length - 1} onClick={() => moveStoreWithinDraft(item.clientId, 'down')}>
                                Bajar
                              </Button>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeStoreFromDraft(item.clientId)}>
                              Quitar
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <Input
                  label="Justificacion obligatoria"
                  name="change_request_note"
                  defaultValue={route.changeRequestState === 'PENDIENTE' ? route.changeRequestNote ?? '' : ''}
                  placeholder="Ej. tienda cerrada, incidencia vial o cambio de prioridad"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {!agendaInfrastructureAvailable && agendaInfrastructureMessage ? (
                  <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {agendaInfrastructureMessage}
                  </div>
                ) : null}
                <Select
                  label="Tipo de evento"
                  name="tipo_evento"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value as RutaAgendaEventoItem['tipoEvento'])}
                  disabled={!agendaInfrastructureAvailable}
                  options={[
                    { value: 'VISITA_ADICIONAL', label: 'Visita adicional / cambio de tienda' },
                    { value: 'OFICINA', label: 'Junta / oficina' },
                    { value: 'FIRMA_CONTRATO', label: 'Firma de contrato' },
                    { value: 'FORMACION', label: 'Formacion' },
                    { value: 'ENTREGA_NUEVA_DC', label: 'Entrega de nueva DC' },
                    { value: 'PRESENTACION_GERENTE', label: 'Presentacion con gerente' },
                    { value: 'VISITA_EMERGENCIA', label: 'Visita de emergencia' },
                    { value: 'OTRO', label: 'Otro' },
                  ]}
                />
                <Select
                  label="Impacto sobre la ruta"
                  name="modo_impacto"
                  value={impactMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as RutaAgendaEventoItem['modoImpacto']
                    setImpactMode(nextMode)
                    if (nextMode === 'REEMPLAZA_TOTAL') {
                      setSelectedDisplacedVisitIds(currentDayVisits.map((visit) => visit.id))
                    } else if (nextMode === 'SUMA') {
                      setSelectedDisplacedVisitIds([])
                    }
                  }}
                  disabled={!agendaInfrastructureAvailable}
                  options={[
                    { value: 'SUMA', label: 'Se suma a la ruta del dia' },
                    { value: 'SOBREPONE_PARCIAL', label: 'Sobrepone parte de la ruta' },
                    { value: 'REEMPLAZA_TOTAL', label: 'Reemplaza toda la ruta del dia' },
                  ]}
                />
                <Input label="Titulo" name="titulo" placeholder="Ej. firma de contratos en oficina" disabled={!agendaInfrastructureAvailable} />
                <Input label="Descripcion" name="descripcion" placeholder="Contexto operativo del evento" disabled={!agendaInfrastructureAvailable} />
                <Input label="Sede u observacion" name="sede" placeholder="Oficina central, centro de formacion, etc." disabled={!agendaInfrastructureAvailable} />
                {eventType === 'VISITA_ADICIONAL' ? (
                  <Select
                    label="PDV del evento"
                    name="pdv_id"
                    disabled={!agendaInfrastructureAvailable}
                    options={[{ value: '', label: 'Selecciona un PDV...' }, ...pdvsDisponibles.map((item) => ({ value: item.id, label: item.nombre }))]}
                  />
                ) : (
                  <input type="hidden" name="pdv_id" value="" />
                )}
                {impactMode !== 'SUMA' && currentDayVisits.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visitas desplazadas</p>
                    <div className="space-y-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                      {currentDayVisits.map((visit) => {
                        const checked = impactMode === 'REEMPLAZA_TOTAL' || selectedDisplacedVisitIds.includes(visit.id)
                        return (
                          <label key={visit.id} className="flex items-start gap-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={impactMode === 'REEMPLAZA_TOTAL'}
                              onChange={(event) => {
                                setSelectedDisplacedVisitIds((current) =>
                                  event.target.checked
                                    ? [...current, visit.id]
                                    : current.filter((item) => item !== visit.id)
                                )
                              }}
                            />
                            <span>
                              <span className="font-medium text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {visit.zona ?? 'Sin zona'} · Orden {visit.orden}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Hora inicio" name="hora_inicio" type="time" disabled={!agendaInfrastructureAvailable} />
                  <Input label="Hora fin" name="hora_fin" type="time" disabled={!agendaInfrastructureAvailable} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[20px] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">Lo que ya esta programado ese dia</p>
            {currentDayVisits.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No hay visitas planeadas para ese dia.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {currentDayVisits.map((visit) => (
                  <div key={visit.id} className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getVisitTone(visit.estatus)}`}>
                        {visit.estatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {visit.zona ?? 'Sin zona'} · Orden {visit.orden}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">Contexto del dia</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Eventos</p>
                <p className="mt-2 text-sm text-slate-950">{currentDayEvents.length}</p>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tiendas sin visita</p>
                <p className="mt-2 text-sm text-slate-950">{currentDayPendings.length}</p>
              </div>
              {agendaHoy && agendaHoy.fecha === operationDate ? (
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Cumplimiento del dia: {agendaHoy.ejecutadasCount}/{agendaHoy.planeadasCount}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'CHANGE' ? (
            <Button type="submit" size="lg" formAction={changeAction} disabled={!metadataEnabled}>
              Solicitar cambio
            </Button>
          ) : (
            <Button type="submit" size="lg" formAction={eventAction} disabled={!agendaInfrastructureAvailable}>
              Registrar evento
            </Button>
          )}
          {activeState.message ? (
            <span className={`text-sm ${activeState.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {activeState.message}
            </span>
          ) : null}
        </div>
      </form>

      <ModalPanel
        open={isStorePickerOpen}
        onClose={() => setIsStorePickerOpen(false)}
        title={`Tiendas para ${getWeekDayLabel(selectedDayNumber)}`}
        subtitle="Construye la nueva ruta de ese dia y acomodala con subir o bajar."
      >
        <div className="space-y-4">
          <Input
            label="Buscar tienda"
            value={storeSearch}
            onChange={(event) => setStoreSearch(event.target.value)}
            placeholder="Nombre o zona"
          />
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {filteredPdvs.map((pdv) => {
              const currentDraft = draftRoute.find((item) => item.pdvId === pdv.id)
              return (
                <div
                  key={pdv.id}
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{pdv.nombre}</p>
                    <p className="mt-1 text-xs text-slate-500">{pdv.zona ?? pdv.formato ?? 'Sin zona'}</p>
                  </div>
                  <Button
                    type="button"
                    variant={currentDraft ? 'ghost' : 'secondary'}
                    onClick={() => {
                      if (currentDraft) {
                        removeStoreFromDraft(currentDraft.clientId)
                        return
                      }
                      addStoreToDraft(pdv.id)
                    }}
                  >
                    {currentDraft ? 'Quitar' : 'Agregar'}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </ModalPanel>
    </div>
  )
}

function getStoreTypeLabel(value: RutaQuotaProgressItem['clasificacionMaestra']) {
  if (value === 'FIJO') return 'Fija'
  if (value === 'ROTATIVO') return 'Rotativa'
  return 'Sin clasificar'
}

function getStoreTypeTone(value: RutaQuotaProgressItem['clasificacionMaestra']) {
  if (value === 'FIJO') return 'bg-emerald-100 text-emerald-700'
  if (value === 'ROTATIVO') return 'bg-sky-100 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}

function QuotaSummary({
  supervisor,
  items,
}: {
  supervisor: RutaSupervisorWarRoomItem
  items: RutaQuotaProgressItem[]
}) {
  const fixedStores = items.filter((item) => item.clasificacionMaestra === 'FIJO').length
  const rotationalStores = items.filter((item) => item.clasificacionMaestra === 'ROTATIVO').length
  const monthlyMinimumVisits = items.reduce((acc, item) => acc + item.quotaMensual, 0)

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cuotas minimas mensuales</p>
        <h4 className="mt-1 text-lg font-semibold text-slate-950">{monthlyMinimumVisits} visitas</h4>
        <p className="mt-1 text-sm text-slate-500">
          {supervisor.supervisor} · {supervisor.zona ?? 'Sin zona'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Tiendas fijas" value={String(fixedStores)} />
        <MiniStat label="Tiendas rotativas" value={String(rotationalStores)} />
        <MiniStat label="Tiendas visibles" value={String(items.length)} />
        <MiniStat label="Minimas del mes" value={String(monthlyMinimumVisits)} />
      </div>
    </div>
  )
}

function QuotaProgressList({
  supervisor,
  items,
  metadataEnabled,
  onPersistedQuotasChange,
}: {
  supervisor: RutaSupervisorWarRoomItem
  items: RutaQuotaProgressItem[]
  metadataEnabled: boolean
  onPersistedQuotasChange?: (quotas: Record<string, number>) => void
}) {
  const [state, formAction] = useActionState(actualizarControlRutaSemanal, ESTADO_RUTA_INICIAL)
  const [draftQuotas, setDraftQuotas] = useState<Record<string, number>>({})
  const [resolvedRouteId, setResolvedRouteId] = useState(supervisor.rutaId ?? '')
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftStoreRank = left.clasificacionMaestra === 'ROTATIVO' ? 1 : 0
        const rightStoreRank = right.clasificacionMaestra === 'ROTATIVO' ? 1 : 0

        if (leftStoreRank !== rightStoreRank) {
          return leftStoreRank - rightStoreRank
        }

        if ((left.cadena ?? '') !== (right.cadena ?? '')) {
          return (left.cadena ?? '').localeCompare(right.cadena ?? '', 'es')
        }

        if ((left.grupoRotacionCodigo ?? '') !== (right.grupoRotacionCodigo ?? '')) {
          const leftGroup = left.grupoRotacionCodigo ?? `FIJO-${left.nombre}`
          const rightGroup = right.grupoRotacionCodigo ?? `FIJO-${right.nombre}`
          return leftGroup.localeCompare(rightGroup, 'es')
        }

        return left.nombre.localeCompare(right.nombre, 'es')
      }),
    [items]
  )
  const fixedItems = useMemo(
    () => sortedItems.filter((item) => item.clasificacionMaestra !== 'ROTATIVO'),
    [sortedItems]
  )
  const rotationalGroups = useMemo(() => {
    const grouped = new Map<string, RutaQuotaProgressItem[]>()

    for (const item of sortedItems) {
      if (item.clasificacionMaestra !== 'ROTATIVO') {
        continue
      }

      const groupKey = item.grupoRotacionCodigo ?? `ROTATIVO-${item.pdvId}`
      const current = grouped.get(groupKey) ?? []
      current.push(item)
      grouped.set(groupKey, current)
    }

    return Array.from(grouped.entries()).map(([groupCode, groupItems]) => ({
      groupCode,
      items: groupItems,
    }))
  }, [sortedItems])
  const canSave = metadataEnabled

  useEffect(() => {
    const nextFromItems = Object.fromEntries(items.map((item) => [item.pdvId, item.quotaMensual]))

    return scheduleEffectStateUpdate(() => {
      setDraftQuotas(() => {
        if (state.ok && state.savedPdvMonthlyQuotas) {
          return {
            ...nextFromItems,
            ...state.savedPdvMonthlyQuotas,
          }
        }

        return nextFromItems
      })
    })
  }, [items, state.ok, state.savedPdvMonthlyQuotas])

  useEffect(() => {
    return scheduleEffectStateUpdate(() => {
      setResolvedRouteId(supervisor.rutaId ?? '')
    })
  }, [supervisor.rutaId, supervisor.supervisorEmpleadoId, supervisor.weekStart])

  useEffect(() => {
    if (!state.ok || !state.savedPdvMonthlyQuotas) {
      return
    }

    const savedPdvMonthlyQuotas = state.savedPdvMonthlyQuotas
    const savedRouteId = state.savedRouteId

    return scheduleEffectStateUpdate(() => {
      setDraftQuotas((current) => ({
        ...current,
        ...savedPdvMonthlyQuotas,
      }))
      onPersistedQuotasChange?.(savedPdvMonthlyQuotas)

      if (savedRouteId) {
        setResolvedRouteId(savedRouteId)
      }
    })
  }, [onPersistedQuotasChange, state.ok, state.savedPdvMonthlyQuotas, state.savedRouteId])




  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Tiendas filtradas</h4>
        <p className="text-sm text-slate-600">Aqui solo asignamos visitas minimas mensuales por PDV.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState copy="No hay tiendas visibles con el filtro aplicado." />
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="ruta_id" value={resolvedRouteId} />
          <input type="hidden" name="supervisor_empleado_id" value={supervisor.supervisorEmpleadoId} />
          <input type="hidden" name="semana_inicio" value={supervisor.weekStart} />

          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(239,246,255,0.92))] px-5 py-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.28)]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-lg font-semibold text-slate-950">Asignacion mensual de visitas</p>
                <p className="mt-1 text-sm text-slate-600">
                Ajusta la cuota minima de visitas del mes para cada tienda visible y guarda el bloque solo cuando termine tu filtro.
                </p>
                {!metadataEnabled ? (
                  <p className="mt-3 text-xs text-amber-700">
                    La lectura del War Room ya funciona, pero para guardar cuotas primero hay que aplicar la migracion del workflow de ruta semanal.
                  </p>
                ) : !supervisor.rutaId ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Este supervisor aun no tiene una ruta base visible para la semana seleccionada. Al guardar las cuotas, el sistema creara la base operativa para que despues el supervisor arme sus rutas semanales contra ese objetivo mensual.
                  </p>
                ) : null}
                {state.message ? (
                  <p className={`mt-3 text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
                ) : null}
              </div>
              <div className="flex justify-start lg:justify-end">
                <SubmitButton label="Guardar cuotas" disabled={!canSave} />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {fixedItems.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Tiendas fijas
                  </h5>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {fixedItems.length} PDV
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {fixedItems.map((item) => (
                    <QuotaPdvCard
                      key={item.pdvId}
                      item={item}
                      quotaValue={draftQuotas[item.pdvId] ?? item.quotaMensual}
                      canSave={canSave}
                      onQuotaChange={(nextValue) =>
                        setDraftQuotas((current) => ({
                          ...current,
                          [item.pdvId]: nextValue,
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {rotationalGroups.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Familias rotativas
                  </h5>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
                    {rotationalGroups.length} grupos
                  </span>
                </div>
                <div className="space-y-4">
                  {rotationalGroups.map((group) => (
                    <div
                      key={group.groupCode}
                      className="rounded-[24px] border border-sky-100 bg-[linear-gradient(180deg,rgba(240,249,255,0.9),rgba(255,255,255,0.95))] px-4 py-4 shadow-[0_20px_40px_-36px_rgba(14,116,144,0.45)]"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{group.groupCode}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Pareja o trio rotativo tratado como una mini-familia visual.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-sky-700">
                          {group.items.length} PDV
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((item) => (
                          <QuotaPdvCard
                            key={item.pdvId}
                            item={item}
                            quotaValue={draftQuotas[item.pdvId] ?? item.quotaMensual}
                            canSave={canSave}
                            compactGroup
                            onQuotaChange={(nextValue) =>
                              setDraftQuotas((current) => ({
                                ...current,
                                [item.pdvId]: nextValue,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </form>
      )}
    </div>
  )
}

function QuotaPdvCard({
  item,
  quotaValue,
  canSave,
  onQuotaChange,
  compactGroup = false,
}: {
  item: RutaQuotaProgressItem
  quotaValue: number
  canSave: boolean
  onQuotaChange: (nextValue: number) => void
  compactGroup?: boolean
}) {
  return (
    <div
      className={`flex min-h-[188px] flex-col justify-between rounded-[24px] border bg-white px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)] transition hover:border-slate-300 ${
        compactGroup ? 'border-sky-100' : 'border-slate-200'
      }`}
    >
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-start gap-2">
          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-slate-950">{item.nombre}</p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStoreTypeTone(item.clasificacionMaestra)}`}>
            {getStoreTypeLabel(item.clasificacionMaestra)}
          </span>
        </div>
        <div className="space-y-1 text-sm text-slate-600">
          <p className="truncate">{item.cadena ?? 'Sin cadena'} · {item.zona ?? item.formato ?? 'Sin zona'}</p>
          {item.grupoRotacionCodigo ? (
            <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              {item.grupoRotacionCodigo}
            </p>
          ) : null}
          <p className="truncate text-xs text-slate-400">{item.claveBtl}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Minimas asignadas
          </p>
          <p className="mt-3 text-[2rem] font-semibold leading-none text-slate-950">{String(quotaValue)}</p>
        </div>
        <label className="grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Visitas del mes
          <Input
            name={`pdv_quota_${item.pdvId}`}
            type="number"
            min="0"
            value={String(quotaValue)}
            onChange={(event) =>
              onQuotaChange(Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0))
            }
            disabled={!canSave}
            className="h-12 border-slate-200 bg-white text-center text-2xl font-semibold text-slate-950"
          />
        </label>
      </div>
    </div>
  )
}

function CoordinatorReachWorkspace({
  supervisors,
}: {
  supervisors: RutaSupervisorWarRoomItem[]
}) {
  const supervisorRows = useMemo(
    () =>
      supervisors
        .map((supervisor) => {
          const monthlyPending = Math.max(supervisor.expectedMonthlyVisits - supervisor.monthlyVisitsCompleted, 0)
          const storesWithoutVisitMonth = supervisor.quotaProgress.filter(
            (item) => item.quotaMensual > 0 && item.visitasRealizadas === 0
          ).length

          return {
            ...supervisor,
            monthlyPending,
            storesWithoutVisitMonth,
          }
        })
        .sort((left, right) => right.cumplimientoPorcentaje - left.cumplimientoPorcentaje || left.supervisor.localeCompare(right.supervisor, 'es')),
    [supervisors]
  )

  const totals = supervisorRows.reduce(
    (acc, item) => {
      acc.supervisors += 1
      acc.monthlyTarget += item.expectedMonthlyVisits
      acc.monthlyCompleted += item.monthlyVisitsCompleted
      acc.monthlyPending += item.monthlyPending
      acc.storesWithoutVisitMonth += item.storesWithoutVisitMonth
      acc.critical += item.semaforo === 'CRITICO' ? 1 : 0
      return acc
    },
    {
      supervisors: 0,
      monthlyTarget: 0,
      monthlyCompleted: 0,
      monthlyPending: 0,
      storesWithoutVisitMonth: 0,
      critical: 0,
    }
  )

  const monthlyCompletionPct =
    totals.monthlyTarget > 0
      ? Math.max(0, Math.min(100, Math.round((totals.monthlyCompleted / totals.monthlyTarget) * 100)))
      : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Supervisores visibles" value={String(totals.supervisors)} />
        <MetricCard label="Objetivo mensual" value={String(totals.monthlyTarget)} />
        <MetricCard label="Realizadas mes" value={String(totals.monthlyCompleted)} />
        <MetricCard label="Pendientes mes" value={String(totals.monthlyPending)} tone="amber" />
        <MetricCard label="Cumplimiento mes" value={`${monthlyCompletionPct}%`} />
        <MetricCard label="Sin visita mes" value={String(totals.storesWithoutVisitMonth)} tone="amber" />
        <MetricCard label="Supervisores en riesgo" value={String(totals.critical)} tone="amber" />
      </div>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Lectura visual del alcance mensual</h3>
            <p className="mt-1 text-sm text-slate-500">
              Arriba dejamos los KPIs; abajo vemos solo el avance mensual por supervisor contra su cuota vigente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Hechas</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Pendientes</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Sin visita mes</span>
          </div>
        </div>

        {supervisorRows.length === 0 ? (
          <EmptyState copy="No hay supervisores visibles con los filtros actuales para calcular alcance." />
        ) : (
          <div className="space-y-4">
            {supervisorRows.map((item) => (
              <div key={item.supervisorEmpleadoId} className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-slate-950">{item.supervisor}</h4>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getSemaforoTone(item.semaforo)}`}>
                        {item.semaforo}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.zona ?? 'Sin zona'} · {item.totalPdvsAsignados} PDVs visibles
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MiniStat label="Meta mes" value={String(item.expectedMonthlyVisits)} />
                    <MiniStat label="Hechas mes" value={String(item.monthlyVisitsCompleted)} />
                    <MiniStat label="Pendientes mes" value={String(item.monthlyPending)} />
                    <MiniStat label="Sin visita mes" value={String(item.storesWithoutVisitMonth)} />
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">Cumplimiento mensual</p>
                    <span className="text-sm font-semibold text-slate-700">{item.cumplimientoPorcentaje}%</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: getProgressBarWidth(item.cumplimientoPorcentaje) }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>Hechas {item.monthlyVisitsCompleted}</span>
                    <span>Pendientes {item.monthlyPending}</span>
                    <span>Objetivo {item.expectedMonthlyVisits}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function CoordinatorCoverageWorkspace({
  supervisor,
  routes,
  selectedWeekStart,
  expandedRouteId,
  onExpandRoute,
  selectedDayNumber,
  onSelectDay,
  selectedVisitId,
  onSelectVisit,
}: {
  supervisor: RutaSupervisorWarRoomItem | null
  routes: RutaSemanalItem[]
  selectedWeekStart: string
  expandedRouteId: string | null
  onExpandRoute: (routeId: string) => void
  selectedDayNumber: number | null
  onSelectDay: (dayNumber: number) => void
  selectedVisitId: string | null
  onSelectVisit: (visitId: string | null) => void
}) {
  const coverageItems = supervisor?.quotaProgress ?? []
  const expandedRoute = routes.find((route) => route.id === expandedRouteId) ?? routes[0] ?? null
  const weeklyAssigned = routes.reduce((acc, route) => acc + route.totalVisitas, 0)
  const weeklyCompleted = routes.reduce((acc, route) => acc + route.visitasCompletadas, 0)
  const weeklyPending = Math.max(weeklyAssigned - weeklyCompleted, 0)
  const weeklyCompletion =
    weeklyAssigned > 0 ? Math.max(0, Math.min(100, Math.round((weeklyCompleted / weeklyAssigned) * 100))) : 0
  const completedVisitIdsThisWeek = new Set(
    routes.flatMap((route) => route.visitas.filter((visit) => visit.estatus === 'COMPLETADA').map((visit) => visit.pdvId))
  )
  const storesWithoutVisitsWeek = coverageItems.filter(
    (item) => item.quotaMensual > 0 && !completedVisitIdsThisWeek.has(item.pdvId)
  )
  const availableDays = expandedRoute
    ? Array.from(new Set(expandedRoute.visitas.map((visit) => visit.diaSemana))).sort((left, right) => left - right)
    : []
  const effectiveDayNumber =
    selectedDayNumber !== null && availableDays.includes(selectedDayNumber)
      ? selectedDayNumber
      : availableDays[0] ?? null
  const selectedDayVisits =
    effectiveDayNumber === null || !expandedRoute
      ? []
      : expandedRoute.visitas.filter((visit) => visit.diaSemana === effectiveDayNumber)
  const selectedVisit =
    selectedDayVisits.find((visit) => visit.id === selectedVisitId) ?? selectedDayVisits[0] ?? null

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Rutas activas" value={String(routes.length)} />
        <MetricCard label="Planeadas semana" value={String(weeklyAssigned)} />
        <MetricCard label="Realizadas semana" value={String(weeklyCompleted)} />
        <MetricCard label="Pendientes semana" value={String(weeklyPending)} tone="amber" />
        <MetricCard label="Cumplimiento semana" value={`${weeklyCompletion}%`} />
        <MetricCard label="Sin visita semana" value={String(storesWithoutVisitsWeek.length)} tone="amber" />
      </div>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">
              {supervisor?.supervisor ?? 'Detalle semanal de rutas activas'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Primero elige una ruta aprobada, luego selecciona el dia y solo despues abre el detalle de las visitas enviadas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Semana visible {formatDate(selectedWeekStart)} - {formatDate(getWeekEndIso(selectedWeekStart))}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSemaforoTone(supervisor?.semaforo ?? 'CRITICO')}`}>
              {supervisor?.semaforo ?? 'SIN DATOS'}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Rutas aprobadas" value={String(routes.length)} />
          <MiniStat label="Planeadas semana" value={String(weeklyAssigned)} />
          <MiniStat label="Realizadas semana" value={String(weeklyCompleted)} />
          <MiniStat label="Pendientes semana" value={String(weeklyPending)} />
          <MiniStat label="Sin visita semana" value={String(storesWithoutVisitsWeek.length)} />
        </div>

        {storesWithoutVisitsWeek.length === 0 ? (
          <EmptyState copy="No hay tiendas con cuota vigente que se hayan quedado sin visita en la semana seleccionada." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {storesWithoutVisitsWeek.map((item) => (
              <div key={item.pdvId} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-950">{item.nombre}</p>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getStoreTypeTone(item.clasificacionMaestra)}`}>
                    {getStoreTypeLabel(item.clasificacionMaestra)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.cadena ?? 'Sin cadena'} · {item.zona ?? item.formato ?? 'Sin zona'}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MiniStat label="Meta mes" value={String(item.quotaMensual)} />
                  <MiniStat label="Hechas" value={String(item.visitasRealizadas)} />
                  <MiniStat label="Pendientes" value={String(item.visitasPendientes)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Rutas semanales visibles</h3>
          <p className="mt-1 text-sm text-slate-500">
            Primero abre la ruta, luego revisa sus visitas y solo despues entra al detalle completo.
          </p>
        </div>

        {routes.length === 0 ? (
          <EmptyState copy="No hay rutas aprobadas visibles para este supervisor en la semana seleccionada." />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              {routes.map((route) => {
                const isExpanded = route.id === (expandedRoute?.id ?? null)
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => onExpandRoute(route.id)}
                    className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                      isExpanded
                        ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          Semana {formatDate(route.semanaInicio)} - {formatDate(route.semanaFin)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {route.totalVisitas} visitas · {route.visitasCompletadas} completadas
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteTone(route.estatus)}`}>
                        {route.estatus}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="space-y-4">
              {expandedRoute ? (
                <>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          Ruta activa {formatDate(expandedRoute.semanaInicio)} - {formatDate(expandedRoute.semanaFin)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Selecciona un dia para ver solo las visitas programadas ahi.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {expandedRoute.visitas.length} visitas
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {availableDays.map((dayNumber) => {
                        const visitsForDay = expandedRoute.visitas.filter((visit) => visit.diaSemana === dayNumber)
                        const active = dayNumber === effectiveDayNumber
                        return (
                          <button
                            key={dayNumber}
                            type="button"
                            onClick={() => onSelectDay(dayNumber)}
                            className={`rounded-full border px-3 py-2 text-left transition ${
                              active
                                ? 'border-[var(--module-border)] bg-white text-slate-950'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <span className="block text-xs font-semibold uppercase tracking-[0.14em]">
                              {getWeekDayLabel(dayNumber)}
                            </span>
                            <span className="mt-1 block text-sm font-medium">
                              {formatDate(addDaysToWeek(expandedRoute.semanaInicio, dayNumber))}
                            </span>
                            <span className="mt-1 block text-xs">
                              {visitsForDay.length} visita(s)
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {selectedDayVisits.map((visit) => {
                        const active = visit.id === selectedVisitId
                        return (
                          <button
                            key={visit.id}
                            type="button"
                            onClick={() => onSelectVisit(active ? null : visit.id)}
                            className={`rounded-[18px] border px-4 py-4 text-left transition ${
                              active
                                ? 'border-[var(--module-border)] bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {visit.diaLabel} · Orden {visit.orden}
                                </p>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getVisitTone(visit.estatus)}`}>
                                {visit.estatus}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {selectedDayVisits.length === 0 ? (
                    <EmptyState copy="No hay visitas cargadas para el dia seleccionado en esta ruta." />
                  ) : selectedVisit ? (
                    <VisitCard item={selectedVisit} canEdit={false} />
                  ) : (
                    <EmptyState copy="Selecciona una visita para abrir el detalle consultivo." />
                  )}
                </>
              ) : (
                <EmptyState copy="Selecciona una ruta para revisar sus visitas." />
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function BlockedDaysCard({ items }: { items: RutaSupervisorWarRoomItem['blockedDays'] }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
        Calendario de disponibilidad
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Sin dias bloqueados visibles para este mes.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item.solicitudId}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ReassignmentAlertsCard({ items }: { items: RutaSupervisorWarRoomItem['reassignmentAlerts'] }) {
  return (
    <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
      <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        Reasignacion sugerida
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-amber-900">Sin alertas de reasignacion por ahora.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.visitId} className="rounded-[18px] border border-amber-200 bg-white px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-950">
                {item.diaLabel} · {item.pdv ?? 'PDV sin nombre'}
              </p>
              <p className="mt-1 text-xs text-slate-600">{item.motivo}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HeatMapCard({
  items,
  showCatalog = false,
  title = 'Mapa de calor',
  helper = 'Dispersion geografica de PDVs con visitas pendientes.',
}: {
  items: RutaQuotaProgressItem[]
  showCatalog?: boolean
  title?: string
  helper?: string
}) {
  const points = items.filter((item) => item.latitud !== null && item.longitud !== null)
  const mapPoints: MexicoMapPoint[] = points.map((item) => ({
    id: item.pdvId,
    lat: item.latitud as number,
    lng: item.longitud as number,
    title: item.nombre,
    subtitle: item.zona ?? 'Sin zona',
    detail: `Pendientes ${item.visitasPendientes} · Realizadas ${item.visitasRealizadas} · Quota ${item.quotaMensual}`,
    tone:
      item.prioridad === 'ALTA'
        ? 'rose'
        : item.prioridad === 'MEDIA'
          ? 'amber'
          : 'emerald',
  }))

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            {title}
          </h4>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <span className="rounded-full bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
          {points.length} puntos
        </span>
      </div>

      {points.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Faltan coordenadas para mostrar este mapa de calor.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <MexicoMap points={mapPoints} heightClassName="h-[320px]" minZoom={4} maxZoom={12} />
          {showCatalog && (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {points.map((item) => (
                <div
                  key={item.pdvId}
                  className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600"
                >
                  <p className="truncate font-semibold text-slate-900">{item.nombre}</p>
                  <p className="mt-1 truncate">{item.zona ?? 'Sin zona'}</p>
                  <p className="mt-1">
                    Pendientes {item.visitasPendientes} · Quota {item.quotaMensual}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      {copy}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string
  tone?: 'slate' | 'amber'
}) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      tone={tone}
      valueClassName={`${metricValueClass(value)} ${tone === 'amber' ? 'text-amber-800' : 'text-slate-950'}`}
      className="px-4 py-4"
      labelClassName="text-xs"
    />
  )
}

function SubmitButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="min-h-11 min-w-36" disabled={pending || disabled}>
      {pending ? 'Guardando...' : label}
    </Button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1.5 font-semibold text-slate-950 ${metricValueClass(value)}`}>{value}</p>
    </div>
  )
}

function SubmitActionButton({
  label,
  pendingLabel,
  disabled = false,
}: {
  label: string
  pendingLabel: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" disabled={disabled || pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function TodayRouteStrip({ visits }: { visits: RutaSemanalVisitItem[] }) {
  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Mi ruta de hoy
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {visits.length === 0 ? 'Sin visitas para hoy' : `${visits.length} visita(s) programadas`}
          </h2>
          <p className="mt-2 text-sm text-slate-500">Ruta del dia, en una vista rapida.</p>
        </div>
        <span className="rounded-full bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
          Hoy
        </span>
      </div>

      {visits.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          En cuanto exista una visita programada para el dia aparecera aqui.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {visits.map((visit) => (
            <div key={visit.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</p>
                  <p className="mt-1 text-xs text-slate-500">{visit.zona ?? 'Sin zona'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getVisitTone(visit.estatus)}`}>
                  {visit.estatus}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <span className="rounded-full bg-white px-3 py-1">Entrada {formatDateTime(visit.checkInAt)}</span>
                <span className="rounded-full bg-white px-3 py-1">Salida {formatDateTime(visit.checkOutAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function AgendaOperativaOverviewCard({
  routeId,
  agendaHoy,
  pdvsDisponibles,
  agendaInfrastructureAvailable,
  agendaInfrastructureMessage,
}: {
  routeId: string | null
  agendaHoy: RutaAgendaOperativaDia | null
  pdvsDisponibles: RutaSemanalPanelData['pdvsDisponibles']
  agendaInfrastructureAvailable: boolean
  agendaInfrastructureMessage?: string
}) {
  const [state, formAction] = useActionState(registrarEventoAgendaRutaSemanal, ESTADO_RUTA_INICIAL)
  const [selectedDate, setSelectedDate] = useState(agendaHoy?.fecha ?? '')
  const [impactMode, setImpactMode] = useState<RutaAgendaEventoItem['modoImpacto']>('SUMA')
  const [eventType, setEventType] = useState<RutaAgendaEventoItem['tipoEvento']>('VISITA_ADICIONAL')
  const [selectedDisplacedVisitIds, setSelectedDisplacedVisitIds] = useState<string[]>([])

  useEffect(() => {
    return scheduleEffectStateUpdate(() => {
      setSelectedDate(agendaHoy?.fecha ?? '')
      setSelectedDisplacedVisitIds([])
    })
  }, [agendaHoy?.fecha])

  const currentDayVisits = agendaHoy?.visitasPlaneadas ?? []

  return (
    <Card className="border-slate-200 bg-white shadow-none">
      <form action={formAction} className="space-y-3 rounded-[20px] border border-slate-200 bg-white p-3">
          <input type="hidden" name="ruta_id" value={routeId ?? ''} />
          <input
            type="hidden"
            name="displaced_visit_ids_json"
            value={JSON.stringify(selectedDisplacedVisitIds)}
          />
          {!agendaInfrastructureAvailable && agendaInfrastructureMessage ? (
            <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {agendaInfrastructureMessage}
            </div>
          ) : null}
          <Input
            label="Fecha"
            type="date"
            name="fecha_operacion"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            disabled={!agendaInfrastructureAvailable}
          />
          <Select
            label="Tipo"
            name="tipo_evento"
            value={eventType}
            onChange={(event) => setEventType(event.target.value as RutaAgendaEventoItem['tipoEvento'])}
            disabled={!agendaInfrastructureAvailable}
            options={[
              { value: 'VISITA_ADICIONAL', label: 'Visita adicional / cambio de tienda' },
              { value: 'OFICINA', label: 'Junta / oficina' },
              { value: 'FIRMA_CONTRATO', label: 'Firma de contrato' },
              { value: 'FORMACION', label: 'Formacion' },
              { value: 'ENTREGA_NUEVA_DC', label: 'Entrega de nueva DC' },
              { value: 'PRESENTACION_GERENTE', label: 'Presentacion con gerente' },
              { value: 'VISITA_EMERGENCIA', label: 'Visita de emergencia' },
              { value: 'OTRO', label: 'Otro' },
            ]}
          />
          <Select
            label="Impacto"
            name="modo_impacto"
            value={impactMode}
            onChange={(event) => {
              const nextMode = event.target.value as RutaAgendaEventoItem['modoImpacto']
              setImpactMode(nextMode)
              if (nextMode === 'REEMPLAZA_TOTAL') {
                setSelectedDisplacedVisitIds(currentDayVisits.map((visit) => visit.id))
              } else if (nextMode === 'SUMA') {
                setSelectedDisplacedVisitIds([])
              }
            }}
            disabled={!agendaInfrastructureAvailable}
            options={[
              { value: 'SUMA', label: 'Se suma a la ruta del dia' },
              { value: 'SOBREPONE_PARCIAL', label: 'Sobrepone parte de la ruta' },
              { value: 'REEMPLAZA_TOTAL', label: 'Reemplaza toda la ruta del dia' },
            ]}
          />
          <Input
            label="Titulo"
            name="titulo"
            placeholder="Ej. Visita adicional"
            disabled={!agendaInfrastructureAvailable}
          />
          <Input
            label="Descripcion"
            name="descripcion"
            placeholder="Motivo o nota breve"
            disabled={!agendaInfrastructureAvailable}
          />
          {eventType === 'VISITA_ADICIONAL' ? (
            <Select
              label="PDV"
              name="pdv_id"
              disabled={!agendaInfrastructureAvailable}
              options={[
                { value: '', label: 'Selecciona un PDV...' },
                ...pdvsDisponibles.map((item) => ({ value: item.id, label: item.nombre })),
              ]}
            />
          ) : (
            <input type="hidden" name="pdv_id" value="" />
          )}

          {impactMode !== 'SUMA' && currentDayVisits.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visitas desplazadas
              </p>
              <div className="space-y-2 rounded-[16px] border border-slate-200 bg-slate-50 p-2.5">
                {currentDayVisits.map((visit) => {
                  const checked =
                    impactMode === 'REEMPLAZA_TOTAL' || selectedDisplacedVisitIds.includes(visit.id)
                  return (
                    <label key={visit.id} className="flex items-start gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={impactMode === 'REEMPLAZA_TOTAL'}
                        onChange={(event) => {
                          setSelectedDisplacedVisitIds((current) =>
                            event.target.checked
                              ? [...current, visit.id]
                              : current.filter((item) => item !== visit.id)
                          )
                        }}
                      />
                      <span>
                        <span className="font-medium text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{visit.zona ?? 'Sin zona'} · #{visit.orden}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}
          <SubmitActionButton
            label="Registrar evento"
            pendingLabel="Guardando..."
            disabled={!agendaHoy || !agendaInfrastructureAvailable}
          />
          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
          )}
      </form>
    </Card>
  )
}

export function SupervisorDayEventFormCard({
  data,
}: {
  data: RutaSemanalPanelData
}) {
  return (
    <AgendaOperativaOverviewCard
      routeId={data.rutaSemanaActual?.id ?? null}
      agendaHoy={data.agendaHoy}
      pdvsDisponibles={data.pdvsDisponibles}
      agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
      agendaInfrastructureMessage={data.agendaInfrastructureMessage}
    />
  )
}

function AgendaEventEvidenceCenter({ events }: { events: RutaAgendaEventoItem[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => events[0]?.id ?? null)
  const [draft, setDraft] = useState<AgendaEventEvidenceDraft | null>(null)
  const [comments, setComments] = useState(() => events[0]?.descripcion ?? '')
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null)
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl)
      }
    }
  }, [draft])

  const buildSilentGpsFallback = (): { position: CapturedPosition; estadoGps: AttendanceGpsState } => ({
    position: {
      latitud: null,
      longitud: null,
      precision: null,
      distanciaMetros: null,
      dentroGeocerca: null,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: 'SIN_GPS',
  })

  const handleCapture = async (file: File) => {
    const gpsCapture = await captureAttendancePosition({
      geocercaLatitud: null,
      geocercaLongitud: null,
      geocercaRadioMetros: null,
    }).catch(() => buildSilentGpsFallback())
    const capturedAt = new Date().toISOString()
    const stamped = await stampAttendanceSelfie(file, {
      capturedAt,
      latitude: gpsCapture.position.latitud,
      longitude: gpsCapture.position.longitud,
      flowLabel: 'Evidencia',
      hideGpsCoordinates: true,
    })
    const hash = await calcularHashArchivo(stamped.file)
    setDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }
      return {
        file: stamped.file,
        previewUrl: URL.createObjectURL(stamped.file),
        hash,
        capturedAt,
        position: gpsCapture.position,
        gpsState: gpsCapture.estadoGps,
      }
    })
  }

  const submitEvidence = () => {
    if (!selectedEvent || !draft) {
      setState({ ok: false, message: 'Primero selecciona un evento y toma la selfie.' })
      return
    }

    if (!comments.trim()) {
      setState({ ok: false, message: 'Agrega el motivo de la visita o evento.' })
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('agenda_evento_id', selectedEvent.id)
      formData.set('selfie_file', draft.file)
      formData.set('latitud', String(draft.position.latitud ?? ''))
      formData.set('longitud', String(draft.position.longitud ?? ''))
      formData.set('distancia_metros', String(draft.position.distanciaMetros ?? ''))
      formData.set('estado_gps', draft.gpsState)
      formData.set('comments', comments)

      try {
        await injectDirectR2Upload(formData, draft.file, {
          modulo: 'rutas',
          removeFieldName: 'selfie_file',
          fieldNames: {
            objectKey: 'selfie_r2_object_key',
            sha256: 'selfie_r2_sha256',
            fileName: 'selfie_r2_file_name',
            contentType: 'selfie_r2_type',
            size: 'selfie_r2_size',
          },
          thumbnailFieldNames: {
            objectKey: 'selfie_thumbnail_r2_object_key',
            sha256: 'selfie_thumbnail_r2_sha256',
            fileName: 'selfie_thumbnail_r2_file_name',
            contentType: 'selfie_thumbnail_r2_type',
            size: 'selfie_thumbnail_r2_size',
          },
        })
      } catch (error) {
        console.error('No fue posible subir la selfie del evento a R2.', error)
      }

      const result = await registrarEvidenciaEventoAgendaRutaSemanal(ESTADO_RUTA_INICIAL, formData)
      setState({
        ok: result.ok,
        message: result.message ?? (result.ok ? 'Evidencia registrada.' : 'No fue posible registrar la evidencia.'),
      })
    })
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Evidencia de eventos no comunes</p>
          <p className="mt-1 text-xs text-slate-500">
            Captura unica: selfie, motivo, fecha/hora y GPS en segundo plano para el historico operativo.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
          {events.length} evento(s)
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-2">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => {
                setSelectedEventId(event.id)
                setDraft((current) => {
                  if (current?.previewUrl) {
                    URL.revokeObjectURL(current.previewUrl)
                  }
                  return null
                })
                setComments(event.descripcion ?? '')
                setState(null)
              }}
              className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${
                selectedEvent?.id === event.id
                  ? 'border-slate-950 bg-white shadow-sm'
                  : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{event.titulo}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.tipoLabel} · {event.pdv ?? event.sede ?? 'Lugar por confirmar'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgendaExecutionTone(event.estatusEjecucion)}`}>
                  {event.estatusEjecucion}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white p-4">
          {selectedEvent ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{selectedEvent.titulo}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedEvent.fechaOperacion} · {selectedEvent.horaInicio ?? 'Hora pendiente'}
                </p>
              </div>

              {selectedEvent.selfieUrl || draft ? (
                <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
                  <img
                    src={draft?.previewUrl ?? selectedEvent.selfieUrl ?? ''}
                    alt="Evidencia del evento"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
              ) : null}

              <label className="block text-sm text-slate-700">
                <span className="font-semibold">Motivo de la visita</span>
                <textarea
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setIsCameraOpen(true)}>
                  Abrir selfie
                </Button>
                <Button type="button" variant="secondary" onClick={submitEvidence} disabled={!draft || isPending}>
                  {isPending ? 'Guardando...' : 'Registrar evidencia'}
                </Button>
              </div>

              {state?.message ? (
                <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
              ) : null}
            </div>
          ) : (
            <EmptyState copy="Selecciona un evento para registrar su evidencia." />
          )}
        </div>
      </div>

      <NativeCameraSelfieDialog
        open={isCameraOpen}
        title="Selfie del evento"
        description="Toma una selfie para documentar la visita no comun. El GPS se intentara capturar en segundo plano."
        captureLabel="Capturar selfie"
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapture}
      />
    </div>
  )
}

function AgendaApprovalsCard({
  route,
  events,
  pendingRepositions,
  agendaInfrastructureAvailable,
  agendaInfrastructureMessage,
}: {
  route: RutaSemanalItem
  events: RutaAgendaEventoItem[]
  pendingRepositions: RutaPendienteReposicionItem[]
  agendaInfrastructureAvailable: boolean
  agendaInfrastructureMessage?: string
}) {
  const [state, formAction] = useActionState(resolverEventoAgendaRutaSemanal, ESTADO_RUTA_INICIAL)

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agenda dinamica</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Eventos y reposiciones</h3>
          <p className="mt-2 text-sm text-slate-500">
            La ruta aprobada sigue como base; aqui se revisan sobreposiciones del dia y visitas por reponer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {events.length} evento(s) por resolver
          </span>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
            {pendingRepositions.length} pendiente(s)
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Eventos pendientes de coordinacion</p>
          {!agendaInfrastructureAvailable && agendaInfrastructureMessage ? (
            <p className="mt-3 text-sm text-amber-800">{agendaInfrastructureMessage}</p>
          ) : null}
          {events.length === 0 || !agendaInfrastructureAvailable ? (
            <p className="mt-3 text-sm text-slate-500">No hay eventos extraordinarios pendientes para esta ruta.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <form key={event.id} action={formAction} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                  <input type="hidden" name="agenda_evento_id" value={event.id} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{event.titulo}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.dayLabel} · {event.tipoLabel} · {event.impactoLabel}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgendaApprovalTone(event.estatusAprobacion)}`}>
                      {event.estatusAprobacion}
                    </span>
                  </div>
                  {event.descripcion ? <p className="mt-3 text-sm text-slate-600">{event.descripcion}</p> : null}
                  {event.displacedVisitIds.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Desplaza {event.displacedVisitIds.length} visita(s) de la ruta base.
                    </p>
                  ) : null}
                  <Input
                    label="Resolucion"
                    name="resolution_note"
                    placeholder="Comentario de aprobacion o rechazo"
                    className="mt-3"
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      name="decision"
                      value="APROBAR"
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Aprobar evento
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="RECHAZAR"
                      className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    >
                      Rechazar evento
                    </button>
                  </div>
                </form>
              ))}
            </div>
          )}
          {state.message ? (
            <p className={`mt-3 text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
          ) : null}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Bandeja de visitas por reponer</p>
          {pendingRepositions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Todavia no hay visitas pendientes por reponer en esta ruta.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pendingRepositions.map((item) => (
                <div key={item.id} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.pdv ?? 'PDV sin nombre'}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.clasificacion === 'JUSTIFICADA'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {item.clasificacion}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.fechaOrigen} · {item.zona ?? 'Sin zona'}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{item.motivo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanificarRutaCard({
  data,
  onOpenCorrections,
  onOpenHistory,
}: {
  data: RutaSemanalPanelData
  onOpenCorrections: (routeId: string) => void
  onOpenHistory: (routeId: string) => void
}) {
  const minimumWeekStart = getWeekStartIso(data.semanaActualInicio)
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => minimumWeekStart)
  const planningRoute = useMemo(
    () => getPlanningRouteForWeek(data.rutas, selectedWeekStart),
    [data.rutas, selectedWeekStart]
  )
  const approvedRoute = useMemo(
    () => (planningRoute && isApprovedOperationalRoute(planningRoute) ? planningRoute : null),
    [planningRoute]
  )
  const editableRoute = useMemo(
    () => (planningRoute && !isApprovedOperationalRoute(planningRoute) ? planningRoute : null),
    [planningRoute]
  )
  const weekEnd = getWeekEndIso(selectedWeekStart)
  const pdvMap = useMemo(
    () =>
      new Map(
        data.pdvsDisponibles.map((pdv) => [
          pdv.id,
          {
            label: pdv.nombre,
            subtitle: pdv.zona ?? pdv.formato ?? 'Sin zona',
          },
        ])
      ),
    [data.pdvsDisponibles]
  )
  const initialDrafts = useMemo<WeeklyCanvasDraftVisit[]>(
    () =>
      [...(editableRoute?.visitas ?? [])]
        .sort((left, right) => left.diaSemana - right.diaSemana || left.orden - right.orden)
        .map((visit) => ({
          clientId: visit.id,
          visitId: visit.id,
          pdvId: visit.pdvId,
          day: visit.diaSemana,
          label: visit.pdv ?? 'PDV sin nombre',
          subtitle: visit.zona ?? 'Sin zona',
          notes: '',
          status: visit.estatus,
          locked: visit.estatus !== 'PLANIFICADA',
        })),
    [editableRoute]
  )

  const hasApprovedWeek = Boolean(approvedRoute)

  useEffect(() => {
    if (selectedWeekStart < minimumWeekStart) {
      return scheduleEffectStateUpdate(() => {
        setSelectedWeekStart(minimumWeekStart)
      })
    }
  }, [minimumWeekStart, selectedWeekStart])

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Definir ruta semanal
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Carga operativa de visitas</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Cada semana se envia una ruta distinta y queda pendiente de aprobacion de coordinacion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {data.pdvsDisponibles.length} PDVs disponibles
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              editableRoute
                ? editableRoute.approvalState === 'APROBADA'
                  ? 'bg-emerald-100 text-emerald-700'
                  : editableRoute.approvalState === 'CAMBIOS_SOLICITADOS'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {editableRoute ? editableRoute.approvalState : hasApprovedWeek ? 'Ruta aprobada' : 'Sin ruta enviada'}
          </span>
        </div>
      </div>
      <div className="mt-5">
        {hasApprovedWeek && approvedRoute ? (
          <ApprovedRouteNotice
            route={approvedRoute}
            onOpenCorrections={() => onOpenCorrections(approvedRoute.id)}
            onOpenHistory={() => onOpenHistory(approvedRoute.id)}
            onStartPlanning={() => setSelectedWeekStart((current) => shiftWeekStart(current, 1))}
          />
        ) : (
          <WeeklyRouteCanvasPlanner
            key={`${editableRoute?.id ?? planningRoute?.id ?? 'new'}-${selectedWeekStart}`}
            weekStart={selectedWeekStart}
            weekEnd={weekEnd}
            minimumWeekStart={minimumWeekStart}
            pdvsDisponibles={data.pdvsDisponibles}
            pdvMap={pdvMap}
            initialDrafts={initialDrafts}
            route={editableRoute}
            onWeekStartChange={(nextWeekStart) => setSelectedWeekStart(nextWeekStart)}
          />
        )}
      </div>
    </Card>
  )
}

function ApprovedRouteNotice({
  route,
  onOpenCorrections,
  onOpenHistory,
  onStartPlanning,
}: {
  route: RutaSemanalItem
  onOpenCorrections: () => void
  onOpenHistory: () => void
  onStartPlanning: () => void
}) {
  const reviewLabel = route.hasEditableFutureDays ? 'Ir a correcciones' : 'Ver en historicos'
  const reviewHandler = route.hasEditableFutureDays ? onOpenCorrections : onOpenHistory

  return (
    <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Ruta aprobada</p>
          <h3 className="mt-2 text-lg font-semibold text-emerald-950">
            {formatDate(route.semanaInicio)} - {formatDate(route.semanaFin)}
          </h3>
          <p className="mt-2 text-sm text-emerald-900/80">
            Esta semana ya fue enviada y aprobada. Para evitar duplicados, ya no se muestra en la carga
            operativa. Revisa la ruta en {route.hasEditableFutureDays ? 'Correcciones' : 'Historicos'} para seguir el flujo correcto.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={reviewHandler}>
            {reviewLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onStartPlanning}>
            Definir otra semana
          </Button>
        </div>
      </div>
    </div>
  )
}

type WeeklyCanvasDraftVisit = {
  clientId: string
  visitId: string | null
  pdvId: string
  day: number
  label: string
  subtitle: string
  notes: string
  status: RutaSemanalVisitItem['estatus']
  locked: boolean
}

type WeeklyPlannerView = 'days' | 'draft'

function buildWeeklyDrafts(
  drafts: WeeklyCanvasDraftVisit[],
  draggedId: string,
  targetDay: number,
  targetIndex: number
) {
  const dragged = drafts.find((item) => item.clientId === draggedId)

  if (!dragged || dragged.locked) {
    return drafts
  }

  const grouped = new Map<number, WeeklyCanvasDraftVisit[]>()
  for (const day of WEEK_DAY_OPTIONS) {
    grouped.set(
      day.value,
      drafts.filter((item) => item.day === day.value && item.clientId !== draggedId)
    )
  }

  const destination = [...(grouped.get(targetDay) ?? [])]
  const normalizedIndex = Math.max(0, Math.min(targetIndex, destination.length))
  destination.splice(normalizedIndex, 0, { ...dragged, day: targetDay })
  grouped.set(targetDay, destination)

  return WEEK_DAY_OPTIONS.flatMap((day) => grouped.get(day.value) ?? [])
}

function WeeklyRouteCanvasPlanner({
  weekStart,
  weekEnd,
  minimumWeekStart,
  pdvsDisponibles,
  pdvMap,
  initialDrafts,
  route,
  onWeekStartChange,
}: {
  weekStart: string
  weekEnd: string
  minimumWeekStart: string
  pdvsDisponibles: RutaSemanalPanelData['pdvsDisponibles']
  pdvMap: Map<string, { label: string; subtitle: string }>
  initialDrafts: WeeklyCanvasDraftVisit[]
  route: RutaSemanalItem | null
  onWeekStartChange: (nextWeekStart: string) => void
}) {
  const [state, formAction] = useActionState(guardarPlaneacionRutaSemanalCanvas, ESTADO_RUTA_INICIAL)
  const [drafts, setDrafts] = useState<WeeklyCanvasDraftVisit[]>(initialDrafts)
  const [selectedDay, setSelectedDay] = useState<number>(WEEK_DAY_OPTIONS[0]?.value ?? 1)
  const [plannerView, setPlannerView] = useState<WeeklyPlannerView>('days')
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')
  const [dayPickerDrafts, setDayPickerDrafts] = useState<WeeklyCanvasDraftVisit[]>([])

  useEffect(() => {
    setDrafts(initialDrafts)
  }, [initialDrafts])

  const openDayPicker = (day: number) => {
    setSelectedDay(day)
    setStoreSearch('')
    setDayPickerDrafts(drafts.filter((item) => item.day === day))
    setIsDayPickerOpen(true)
  }

  const saveDayDraft = () => {
    setDrafts((current) => [
      ...current.filter((item) => item.day !== selectedDay),
      ...dayPickerDrafts.map((item) => ({ ...item, day: selectedDay })),
    ])
    setIsDayPickerOpen(false)
  }

  const clearSelectedDayDrafts = () => {
    setDayPickerDrafts((current) => current.filter((item) => item.locked))
  }

  const clearDayDrafts = (day: number) => {
    setDrafts((current) => current.filter((item) => item.day !== day || item.locked))

    if (selectedDay === day) {
      setDayPickerDrafts((current) => current.filter((item) => item.locked))
    }
  }

  const clearWeeklyDrafts = () => {
    setDrafts((current) => current.filter((item) => item.locked))
    setDayPickerDrafts((current) => current.filter((item) => item.locked))
  }

  const removeDraft = (clientId: string) => {
    setDayPickerDrafts((current) => current.filter((item) => item.clientId !== clientId || item.locked))
  }

  const moveDraftWithinDay = (clientId: string, direction: 'up' | 'down') => {
    setDayPickerDrafts((current) => {
      const target = current.find((item) => item.clientId === clientId)
      if (!target || target.locked) {
        return current
      }

      const currentIndex = current.findIndex((item) => item.clientId === clientId)
      if (currentIndex === -1) {
        return current
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  const serializedPlan = JSON.stringify(
    drafts
      .filter((item) => !item.locked)
      .map((item) => ({
        visitId: item.visitId,
        pdvId: item.pdvId,
        day: item.day,
        notes: null,
      }))
  )
  const filteredPdvs = pdvsDisponibles.filter((pdv) =>
    normalizeFilterText(`${pdv.nombre} ${pdv.zona ?? ''}`).includes(normalizeFilterText(storeSearch))
  )
  const isWeekEditable = weekStart >= minimumWeekStart
  const hasEditableWeeklyDrafts = drafts.some((item) => !item.locked)
  const hasEditableSelectedDayDrafts = dayPickerDrafts.some((item) => !item.locked)
  const weeklyDraftGroups = WEEK_DAY_OPTIONS.map((day) => ({
    day,
    items: drafts.filter((item) => item.day === day.value),
  }))
  const buildDaySignature = (items: WeeklyCanvasDraftVisit[]) =>
    JSON.stringify(
      items.map((item, index) => ({
        visitId: item.visitId,
        pdvId: item.pdvId,
        order: index + 1,
        locked: item.locked,
        status: item.status,
      }))
    )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="semana_inicio" value={weekStart} />
      <input type="hidden" name="route_plan_json" value={serializedPlan} />

      <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Planeacion semanal</p>
            <p className="mt-1 text-xs text-slate-500">
              Elige primero el lunes de la semana, luego el dia y despues las tiendas. La ruta se activa solo cuando coordinacion la aprueba.
            </p>
          </div>
          <SubmitActionButton
            label="Enviar ruta a coordinacion"
            pendingLabel="Enviando..."
            disabled={!isWeekEditable}
          />
        </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)]">
            <Input
              label="Lunes de inicio"
              type="date"
              min={minimumWeekStart}
              value={weekStart}
              onChange={(event) => {
                const nextWeekStart = normalizeWeekStart(event.target.value)
                onWeekStartChange(nextWeekStart < minimumWeekStart ? minimumWeekStart : nextWeekStart)
              }}
              hint="Puedes elegir la semana actual o una futura para definir la ruta."
            />
          </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            Semana {formatDate(weekStart)} - {formatDate(weekEnd)}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {drafts.length} visita(s)
          </span>
          {route && (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {route.approvalState}
            </span>
          )}
        </div>
      </div>

      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      ) : null}

      <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Definir ruta semanal
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlannerView('days')}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                plannerView === 'days'
                  ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Dias de la semana
            </button>
            <button
              type="button"
              onClick={() => setPlannerView('draft')}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                plannerView === 'draft'
                  ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Borrador semanal
            </button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={clearWeeklyDrafts}
              disabled={!hasEditableWeeklyDrafts}
            >
              Limpiar borrador
            </Button>
          </div>
        </div>

        {plannerView === 'days' ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {WEEK_DAY_OPTIONS.map((day) => {
              const dayDrafts = drafts.filter((item) => item.day === day.value)
              const initialDayDrafts = initialDrafts.filter((item) => item.day === day.value)
              const hasDraftChanges = buildDaySignature(dayDrafts) !== buildDaySignature(initialDayDrafts)
              const hasVisits = dayDrafts.length > 0
              const dayStateLabel = hasVisits ? 'Con visitas' : 'Sin visitas'

              return (
                <div
                  key={day.value}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isWeekEditable) {
                      openDayPicker(day.value)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!isWeekEditable) {
                      return
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDayPicker(day.value)
                    }
                  }}
                  className={`min-w-0 rounded-[22px] border px-4 py-4 text-left transition ${
                    hasVisits
                      ? 'border-emerald-200 bg-emerald-50/80 shadow-[0_12px_30px_-24px_rgba(16,185,129,0.75)]'
                      : 'border-slate-200 bg-slate-50'
                  } ${
                    isWeekEditable
                      ? 'cursor-pointer hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]'
                      : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
                        {day.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(addDaysToWeek(weekStart, day.value))}</p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          hasVisits ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-700'
                        }`}
                      >
                        {dayDrafts.length} visita(s)
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          hasVisits ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {dayStateLabel}
                      </span>
                      {hasDraftChanges ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-800">
                          Borrador
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full min-w-0 justify-center sm:w-full"
                      onClick={(event) => {
                        event.stopPropagation()
                        openDayPicker(day.value)
                      }}
                      disabled={!isWeekEditable}
                    >
                      Elegir tiendas
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {weeklyDraftGroups.every((group) => group.items.length === 0) ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                Todavia no hay borrador semanal cargado.
              </div>
            ) : (
              weeklyDraftGroups.map(({ day, items }) => (
                <div key={day.value} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
                        {day.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(addDaysToWeek(weekStart, day.value))}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          items.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-700'
                        }`}
                      >
                        {items.length} visita(s)
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          items.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {items.length > 0 ? 'Con visitas' : 'Sin visitas'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openDayPicker(day.value)}
                        className="min-h-10 w-full justify-center px-4 sm:w-auto"
                      >
                        Editar dia
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => clearDayDrafts(day.value)}
                        disabled={!items.some((item) => !item.locked)}
                        className="min-h-10 w-full justify-center px-4 sm:w-auto"
                      >
                        Limpiar dia
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {items.length === 0 ? (
                      <div className="rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-400">
                        Sin visitas en borrador.
                      </div>
                    ) : (
                      items.map((item, index) => (
                        <div key={item.clientId} className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                item.locked ? 'bg-slate-200 text-slate-600' : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {item.locked ? item.status : `#${index + 1}`}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ModalPanel
        open={isDayPickerOpen}
        onClose={() => setIsDayPickerOpen(false)}
        title={`Tiendas para ${WEEK_DAY_OPTIONS.find((day) => day.value === selectedDay)?.label ?? 'el dia'}`}
        subtitle="Elige tiendas y guarda el borrador del dia."
      >
        <div className="space-y-4">
          <Input
            label="Buscar tienda"
            value={storeSearch}
            onChange={(event) => setStoreSearch(event.target.value)}
            placeholder="Nombre o zona"
          />
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Borrador del dia para {WEEK_DAY_OPTIONS.find((day) => day.value === selectedDay)?.label ?? 'el dia'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Ordena las visitas dentro de este menu.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {dayPickerDrafts.length} visita(s)
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {dayPickerDrafts.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-400">
                  Todavia no hay tiendas cargadas para este dia.
                </div>
              ) : (
                dayPickerDrafts.map((item, index) => (
                  <div key={item.clientId} className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          item.locked ? 'bg-slate-200 text-slate-600' : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {item.locked ? item.status : `#${index + 1}`}
                      </span>
                    </div>
                    {!item.locked ? (
                      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="grid gap-2 sm:flex sm:flex-wrap">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => moveDraftWithinDay(item.clientId, 'up')}
                            className="min-h-10 w-full justify-center px-4 sm:w-auto"
                          >
                            Subir
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === dayPickerDrafts.length - 1}
                            onClick={() => moveDraftWithinDay(item.clientId, 'down')}
                            className="min-h-10 w-full justify-center px-4 sm:w-auto"
                          >
                            Bajar
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDraft(item.clientId)}
                          className="min-h-10 w-full justify-center px-4 sm:w-auto"
                        >
                          Quitar
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] font-medium text-slate-500">
                        Esta visita ya forma parte del historial operativo.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {filteredPdvs.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                {pdvsDisponibles.length === 0
                  ? 'No hay PDVs activos asignados a este supervisor para planear la ruta.'
                  : 'No encontramos tiendas con ese filtro.'}
              </div>
            ) : (
              filteredPdvs.map((pdv) => {
                const currentDraft = dayPickerDrafts.find((item) => item.pdvId === pdv.id)
                const isSelected = Boolean(currentDraft)
                return (
                  <div
                    key={pdv.id}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{pdv.nombre}</p>
                      <p className="mt-1 text-xs text-slate-500">{pdv.zona ?? pdv.formato ?? 'Sin zona'}</p>
                    </div>
                    <Button
                      type="button"
                      variant={isSelected ? 'ghost' : 'secondary'}
                      onClick={() => {
                        if (currentDraft && !currentDraft.locked) {
                          removeDraft(currentDraft.clientId)
                          return
                        }
                        if (!isSelected) {
                          const nextPdv = pdvMap.get(pdv.id)
                          if (!nextPdv) {
                            return
                          }
                          setDayPickerDrafts((current) => [
                            ...current,
                            {
                              clientId: createRouteDraftClientId(`draft-${selectedDay}-${pdv.id}`),
                              visitId: null,
                              pdvId: pdv.id,
                              day: selectedDay,
                              label: nextPdv.label,
                              subtitle: nextPdv.subtitle,
                              notes: '',
                              status: 'PLANIFICADA',
                              locked: false,
                            },
                          ])
                        }
                      }}
                    >
                      {isSelected ? (currentDraft?.locked ? 'Bloqueada' : 'Quitar') : 'Agregar'}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="danger"
              onClick={clearSelectedDayDrafts}
              disabled={!hasEditableSelectedDayDrafts}
              className="min-h-11 w-full justify-center px-4 sm:w-auto"
            >
              Limpiar dia
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDayPickerOpen(false)}
              className="min-h-11 w-full justify-center px-4 sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={saveDayDraft}
              className="min-h-11 w-full justify-center px-4 sm:w-auto"
            >
              Guardar borrador del dia
            </Button>
          </div>
        </div>
      </ModalPanel>
    </form>
  )
}

function DropZone({ onDrop, active }: { onDrop: () => void; active: boolean }) {
  return (
    <div
      className={`h-3 rounded-full transition ${active ? 'bg-[var(--module-soft-bg)]' : 'bg-transparent'}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    />
  )
}

function RouteWorkflowCard({
  route,
  canReview,
}: {
  route: RutaSemanalItem
  canReview: boolean
}) {
  const [state, formAction] = useActionState(actualizarControlRutaSemanal, ESTADO_RUTA_INICIAL)
  const [resolveState, resolveAction] = useActionState(resolverSolicitudCambioRutaSemanal, ESTADO_RUTA_INICIAL)

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Revision de ruta</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{route.supervisor ?? 'Supervisor sin nombre'}</h3>
          <p className="mt-2 text-sm text-slate-500">
            Semana {formatDate(route.semanaInicio)} - {formatDate(route.semanaFin)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteTone(route.estatus)}`}>
            {route.estatus}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {route.approvalState}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Esperadas" value={String(route.expectedMonthlyVisits ?? 0)} />
        <MiniStat label="Hechas" value={String(route.monthlyVisitsCompleted)} />
        <MiniStat label="Pendientes" value={String(Math.max((route.expectedMonthlyVisits ?? 0) - route.monthlyVisitsCompleted, 0))} />
      </div>

      {canReview ? (
        <div className="mt-5 space-y-4">
          <form action={formAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="ruta_id" value={route.id} />

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Aprobacion de ruta
              </label>
              <Select
                name="approval_state"
                defaultValue={route.approvalState}
                options={[
                  { value: 'PENDIENTE_COORDINACION', label: 'Pendiente coordinacion' },
                  { value: 'APROBADA', label: 'Aprobada' },
                  { value: 'CAMBIOS_SOLICITADOS', label: 'Cambios solicitados' },
                ]}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nota</label>
              <Input name="approval_note" defaultValue={route.approvalNote ?? ''} placeholder="Comentario de revision" />
            </div>

            <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
              <SubmitActionButton label="Guardar revision" pendingLabel="Guardando..." />
              {state.message && (
                <span className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</span>
              )}
            </div>
          </form>

          {route.changeRequestState === 'PENDIENTE' && (
            <form action={resolveAction} className="rounded-[20px] border border-sky-200 bg-sky-50 p-4">
              <input type="hidden" name="ruta_id" value={route.id} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Decision sobre cambio de ruta</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {getRouteChangeTypeLabel(route.changeRequestType)} ·{' '}
                    {route.changeRequestTargetDayLabel ?? 'Dia seleccionado'}
                  </p>
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  Pendiente
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Resolucion
                </label>
                <Input
                  name="resolution_note"
                  defaultValue={route.changeRequestResolutionNote ?? ''}
                  placeholder="Comentario de aprobacion o rechazo"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="APROBAR"
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Aprobar cambio
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="RECHAZAR"
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Rechazar cambio
                </button>
                {resolveState.message && (
                  <span className={`text-sm ${resolveState.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {resolveState.message}
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
          La revision y aprobacion de esta ruta se resuelve desde coordinacion.
        </div>
      )}
    </div>
  )
}

function RouteChangeRequestCard({
  route,
  enabled,
  pdvsDisponibles,
}: {
  route: RutaSemanalItem
  enabled: boolean
  pdvsDisponibles: RutaSemanalPanelData['pdvsDisponibles']
}) {
  const [state, formAction] = useActionState(solicitarCambioRutaSemanal, ESTADO_RUTA_INICIAL)
  const editableDayNumbers = route.editableDayNumbers
  const dayOptions = Array.from(
    new Map(
      editableDayNumbers.map((dayNumber) => {
        const visitsForDay = route.visitas.filter((item) => item.diaSemana === dayNumber)
        return [
          dayNumber,
          {
            value: String(dayNumber),
            label: `${getWeekDayLabel(dayNumber)} · ${visitsForDay.length} visita(s)`,
          },
        ]
      })
    ).values()
  )
  const visitsByDay = useMemo(
    () =>
      route.visitas.reduce<Map<number, RutaSemanalVisitItem[]>>((acc, visit) => {
        const current = acc.get(visit.diaSemana) ?? []
        current.push(visit)
        acc.set(visit.diaSemana, current)
        return acc
      }, new Map<number, RutaSemanalVisitItem[]>()),
    [route.visitas]
  )
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(
    route.changeRequestTargetDayNumber &&
      editableDayNumbers.includes(route.changeRequestTargetDayNumber)
      ? route.changeRequestTargetDayNumber
      : editableDayNumbers[0] ?? 1
  )
  const [changeType, setChangeType] = useState<RutaSemanalItem['changeRequestType']>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA'
  )
  const [selectedVisitId, setSelectedVisitId] = useState<string>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : ''
  )
  const [isStorePickerOpen, setIsStorePickerOpen] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')

  const buildDraftForDay = useCallback((dayNumber: number, sourceRoute = route) => {
    if (
      sourceRoute.changeRequestState === 'PENDIENTE' &&
      sourceRoute.changeRequestTargetDayNumber === dayNumber &&
      sourceRoute.changeRequestProposedVisits.length > 0
    ) {
      return sourceRoute.changeRequestProposedVisits.map((proposal) => ({
        clientId: `proposal-${proposal.order}-${proposal.pdvId}`,
        pdvId: proposal.pdvId,
        label: proposal.pdv ?? 'PDV sin nombre',
        subtitle: proposal.zona ?? 'Sin zona',
      }))
    }

    return (visitsByDay.get(dayNumber) ?? []).map((visit, index) => ({
      clientId: visit.id ?? `${dayNumber}-${visit.pdvId}-${index}`,
      pdvId: visit.pdvId,
      label: visit.pdv ?? 'PDV sin nombre',
      subtitle: visit.zona ?? 'Sin zona',
    }))
  }, [route, visitsByDay])

  const [draftRoute, setDraftRoute] = useState(() => buildDraftForDay(selectedDayNumber))

  useEffect(() => {
    const nextDay =
      route.changeRequestTargetDayNumber &&
      route.editableDayNumbers.includes(route.changeRequestTargetDayNumber)
        ? route.changeRequestTargetDayNumber
        : route.editableDayNumbers[0] ?? 1
    return scheduleEffectStateUpdate(() => {
      setSelectedDayNumber(nextDay)
      setChangeType(route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA')
      setSelectedVisitId(route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : '')
      setDraftRoute(buildDraftForDay(nextDay, route))
    })
  }, [buildDraftForDay, route])

  const currentDayVisits = visitsByDay.get(selectedDayNumber) ?? []
  const targetVisitOptions = currentDayVisits.map((visit) => ({
    value: visit.id,
    label: visit.pdv ?? 'PDV sin nombre',
  }))
  const filteredPdvs = pdvsDisponibles.filter((pdv) =>
    normalizeFilterText(`${pdv.nombre} ${pdv.zona ?? ''}`).includes(normalizeFilterText(storeSearch))
  )
  const serializedProposal = JSON.stringify(
    draftRoute.map((item, index) => ({
      pdvId: item.pdvId,
      order: index + 1,
    }))
  )

  const resetDraftForDay = (dayNumber: number, nextType: RutaSemanalItem['changeRequestType']) => {
    setSelectedDayNumber(dayNumber)
    setSelectedVisitId((visitsByDay.get(dayNumber) ?? [])[0]?.id ?? '')
    setDraftRoute(nextType === 'CANCELACION_DIA' ? [] : buildDraftForDay(dayNumber))
  }

  const addStoreToDraft = (pdvId: string) => {
    if (!pdvId || draftRoute.some((item) => item.pdvId === pdvId)) {
      return
    }

    const pdv = pdvsDisponibles.find((item) => item.id === pdvId)
    if (!pdv) {
      return
    }

    setDraftRoute((current) => [
      ...current,
      {
        clientId: createRouteDraftClientId(`draft-${selectedDayNumber}-${pdvId}`),
        pdvId,
        label: pdv.nombre,
        subtitle: pdv.zona ?? pdv.formato ?? 'Sin zona',
      },
    ])
  }

  const removeStoreFromDraft = (clientId: string) => {
    setDraftRoute((current) => current.filter((item) => item.clientId !== clientId))
  }

  const moveStoreWithinDraft = (clientId: string, direction: 'up' | 'down') => {
    setDraftRoute((current) => {
      const currentIndex = current.findIndex((item) => item.clientId === clientId)
      if (currentIndex === -1) {
        return current
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ruta activa</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Solicitud de modificacion</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {route.changeRequestState}
        </span>
      </div>

      {route.changeRequestNote && (
        <div className="mt-3 rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {route.changeRequestTargetDayLabel && (
            <p className="font-medium text-slate-900">
              {getRouteChangeTypeLabel(route.changeRequestType)} · {route.changeRequestTargetDayLabel}
            </p>
          )}
          <p className={route.changeRequestTargetDayLabel ? 'mt-2' : ''}>{route.changeRequestNote}</p>
          {route.changeRequestProposedVisits.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {route.changeRequestProposedVisits.map((proposal) => (
                <span key={`${proposal.order}-${proposal.pdvId}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                  #{proposal.order} {proposal.pdv ?? 'PDV'}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-rose-700">Dia completo sin tiendas: cancelacion solicitada.</p>
          )}
        </div>
      )}

      {!enabled ? (
        <p className="mt-4 text-sm text-slate-500">
          La ruta ya se puede consultar, pero la solicitud formal de cambio se habilitara cuando la base
          local tenga la columna de metadata.
        </p>
      ) : !route.hasEditableFutureDays ? (
        <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Esta ruta ya no tiene dias vigentes para modificar. Solo pueden ajustarse dias actuales o futuros.
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="ruta_id" value={route.id} />
          <input type="hidden" name="change_request_route_json" value={serializedProposal} />
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tipo de cambio
            </label>
            <Select
              name="change_request_type"
              value={changeType}
              onChange={(event) => {
                const nextType = event.target.value as RutaSemanalItem['changeRequestType']
                setChangeType(nextType)
                if (nextType === 'CANCELACION_DIA') {
                  setDraftRoute([])
                } else if (draftRoute.length === 0) {
                  setDraftRoute(buildDraftForDay(selectedDayNumber))
                }
              }}
              options={[
                { value: 'CAMBIO_DIA', label: 'Cambio de tiendas en un dia' },
                { value: 'CANCELACION_DIA', label: 'Cancelacion de ruta del dia' },
                { value: 'CAMBIO_TIENDA', label: 'Cambio de tienda en ruta' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Dia a cambiar
            </label>
            <Select
              name="target_day_number"
              value={String(selectedDayNumber)}
              onChange={(event) => {
                const nextDay = Number(event.target.value)
                resetDraftForDay(nextDay, changeType)
              }}
              options={[
                ...dayOptions,
              ]}
            />
          </div>
          {changeType === 'CAMBIO_TIENDA' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Tienda afectada dentro de la ruta
              </label>
              <Select
                name="target_visit_id"
                value={selectedVisitId}
                onChange={(event) => setSelectedVisitId(event.target.value)}
                options={[
                  { value: '', label: 'Selecciona la tienda afectada...' },
                  ...targetVisitOptions,
                ]}
              />
            </div>
          ) : (
            <input type="hidden" name="target_visit_id" value="" />
          )}
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Nueva ruta propuesta para {getWeekDayLabel(selectedDayNumber)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Si la dejas sin tiendas, el sistema interpretara una cancelacion completa del dia.
                </p>
              </div>
              {changeType !== 'CANCELACION_DIA' ? (
                <Button type="button" variant="secondary" onClick={() => setIsStorePickerOpen(true)}>
                  Definir tiendas del dia
                </Button>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {draftRoute.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                  Este dia quedara sin tiendas en la ruta.
                </div>
              ) : (
                draftRoute.map((item, index) => (
                  <div key={item.clientId} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                        #{index + 1}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => moveStoreWithinDraft(item.clientId, 'up')}>
                          Subir
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={index === draftRoute.length - 1} onClick={() => moveStoreWithinDraft(item.clientId, 'down')}>
                          Bajar
                        </Button>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeStoreFromDraft(item.clientId)}>
                        Quitar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Justificacion obligatoria
            </label>
            <Input
              name="change_request_note"
              defaultValue={route.changeRequestState === 'PENDIENTE' ? route.changeRequestNote ?? '' : ''}
              placeholder="Ej. tienda cerrada, incidencia vial o cambio de prioridad"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitActionButton label="Solicitar cambio" pendingLabel="Enviando..." />
            {state.message && (
              <span className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</span>
            )}
          </div>
        </form>
      )}

      <ModalPanel
        open={isStorePickerOpen}
        onClose={() => setIsStorePickerOpen(false)}
        title={`Tiendas para ${getWeekDayLabel(selectedDayNumber)}`}
        subtitle="Construye la nueva ruta de ese dia y acomodala con subir o bajar."
      >
        <div className="space-y-4">
          <Input
            label="Buscar tienda"
            value={storeSearch}
            onChange={(event) => setStoreSearch(event.target.value)}
            placeholder="Nombre o zona"
          />
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {filteredPdvs.map((pdv) => {
              const currentDraft = draftRoute.find((item) => item.pdvId === pdv.id)
              return (
                <div
                  key={pdv.id}
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{pdv.nombre}</p>
                    <p className="mt-1 text-xs text-slate-500">{pdv.zona ?? pdv.formato ?? 'Sin zona'}</p>
                  </div>
                  <Button
                    type="button"
                    variant={currentDraft ? 'ghost' : 'secondary'}
                    onClick={() => {
                      if (currentDraft) {
                        removeStoreFromDraft(currentDraft.clientId)
                        return
                      }
                      addStoreToDraft(pdv.id)
                    }}
                  >
                    {currentDraft ? 'Quitar' : 'Agregar'}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </ModalPanel>
    </div>
  )
}

function RouteChangeImpactCard({
  route,
  supervisor,
}: {
  route: RutaSemanalItem
  supervisor: RutaSupervisorWarRoomItem | null
}) {
  const visitedPdvIds = new Set(route.visitas.map((visit) => visit.pdvId))
  const suggestedReplacements =
    supervisor?.quotaProgress
      .filter((item) => !visitedPdvIds.has(item.pdvId))
      .filter((item) => item.visitasPendientes > 0)
      .sort(
        (left, right) =>
          right.visitasPendientes - left.visitasPendientes ||
          (right.prioridad === 'ALTA' ? 3 : right.prioridad === 'MEDIA' ? 2 : 1) -
            (left.prioridad === 'ALTA' ? 3 : left.prioridad === 'MEDIA' ? 2 : 1)
      )
      .slice(0, 4) ?? []

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Antes vs despues
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Impacto del cambio de ruta</h3>
          <p className="mt-2 text-sm text-slate-500">
            Coordinacion revisa la secuencia actual y los PDVs que aun deben visitas este mes.
          </p>
        </div>
        {route.changeRequestState !== 'NINGUNO' && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
            {route.changeRequestState}
          </span>
        )}
      </div>

      {route.changeRequestNote && (
        <div className="mt-4 rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-4">
          <p className="text-sm font-semibold text-slate-950">Solicitud del supervisor</p>
          {route.changeRequestTargetDayLabel && (
            <p className="mt-2 text-sm text-slate-700">
              Objetivo: {getRouteChangeTypeLabel(route.changeRequestType)} · {route.changeRequestTargetDayLabel}
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">{route.changeRequestNote}</p>
          {route.changeRequestResolutionNote && (
            <p className="mt-2 text-sm text-slate-500">Resolucion: {route.changeRequestResolutionNote}</p>
          )}
          {route.changeRequestedAt && (
            <p className="mt-2 text-xs text-slate-500">Solicitado {formatDateTime(route.changeRequestedAt)}</p>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Ruta actual del dia</p>
          <div className="mt-4 space-y-3">
            {route.visitas.filter((visit) => visit.diaSemana === route.changeRequestTargetDayNumber).length === 0 ? (
              <p className="text-sm text-slate-500">Ese dia aun no tiene visitas cargadas.</p>
            ) : (
              route.visitas
                .filter((visit) => visit.diaSemana === route.changeRequestTargetDayNumber)
                .map((visit) => (
                <div key={visit.id} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getVisitTone(visit.estatus)}`}>
                      {visit.estatus}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {visit.diaLabel} · Orden {visit.orden} · {visit.zona ?? 'Sin zona'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Nueva ruta propuesta</p>
          <div className="mt-4 space-y-3">
            {route.changeRequestProposedVisits.length === 0 ? (
              <p className="text-sm text-slate-500">
                El supervisor propone dejar este dia sin tiendas. Se interpretara como cancelacion total del dia.
              </p>
            ) : (
              route.changeRequestProposedVisits.map((item) => (
                <div key={`${item.order}-${item.pdvId}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.pdv ?? 'PDV sin nombre'}</p>
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      #{item.order}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.zona ?? 'Sin zona'}</p>
                </div>
              ))
            )}
          </div>
          {suggestedReplacements.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-950">PDVs sugeridos para cubrir quota</p>
              <div className="mt-3 space-y-3">
                {suggestedReplacements.map((item) => (
                  <div key={item.pdvId} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950">{item.nombre}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.prioridad === 'ALTA'
                            ? 'bg-rose-100 text-rose-700'
                            : item.prioridad === 'MEDIA'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {item.prioridad}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.zona ?? item.formato ?? 'Sin zona'}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      Quota {item.quotaMensual} · Realizadas {item.visitasRealizadas} · Pendientes {item.visitasPendientes}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function VisitCard({
  item,
  canEdit,
}: {
  item: RutaSemanalVisitItem
  canEdit: boolean
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.pdv ?? 'PDV sin nombre'}</p>
          <p className="mt-1 text-xs text-slate-500">{item.zona ?? 'Sin zona'} · Orden {item.orden}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getVisitTone(item.estatus)}`}>
          {item.estatus}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniStat label="Check-in" value={item.checkInAt ? 'OK' : 'Pend.'} />
        <MiniStat label="Checklist" value={`${item.checklistCompletion}%`} />
        <MiniStat label="Check-out" value={item.checkOutAt ? 'OK' : 'Pend.'} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-500 lg:grid-cols-2">
        <span className="rounded-full bg-slate-100 px-3 py-1">Entrada {formatDateTime(item.checkInAt)}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">Salida {formatDateTime(item.checkOutAt)}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">GPS entrada {item.checkInGpsState ?? 'Pendiente'}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">GPS salida {item.checkOutGpsState ?? 'Pendiente'}</span>
      </div>

      {canEdit && item.estatus !== 'COMPLETADA' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <VisitCheckInCard item={item} />
          <VisitCheckOutCard item={item} />
        </div>
      )}
    </div>
  )
}

function VisitCheckInCard({ item }: { item: RutaSemanalVisitItem }) {
  const [state, formAction] = useActionState(registrarInicioVisitaRutaSemanal, ESTADO_RUTA_INICIAL)

  return (
    <form action={formAction} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="visita_id" value={item.id} />
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-950">Llegue a tienda</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.checkInAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {item.checkInAt ? 'Registrado' : 'Pendiente'}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <Input name="selfie_file" type="file" accept="image/*,application/pdf" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="latitud" type="number" step="0.000001" placeholder="Latitud" />
          <Input name="longitud" type="number" step="0.000001" placeholder="Longitud" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="distancia_metros" type="number" step="0.1" placeholder="Distancia metros" />
          <Select
            name="estado_gps"
            defaultValue={item.checkInGpsState ?? 'PENDIENTE'}
            options={[
              { value: 'PENDIENTE', label: 'Pendiente' },
              { value: 'DENTRO_GEOCERCA', label: 'Dentro geocerca' },
              { value: 'FUERA_GEOCERCA', label: 'Fuera geocerca' },
              { value: 'SIN_GPS', label: 'Sin GPS' },
            ]}
          />
        </div>
        <Input name="comments" placeholder="Comentario de llegada" defaultValue={item.comentarios ?? ''} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item.checkInAt ? 'Actualizar llegada' : 'Registrar llegada'}
          pendingLabel="Guardando..."
        />
        {state.message && (
          <span className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</span>
        )}
      </div>
    </form>
  )
}

function VisitCheckOutCard({ item }: { item: RutaSemanalVisitItem }) {
  const [state, formAction] = useActionState(registrarSalidaVisitaRutaSemanal, ESTADO_RUTA_INICIAL)
  const disabled = !item.checkInAt

  return (
    <form action={formAction} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="visita_id" value={item.id} />
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-950">Cierre de visita</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.checkOutAt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {item.checkOutAt ? 'Cerrada' : 'Abierta'}
        </span>
      </div>

      {disabled && (
        <p className="mt-3 rounded-[18px] bg-white px-4 py-3 text-sm text-slate-500">
          Primero registra la llegada para desbloquear el checklist y el cierre.
        </p>
      )}

      <div className="mt-4 grid gap-3">
        <Input name="selfie_file" type="file" accept="image/*,application/pdf" disabled={disabled} />
        <Input name="evidencia_file" type="file" accept="image/*,application/pdf" disabled={disabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="latitud" type="number" step="0.000001" placeholder="Latitud" disabled={disabled} />
          <Input name="longitud" type="number" step="0.000001" placeholder="Longitud" disabled={disabled} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="distancia_metros" type="number" step="0.1" placeholder="Distancia metros" disabled={disabled} />
          <Select
            name="estado_gps"
            defaultValue={item.checkOutGpsState ?? 'PENDIENTE'}
            disabled={disabled}
            options={[
              { value: 'PENDIENTE', label: 'Pendiente' },
              { value: 'DENTRO_GEOCERCA', label: 'Dentro geocerca' },
              { value: 'FUERA_GEOCERCA', label: 'Fuera geocerca' },
              { value: 'SIN_GPS', label: 'Sin GPS' },
            ]}
          />
        </div>
        <Input name="comments" placeholder="Comentario de salida" defaultValue={item.comentarios ?? ''} disabled={disabled} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ChecklistToggle
          name="checklist_fachada_ok"
          label="Fachada"
          defaultChecked={item.checklistCalidad.fachada_ok ?? false}
          disabled={disabled}
        />
        <ChecklistToggle
          name="checklist_material_ok"
          label="Material"
          defaultChecked={item.checklistCalidad.material_ok ?? false}
          disabled={disabled}
        />
        <ChecklistToggle
          name="checklist_equipo_ok"
          label="Equipo"
          defaultChecked={item.checklistCalidad.equipo_ok ?? false}
          disabled={disabled}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitActionButton label="Cerrar visita" pendingLabel="Cerrando..." disabled={disabled} />
        {state.message && (
          <span className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</span>
        )}
      </div>
    </form>
  )
}

function ChecklistToggle({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string
  label: string
  defaultChecked: boolean
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm ${
        disabled ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} disabled={disabled} />
      <span>{label}</span>
    </label>
  )
}

function RouteMap({ visits }: { visits: RutaSemanalVisitItem[] }) {
  const points = visits.filter((visit) => visit.latitud !== null && visit.longitud !== null)

  if (points.length === 0) {
    return <EmptyState copy="Faltan coordenadas para dibujar la secuencia geografica de esta ruta." />
  }

  const mapPoints: MexicoMapPoint[] = points.map((visit, index) => ({
    id: visit.id,
    lat: visit.latitud as number,
    lng: visit.longitud as number,
    title: `${index + 1}. ${visit.pdv ?? 'PDV'}`,
    subtitle: `${visit.diaLabel} · ${visit.zona ?? 'Sin zona'}`,
    detail: visit.direccion ?? visit.pdvClaveBtl ?? null,
    tone:
      visit.estatus === 'COMPLETADA'
        ? 'emerald'
        : visit.estatus === 'CANCELADA'
          ? 'rose'
          : 'sky',
  }))

  return (
    <div className="space-y-3 rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top,#ecfeff,white_65%)] p-4">
      <MexicoMap points={mapPoints} showPath heightClassName="h-[320px]" minZoom={4} maxZoom={12} />
      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
        {points.map((visit, index) => (
          <div key={visit.id} className="rounded-[16px] border border-slate-200 bg-white px-3 py-2.5">
            <p className="font-semibold text-slate-900">
              {index + 1}. {visit.pdv ?? 'PDV'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {visit.diaLabel} · {visit.zona ?? 'Sin zona'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
