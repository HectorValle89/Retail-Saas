'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap'
import { ModalPanel } from '@/components/ui/modal-panel'
import { PremiumLineIcon } from '@/components/ui/premium-icons'
import { Select } from '@/components/ui/select'
import {
  actualizarControlRutaSemanal,
  guardarPlaneacionRutaSemanalCanvas,
  registrarEventoAgendaRutaSemanal,
  registrarInicioVisitaRutaSemanal,
  registrarSalidaVisitaRutaSemanal,
  resolverEventoAgendaRutaSemanal,
  resolverSolicitudCambioRutaSemanal,
  solicitarCambioRutaSemanal,
} from '../actions'
import { getNextWeekStartIso, getWeekDayLabel, getWeekEndIso, normalizeWeekStart, WEEK_DAY_OPTIONS } from '../lib/weeklyRoute'
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

type WarRoomTab = 'coverage' | 'planning'
type CoordinatorKanbanColumnKey = 'ENVIADAS' | 'AJUSTES' | 'PUBLICADAS' | 'CERRADAS'

type UnifiedDayEditorMode = 'CHANGE' | 'EVENT'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
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

function metricValueClass(value: string) {
  return value.length >= 12 ? 'text-lg sm:text-xl' : 'text-2xl'
}

export function RutaSemanalPanel({
  data,
  actorPuesto,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
}) {
  if (actorPuesto === 'COORDINADOR' || actorPuesto === 'ADMINISTRADOR') {
    return <CoordinatorWarRoom data={data} actorPuesto={actorPuesto} />
  }

  return <SupervisorRouteOperations data={data} actorPuesto={actorPuesto} />
}

function CoordinatorWarRoom({
  data,
  actorPuesto,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
}) {
  const [activeTab, setActiveTab] = useState<WarRoomTab>('coverage')
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [supervisorZoneFilter, setSupervisorZoneFilter] = useState('TODAS')
  const [supervisorSemaforoFilter, setSupervisorSemaforoFilter] = useState<'TODOS' | RutaSupervisorWarRoomItem['semaforo']>('TODOS')
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(
    data.warRoom.supervisors[0]?.supervisorEmpleadoId ?? null
  )
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(normalizeWeekStart(data.semanaActualInicio))
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(data.rutas[0]?.id ?? null)
  const [isExceptionsOpen, setIsExceptionsOpen] = useState(false)

  const deferredSupervisorSearch = normalizeFilterText(supervisorSearch)
  const supervisorZoneOptions = useMemo(
    () =>
      Array.from(
        new Set(
          data.warRoom.supervisors
            .map((item) => item.zona)
            .filter((item): item is string => Boolean(item))
        )
      ).sort((left, right) => left.localeCompare(right, 'es')),
    [data.warRoom.supervisors]
  )
  const filteredSupervisors = useMemo(
    () =>
      data.warRoom.supervisors.filter((item) => {
        const matchesSearch =
          !deferredSupervisorSearch ||
          [item.supervisor, item.zona]
            .map((value) => normalizeFilterText(value))
            .some((value) => value.includes(deferredSupervisorSearch))

        const matchesZone =
          supervisorZoneFilter === 'TODAS' || (item.zona ?? 'Sin zona') === supervisorZoneFilter
        const matchesSemaforo =
          supervisorSemaforoFilter === 'TODOS' || item.semaforo === supervisorSemaforoFilter

        return matchesSearch && matchesZone && matchesSemaforo
      }),
    [data.warRoom.supervisors, deferredSupervisorSearch, supervisorZoneFilter, supervisorSemaforoFilter]
  )

  const selectedSupervisor =
    filteredSupervisors.find((item) => item.supervisorEmpleadoId === selectedSupervisorId) ??
    filteredSupervisors[0] ??
    null

  const filteredRoutes = useMemo(
    () => data.rutas.filter((route) => route.semanaInicio === selectedWeekStart),
    [data.rutas, selectedWeekStart]
  )

  const selectedRoute =
    filteredRoutes.find((route) => route.id === selectedRouteId) ?? filteredRoutes[0] ?? null

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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">War Room</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Ruta semanal para {actorPuesto.toLowerCase()}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Controla cobertura y mueve las rutas entre estados con un tablero mas simple.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsExceptionsOpen(true)}>
              Tiendas sin visitas
            </Button>
            <WarRoomTabButton active={activeTab === 'coverage'} icon="reports" label="Cobertura y quotas" onClick={() => setActiveTab('coverage')} />
            <WarRoomTabButton active={activeTab === 'planning'} icon="calendar" label="Tablero de rutas" onClick={() => setActiveTab('planning')} />
          </div>
        </div>
      </Card>

      {activeTab === 'coverage' ? (
        <section className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Filtros de supervisores</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Filtra y elige un supervisor para ver sus PDVs, cuotas, visitas y alertas operativas.
                </p>
              </div>
              <span className="rounded-full bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
                {filteredSupervisors.length} visibles
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Buscar supervisor"
                value={supervisorSearch}
                onChange={(event) => setSupervisorSearch(event.target.value)}
                placeholder="Nombre o zona"
              />
              <Select
                label="Zona"
                value={supervisorZoneFilter}
                onChange={(event) => setSupervisorZoneFilter(event.target.value)}
                options={[
                  { value: 'TODAS', label: 'Todas' },
                  ...supervisorZoneOptions.map((item) => ({ value: item, label: item })),
                  { value: 'Sin zona', label: 'Sin zona' },
                ]}
              />
              <Select
                label="Semaforo"
                value={supervisorSemaforoFilter}
                onChange={(event) =>
                  setSupervisorSemaforoFilter(
                    event.target.value as 'TODOS' | RutaSupervisorWarRoomItem['semaforo']
                  )
                }
                options={[
                  { value: 'TODOS', label: 'Todos' },
                  { value: 'OK', label: 'OK' },
                  { value: 'RIESGO', label: 'Riesgo' },
                  { value: 'CRITICO', label: 'Critico' },
                ]}
              />
              <Select
                label="Supervisor"
                value={selectedSupervisor?.supervisorEmpleadoId ?? ''}
                onChange={(event) => setSelectedSupervisorId(event.target.value)}
                options={
                  filteredSupervisors.length === 0
                    ? [{ value: '', label: 'Sin resultados' }]
                    : filteredSupervisors.map((item) => ({
                        value: item.supervisorEmpleadoId,
                        label: `${item.supervisor} · ${item.zona ?? 'Sin zona'}`,
                      }))
                }
              />
            </div>
          </Card>

          <Card className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {selectedSupervisor?.supervisor ?? 'Selecciona un supervisor'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">PDVs, quota mensual y bloqueos de disponibilidad.</p>
              </div>
              {selectedSupervisor && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSemaforoTone(selectedSupervisor.semaforo)}`}>
                  {selectedSupervisor.semaforo}
                </span>
              )}
            </div>

            {selectedSupervisor ? (
              <>
                <QuotaSummary supervisor={selectedSupervisor} />
                <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
                <QuotaProgressList
                    key={selectedSupervisor.supervisorEmpleadoId}
                    supervisor={selectedSupervisor}
                    items={selectedSupervisor.quotaProgress}
                    metadataEnabled={data.warRoom.metadataColumnAvailable}
                  />
                  <div className="space-y-4">
                    <BlockedDaysCard items={selectedSupervisor.blockedDays} />
                    <ReassignmentAlertsCard items={selectedSupervisor.reassignmentAlerts} />
                  </div>
                </div>
                <HeatMapCard items={selectedSupervisor.quotaProgress} />
              </>
            ) : (
              <EmptyState copy="No hay supervisores que coincidan con los filtros actuales. Ajusta los filtros para ver sus PDVs, quotas y visitas." />
            )}
          </Card>
        </section>
      ) : (
        <section className="space-y-6">
          <CoordinatorRouteKanban
            routes={filteredRoutes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            selectedWeekStart={selectedWeekStart}
            onPreviousWeek={() => setSelectedWeekStart((current) => shiftWeekStart(current, -1))}
            onNextWeek={() => setSelectedWeekStart((current) => shiftWeekStart(current, 1))}
          />

          <div className="space-y-6">
            <Card className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{selectedRoute?.supervisor ?? 'Selecciona una ruta'}</h3>
                  <p className="mt-1 text-sm text-slate-500">Detalle operativo de la ruta seleccionada y decisiones de coordinacion.</p>
                </div>
                {selectedRoute && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteTone(selectedRoute.estatus)}`}>
                    {selectedRoute.estatus}
                  </span>
                )}
              </div>
              {selectedRoute ? (
                <>
                  <RouteWorkflowCard route={selectedRoute} canReview={data.warRoom.metadataColumnAvailable} />
                  <RouteChangeImpactCard
                    route={selectedRoute}
                    supervisor={
                      data.warRoom.supervisors.find(
                        (item) => item.supervisorEmpleadoId === selectedRoute.supervisorEmpleadoId
                      ) ?? null
                    }
                  />
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
                <EmptyState copy="Selecciona una ruta para revisar secuencia, carga de trabajo y aprobacion." />
              )}
            </Card>
          </div>
        </section>
      )}

      <ModalPanel
        open={isExceptionsOpen}
        onClose={() => setIsExceptionsOpen(false)}
        title="Tiendas sin visitas"
        subtitle="Visitas abiertas, fuera de geocerca o sin check-in que requieren seguimiento."
      >
        <div className="space-y-3">
          {data.warRoom.exceptions.length === 0 ? (
            <EmptyState copy="Sin tiendas sin visitas por ahora." />
          ) : (
            data.warRoom.exceptions.map((item) => (
              <div key={`${item.routeId}-${item.visitId}`} className={`rounded-[20px] border px-4 py-4 ${getExceptionTone(item.tone)}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.pdv ?? 'PDV sin nombre'}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] opacity-80">{item.supervisor ?? 'Sin supervisor'} · {item.diaLabel}</p>
                  </div>
                  <PremiumLineIcon name="warning" className="h-5 w-5" strokeWidth={2} />
                </div>
                <p className="mt-3 text-sm">{item.motivo}</p>
              </div>
            ))
          )}
        </div>
      </ModalPanel>
    </div>
  )
}

function SupervisorRouteOperations({
  data,
  actorPuesto,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
}) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(data.rutas[0]?.id ?? null)
  const [isRoutesHistoryOpen, setIsRoutesHistoryOpen] = useState(false)
  const [isMissingVisitsOpen, setIsMissingVisitsOpen] = useState(false)
  const selectedRoute = data.rutas.find((item) => item.id === selectedRouteId) ?? data.rutas[0] ?? null

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

      <AgendaDigestCard agendaHoy={data.agendaHoy} pendientes={data.agendaPendientesReposicion} />

      {data.puedeEditar && <PlanificarRutaCard data={data} />}

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Agenda y ruta del dia</h2>
            <p className="mt-1 text-sm text-slate-500">
              Edita el dia, pide modificaciones y revisa la secuencia programada sin saturar la pantalla.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsMissingVisitsOpen(true)}>
              Tiendas sin visitas
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsRoutesHistoryOpen(true)}>
              Semanas enviadas
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="space-y-5 px-6 py-5">
            {selectedRoute ? (
              <>
                <RouteWorkflowCard route={selectedRoute} canReview={false} />
                <UnifiedDayEditorCard
                  route={selectedRoute}
                  agendaHoy={
                    data.agendaSemanaActual.find((item) => item.fecha === data.agendaHoy?.fecha) ?? data.agendaHoy
                  }
                  agendaEvents={data.agendaEventosPendientesAprobacion.filter((item) => item.routeId === selectedRoute.id)}
                  pendingRepositions={data.agendaPendientesReposicion.filter((item) => item.routeId === selectedRoute.id)}
                  agendaInfrastructureAvailable={data.agendaInfrastructureAvailable}
                  agendaInfrastructureMessage={data.agendaInfrastructureMessage}
                  metadataEnabled={data.warRoom.metadataColumnAvailable}
                  pdvsDisponibles={data.pdvsDisponibles}
                />
                <RouteMapByDay route={selectedRoute} />
              </>
            ) : (
              <EmptyState copy="Selecciona una ruta para ver la secuencia." />
            )}
          </div>
        </Card>
      </section>

      <ModalPanel
        open={isRoutesHistoryOpen}
        onClose={() => setIsRoutesHistoryOpen(false)}
        title="Semanas enviadas"
        subtitle="Consulta semanas previas y el estatus de aprobacion de coordinacion."
      >
        <div className="space-y-3">
          {data.rutas.length === 0 ? (
            <EmptyState copy="Todavia no hay rutas registradas. En cuanto agregues visitas, apareceran aqui." />
          ) : (
            data.rutas.map((ruta) => (
              <button
                key={ruta.id}
                type="button"
                onClick={() => {
                  setSelectedRouteId(ruta.id)
                  setIsRoutesHistoryOpen(false)
                }}
                className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                  selectedRoute?.id === ruta.id
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{ruta.supervisor ?? 'Supervisor sin nombre'}</p>
                    <p className={`mt-1 text-xs ${selectedRoute?.id === ruta.id ? 'text-slate-300' : 'text-slate-400'}`}>
                      {formatDate(ruta.semanaInicio)} - {formatDate(ruta.semanaFin)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      selectedRoute?.id === ruta.id ? 'bg-white/10 text-white' : getRouteTone(ruta.estatus)
                    }`}
                  >
                    {ruta.estatus}
                  </span>
                </div>
                <div className={`mt-3 text-sm ${selectedRoute?.id === ruta.id ? 'text-slate-200' : 'text-slate-600'}`}>
                  {ruta.visitasCompletadas}/{ruta.totalVisitas} visitas completadas
                </div>
                {ruta.notas && (
                  <p className={`mt-2 text-xs ${selectedRoute?.id === ruta.id ? 'text-slate-300' : 'text-slate-500'}`}>
                    {ruta.notas}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </ModalPanel>

      <ModalPanel
        open={isMissingVisitsOpen}
        onClose={() => setIsMissingVisitsOpen(false)}
        title="Tiendas sin visitas"
        subtitle="Pendientes por reponer o visitas del dia que no se ejecutaron todavia."
      >
        <div className="space-y-3">
          {data.agendaPendientesReposicion.length === 0 ? (
            <EmptyState copy="No hay tiendas sin visitas por ahora." />
          ) : (
            data.agendaPendientesReposicion.map((item) => (
              <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.pdv ?? 'PDV sin nombre'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.fechaOrigen} · {item.zona ?? 'Sin zona'}
                    </p>
                  </div>
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
                <p className="mt-3 text-sm text-slate-600">{item.motivo}</p>
              </div>
            ))
          )}
        </div>
      </ModalPanel>
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
  icon: 'reports' | 'calendar'
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
            Agenda operativa
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

function RouteMapByDay({ route }: { route: RutaSemanalItem }) {
  const dayOptions = useMemo(
    () =>
      Array.from(
        new Map(
          route.visitas.map((visit) => [
            visit.diaSemana,
            {
              value: String(visit.diaSemana),
              label: `${visit.diaLabel} · ${
                route.visitas.filter((item) => item.diaSemana === visit.diaSemana).length
              } visita(s)`,
            },
          ])
        ).values()
      ),
    [route.visitas]
  )
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(route.visitas[0]?.diaSemana ?? 1)

  useEffect(() => {
    setSelectedDayNumber(route.visitas[0]?.diaSemana ?? 1)
  }, [route.id, route.visitas])

  const dayVisits = route.visitas
    .filter((visit) => visit.diaSemana === selectedDayNumber)
    .sort((left, right) => left.orden - right.orden)

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mapa del dia</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Ruta programada por dia</h3>
          <p className="mt-2 text-sm text-slate-500">
            Elige el dia de la semana para ver solo la secuencia programada de ese dia.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Select
            label="Dia"
            value={String(selectedDayNumber)}
            onChange={(event) => setSelectedDayNumber(Number(event.target.value))}
            options={dayOptions.length === 0 ? [{ value: '', label: 'Sin visitas' }] : dayOptions}
          />
        </div>
      </div>
      <div className="mt-5">
        <RouteMap visits={dayVisits} />
      </div>
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
}: {
  routes: RutaSemanalItem[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  selectedWeekStart: string
  onPreviousWeek: () => void
  onNextWeek: () => void
}) {
  const [draggedRouteId, setDraggedRouteId] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    routeId: string
    targetColumn: CoordinatorKanbanColumnKey
  } | null>(null)
  const [state, formAction] = useActionState(actualizarControlRutaSemanal, ESTADO_RUTA_INICIAL)

  useEffect(() => {
    if (state.ok) {
      setPendingMove(null)
    }
  }, [state.ok])

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
              Arrastra una ruta entre columnas para cambiar su estado. Las cerradas se alimentan por ejecucion y quedan solo lectura.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <button
                type="button"
                onClick={onPreviousWeek}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white"
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
            {columns.map((column) => (
              <span key={column} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {getCoordinatorKanbanColumnLabel(column)} {grouped[column].length}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          {columns.map((column) => {
            const canDrop = getCoordinatorApprovalStateForColumn(column) !== null
            return (
              <div
                key={column}
                className={`rounded-[24px] border p-4 ${
                  column === 'PUBLICADAS'
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : column === 'AJUSTES'
                      ? 'border-amber-200 bg-amber-50/70'
                      : column === 'ENVIADAS'
                        ? 'border-sky-200 bg-sky-50/70'
                        : 'border-slate-200 bg-slate-50'
                }`}
                onDragOver={(event) => {
                  if (canDrop) {
                    event.preventDefault()
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!draggedRouteId || !canDrop) {
                    return
                  }

                  const route = routes.find((item) => item.id === draggedRouteId)
                  if (!route || getCoordinatorKanbanColumn(route) === column) {
                    return
                  }

                  setPendingMove({ routeId: route.id, targetColumn: column })
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{getCoordinatorKanbanColumnLabel(column)}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {grouped[column].length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {grouped[column].length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-400">
                      Sin rutas en esta columna.
                    </div>
                  ) : (
                    grouped[column].map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        draggable={column !== 'CERRADAS'}
                        onDragStart={() => setDraggedRouteId(route.id)}
                        onDragEnd={() => setDraggedRouteId(null)}
                        onClick={() => onSelectRoute(route.id)}
                        className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                          selectedRouteId === route.id
                            ? 'border-slate-950 bg-slate-950 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{route.supervisor ?? 'Supervisor sin nombre'}</p>
                            <p className={`mt-1 text-xs ${selectedRouteId === route.id ? 'text-slate-300' : 'text-slate-500'}`}>
                              {formatDate(route.semanaInicio)} - {formatDate(route.semanaFin)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                              selectedRouteId === route.id ? 'bg-white/10 text-white' : getRouteTone(route.estatus)
                            }`}
                          >
                            {route.estatus}
                          </span>
                        </div>
                        <div className={`mt-3 flex flex-wrap gap-3 text-xs ${selectedRouteId === route.id ? 'text-slate-200' : 'text-slate-500'}`}>
                          <span>{route.totalVisitas} visitas</span>
                          <span>{route.visitasCompletadas} hechas</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <ModalPanel
        open={Boolean(pendingMove)}
        onClose={() => setPendingMove(null)}
        title="Mover ruta de estado"
        subtitle="Confirmamos el cambio antes de actualizar el workflow operativo."
      >
        {pendingMove ? (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="ruta_id" value={pendingMove.routeId} />
            <input
              type="hidden"
              name="minimum_visits_per_pdv"
              value={String(routes.find((item) => item.id === pendingMove.routeId)?.minimumVisitsPerPdv ?? 4)}
            />
            <input
              type="hidden"
              name="approval_state"
              value={getCoordinatorApprovalStateForColumn(pendingMove.targetColumn) ?? ''}
            />
            <Input
              label="Nota"
              name="approval_note"
              placeholder={`Motivo para mover a ${getCoordinatorKanbanColumnLabel(pendingMove.targetColumn)}`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitActionButton label="Confirmar movimiento" pendingLabel="Moviendo..." />
              {state.message ? (
                <span className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {state.message}
                </span>
              ) : null}
            </div>
          </form>
        ) : null}
      </ModalPanel>
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

  const buildDraftForDay = (dayNumber: number, sourceRoute = route) => {
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
  }

  const [draftRoute, setDraftRoute] = useState(() => buildDraftForDay(selectedDayNumber))

  useEffect(() => {
    const nextDay = route.changeRequestTargetDayNumber ?? route.visitas[0]?.diaSemana ?? 1
    setSelectedDayNumber(nextDay)
    setSelectedVisitId(route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : '')
    setChangeType(route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA')
    setDraftRoute(buildDraftForDay(nextDay, route))
  }, [route.id, route.updatedAt])

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
        clientId: `draft-${selectedDayNumber}-${pdvId}-${crypto.randomUUID()}`,
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
                    { value: 'VISITA_ADICIONAL', label: 'Visita adicional' },
                    { value: 'OFICINA', label: 'Oficina' },
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

function QuotaSummary({ supervisor }: { supervisor: RutaSupervisorWarRoomItem }) {
  const width = supervisor.expectedMonthlyVisits
    ? Math.max(8, Math.min(100, Math.round((supervisor.monthlyVisitsCompleted / supervisor.expectedMonthlyVisits) * 100)))
    : 0

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quota mensual del supervisor</p>
            <h4 className="mt-1 text-lg font-semibold text-slate-950">{supervisor.monthlyVisitsCompleted}/{supervisor.expectedMonthlyVisits} visitas</h4>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSemaforoTone(supervisor.semaforo)}`}>
            {supervisor.cumplimientoPorcentaje}%
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-[var(--module-primary)]" style={{ width: `${width}%` }} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <MiniStat label="Min/PDV" value={String(supervisor.minimumVisitsPerPdv ?? 0)} />
          <MiniStat label="PDVs" value={String(supervisor.totalPdvsAsignados)} />
          <MiniStat label="Cambios" value={String(supervisor.changeRequestsPendientes)} />
        </div>
      </div>
      <div className="rounded-[20px] border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ruta activa</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteTone(supervisor.rutaEstatus ?? 'BORRADOR')}`}>
            {supervisor.rutaEstatus ?? 'Sin ruta'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Aprobacion {supervisor.approvalState}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Zona: <span className="font-medium text-slate-900">{supervisor.zona ?? 'Sin zona'}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Quedan <span className="font-medium text-slate-900">{Math.max(supervisor.expectedMonthlyVisits - supervisor.monthlyVisitsCompleted, 0)}</span> visitas pendientes este mes.
        </p>
      </div>
    </div>
  )
}

function QuotaProgressList({
  supervisor,
  items,
  metadataEnabled,
}: {
  supervisor: RutaSupervisorWarRoomItem
  items: RutaQuotaProgressItem[]
  metadataEnabled: boolean
}) {
  const [state, formAction] = useActionState(actualizarControlRutaSemanal, ESTADO_RUTA_INICIAL)
  const [minimumVisitsInput, setMinimumVisitsInput] = useState(
    String(supervisor.minimumVisitsPerPdv ?? 0)
  )
  const normalizedMinimumVisits = Math.max(0, Number.parseInt(minimumVisitsInput || '0', 10) || 0)
  const expectedVisitsPreview = normalizedMinimumVisits * supervisor.totalPdvsAsignados

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">PDVs</h4>
        <span className="text-xs text-slate-500">Cada PDV replica la cuota general del supervisor.</span>
      </div>
      {items.length === 0 ? (
        <EmptyState copy="Este supervisor todavia no tiene PDVs activos visibles." />
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="ruta_id" value={supervisor.rutaId ?? ''} />
          <input type="hidden" name="supervisor_empleado_id" value={supervisor.supervisorEmpleadoId} />
          <input type="hidden" name="semana_inicio" value={supervisor.weekStart} />

          <div className="grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-950">Cuota general por supervisor</p>
              <p className="mt-1 text-xs text-slate-500">
                Si defines {normalizedMinimumVisits} visita{normalizedMinimumVisits === 1 ? '' : 's'} y el supervisor tiene {supervisor.totalPdvsAsignados} PDV{supervisor.totalPdvsAsignados === 1 ? '' : 's'}, el total mensual esperado sera {expectedVisitsPreview} visita{expectedVisitsPreview === 1 ? '' : 's'}.
              </p>
              {!metadataEnabled ? (
                <p className="mt-2 text-xs text-amber-700">
                  La lectura del War Room ya funciona, pero para guardar la cuota general primero hay que aplicar la migracion del workflow de ruta semanal.
                </p>
              ) : null}
              {state.message ? (
                <p className={`mt-2 text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:justify-items-end">
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Visitas minimas por PDV
                <Input
                  name="minimum_visits_per_pdv"
                  type="number"
                  min="0"
                  value={minimumVisitsInput}
                  onChange={(event) => setMinimumVisitsInput(event.target.value)}
                  className="w-full md:w-36"
                />
              </label>
              <SubmitButton label="Guardar cuota general" disabled={!metadataEnabled} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
            <div key={item.pdvId} className="rounded-[16px] border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{item.nombre}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{item.zona ?? item.formato ?? 'Sin zona'}</p>
                </div>
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
              <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-[var(--module-primary)]"
                  style={{ width: `${Math.max(8, item.cumplimientoPorcentaje)}%` }}
                />
              </div>
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                  <span className="truncate">Quota: {item.quotaMensual}</span>
                  <span className="truncate">Hechas: {item.visitasRealizadas}</span>
                  <span className="truncate">Pend.: {item.visitasPendientes}</span>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Hereda cuota general
                </span>
              </div>
            </div>
          ))}
          </div>

        </form>
      )}
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

function HeatMapCard({ items }: { items: RutaQuotaProgressItem[] }) {
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
            Mapa de calor
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Dispersion geografica de PDVs con visitas pendientes.
          </p>
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
    <Card className="border-slate-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className={`mt-2 font-semibold ${metricValueClass(value)} ${tone === 'amber' ? 'text-amber-800' : 'text-slate-950'}`}>{value}</p>
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
          <PremiumLineIcon name={tone === 'amber' ? 'warning' : 'reports'} className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
    </Card>
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
  pendientes,
  pdvsDisponibles,
  agendaInfrastructureAvailable,
  agendaInfrastructureMessage,
}: {
  routeId: string | null
  agendaHoy: RutaAgendaOperativaDia | null
  pendientes: RutaPendienteReposicionItem[]
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
    setSelectedDate(agendaHoy?.fecha ?? '')
    setSelectedDisplacedVisitIds([])
  }, [agendaHoy?.fecha])

  const currentDayVisits = agendaHoy?.visitasPlaneadas ?? []

  return (
    <Card className="border-slate-200 bg-white">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
                Agenda operativa dinamica
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                {agendaHoy ? `${agendaHoy.dayLabel} ${formatDate(agendaHoy.fecha)}` : 'Sin agenda resuelta'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                La ruta aprobada sigue siendo la base, pero aqui se resuelve lo planeado, lo ejecutado y lo que queda por reponer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Planeadas {agendaHoy?.planeadasCount ?? 0}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Ejecutadas {agendaHoy?.ejecutadasCount ?? 0}
              </span>
            </div>
          </div>

          {agendaHoy ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniStat label="Planeadas" value={String(agendaHoy.planeadasCount)} />
                <MiniStat label="Ejecutadas" value={String(agendaHoy.ejecutadasCount)} />
                <MiniStat label="Pend. just." value={String(agendaHoy.pendientesJustificadasCount)} />
                <MiniStat label="Pend. inj." value={String(agendaHoy.pendientesInjustificadasCount)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <AgendaBlock
                  title="Ruta base activa"
                  emptyCopy="No hay visitas activas para este dia."
                  items={agendaHoy.visitasActivas.map((visit) => ({
                    key: visit.id,
                    title: visit.pdv ?? 'PDV sin nombre',
                    subtitle: `${visit.zona ?? 'Sin zona'} · Orden ${visit.orden}`,
                    badge: visit.estatus,
                    badgeTone: getVisitTone(visit.estatus),
                  }))}
                />
                <AgendaBlock
                  title="Eventos del dia"
                  emptyCopy="Todavia no hay eventos operativos cargados."
                  items={agendaHoy.eventos.map((event) => ({
                    key: event.id,
                    title: event.titulo,
                    subtitle: `${event.tipoLabel} · ${event.impactoLabel}`,
                    detail: event.pdv ?? event.sede ?? event.zona ?? 'Sin detalle',
                    badge: event.estatusAprobacion,
                    badgeTone: getAgendaApprovalTone(event.estatusAprobacion),
                  }))}
                />
                <AgendaBlock
                  title="Visitas desplazadas"
                  emptyCopy="No hay visitas desplazadas por eventos aprobados."
                  items={agendaHoy.visitasDesplazadas.map((visit) => ({
                    key: visit.id,
                    title: visit.pdv ?? 'PDV sin nombre',
                    subtitle: `${visit.zona ?? 'Sin zona'} · ${visit.diaLabel}`,
                    badge: 'Pend. reponer',
                    badgeTone: 'bg-amber-100 text-amber-800',
                  }))}
                />
              </div>
            </>
          ) : (
            <EmptyState copy="Cuando exista ruta semanal visible para esta semana, aqui se resolvera la agenda del dia." />
          )}

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Pendientes por reponer</p>
                <p className="mt-1 text-xs text-slate-500">
                  Las visitas no realizadas quedan separadas por causa justificada o no justificada.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {pendientes.length} visibles
              </span>
            </div>
            {pendientes.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No hay visitas pendientes de reposicion visibles.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {pendientes.slice(0, 6).map((item) => (
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

        <form action={formAction} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 space-y-4">
          <input type="hidden" name="ruta_id" value={routeId ?? ''} />
          <input
            type="hidden"
            name="displaced_visit_ids_json"
            value={JSON.stringify(selectedDisplacedVisitIds)}
          />
          <div>
            <p className="text-sm font-semibold text-slate-950">Agregar evento del dia</p>
            <p className="mt-1 text-xs text-slate-500">
              Registra visitas adicionales o eventos que se suman, sobreponen parcialmente o reemplazan la ruta aprobada.
            </p>
          </div>
          {!agendaInfrastructureAvailable && agendaInfrastructureMessage ? (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {agendaInfrastructureMessage}
            </div>
          ) : null}
          <Input
            label="Fecha operativa"
            type="date"
            name="fecha_operacion"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            disabled={!agendaInfrastructureAvailable}
          />
          <Select
            label="Tipo de evento"
            name="tipo_evento"
            value={eventType}
            onChange={(event) => setEventType(event.target.value as RutaAgendaEventoItem['tipoEvento'])}
            disabled={!agendaInfrastructureAvailable}
            options={[
              { value: 'VISITA_ADICIONAL', label: 'Visita adicional' },
              { value: 'OFICINA', label: 'Oficina' },
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
          <Input
            label="Titulo"
            name="titulo"
            placeholder="Ej. firma de contratos en oficina"
            disabled={!agendaInfrastructureAvailable}
          />
          <Input label="Descripcion" name="descripcion" placeholder="Contexto operativo del evento" disabled={!agendaInfrastructureAvailable} />
          <Input label="Sede u observacion" name="sede" placeholder="Oficina central, centro de formacion, etc." disabled={!agendaInfrastructureAvailable} />
          {eventType === 'VISITA_ADICIONAL' ? (
            <Select
              label="PDV del evento"
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
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visitas desplazadas
              </p>
              <div className="space-y-2 rounded-[18px] border border-slate-200 bg-white p-3">
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
          <SubmitActionButton
            label="Registrar evento"
            pendingLabel="Guardando..."
            disabled={!agendaHoy || !agendaInfrastructureAvailable}
          />
          {state.message && (
            <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
          )}
        </form>
      </div>
    </Card>
  )
}

function AgendaBlock({
  title,
  emptyCopy,
  items,
}: {
  title: string
  emptyCopy: string
  items: Array<{
    key: string
    title: string
    subtitle: string
    detail?: string | null
    badge: string
    badgeTone: string
  }>
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyCopy}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.key} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.badgeTone}`}>{item.badge}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
              {item.detail ? <p className="mt-2 text-xs text-slate-600">{item.detail}</p> : null}
            </div>
          ))}
        </div>
      )}
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

function PlanificarRutaCard({ data }: { data: RutaSemanalPanelData }) {
  const minimumWeekStart = getNextWeekStartIso(data.semanaActualInicio)
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => minimumWeekStart)
  const route = data.rutas.find((item) => item.semanaInicio === selectedWeekStart) ?? null
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
      [...(route?.visitas ?? [])]
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
    [route]
  )

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Definir ruta semanal
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Carga operativa de visitas</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Cada semana se envía una ruta distinta y queda pendiente de aprobacion de coordinacion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {data.pdvsDisponibles.length} PDVs disponibles
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              route
                ? route.approvalState === 'APROBADA'
                  ? 'bg-emerald-100 text-emerald-700'
                  : route.approvalState === 'CAMBIOS_SOLICITADOS'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {route ? route.approvalState : 'Sin ruta enviada'}
          </span>
        </div>
      </div>
      <div className="mt-5">
        <WeeklyRouteCanvasPlanner
          key={`${route?.id ?? 'new'}-${selectedWeekStart}`}
          weekStart={selectedWeekStart}
          weekEnd={weekEnd}
          minimumWeekStart={minimumWeekStart}
          pdvsDisponibles={data.pdvsDisponibles}
          pdvMap={pdvMap}
          initialDrafts={initialDrafts}
          route={route}
          onWeekStartChange={(nextWeekStart) => setSelectedWeekStart(nextWeekStart)}
        />
      </div>
    </Card>
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
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')

  useEffect(() => {
    setDrafts(initialDrafts)
  }, [initialDrafts])

  const addVisitToDay = (day: number, pdvId: string) => {
    if (!pdvId || drafts.some((item) => item.day === day && item.pdvId === pdvId)) {
      return
    }

    const pdv = pdvMap.get(pdvId)
    if (!pdv) {
      return
    }

    setDrafts((current) => [
      ...current,
      {
        clientId: `draft-${day}-${pdvId}-${crypto.randomUUID()}`,
        visitId: null,
        pdvId,
        day,
        label: pdv.label,
        subtitle: pdv.subtitle,
        notes: '',
        status: 'PLANIFICADA',
        locked: false,
      },
    ])
  }

  const removeDraft = (clientId: string) => {
    setDrafts((current) => current.filter((item) => item.clientId !== clientId || item.locked))
  }

  const moveDraftWithinDay = (clientId: string, direction: 'up' | 'down') => {
    setDrafts((current) => {
      const target = current.find((item) => item.clientId === clientId)
      if (!target || target.locked) {
        return current
      }

      const sameDay = current.filter((item) => item.day === target.day)
      const currentIndex = sameDay.findIndex((item) => item.clientId === clientId)
      if (currentIndex === -1) {
        return current
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= sameDay.length) {
        return current
      }

      return buildWeeklyDrafts(current, clientId, target.day, nextIndex)
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
  const selectedDayDrafts = drafts.filter((item) => item.day === selectedDay)
  const filteredPdvs = pdvsDisponibles.filter((pdv) =>
    normalizeFilterText(`${pdv.nombre} ${pdv.zona ?? ''}`).includes(normalizeFilterText(storeSearch))
  )
  const isWeekEditable = weekStart >= minimumWeekStart

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
            onChange={(event) => onWeekStartChange(normalizeWeekStart(event.target.value))}
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

      <div className="grid gap-4 xl:grid-cols-[0.64fr_1.36fr]">
        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Dias de la semana
          </p>
          <div className="mt-3 space-y-2">
            {WEEK_DAY_OPTIONS.map((day) => {
              const totalVisits = drafts.filter((item) => item.day === day.value).length
              const isActive = day.value === selectedDay

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setSelectedDay(day.value)}
                  className={`flex w-full items-center justify-between rounded-[16px] border px-3 py-3 text-left transition ${
                    isActive
                      ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{day.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{totalVisits} visita(s)</p>
                  </div>
                  {isActive ? (
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[var(--module-text)] shadow-sm">
                      Activo
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
                {WEEK_DAY_OPTIONS.find((day) => day.value === selectedDay)?.label ?? 'Dia'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Agrega tiendas desde el boton y acomoda el orden con subir o bajar.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-w-[200px] justify-center"
              onClick={() => setIsDayPickerOpen(true)}
              disabled={!isWeekEditable}
            >
              Elegir tiendas
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {selectedDayDrafts.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                Todavia no hay tiendas cargadas para este dia.
              </div>
            ) : (
              selectedDayDrafts.map((item, index) => (
                <div
                  key={item.clientId}
                  className={`rounded-[18px] border px-3 py-3 ${
                    item.locked ? 'border-slate-200 bg-slate-100' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{item.subtitle}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        item.status === 'COMPLETADA'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.locked
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {item.locked ? item.status : `#${index + 1}`}
                    </span>
                  </div>

                  {!item.locked ? (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => moveDraftWithinDay(item.clientId, 'up')}
                        >
                          Subir
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === selectedDayDrafts.length - 1}
                          onClick={() => moveDraftWithinDay(item.clientId, 'down')}
                        >
                          Bajar
                        </Button>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeDraft(item.clientId)}>
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
      </div>

      <ModalPanel
        open={isDayPickerOpen}
        onClose={() => setIsDayPickerOpen(false)}
        title={`Tiendas para ${WEEK_DAY_OPTIONS.find((day) => day.value === selectedDay)?.label ?? 'el dia'}`}
        subtitle="Selecciona los PDVs a visitar en este dia."
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
              const currentDraft = selectedDayDrafts.find((item) => item.pdvId === pdv.id)
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
                        addVisitToDay(selectedDay, pdv.id)
                      }
                    }}
                  >
                    {isSelected ? (currentDraft?.locked ? 'Bloqueada' : 'Quitar') : 'Agregar'}
                  </Button>
                </div>
              )
            })}
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Control de quota</p>
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
          <form action={formAction} className="grid gap-4 lg:grid-cols-3">
            <input type="hidden" name="ruta_id" value={route.id} />

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visitas minimas por PDV
              </label>
              <Input
                name="minimum_visits_per_pdv"
                type="number"
                min="1"
                defaultValue={route.minimumVisitsPerPdv ?? 4}
              />
            </div>

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

            <div className="space-y-2 lg:col-span-3">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nota</label>
              <Input name="approval_note" defaultValue={route.approvalNote ?? ''} placeholder="Comentario de revision" />
            </div>

            <div className="lg:col-span-3 flex flex-wrap items-center gap-3">
              <SubmitActionButton label="Guardar control" pendingLabel="Guardando..." />
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
          La aprobacion de quota y cambios de ruta se resuelve desde coordinacion.
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
    route.changeRequestTargetDayNumber ?? route.visitas[0]?.diaSemana ?? 1
  )
  const [changeType, setChangeType] = useState<RutaSemanalItem['changeRequestType']>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA'
  )
  const [selectedVisitId, setSelectedVisitId] = useState<string>(
    route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : ''
  )
  const [isStorePickerOpen, setIsStorePickerOpen] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')

  const buildDraftForDay = (dayNumber: number, sourceRoute = route) => {
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
  }

  const [draftRoute, setDraftRoute] = useState(() => buildDraftForDay(selectedDayNumber))

  useEffect(() => {
    const nextDay = route.changeRequestTargetDayNumber ?? route.visitas[0]?.diaSemana ?? 1
    setSelectedDayNumber(nextDay)
    setChangeType(route.changeRequestState === 'PENDIENTE' ? route.changeRequestType : 'CAMBIO_DIA')
    setSelectedVisitId(route.changeRequestState === 'PENDIENTE' ? route.changeRequestTargetVisitId ?? '' : '')
    setDraftRoute(buildDraftForDay(nextDay, route))
  }, [route.id, route.updatedAt])

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
        clientId: `draft-${selectedDayNumber}-${pdvId}-${crypto.randomUUID()}`,
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
                { value: '', label: 'Selecciona un dia...' },
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
