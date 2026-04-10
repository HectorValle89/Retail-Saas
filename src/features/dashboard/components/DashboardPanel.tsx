'use client';

import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap';
import { ModalPanel } from '@/components/ui/modal-panel';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Card } from '@/components/ui/card';
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card';
import { PremiumLineIcon, type PremiumIconName } from '@/components/ui/premium-icons';
import { resolveKpiSemantic, withAlpha } from '@/components/ui/kpi-semantics';
import { ToastBanner } from '@/components/ui/toast-banner';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { ActorActual } from '@/lib/auth/session';
import { queueOfflineLoveIsdin, queueOfflineVenta } from '@/lib/offline/syncQueue';
import { signout } from '@/actions/auth';
import { ejecutarTareasCampanaPdv } from '@/features/campanas/actions';
import { ESTADO_CAMPANA_ADMIN_INICIAL } from '@/features/campanas/state';
import { registrarAfiliacionLoveIsdin } from '@/features/love-isdin/actions';
import { ESTADO_LOVE_ISDIN_INICIAL } from '@/features/love-isdin/state';
import { injectDirectR2Manifest, injectDirectR2Upload } from '@/lib/storage/directR2Client';
import {
  enviarMensajeSoporteDermoconsejo,
  marcarMensajeLeido,
  registrarIncidenciaOperativa,
  solicitarCorreccionPerfilDermoconsejo,
} from '@/features/mensajes/actions';
import { ESTADO_MENSAJE_INICIAL } from '@/features/mensajes/state';
import {
  registrarSolicitudOperativa,
  resolverSolicitudDesdeDashboard,
} from '@/features/solicitudes/actions';
import { registrarRegistroExtemporaneo } from '@/features/solicitudes/extemporaneoActions';
import { ESTADO_SOLICITUD_INICIAL } from '@/features/solicitudes/state';
import { DermoCheckInSheet } from './DermoCheckInSheet';
import { DermoLoveCartSheet, DermoRegistroExtemporaneoSheet, DermoVentasCartSheet } from './DermoCommercialSheets';
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog';
import {
  captureAttendancePosition,
  stampAttendanceSelfie,
} from '@/features/asistencias/lib/attendanceCapture';
import {
  registrarLlegadaFormacionDashboard,
  registrarSalidaFormacionDashboard,
} from '@/features/formaciones/actions';
import { ESTADO_FORMACION_ADMIN_INICIAL } from '@/features/formaciones/state';
import { resolverAsistenciaSupervisor } from '@/features/asistencias/actions';
import { ESTADO_SUPERVISOR_ASISTENCIA_INICIAL } from '@/features/asistencias/state';
import { RutaSemanalPanel } from '@/features/rutas/components/RutaSemanalPanel';
import { SupervisorTodayRouteSheet } from '@/features/rutas/components/SupervisorTodayRouteSheet';
import { SupervisorMonthlyRoleSheet } from './SupervisorMonthlyRoleSheet';
import type { RutaSemanalPanelData } from '@/features/rutas/services/rutaSemanalService';
import { NominaWorkspacePanel } from '@/features/nomina/components/NominaWorkspacePanel'
import {
  buildDashboardHref,
  EMPTY_DASHBOARD_FILTERS,
} from '@/features/dashboard/types/dashboardFilters';
import type {
  DashboardDermoconsejoData,
  DashboardDermoconsejoNotificationsSummary,
  DashboardInsightsData,
  DashboardLiveAlertItem,
  DashboardMapItem,
  DashboardPanelData,
  DashboardSupervisorDailyItem,
  DashboardSupervisorRequestItem,
  DashboardTrendItem,
  DashboardVacationPolicySummary,
  DashboardSupervisorRouteSnapshot,
  VisitReachDashboardSummary,
} from '../services/dashboardService';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`));
}

function formatWeekRangeLabel(start: string, end: string) {
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function getPreviousDateValue() {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA').format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin refresh';
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortClock(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getBarWidth(current: number, max: number) {
  if (max <= 0) {
    return '0%';
  }

  return `${Math.max(8, Math.round((current / max) * 100))}%`;
}

function getQuickActionTone(accent: DashboardDermoconsejoData['quickActions'][number]['accent']) {
  switch (accent) {
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-950';
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    case 'rose':
      return 'border-rose-200 bg-rose-50 text-rose-950';
    case 'sky':
      return 'border-sky-200 bg-sky-50 text-sky-950';
    case 'orange':
      return 'border-orange-200 bg-orange-50 text-orange-950';
    case 'purple':
      return 'border-violet-200 bg-violet-50 text-violet-950';
    default:
      return 'border-slate-200 bg-white text-slate-950';
  }
}

function NominaDashboard({
  data,
}: {
  data: NonNullable<DashboardPanelData['nominaWorkspace']>
}) {
  return (
    <div className="space-y-6">
      <section className="page-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <p className="page-hero-eyebrow">Operacion de nomina</p>
            <h1 className="page-hero-title sm:text-4xl">Flujo IMSS y asistencias</h1>
            <p className="page-hero-copy max-w-3xl sm:text-base">
              Nomina solo revisa altas, cierre de incapacidades y descarga mensual de asistencias.
            </p>
          </div>

          <div className="surface-soft p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--module-text)]">
              Hoy
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SnapshotMetric label="Altas IMSS" value={String(data.summary.altasImssPendientes)} />
              <SnapshotMetric label="En proceso" value={String(data.summary.altasEnProceso)} />
              <SnapshotMetric label="Observadas" value={String(data.summary.altasObservadas)} />
              <SnapshotMetric label="Incapacidades" value={String(data.summary.incapacidadesPendientes)} />
            </div>
          </div>
        </div>
      </section>

      <NominaWorkspacePanel data={data} compact />
    </div>
  )
}

function VisitReachDashboardSection({
  data,
  dashboardFilters,
}: {
  data: VisitReachDashboardSummary
  dashboardFilters: DashboardPanelData['filtros']
}) {
  const [expandedSupervisorId, setExpandedSupervisorId] = useState<string | null>(
    data.filters.supervisorEmpleadoId || data.supervisors[0]?.supervisorEmpleadoId || null
  )

  useEffect(() => {
    setExpandedSupervisorId(data.filters.supervisorEmpleadoId || data.supervisors[0]?.supervisorEmpleadoId || null)
  }, [data.filters.supervisorEmpleadoId, data.supervisors])

  const expandedSupervisor =
    data.supervisors.find((item) => item.supervisorEmpleadoId === expandedSupervisorId) ?? data.supervisors[0] ?? null

  const buildVisitReachHref = (overrides: Partial<VisitReachDashboardSummary['filters']> = {}) => {
    const next = { ...data.filters, ...overrides }
    const params = new URLSearchParams()

    if (dashboardFilters.periodo) params.set('periodo', dashboardFilters.periodo)
    if (dashboardFilters.estado) params.set('estado', dashboardFilters.estado)
    if (dashboardFilters.zona) params.set('zona', dashboardFilters.zona)
    if (dashboardFilters.supervisorId) params.set('supervisorId', dashboardFilters.supervisorId)
    if (next.supervisorEmpleadoId) params.set('reachSupervisorId', next.supervisorEmpleadoId)
    if (next.weekStart) params.set('reachWeekStart', next.weekStart)
    if (next.cadenaCodigo) params.set('reachChain', next.cadenaCodigo)
    if (next.storeType) params.set('reachStoreType', next.storeType)

    const query = params.toString()
    return query ? `/dashboard?${query}` : '/dashboard'
  }

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--module-text)]">
            Alcance de visitas
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">KPIs diarios de cobertura</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Seguimos el objetivo mensual definido en Ruta semanal y el avance de la semana visible sin recalcular otro motor.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/ruta-semanal?tab=quotas"
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Ir a cuotas
          </Link>
          <Link
            href="/ruta-semanal?tab=routes"
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Tablero de rutas
          </Link>
          <Link
            href="/ruta-semanal?tab=coverage"
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Cobertura
          </Link>
        </div>
      </div>

      <form method="get" className="grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr_1fr_auto] lg:items-end">
        <input type="hidden" name="periodo" value={dashboardFilters.periodo} />
        <input type="hidden" name="estado" value={dashboardFilters.estado} />
        <input type="hidden" name="zona" value={dashboardFilters.zona} />
        <input type="hidden" name="supervisorId" value={dashboardFilters.supervisorId} />

        <Field label="Supervisor">
          <select
            name="reachSupervisorId"
            defaultValue={data.filters.supervisorEmpleadoId}
            className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          >
            <option value="">Todos los supervisores</option>
            {data.options.supervisors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Semana visible">
          <input
            name="reachWeekStart"
            type="date"
            defaultValue={data.filters.weekStart}
            className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
        </Field>

        <Field label="Cadena">
          <select
            name="reachChain"
            defaultValue={data.filters.cadenaCodigo}
            className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          >
            <option value="">Todas las cadenas</option>
            {data.options.cadenas.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de tienda">
          <select
            name="reachStoreType"
            defaultValue={data.filters.storeType}
            className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          >
            {data.options.storeTypes.map((item) => (
              <option key={item.value || 'ALL'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex gap-3">
          <button
            type="submit"
            className="min-h-11 rounded-[14px] bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]"
          >
            Aplicar filtros
          </button>
          <Link
            href={buildVisitReachHref({
              supervisorEmpleadoId: '',
              cadenaCodigo: '',
              storeType: '',
            })}
            className="min-h-11 rounded-[14px] border border-border bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Limpiar
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            Semana visible {formatWeekRangeLabel(data.weekStart, data.weekEnd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.visibleSupervisors} supervisor{data.visibleSupervisors === 1 ? '' : 'es'} visibles con filtros actuales.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={buildVisitReachHref({ weekStart: new Date(new Date(`${data.weekStart}T12:00:00`).getTime() - 7 * 86400000).toISOString().slice(0, 10) })}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Semana anterior
          </Link>
          <Link
            href={buildVisitReachHref({ weekStart: new Date(new Date(`${data.weekStart}T12:00:00`).getTime() + 7 * 86400000).toISOString().slice(0, 10) })}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Semana siguiente
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Objetivo mensual" value={String(data.monthlyTarget)} />
        <MetricCard label="Realizadas mes" value={String(data.monthlyCompleted)} />
        <MetricCard label="Pendientes mes" value={String(data.monthlyPending)} />
        <MetricCard label="Cumplimiento mensual" value={`${data.monthlyCompletionPct}%`} />
        <MetricCard label="Planeadas semana" value={String(data.weeklyPlanned)} />
        <MetricCard label="Realizadas semana" value={String(data.weeklyCompleted)} />
        <MetricCard label="Pendientes semana" value={String(data.weeklyPending)} />
        <MetricCard label="Cumplimiento semanal" value={`${data.weeklyCompletionPct}%`} />
        <MetricCard label="Tiendas sin visita" value={`${data.storesWithoutVisitMonth} mes / ${data.storesWithoutVisitWeek} semana`} />
      </section>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Detalle por supervisor</h3>
          <p className="mt-1 text-sm text-slate-500">
            El dashboard abre primero el resumen ejecutivo. El detalle por PDV solo se despliega cuando filtras un supervisor.
          </p>
        </div>

        {data.supervisors.length === 0 ? (
          <Card className="border-dashed text-center text-sm text-slate-500">
            No hay supervisores visibles con los filtros actuales.
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-2">
              {data.supervisors.map((item) => {
                const active = item.supervisorEmpleadoId === expandedSupervisor?.supervisorEmpleadoId
                return (
                  <button
                    key={item.supervisorEmpleadoId}
                    type="button"
                    onClick={() => setExpandedSupervisorId(item.supervisorEmpleadoId)}
                    className={`rounded-[20px] border px-5 py-5 text-left transition ${
                      active
                        ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950">{item.supervisor}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.zona ?? 'Sin zona'} · {item.visibleStores} tiendas visibles</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {item.semaforo}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <MiniInsight label="Mes" value={`${item.monthlyCompleted}/${item.monthlyTarget}`} />
                      <MiniInsight label="Semana" value={`${item.weeklyCompleted}/${item.weeklyPlanned}`} />
                      <MiniInsight label="Sin visita" value={`${item.storesWithoutVisitMonth} mes`} />
                    </div>
                  </button>
                )
              })}
            </div>

            {data.detailEnabled && expandedSupervisor ? (
              <Card className="space-y-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-950">{expandedSupervisor.supervisor}</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      Objetivo mensual {expandedSupervisor.monthlyTarget} · realizadas {expandedSupervisor.monthlyCompleted} · semana {formatWeekRangeLabel(data.weekStart, data.weekEnd)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {expandedSupervisor.pdvGaps.length} PDVs filtrados
                  </span>
                </div>

                {expandedSupervisor.pdvGaps.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No hay PDVs visibles para este supervisor con la combinacion actual de filtros.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expandedSupervisor.pdvGaps.map((item) => (
                      <div key={item.pdvId} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{item.nombre}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.claveBtl} · {item.cadena ?? 'Sin cadena'} · {item.zona ?? 'Sin zona'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {item.clasificacionMaestra && (
                              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                {item.clasificacionMaestra}
                              </span>
                            )}
                            {item.grupoRotacionCodigo && (
                              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                {item.grupoRotacionCodigo}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                          <MiniInsight label="Objetivo mes" value={String(item.monthlyTarget)} />
                          <MiniInsight label="Hechas mes" value={String(item.monthlyCompleted)} />
                          <MiniInsight label="Pendientes mes" value={String(item.monthlyPending)} />
                          <MiniInsight label="Cumplimiento mes" value={`${item.monthlyCompletionPct}%`} />
                          <MiniInsight label="Planeadas semana" value={String(item.weeklyPlanned)} />
                          <MiniInsight label="Hechas semana" value={String(item.weeklyCompleted)} />
                          <MiniInsight label="Pendientes semana" value={String(item.weeklyPending)} />
                          <MiniInsight label="Cumplimiento semana" value={`${item.weeklyCompletionPct}%`} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : (
              <Card className="border-dashed text-sm text-slate-500">
                Aplica un filtro de supervisor para abrir el detalle consultivo por PDV sin cargar toda la lista desde el inicio.
              </Card>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function MiniInsight({ label, value }: { label: string; value: string }) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      className="rounded-[16px] px-3 py-3 shadow-none"
      labelClassName="text-[10px]"
      valueClassName="text-base sm:text-lg"
    />
  )
}

type ShortcutTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'orange' | 'purple';

interface RoleShortcutItem {
  key: string;
  label: string;
  helper: string;
  href: string;
  accent: ShortcutTone;
}

const SUPERVISOR_SHORTCUTS: RoleShortcutItem[] = [
  {
    key: 'pdvs',
    label: 'PDVs',
    helper: 'Mapa, catalogo y detalle de tiendas.',
    href: '/pdvs',
    accent: 'emerald',
  },
  {
    key: 'ruta-semanal',
    label: 'Ruta semanal',
    helper: 'Planea visitas y seguimiento de ruta.',
    href: '/ruta-semanal',
    accent: 'sky',
  },
  {
    key: 'asignaciones',
    label: 'Asignaciones',
    helper: 'Consulta cobertura y movimientos del equipo.',
    href: '/asignaciones',
    accent: 'sky',
  },
  {
    key: 'asistencias',
    label: 'Asistencias',
    helper: 'Monitorea check-ins y disciplina operativa.',
    href: '/asistencias',
    accent: 'emerald',
  },
  {
    key: 'solicitudes',
    label: 'Solicitudes',
    helper: 'Gestiona ausencias y movimientos pendientes.',
    href: '/solicitudes',
    accent: 'amber',
  },
  {
    key: 'ventas',
    label: 'Ventas',
    helper: 'Consulta captura y avance comercial.',
    href: '/ventas',
    accent: 'emerald',
  },
  {
    key: 'campanas',
    label: 'Campanas',
    helper: 'Activa evidencias y seguimiento en tienda.',
    href: '/campanas',
    accent: 'rose',
  },
  {
    key: 'mensajes',
    label: 'Mensajes',
    helper: 'Abre el canal operativo del equipo.',
    href: '/mensajes',
    accent: 'slate',
  },
  {
    key: 'gastos',
    label: 'Gastos',
    helper: 'Registra y revisa comprobaciones.',
    href: '/gastos',
    accent: 'amber',
  },
  {
    key: 'materiales',
    label: 'Materiales',
    helper: 'Solicita y revisa entregas de apoyo.',
    href: '/materiales',
    accent: 'sky',
  },
  {
    key: 'formaciones',
    label: 'Formaciones',
    helper: 'Sigue entrenamientos y asistencia.',
    href: '/formaciones',
    accent: 'amber',
  },
];

export function DashboardPanel({
  actor,
  data,
}: {
  actor: ActorActual;
  data: DashboardPanelData;
}) {
  if (actor.puesto === 'DERMOCONSEJERO' && data.dermoconsejo) {
    return <DermoconsejoDashboard data={data.dermoconsejo} />;
  }

  if (actor.puesto === 'SUPERVISOR') {
    return <SupervisorFieldDashboard actor={actor} data={data} />;
  }

  if (actor.puesto === 'RECLUTAMIENTO' && data.recruitmentCoverage) {
    return <RecruitmentCoverageDashboard data={data.recruitmentCoverage} />;
  }

  if (actor.puesto === 'NOMINA' && data.nominaWorkspace) {
    return <NominaDashboard data={data.nominaWorkspace} />;
  }

  const widgets = new Set(data.widgets);
  return (
    <div className="space-y-6">
      <section className="page-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <p className="page-hero-eyebrow">Beteele One</p>
            <h1 className="page-hero-title sm:text-4xl">Resumen operativo</h1>
            <p className="page-hero-copy max-w-3xl sm:text-base">Operacion general de ISDIN.</p>
          </div>

          <div className="surface-soft p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--module-text)]">
              Hoy
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SnapshotMetric label="Corte" value={data.stats.fechaCorte ?? 'Sin datos'} />
              <SnapshotMetric label="Actualizado" value={formatDateTime(data.refreshedAt)} />
              <SnapshotMetric
                label="Asistencia"
                value={`${data.stats.asistenciaPorcentajeHoy.toFixed(2)}%`}
              />
              <SnapshotMetric label="Alertas" value={String(data.stats.alertasOperativas)} />
            </div>
          </div>
        </div>
      </section>

      {!data.infraestructuraLista && (
        <Card className="bg-amber-50 text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {actor.puesto === 'NOMINA' && data.stats.imssPendientes > 0 && (
        <Card className="bg-amber-50 text-amber-950 ring-1 ring-amber-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                Pendientes IMSS
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Tienes {data.stats.imssPendientes} alta{data.stats.imssPendientes === 1 ? '' : 's'}{' '}
                pendiente{data.stats.imssPendientes === 1 ? '' : 's'} de IMSS
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                Revisa empleados para continuar el tramite.
              </p>
            </div>
            <a
              href="/nomina?inbox=altas-imss"
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]"
            >
              Revisar IMSS pendientes
            </a>
          </div>
        </Card>
      )}

      {widgets.has('autorizaciones_supervisor') && data.supervisorAuthorizations.length > 0 && (
        <SupervisorAuthorizationsSection items={data.supervisorAuthorizations} />
      )}

      {widgets.has('filtros') && (
        <Card className="bg-white">
          <form method="get" className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
            {data.visitReach && (
              <>
                <input type="hidden" name="reachSupervisorId" value={data.visitReach.filters.supervisorEmpleadoId} />
                <input type="hidden" name="reachWeekStart" value={data.visitReach.filters.weekStart} />
                <input type="hidden" name="reachChain" value={data.visitReach.filters.cadenaCodigo} />
                <input type="hidden" name="reachStoreType" value={data.visitReach.filters.storeType} />
              </>
            )}
            <Field label="Periodo">
              <input
                name="periodo"
                type="month"
                defaultValue={data.filtros.periodo}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              />
            </Field>

            <Field label="Estado">
              <select
                name="estado"
                defaultValue={data.filtros.estado}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todos los estados</option>
                {data.opcionesFiltro.estados.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Zona">
              <select
                name="zona"
                defaultValue={data.filtros.zona}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todas las zonas</option>
                {data.opcionesFiltro.zonas.map((zona) => (
                  <option key={zona} value={zona}>
                    {zona}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Supervisor">
              <select
                name="supervisorId"
                defaultValue={data.filtros.supervisorId}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todos los supervisores</option>
                {data.opcionesFiltro.supervisores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex gap-3">
              <button
                type="submit"
                className="min-h-11 rounded-[14px] bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]"
              >
                Aplicar filtros
              </button>
              <a
                href={
                  data.visitReach
                    ? `${buildDashboardHref(data.filtros, EMPTY_DASHBOARD_FILTERS)}${
                        (() => {
                          const params = new URLSearchParams()
                          if (data.visitReach?.filters.weekStart) params.set('reachWeekStart', data.visitReach.filters.weekStart)
                          const query = params.toString()
                          return query ? `?${query}` : ''
                        })()
                      }`
                    : buildDashboardHref(data.filtros, EMPTY_DASHBOARD_FILTERS)
                }
                className="min-h-11 rounded-[14px] border border-border bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm"
              >
                Limpiar
              </a>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Las consultas solo cambian al aplicar filtros. `estado`, `zona` y `supervisor`
            afectan mapa, alertas y operacion live; `periodo` recorta tambien la ventana agregada.
          </p>
        </Card>
      )}

      {widgets.has('metricas') && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Promotores activos hoy"
            value={String(data.stats.promotoresActivosHoy)}
          />
          <MetricCard label="Check-ins validos" value={String(data.stats.checkInsValidosHoy)} />
          <MetricCard label="Ventas confirmadas" value={String(data.stats.ventasConfirmadasHoy)} />
          <MetricCard
            label="Monto confirmado"
            value={formatCurrency(data.stats.montoConfirmadoHoy)}
          />
          <MetricCard label="Afiliaciones LOVE" value={String(data.stats.afiliacionesLoveHoy)} />
          <MetricCard label="Cuotas cumplidas" value={String(data.stats.cuotasCumplidasPeriodo)} />
          <MetricCard label="Neto nomina" value={formatCurrency(data.stats.netoNominaPeriodo)} />
          <MetricCard
            label="Asistencia operativa"
            value={`${data.stats.asistenciaPorcentajeHoy.toFixed(2)}%`}
          />
          {actor.puesto === 'NOMINA' && (
            <MetricCard label="Altas IMSS pendientes" value={String(data.stats.imssPendientes)} />
          )}
        </section>
      )}

      {(actor.puesto === 'COORDINADOR' || actor.puesto === 'ADMINISTRADOR') && data.visitReach && (
        <VisitReachDashboardSection data={data.visitReach} dashboardFilters={data.filtros} />
      )}

      {widgets.has('compacto_supervisor') && (
        <section className="grid gap-4 lg:hidden">
          <Card className="bg-sky-50 ring-1 ring-sky-200">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--module-text)]">
              Supervisor en campo
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Vista compacta movil</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CompactMetric label="Activos" value={String(data.stats.promotoresActivosHoy)} />
              <CompactMetric
                label="Alertas"
                value={String(data.stats.alertasOperativas)}
                tone="amber"
              />
              <CompactMetric label="Ventas" value={String(data.stats.ventasConfirmadasHoy)} />
              <CompactMetric
                label="Asistencia"
                value={`${data.stats.asistenciaPorcentajeHoy.toFixed(0)}%`}
              />
            </div>
          </Card>
        </section>
      )}

      {widgets.has('cartera') && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-950">Cartera visible</h2>
            <p className="mt-1 text-sm text-slate-500">
              Corte operativo por cuenta cliente con ventas, alertas, cuotas y nomina estimada.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Cuenta</th>
                  <th className="px-6 py-3 font-medium">Operacion</th>
                  <th className="px-6 py-3 font-medium">Ventas</th>
                  <th className="px-6 py-3 font-medium">Cuotas</th>
                  <th className="px-6 py-3 font-medium">Nomina</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Sin cuentas visibles todavia.
                    </td>
                  </tr>
                ) : (
                  data.clientes.map((item) => (
                    <tr key={item.cuentaClienteId} className="border-t border-border/40 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.cuentaCliente}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.identificador ?? 'sin identificador'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.promotoresActivos} promotores activos</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.checkInsValidos} check-ins validos · {item.jornadasPendientes}{' '}
                          pendientes
                        </div>
                        <div className="mt-1 text-xs text-amber-700">
                          {item.alertasOperativas} alertas · {item.asistenciaPorcentaje.toFixed(2)}%
                          asistencia
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.ventasConfirmadas} confirmadas</div>
                        <div className="mt-1 text-xs text-emerald-700">
                          {formatCurrency(item.montoConfirmado)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.cuotasCumplidasPeriodo} cumplidas</div>
                        <div className="mt-1 text-xs text-slate-400">
                          LOVE {item.afiliacionesLove}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {formatCurrency(item.netoNominaPeriodo)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RecruitmentCoverageDashboard({
  data,
}: {
  data: NonNullable<DashboardPanelData['recruitmentCoverage']>;
}) {
  const activePct = data.target > 0 ? Math.min(100, Math.round((data.plantillaActiva / data.target) * 100)) : 0;
  const waitingPct =
    data.target > 0
      ? Math.min(100 - activePct, Math.round((data.plantillaEsperaTransito / data.target) * 100))
      : 0;
  const gapPct = Math.max(0, 100 - activePct - waitingPct);
  const quickActions = [
    {
      label: 'Vacantes urgentes',
      value: data.vacantesUrgentes,
      helper: 'PDVs listos para cubrir sin DC reservada.',
      tone: 'border-orange-200 bg-orange-50/85 text-orange-950',
    },
    {
      label: 'Pendientes de acceso >48h',
      value: data.pendientesAccesoVencidos,
      helper: 'Tiendas reservadas que siguen bloqueadas.',
      tone: 'border-amber-200 bg-amber-50/85 text-amber-950',
    },
    {
      label: 'Vacantes en proceso de firma',
      value: data.vacantesEnProcesoFirma,
      helper: 'PDVs con candidato vinculado pero todavía no contratado.',
      tone: 'border-sky-200 bg-sky-50/85 text-sky-950',
    },
    {
      label: 'Listos para administración',
      value: data.listosAdministracion,
      helper: 'Expedientes cerrados esperando acceso y salida operativa.',
      tone: 'border-emerald-200 bg-emerald-50/85 text-emerald-950',
    },
    {
      label: 'Próximas ISDINIZACIONES',
      value: data.proximasIsdinizaciones,
      helper: 'Ingresos programados para la próxima semana.',
      tone: 'border-violet-200 bg-violet-50/85 text-violet-950',
    },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="page-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.4em] text-emerald-600">
                Cobertura Reclutamiento
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Termómetro de cobertura
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-600">
                Seguimos la plantilla activa, las DC en espera de acceso y la brecha contra la meta
                operativa para que Reclutamiento y Administración trabajen sobre la misma foto.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/empleados"
                className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                Abrir cobertura PDVs
              </Link>
              <Link
                href="/mensajes"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Abrir mensajes internos
              </Link>
            </div>
          </div>
          <Card className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-950/5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-slate-500">
              Meta operativa
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-semibold tracking-tight text-slate-950">{data.totalContratadas}</p>
                <p className="mt-1 text-sm text-slate-500">de {data.target} contratadas</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Brecha</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{data.brechaContratacion}</p>
              </div>
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-full w-full overflow-hidden rounded-full">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${activePct}%` }}
                  aria-label="Plantilla activa"
                />
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${waitingPct}%` }}
                  aria-label="Plantilla en espera"
                />
                <div
                  className="h-full bg-slate-300"
                  style={{ width: `${gapPct}%` }}
                  aria-label="Brecha pendiente"
                />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-emerald-700">Activas</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-950">{data.plantillaActiva}</p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-700">En tránsito</p>
                <p className="mt-1 text-2xl font-semibold text-sky-950">{data.plantillaEsperaTransito}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Cobertura</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{data.progressPct}%</p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SharedMetricCard label="Plantilla activa" value={String(data.plantillaActiva)} tone="emerald" />
        <SharedMetricCard label="Plantilla en espera / tránsito" value={String(data.plantillaEsperaTransito)} tone="sky" />
        <SharedMetricCard label="Brecha de contratación" value={String(data.brechaContratacion)} tone="slate" />
        <SharedMetricCard label="Total contratadas" value={String(data.totalContratadas)} tone="module" />
      </div>

      <Card className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-slate-500">
              Colas de acción
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Lo que necesita movimiento hoy
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Cubiertos: <span className="font-semibold text-slate-900">{data.pdvsCubiertos}</span> · Reservados:{' '}
            <span className="font-semibold text-slate-900">{data.pdvsReservados}</span> · Vacantes:{' '}
            <span className="font-semibold text-slate-900">{data.pdvsVacantes}</span> · Bloqueados:{' '}
            <span className="font-semibold text-slate-900">{data.pdvsBloqueados}</span>
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {quickActions.map((item) => (
            <div key={item.label} className={`rounded-[24px] border px-4 py-4 shadow-sm shadow-slate-950/5 ${item.tone}`}>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{item.value}</p>
              <p className="mt-2 text-xs leading-5 opacity-80">{item.helper}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DermoconsejoDashboard({ data }: { data: DashboardDermoconsejoData }) {
  const [activeSheet, setActiveSheet] = useState<
    DashboardDermoconsejoData['quickActions'][number]['key'] | null
  >(null);
  const [isCheckInSheetOpen, setIsCheckInSheetOpen] = useState(false);
  const [isCampaignSheetOpen, setIsCampaignSheetOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [sheetData, setSheetData] = useState<DashboardDermoconsejoData | null>(null);
  const [sheetDataLoaded, setSheetDataLoaded] = useState(false);
  const [sheetDataError, setSheetDataError] = useState<string | null>(null);
  const [isSheetDataLoading, startSheetDataTransition] = useTransition();
  const [salesCount, setSalesCount] = useState(
    data.counters.find((item) => item.label === 'Ventas')?.value ?? 0
  );
  const [capturesCount, setCapturesCount] = useState(
    data.counters.find((item) => item.label === 'Capturas')?.value ?? 0
  );
  const [toast, setToast] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const counters = useMemo(
    () =>
      (sheetData ?? data).counters.map((item) =>
        item.label === 'Ventas'
          ? { ...item, value: salesCount }
          : item.label === 'Capturas'
            ? { ...item, value: capturesCount }
            : item
      ),
    [capturesCount, data, salesCount, sheetData]
  );
  const resolvedData = sheetData ?? data;
  const activeAction = resolvedData.quickActions.find((item) => item.key === activeSheet) ?? null;
  const actionMap = new Map(resolvedData.quickActions.map((item) => [item.key, item]));
  const primaryActions = [
    actionMap.get('calendario'),
    actionMap.get('ventas'),
    actionMap.get('love-isdin'),
    actionMap.get('registro-extemporaneo'),
    actionMap.get('comunicacion'),
    actionMap.get('perfil'),
    actionMap.get('incidencias'),
    actionMap.get('justificacion-faltas'),
    actionMap.get('incapacidad'),
    actionMap.get('vacaciones'),
    actionMap.get('permiso'),
  ];
  const quickActions = primaryActions.filter(
    (item): item is DashboardDermoconsejoData['quickActions'][number] => Boolean(item)
  );
  const jornadaEstado = resolvedData.shift.isOpen ? 'INICIADA' : 'NO INICIADA';
  const jornadaTitulo = resolvedData.shift.isOpen ? 'Jornada en curso' : 'Jornada por iniciar';
  const jornadaCta = resolvedData.shift.isOpen ? 'CERRAR JORNADA' : 'LLEGUE A TIENDA';
  const canStartShift = Boolean(resolvedData.shift.canStart);
  const shiftBlockedReason = resolvedData.shift.disabledReason ?? resolvedData.shift.helper;
  const timeBadge = resolvedData.shift.isOpen
    ? `Inicio ${formatShortClock(resolvedData.shift.checkInUtc) ?? ''}`.trim()
    : canStartShift
      ? 'Lista para check-in'
      : 'Sin asignacion activa';
  const campaignNoticeMessage = resolvedData.activeCampaign
    ? `Tu PDV esta en la campana ${resolvedData.activeCampaign.nombre}.`
    : null;
  const formationNoticeMessage = resolvedData.activeFormation
    ? `Tienes formacion activa: ${resolvedData.activeFormation.nombre}.`
    : null;
  const reportPending = resolvedData.reportWindow.status === 'PENDIENTE_REPORTE';

  const handleToast = (tone: 'success' | 'error' | 'info', message: string) => {
    setToast({ tone, message });
  };

  const requiresSheetData = (
    key: DashboardDermoconsejoData['quickActions'][number]['key'] | 'campaign' | 'notifications'
  ) =>
    key === 'ventas' ||
    key === 'love-isdin' ||
    key === 'vacaciones' ||
    key === 'permiso' ||
    key === 'incapacidad' ||
    key === 'justificacion-faltas' ||
    key === 'campaign';

  const ensureSheetData = (
    target:
      | DashboardDermoconsejoData['quickActions'][number]['key']
      | 'campaign'
      | 'notifications'
      | null
  ) => {
    if (target && target !== 'campaign' && target !== 'notifications') {
      setActiveSheet(target);
    }

    if (sheetDataLoaded || isSheetDataLoading) {
      return;
    }

    startSheetDataTransition(() => {
      void (async () => {
        try {
          setSheetDataError(null);
          const response = await fetch('/api/dashboard/dermoconsejo-panel', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const payload = (await response.json()) as {
            data?: DashboardDermoconsejoData | null;
            message?: string;
          };

          if (!response.ok || !payload.data) {
            throw new Error(payload.message ?? 'No fue posible cargar el detalle operativo.');
          }

          setSheetData(payload.data);
          setSheetDataLoaded(true);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'No fue posible cargar el detalle operativo.';
          setSheetDataError(message);
          handleToast('error', message);
        }
      })();
    });
  };

  const renderSheetDataState = (
    target:
      | DashboardDermoconsejoData['quickActions'][number]['key']
      | 'campaign'
      | 'notifications'
  ) => {
    if (isSheetDataLoading && !sheetData) {
      return (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Cargando detalle operativo...
        </div>
      );
    }

    if (sheetDataError && !sheetData) {
      return (
        <div className="space-y-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
          <p>{sheetDataError}</p>
          <button
            type="button"
            onClick={() => ensureSheetData(target)}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
          >
            Reintentar carga
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        El detalle operativo todavia no esta disponible.
      </div>
    );
  };

  const handleOpenCheckInSheet = () => {
    if (typeof window === 'undefined') {
      setIsCheckInSheetOpen(true);
      return;
    }

    window.requestAnimationFrame(() => {
      setIsCheckInSheetOpen(true);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Beteele One
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Centro operativo rapido para dermoconsejo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              ensureSheetData('notifications');
              setIsNotificationCenterOpen(true);
            }}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Notificaciones"
          >
            <ActionIconGlyph icon="notification" accent="slate" />
            {data.notifications.unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white shadow-sm">
                {data.notifications.unreadCount > 9 ? '9+' : data.notifications.unreadCount}
              </span>
            )}
          </button>
          <DashboardLogoutButton />
        </div>
      </div>

      {(resolvedData.activeCampaign || resolvedData.activeFormation) && (
        <div className="grid gap-3">
          {resolvedData.activeCampaign && (
            <div className="flex flex-col gap-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-rose-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-600">
                  Campana activa
                </p>
                <p className="mt-1 text-sm font-medium text-rose-950">{campaignNoticeMessage}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-rose-800">
                  {resolvedData.activeCampaign.productosFoco.slice(0, 2).map((item) => (
                    <span key={item} className="rounded-full border border-rose-200 bg-white/80 px-2.5 py-1">
                      {item}
                    </span>
                  ))}
                  {resolvedData.activeCampaign.evidenciasRequeridas.length > 0 && (
                    <span className="rounded-full border border-rose-200 bg-white/80 px-2.5 py-1">
                      {resolvedData.activeCampaign.evidenciasRequeridas.length} evidencias requeridas
                    </span>
                  )}
                  {resolvedData.activeCampaign.manualMercadeoNombre && (
                    <span className="rounded-full border border-rose-200 bg-white/80 px-2.5 py-1">
                      Manual disponible
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:min-w-[220px]">
                <button
                  type="button"
                  onClick={() => {
                    if (requiresSheetData('campaign')) {
                      ensureSheetData('campaign');
                    }
                    setIsCampaignSheetOpen(true);
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm"
                >
                  Registrar evidencia
                </button>
                {resolvedData.activeCampaign.manualMercadeoUrl && (
                  <a
                    href={resolvedData.activeCampaign.manualMercadeoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-100 bg-rose-100/70 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm"
                  >
                    Abrir manual
                  </a>
                )}
              </div>
            </div>
          )}

          {resolvedData.activeFormation && (
            <DermoFormationAttendanceCard formation={resolvedData.activeFormation} />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {data.todayLabel.toUpperCase()}
                </p>
                <h1 className="mt-2 text-[2rem] font-semibold leading-tight text-slate-950 sm:text-[2.4rem]">
                  {jornadaTitulo}
                </h1>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  data.shift.isOpen
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {jornadaEstado}
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-[26px] border border-[#d7e4ff] bg-[#edf3ff] px-5 py-5 shadow-sm">
            <div className="pointer-events-none absolute hidden" />
            <div className="relative overflow-hidden">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#dbe7ff]" />
              <div className="relative">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#4d56d6]">
                  <ActionIconGlyph icon="store-pin" accent="sky" />
                  <span>{resolvedData.store.nombre}</span>
                </div>
                <p className="mt-4 text-[1.9rem] font-semibold leading-tight text-[#313fa7] sm:text-[2.3rem]">
                  {resolvedData.store.claveBtl ?? 'SUCURSAL CENTRAL'}
                </p>
                <p className="mt-3 max-w-2xl text-base text-[#5162d9]">
                  {resolvedData.store.direccion ?? 'Sin direccion visible'}
                </p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-[#5b64db] shadow-sm">
                  <ActionIconGlyph icon="clock" accent="sky" small />
                  <span>{timeBadge}</span>
                </div>
              </div>
            </div>
          </div>

          {resolvedData.shift.isOpen ? (
            <Link
              href={resolvedData.shift.buttonHref}
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[20px] border-2 border-slate-950/85 bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition hover:bg-emerald-700"
            >
              <ActionIconGlyph icon="arrival" accent="emerald" light />
              <span>{jornadaCta}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!canStartShift) {
                  handleToast('info', shiftBlockedReason);
                  return;
                }
                handleOpenCheckInSheet();
              }}
              disabled={!canStartShift}
              className={`inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[20px] border-2 px-5 py-4 text-base font-semibold transition ${
                canStartShift
                  ? 'border-slate-950/85 bg-[var(--module-primary)] text-white shadow-[0_10px_20px_rgba(15,23,42,0.08)] hover:bg-[var(--module-hover)]'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none'
              }`}
            >
              <ActionIconGlyph icon="arrival" accent="emerald" light />
              <span>{jornadaCta}</span>
            </button>
          )}
          {!data.shift.isOpen && (
            <p className="text-sm leading-6 text-slate-500">{shiftBlockedReason}</p>
          )}
          {resolvedData.reportWindow.canReportToday && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Reportes pendientes del dia
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-950">{resolvedData.reportWindow.helper}</p>
                </div>
                {reportPending && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm">
                    Post check-out
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <DermoStatTile
              title="Entrada"
              value={data.shift.isOpen ? 'Registrada' : 'Pendiente'}
              icon="entrada"
              accent="slate"
            />
            <DermoStatTile
              title="Ventas"
              value={`${salesCount} capturadas`}
              icon="ventas"
              accent="sky"
            />
            <DermoStatTile
              title="LOVE ISDIN"
              value={`${capturesCount}/${resolvedData.loveQuota.objetivoDiario}`}
              icon="love"
              accent="rose"
            />
            <DermoStatTile
              title="Incidencias"
              value="Ninguna"
              icon="warning"
              accent="amber"
            />
          </section>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-950">Acciones Rapidas</h2>
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-5 lg:grid-cols-8">
          {quickActions.map((item) => (
            <DermoQuickActionButton
              key={item.key}
              item={item}
              onClick={() => {
                if (requiresSheetData(item.key)) {
                  ensureSheetData(item.key);
                  return;
                }
                setActiveSheet(item.key);
              }}
            />
          ))}
        </div>
      </div>

      <BottomSheet
        open={isCheckInSheetOpen}
        onClose={() => setIsCheckInSheetOpen(false)}
        title="Llegada a tienda"
        description="Acepta la mision del dia, toma la fotografia y envia el borrador de entrada."
        initialSnap="expanded"
      >
        <DermoCheckInSheet
          data={resolvedData}
          onClose={() => setIsCheckInSheetOpen(false)}
          onSuccess={(message) => {
            setIsCheckInSheetOpen(false);
            handleToast('success', message);
          }}
          onError={(message) => handleToast('error', message)}
        />
      </BottomSheet>

      <BottomSheet
        open={Boolean(activeAction) && activeSheet !== 'perfil'}
        onClose={() => setActiveSheet(null)}
        title={activeAction?.label ?? 'Operacion'}
        description={activeAction?.helper}
        initialSnap={activeAction?.preferredSnap ?? 'partial'}
      >
        {activeSheet === 'ventas' && (
          sheetData ? (
            <DermoVentasCartSheet
              data={resolvedData}
              onSuccess={(message, savedCount) => {
                setSalesCount((current) => current + savedCount);
                setActiveSheet(null);
                handleToast('success', message);
              }}
              onError={(message) => handleToast('error', message)}
            />
          ) : (
            renderSheetDataState('ventas')
          )
        )}

        {activeSheet === 'calendario' && <DermoCalendarioSheet data={resolvedData} />}

        {activeSheet === 'love-isdin' && (
          sheetData ? (
            <DermoLoveCartSheet
              data={resolvedData}
              onSuccess={(message, savedCount) => {
                setCapturesCount((current) => current + savedCount);
                setActiveSheet(null);
                handleToast('success', message);
              }}
              onError={(message) => handleToast('error', message)}
            />
          ) : (
            renderSheetDataState('love-isdin')
          )
        )}

        {(activeSheet === 'incapacidad' ||
          activeSheet === 'justificacion-faltas' ||
          activeSheet === 'vacaciones' ||
          activeSheet === 'permiso') && (
          sheetData ? (
            <DermoSolicitudSheet
              data={resolvedData}
              tipo={activeSheet}
              onClose={() => setActiveSheet(null)}
              onSuccess={(message) => {
                setActiveSheet(null);
                handleToast('success', message);
              }}
            />
          ) : (
            renderSheetDataState(activeSheet)
          )
        )}

        {activeSheet === 'registro-extemporaneo' && (
          <DermoRegistroExtemporaneoSheet
            data={resolvedData}
            onClose={() => setActiveSheet(null)}
            onSuccess={(message) => {
              setActiveSheet(null);
              handleToast('success', message);
            }}
          />
        )}

        {activeSheet === 'incidencias' && (
          <DermoIncidenciasSheet
            data={resolvedData}
            onClose={() => setActiveSheet(null)}
            onSuccess={(message) => {
              handleToast('success', message);
              setActiveSheet(null);
            }}
          />
        )}

        {activeSheet === 'comunicacion' && (
          <DermoComunicacionSheet
            data={resolvedData}
            onClose={() => setActiveSheet(null)}
            onSuccess={(message) => {
              handleToast('success', message);
              setActiveSheet(null);
            }}
          />
        )}

      </BottomSheet>

      <ModalPanel
        open={activeSheet === 'perfil'}
        onClose={() => setActiveSheet(null)}
        title="Perfil"
        subtitle="Consulta y corrige tus datos base sin salir del dashboard."
        maxWidthClassName="max-w-4xl"
      >
        {activeSheet === 'perfil' && (
          <DermoPerfilSheet
            data={resolvedData}
            onClose={() => setActiveSheet(null)}
            onSuccess={(message) => {
              handleToast('success', message);
              setActiveSheet(null);
            }}
          />
        )}
      </ModalPanel>

      <BottomSheet
        open={isCampaignSheetOpen}
        onClose={() => setIsCampaignSheetOpen(false)}
        title={resolvedData.activeCampaign?.nombre ?? 'Campana activa'}
        description="Registra evidencia del dia sin salir del dashboard operativo."
        initialSnap="expanded"
      >
        {resolvedData.activeCampaign ? (
          sheetData ? (
            <DermoCampanaSheet
              data={resolvedData}
              onClose={() => setIsCampaignSheetOpen(false)}
              onSuccess={(message) => {
                setIsCampaignSheetOpen(false);
                handleToast('success', message);
              }}
            />
          ) : (
            renderSheetDataState('campaign')
          )
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        title="Notificaciones"
        description="Avisos breves y lectura rapida de mensajes nuevos."
        initialSnap="partial"
      >
        {sheetData ? (
          <NotificationCenterSheet notifications={resolvedData.notifications} />
        ) : (
          renderSheetDataState('notifications')
        )}
      </BottomSheet>

      {toast && <ToastBanner tone={toast.tone} message={toast.message} />}
    </div>
  );
}

function SupervisorFieldDashboard({
  actor,
  data,
}: {
  actor: ActorActual;
  data: DashboardPanelData;
}) {
  const [dailyItems, setDailyItems] = useState<DashboardSupervisorDailyItem[]>(
    data.supervisorDailyBoard?.items ?? []
  );
  const [selectedItem, setSelectedItem] = useState<DashboardSupervisorDailyItem | null>(null);
  const [activeQuickAction, setActiveQuickAction] = useState<
    | 'ruta-agenda'
    | 'ruta-planning'
    | 'ruta-history'
    | 'rol-mensual'
    | 'hoy'
    | 'solicitudes'
    | 'vacaciones'
    | 'incapacidad'
    | 'cumpleanos'
    | null
  >(null);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [requestInboxItems, setRequestInboxItems] = useState(data.supervisorRequestInbox.items);
  const [routeData, setRouteData] = useState<RutaSemanalPanelData | null>(null);
  const [routeDataLoaded, setRouteDataLoaded] = useState(false);
  const [routeDataError, setRouteDataError] = useState<string | null>(null);
  const [isRouteDataLoading, startRouteDataTransition] = useTransition();
  const [panelDataLoaded, setPanelDataLoaded] = useState(false);
  const [panelDataError, setPanelDataError] = useState<string | null>(null);
  const [isPanelDataLoading, startPanelDataTransition] = useTransition();
  const [panelNotifications, setPanelNotifications] = useState(data.supervisorNotifications);
  const [panelAuthorizations, setPanelAuthorizations] = useState(data.supervisorAuthorizations);
  const [panelSelfRequestStatus, setPanelSelfRequestStatus] = useState(data.supervisorSelfRequestStatus);
  const [panelVacationPolicy, setPanelVacationPolicy] = useState(data.supervisorVacationPolicy);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const routeSnapshot = data.supervisorRouteSnapshot;
  const supervisorSelfRequestData = useMemo(
    () => ({
      context: {
        cuentaClienteId: actor.cuentaClienteId,
        empleadoId: actor.empleadoId,
        supervisorEmpleadoId: null,
        pdvId: null,
        attendanceId: null,
        fechaOperacion: getLocalDateValue(),
      },
      requestStatus: panelSelfRequestStatus,
      vacationPolicy: panelVacationPolicy,
    }),
    [actor.cuentaClienteId, actor.empleadoId, panelSelfRequestStatus, panelVacationPolicy]
  );

  useEffect(() => {
    setDailyItems(data.supervisorDailyBoard?.items ?? []);
  }, [data.supervisorDailyBoard]);

  useEffect(() => {
    setRequestInboxItems(data.supervisorRequestInbox.items);
  }, [data.supervisorRequestInbox.items]);

  useEffect(() => {
    setPanelNotifications(data.supervisorNotifications);
  }, [data.supervisorNotifications]);

  useEffect(() => {
    setPanelAuthorizations(data.supervisorAuthorizations);
  }, [data.supervisorAuthorizations]);

  useEffect(() => {
    setPanelSelfRequestStatus(data.supervisorSelfRequestStatus);
  }, [data.supervisorSelfRequestStatus]);

  useEffect(() => {
    setPanelVacationPolicy(data.supervisorVacationPolicy);
  }, [data.supervisorVacationPolicy]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => summarizeSupervisorDailyItems(dailyItems), [dailyItems]);
  const requestSummary = useMemo(() => {
    if (requestInboxItems.length > 0) {
      return summarizeSupervisorRequestInbox(requestInboxItems);
    }

    return data.supervisorRequestInbox.summaries.reduce(
      (acc, item) => {
        if (item.key === 'TODAS') {
          acc.total = item.count;
          acc.actionable = item.actionableCount;
        }
        if (item.key === 'VACACIONES') acc.vacations = item.count;
        if (item.key === 'INCAPACIDAD') acc.medical = item.count;
        if (item.key === 'CUMPLEANOS') acc.birthdays = item.count;
        if (item.key === 'JUSTIFICACION_FALTA') acc.justifiedAbsences = item.count;
        return acc;
      },
      { total: 0, actionable: 0, vacations: 0, medical: 0, birthdays: 0, justifiedAbsences: 0 }
    );
  }, [data.supervisorRequestInbox.summaries, requestInboxItems]);
  const supervisorFormation = data.supervisorActiveFormation;
  const ensurePanelData = () => {
    if (panelDataLoaded || isPanelDataLoading) {
      return;
    }

    startPanelDataTransition(() => {
      void (async () => {
        try {
          setPanelDataError(null);
          const response = await fetch('/api/dashboard/supervisor-panel', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });

          const payload = (await response.json()) as {
            data?: {
              supervisorNotifications?: typeof data.supervisorNotifications;
              supervisorAuthorizations?: typeof data.supervisorAuthorizations;
              supervisorRequestInbox?: typeof data.supervisorRequestInbox;
              supervisorSelfRequestStatus?: typeof data.supervisorSelfRequestStatus;
              supervisorVacationPolicy?: typeof data.supervisorVacationPolicy;
            };
            message?: string;
          };

          if (!response.ok || !payload.data) {
            throw new Error(payload.message ?? 'No fue posible cargar el detalle del supervisor.');
          }

          setPanelNotifications(payload.data.supervisorNotifications ?? data.supervisorNotifications);
          setPanelAuthorizations(payload.data.supervisorAuthorizations ?? data.supervisorAuthorizations);
          setRequestInboxItems(payload.data.supervisorRequestInbox?.items ?? []);
          setPanelSelfRequestStatus(
            payload.data.supervisorSelfRequestStatus ?? data.supervisorSelfRequestStatus
          );
          setPanelVacationPolicy(payload.data.supervisorVacationPolicy ?? data.supervisorVacationPolicy);
          setPanelDataLoaded(true);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'No fue posible cargar el detalle del supervisor.';
          setPanelDataError(message);
          setToast({ tone: 'error', message });
        }
      })();
    });
  };
  const ensureRouteData = (focusQuickAction?: 'ruta-agenda' | 'ruta-planning' | 'ruta-history' | 'hoy') => {
    if (routeDataLoaded || isRouteDataLoading) {
      if (focusQuickAction) {
        setActiveQuickAction(focusQuickAction);
      }
      return;
    }

    if (focusQuickAction) {
      setActiveQuickAction(focusQuickAction);
    }

    startRouteDataTransition(() => {
      void (async () => {
        try {
          setRouteDataError(null);
          const response = await fetch('/api/dashboard/supervisor-route-panel', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });

          const payload = (await response.json()) as { data?: RutaSemanalPanelData; message?: string };
          if (!response.ok || !payload.data) {
            throw new Error(payload.message ?? 'No fue posible cargar la ruta semanal del supervisor.');
          }

          setRouteData(payload.data);
          setRouteDataLoaded(true);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'No fue posible cargar la ruta semanal del supervisor.';
          setRouteDataError(message);
          setToast({ tone: 'error', message });
        }
      })();
    });
  };

  const routeReminder = useMemo(() => {
    if (!routeSnapshot) {
      return null;
    }
    const currentWeekday = (() => {
      const now = new Date();
      return now.getDay() === 0 ? 7 : now.getDay();
    })();
    const deadlinePassed = currentWeekday >= 3;

    if (routeSnapshot.hasNextWeekRoute) {
      return null;
    }

    return {
      id: `system-route-${routeSnapshot.nextWeekStart}`,
      titulo: deadlinePassed
        ? 'Ruta de la siguiente semana pendiente'
        : 'Recuerda enviar la siguiente ruta',
      cuerpo: deadlinePassed
        ? `No has enviado tu ruta de la semana ${routeSnapshot.nextWeekStart} al ${routeSnapshot.nextWeekEnd}. Debes mandarla a coordinacion para aprobacion.`
        : `Aun no envias tu ruta de la semana ${routeSnapshot.nextWeekStart} al ${routeSnapshot.nextWeekEnd}. Recuerda mandarla a mas tardar el miercoles previo.`,
      createdAt: new Date().toISOString(),
      estado: 'PENDIENTE' as const,
      tipo: 'SISTEMA_RUTA' as const,
      remitente: 'Sistema',
      deadlinePassed,
    };
  }, [routeSnapshot]);
  const supervisorNotifications = useMemo<DashboardDermoconsejoNotificationsSummary>(() => {
    if (!routeReminder) {
      return panelNotifications;
    }

    return {
      unreadCount: panelNotifications.unreadCount + 1,
      items: [routeReminder, ...panelNotifications.items],
    };
  }, [panelNotifications, routeReminder]);
  const routeSummary = useMemo(() => {
    if (!routeSnapshot) {
      return null;
    }

    return {
      rutas: routeSnapshot.totalRutas,
      visitas: routeSnapshot.totalVisitas,
      completadas: routeSnapshot.visitasCompletadas,
      sinVisita: routeSnapshot.pendientesReposicion,
    };
  }, [routeSnapshot]);
  const supervisorMetricCards = useMemo(
    () => {
      const cards: Array<{
        label: string;
        value: string;
        helper: string;
        tone?: ShortcutTone;
      }> = [
        {
          label: 'Tiendas hoy',
          value: String(summary.total),
          helper: 'Asignaciones activas del dia',
        },
        {
          label: 'Pendientes',
          value: String(summary.pendingReview),
          helper: 'Entradas listas para revision',
          tone: 'amber',
        },
        {
          label: 'Sin llegada',
          value: String(summary.noCheckIn),
          helper: 'Asignaciones sin check-in',
          tone: 'rose',
        },
        {
          label: 'Solicitudes',
          value: String(requestSummary.actionable),
          helper: 'Pendientes de tu aprobacion',
          tone: 'purple',
        },
      ];

      if (data.supervisorLoveQuota) {
        cards.push(
          {
            label: 'LOVE equipo',
            value: `${data.supervisorLoveQuota.avanceHoy}/${data.supervisorLoveQuota.objetivoHoy}`,
            helper: `${data.supervisorLoveQuota.cumplimientoHoyPct.toFixed(2)}% de cumplimiento`,
            tone: 'rose',
          },
          {
            label: 'DC con meta',
            value: String(data.supervisorLoveQuota.dcConMetaHoy),
            helper: 'Dermoconsejeras con objetivo hoy',
            tone: 'sky',
          },
          {
            label: 'LOVE pendiente',
            value: String(data.supervisorLoveQuota.restanteHoy),
            helper: 'Afiliaciones restantes del equipo',
            tone: 'amber',
          }
        );
      }

      if (routeSummary) {
        cards.push(
          {
            label: 'Rutas visibles',
            value: String(routeSummary.rutas),
            helper: 'Semanas con planeacion',
          },
          {
            label: 'Visitas planeadas',
            value: String(routeSummary.visitas),
            helper: 'Carga total del modulo',
            tone: 'sky',
          },
          {
            label: 'Completadas',
            value: String(routeSummary.completadas),
            helper: 'Visitas ya ejecutadas',
            tone: 'emerald',
          },
          {
            label: 'Tiendas sin visita',
            value: String(routeSummary.sinVisita),
            helper: 'Pendientes por reponer',
            tone: 'amber',
          }
        );
      }

      return cards;
    },
    [data.supervisorLoveQuota, requestSummary.actionable, routeSummary, summary.noCheckIn, summary.pendingReview, summary.total]
  );
  const renderRouteSheetState = (focusQuickAction: 'ruta-agenda' | 'ruta-planning' | 'ruta-history' | 'hoy') => {
    if (isRouteDataLoading && !routeData) {
      return (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Cargando ruta semanal del supervisor...
        </div>
      );
    }

    if (routeDataError && !routeData) {
      return (
        <div className="space-y-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
          <p>{routeDataError}</p>
          <button
            type="button"
            onClick={() => ensureRouteData(focusQuickAction)}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
          >
            Reintentar carga
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        La ruta semanal todavia no esta disponible para este supervisor.
      </div>
    );
  };
  const renderPanelSheetState = () => {
    if (isPanelDataLoading && !panelDataLoaded) {
      return (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Cargando detalle del supervisor...
        </div>
      );
    }

    if (panelDataError && !panelDataLoaded) {
      return (
        <div className="space-y-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
          <p>{panelDataError}</p>
          <button
            type="button"
            onClick={() => ensurePanelData()}
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
          >
            Reintentar carga
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        El detalle del supervisor todavia no esta disponible.
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <section className="page-hero overflow-hidden">
        <div className="px-5 py-6 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-hero-eyebrow">Supervisor</p>
              <h1 className="page-hero-title text-3xl">Operacion diaria</h1>
              <p className="mt-2 text-sm text-slate-600">
                Revisa las tiendas asignadas hoy, valida llegadas y atiende solicitudes sin salir
                del dashboard.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  ensurePanelData();
                  setIsNotificationCenterOpen(true);
                }}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                aria-label="Notificaciones"
              >
                <ActionIconGlyph icon="notification" accent="slate" />
                {supervisorNotifications.unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white shadow-sm">
                    {supervisorNotifications.unreadCount > 9
                      ? '9+'
                      : supervisorNotifications.unreadCount}
                  </span>
                )}
              </button>
              <DashboardLogoutButton />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1.5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {supervisorMetricCards.map((item) => (
              <RoleMetricCard
                key={item.label}
                label={item.label}
                value={item.value}
                helper={item.helper}
                tone={item.tone}
              />
            ))}
          </div>
        </div>
      </section>

      {supervisorFormation && (
        <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sky-950 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Formacion activa</p>
          <p className="mt-1 text-sm font-medium text-sky-950">
            Tienes formacion programada: {supervisorFormation.nombre}. Tus visitas de hoy quedan exentas mientras dure este evento.
          </p>
          <p className="mt-2 text-xs text-sky-700">
            {supervisorFormation.sede
              ? `${supervisorFormation.sede} · ${formatDateLabel(supervisorFormation.fechaInicio)}`
              : formatDateLabel(supervisorFormation.fechaInicio)}
          </p>
          {supervisorFormation.locationAddress && (
            <p className="mt-2 text-xs text-sky-700">
              Sede operativa: {supervisorFormation.locationAddress}
              {supervisorFormation.modalidad === 'PRESENCIAL' &&
                supervisorFormation.locationLatitude !== null &&
                supervisorFormation.locationLongitude !== null &&
                ` · ${supervisorFormation.locationLatitude}, ${supervisorFormation.locationLongitude}`}
            </p>
          )}
          <p className="mt-2 text-xs text-sky-700">
            Debes registrar llegada con selfie en la sede de formacion.
          </p>
        </div>
      )}

      {routeReminder && (
        <div
          className={`rounded-[22px] border px-4 py-4 shadow-sm ${
            routeReminder.deadlinePassed
              ? 'border-rose-200 bg-rose-50 text-rose-950'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Ruta semanal pendiente</p>
          <p className="mt-2 text-sm font-medium">{routeReminder.cuerpo}</p>
        </div>
      )}

      <Card className="bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Acciones rapidas
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Ruta, visita y solicitudes</h2>
            <p className="mt-2 text-sm text-slate-600">
              Abre la agenda activa, define la semana y revisa correcciones sin mezclar flujos.
            </p>
          </div>
          <span className="rounded-full border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
            {routeSnapshot?.hasCurrentWeekRoute ? 'Ruta activa' : 'Sin ruta cargada'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => ensureRouteData('ruta-agenda')}
            aria-label="Abrir agenda operativa"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-sky-200 bg-sky-50 text-sky-700">
              <ActionIconGlyph icon="calendar" accent="sky" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Agenda operativa</p>
            <p className="mt-1 text-sm text-slate-500">
              Entra directo a la agenda activa del supervisor, con eventos y ejecucion del dia.
            </p>
          </button>

          <button
            type="button"
            onClick={() => ensureRouteData('ruta-planning')}
            aria-label="Abrir definir ruta semanal"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-sky-200 bg-sky-50 text-sky-700">
              <ActionIconGlyph icon="route" accent="sky" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Definir ruta semanal</p>
            <p className="mt-1 text-sm text-slate-500">
              Elige la semana, abre cada dia y arma el borrador antes de enviarlo a coordinacion.
            </p>
          </button>

          <button
            type="button"
            onClick={() => ensureRouteData('ruta-history')}
            aria-label="Abrir correcciones e historicos"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-sky-200 bg-sky-50 text-sky-700">
              <ActionIconGlyph icon="reports" accent="sky" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Correcciones e historicos</p>
            <p className="mt-1 text-sm text-slate-500">
              Consulta semanas enviadas, solicitudes de cambio y tiendas pendientes de reposicion.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveQuickAction('rol-mensual')}
            aria-label="Abrir rol mensual"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-sky-200 bg-sky-50 text-sky-700">
              <ActionIconGlyph icon="calendar" accent="sky" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Rol mensual</p>
            <p className="mt-1 text-sm text-slate-500">
              Consulta solo tus PDVs del mes, ordenados entre fijos y rotativos, con la DC asignada por dia.
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              if (supervisorFormation) {
                setToast({
                  tone: 'info',
                  message: `Tienes formacion activa${supervisorFormation.sede ? ` en ${supervisorFormation.sede}` : ''}. Tu ruta de hoy queda exenta.`,
                });
                return;
              }
              ensureRouteData('hoy')
            }}
            aria-label="Abrir mi ruta de hoy"
            className={`rounded-[22px] border px-4 py-4 text-left shadow-sm transition ${
              supervisorFormation
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                : 'border-[var(--module-border)] bg-white hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover'
            }`}
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700">
              <ActionIconGlyph icon="arrival" accent="emerald" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Mi ruta de hoy</p>
            <p className="mt-1 text-sm text-slate-500">
              {supervisorFormation
                ? 'Tienes formacion activa y tu visita de campo queda exenta mientras dure el evento.'
                : 'Abre las tiendas del dia, registra llegada, checklist y salida por visita.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              ensurePanelData();
              setActiveQuickAction('solicitudes');
            }}
            aria-label="Abrir solicitudes del equipo"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-200 bg-amber-50 text-amber-700">
                <ActionIconGlyph icon="requests" accent="amber" />
              </div>
              {requestSummary.actionable > 0 && (
                <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {requestSummary.actionable}
                </span>
              )}
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Solicitudes</p>
            <p className="mt-1 text-sm text-slate-500">
              Revisa vacaciones como aviso operativo y resuelve incapacidades o dia de cumpleanos cuando te toquen.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              ensurePanelData();
              setActiveQuickAction('vacaciones');
            }}
            aria-label="Abrir mis vacaciones"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700">
                <ActionIconGlyph icon="vacaciones" accent="emerald" />
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                {
                  panelSelfRequestStatus.filter((item) => item.tipo === 'VACACIONES').length
                }
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Vacaciones</p>
            <p className="mt-1 text-sm text-slate-500">
              Solicita tus vacaciones y revisa el estatus de tus envios.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              ensurePanelData();
              setActiveQuickAction('incapacidad');
            }}
            aria-label="Abrir mi incapacidad"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-rose-200 bg-rose-50 text-rose-700">
                <ActionIconGlyph icon="incapacidad" accent="rose" />
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                {
                  panelSelfRequestStatus.filter((item) => item.tipo === 'INCAPACIDAD').length
                }
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Incapacidades</p>
            <p className="mt-1 text-sm text-slate-500">
              Registra tu incapacidad y da seguimiento a tu propio estatus.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              ensurePanelData();
              setActiveQuickAction('cumpleanos');
            }}
            aria-label="Abrir mi dia cumple"
            className="rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-violet-200 bg-violet-50 text-violet-700">
                <ActionIconGlyph icon="cumple" accent="purple" />
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                {panelSelfRequestStatus.filter((item) => item.tipo === 'PERMISO').length}
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-950">Dia cumple</p>
            <p className="mt-1 text-sm text-slate-500">
              Solicita tu dia de cumpleanos y revisa como va la aprobacion.
            </p>
          </button>
        </div>
      </Card>

      <Card className="bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Operacion del dia
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Tiendas asignadas hoy</h2>
            <p className="mt-2 text-sm text-slate-600">
              Cada fila resume el PDV, la persona asignada, su horario y si ya llego o sigue sin
              check-in.
            </p>
          </div>
          <span className="rounded-full border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
            {summary.total} visibles
          </span>
        </div>
        {dailyItems.length === 0 ? (
          <div className="mt-5 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
            No tienes PDVs con asignacion activa para hoy.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {dailyItems.map((item) => (
              <button
                key={item.assignmentId}
                type="button"
                onClick={() => setSelectedItem(item)}
                className="w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-left transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{item.pdv}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.pdvClaveBtl ?? 'Sin clave'} · {item.zona ?? 'Sin zona'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Dermoconsejero
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-900">{item.empleado}</p>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Horario
                      </p>
                      <p className="mt-1 text-sm text-slate-900">{item.horario ?? 'Sin horario'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Estado
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <SupervisorAttendanceStatusBadge item={item} />
                        {item.minutosRetardo !== null && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            {item.minutosRetardo} min retardo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                      Revisar entrada
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <BottomSheet
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? `Entrada en ${selectedItem.pdv}` : 'Entrada operativa'}
        description="Valida o rechaza la llegada del dermoconsejero segun el check-in registrado."
        initialSnap="expanded"
      >
        {selectedItem && (
          <SupervisorAttendanceReviewSheet
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onResolved={(nextStatus, message) => {
              setDailyItems((current) =>
                current.map((candidate) =>
                  candidate.assignmentId === selectedItem.assignmentId
                    ? { ...candidate, estadoAsistencia: nextStatus }
                    : candidate
                )
              );
              setSelectedItem((current) =>
                current ? { ...current, estadoAsistencia: nextStatus } : current
              );
              setToast({
                tone: nextStatus === 'RECHAZADA' ? 'info' : 'success',
                message,
              });
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={activeQuickAction === 'ruta-agenda'}
        onClose={() => setActiveQuickAction(null)}
        title="Agenda operativa"
        description="Agenda activa del supervisor en una hoja inferior compatible con movil."
        initialSnap="expanded"
      >
        {routeData ? (
          <RutaSemanalPanel
            data={routeData}
            actorPuesto={actor.puesto}
            initialTab="agenda"
            hideSupervisorTabs
          />
        ) : (
          renderRouteSheetState('ruta-agenda')
        )}
      </BottomSheet>

      <BottomSheet
        open={activeQuickAction === 'ruta-planning'}
        onClose={() => setActiveQuickAction(null)}
        title="Definir ruta semanal"
        description="Planeacion semanal guiada en una hoja inferior arrastrable."
        initialSnap="expanded"
      >
        {routeData ? (
          <RutaSemanalPanel
            data={routeData}
            actorPuesto={actor.puesto}
            initialTab="planning"
            hideSupervisorTabs
          />
        ) : (
          renderRouteSheetState('ruta-planning')
        )}
      </BottomSheet>

      <BottomSheet
        open={activeQuickAction === 'ruta-history'}
        onClose={() => setActiveQuickAction(null)}
        title="Correcciones e historicos"
        description="Consulta semanas previas, cambios y pendientes desde una hoja inferior."
        initialSnap="expanded"
      >
        {routeData ? (
          <RutaSemanalPanel
            data={routeData}
            actorPuesto={actor.puesto}
            initialTab="history"
            hideSupervisorTabs
          />
        ) : (
          renderRouteSheetState('ruta-history')
        )}
      </BottomSheet>


      <BottomSheet
        open={activeQuickAction === 'rol-mensual'}
        onClose={() => setActiveQuickAction(null)}
        title="Rol mensual"
        description="Calendario mensual solo lectura de tus PDVs fijos y rotativos."
        initialSnap="expanded"
      >
        <SupervisorMonthlyRoleSheet open={activeQuickAction === 'rol-mensual'} />
      </BottomSheet>
      <BottomSheet
        open={activeQuickAction === 'hoy'}
        onClose={() => setActiveQuickAction(null)}
        title="Mi ruta de hoy"
        description="Ejecuta visita por visita con llegada, checklist y salida."
        initialSnap="expanded"
      >
        {routeData ? (
          <SupervisorTodayRouteSheet
            data={routeData}
            onSuccess={(message) => setToast({ tone: 'success', message })}
            onError={(message) => setToast({ tone: 'error', message })}
          />
        ) : (
          renderRouteSheetState('hoy')
        )}
      </BottomSheet>

      <BottomSheet
        open={activeQuickAction === 'solicitudes'}
        onClose={() => setActiveQuickAction(null)}
        title="Solicitudes del equipo"
        description="Consulta vacaciones como aviso operativo y atiende incapacidades o dias de cumpleanos del equipo."
        initialSnap="expanded"
      >
        {panelDataLoaded ? (
          <SupervisorRequestsInboxSheet
            inbox={requestInboxItems}
            authorizations={panelAuthorizations}
            initialFilter={
              activeQuickAction === 'vacaciones'
                ? 'VACACIONES'
                : activeQuickAction === 'incapacidad'
                  ? 'INCAPACIDAD'
                  : activeQuickAction === 'cumpleanos'
                    ? 'CUMPLEANOS'
                    : 'TODAS'
            }
            onResolved={(requestId, nextStatus, message) => {
              setRequestInboxItems((current) =>
                current.map((item) =>
                  item.id === requestId
                    ? {
                        ...item,
                        estatus: nextStatus,
                        actionable: false,
                        siguienteActor:
                          nextStatus === 'VALIDADA_SUP'
                            ? 'COORDINADOR'
                            : nextStatus === 'CORRECCION_SOLICITADA'
                              ? 'DERMOCONSEJERO'
                              : null,
                      }
                    : item
                )
              );
              setToast({
                tone: nextStatus === 'RECHAZADA' ? 'info' : 'success',
                message,
              });
            }}
          />
        ) : (
          renderPanelSheetState()
        )}
      </BottomSheet>

      <BottomSheet
        open={
          activeQuickAction === 'vacaciones' ||
          activeQuickAction === 'incapacidad' ||
          activeQuickAction === 'cumpleanos'
        }
        onClose={() => setActiveQuickAction(null)}
        title={
          activeQuickAction === 'vacaciones'
            ? 'Mis vacaciones'
            : activeQuickAction === 'incapacidad'
              ? 'Mi incapacidad'
              : 'Mi dia cumple'
        }
        description={
          activeQuickAction === 'vacaciones'
            ? 'Registra tu solicitud personal y revisa su estatus sin salir del dashboard.'
            : activeQuickAction === 'incapacidad'
              ? 'Registra tu incapacidad y adjunta evidencia para validacion de supervision, reclutamiento y nomina.'
              : 'Solicita tu dia de cumpleanos y consulta el avance.'
        }
        initialSnap="expanded"
      >
        {panelDataLoaded &&
          (activeQuickAction === 'vacaciones' ||
            activeQuickAction === 'incapacidad' ||
            activeQuickAction === 'cumpleanos') && (
          <DermoSolicitudSheet
            data={supervisorSelfRequestData}
            requesterRole="SUPERVISOR"
            tipo={
              activeQuickAction === 'vacaciones'
                ? 'vacaciones'
                : activeQuickAction === 'incapacidad'
                  ? 'incapacidad'
                  : 'permiso'
            }
            onClose={() => setActiveQuickAction(null)}
            onSuccess={(message) => {
              setActiveQuickAction(null);
              setToast({ tone: 'success', message });
            }}
          />
        )}
        {!panelDataLoaded && renderPanelSheetState()}
      </BottomSheet>

      <BottomSheet
        open={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        title="Notificaciones"
        description="Avisos breves y lectura rapida para supervision."
        initialSnap="partial"
      >
        {panelDataLoaded ? (
          <NotificationCenterSheet
            notifications={supervisorNotifications}
            onOpenRoutePlanner={() => {
              setIsNotificationCenterOpen(false);
              setActiveQuickAction('ruta-planning');
            }}
          />
        ) : (
          renderPanelSheetState()
        )}
      </BottomSheet>

      {toast && <ToastBanner tone={toast.tone} message={toast.message} />}
    </div>
  );
}

function summarizeSupervisorDailyItems(items: DashboardSupervisorDailyItem[]) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;

      if (item.estadoAsistencia === 'SIN_CHECKIN') {
        acc.noCheckIn += 1;
      } else if (item.estadoAsistencia === 'PENDIENTE_VALIDACION') {
        acc.pendingReview += 1;
      } else if (item.estadoAsistencia === 'RECHAZADA') {
        acc.rejected += 1;
      } else {
        acc.approved += 1;
      }

      return acc;
    },
    {
      total: 0,
      pendingReview: 0,
      noCheckIn: 0,
      approved: 0,
      rejected: 0,
    }
  );
}

function getSupervisorAttendanceTone(item: DashboardSupervisorDailyItem) {
  if (item.estadoAsistencia === 'SIN_CHECKIN') {
    return 'bg-slate-100 text-slate-700';
  }

  if (item.estadoAsistencia === 'PENDIENTE_VALIDACION') {
    return 'bg-amber-100 text-amber-800';
  }

  if (item.estadoAsistencia === 'RECHAZADA') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function getSupervisorAttendanceLabel(item: DashboardSupervisorDailyItem) {
  if (item.estadoAsistencia === 'SIN_CHECKIN') {
    return 'Sin llegada';
  }

  if (item.estadoAsistencia === 'PENDIENTE_VALIDACION') {
    return 'Pendiente';
  }

  if (item.estadoAsistencia === 'RECHAZADA') {
    return 'Rechazada';
  }

  if (item.minutosRetardo !== null) {
    return 'Con retardo';
  }

  return 'Llego';
}

function SupervisorAttendanceStatusBadge({ item }: { item: DashboardSupervisorDailyItem }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSupervisorAttendanceTone(
        item
      )}`}
    >
      {getSupervisorAttendanceLabel(item)}
    </span>
  );
}

function summarizeSupervisorRequestInbox(items: DashboardSupervisorRequestItem[]) {
  return {
    total: items.length,
    actionable: items.filter((item) => item.actionable).length,
  };
}

function formatSupervisorRequestKind(kind: DashboardSupervisorRequestItem['kind']) {
  switch (kind) {
    case 'VACACIONES':
      return 'Vacaciones';
    case 'INCAPACIDAD':
      return 'Incapacidad';
    case 'CUMPLEANOS':
      return 'Dia cumple';
    case 'JUSTIFICACION_FALTA':
      return 'Justificacion de falta';
    default:
      return 'Solicitud';
  }
}

function SupervisorRequestsInboxSheet({
  inbox,
  authorizations,
  initialFilter = 'TODAS',
  onResolved,
}: {
  inbox: DashboardSupervisorRequestItem[];
  authorizations: DashboardPanelData['supervisorAuthorizations'];
  initialFilter?: 'TODAS' | DashboardSupervisorRequestItem['kind'] | 'PENDIENTES';
  onResolved: (
    requestId: string,
    nextStatus: 'RECHAZADA' | 'VALIDADA_SUP' | 'REGISTRADA' | 'CORRECCION_SOLICITADA',
    message: string
  ) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<
    'TODAS' | DashboardSupervisorRequestItem['kind'] | 'PENDIENTES'
  >(initialFilter);
  const [selectedAuthorization, setSelectedAuthorization] = useState<
    DashboardPanelData['supervisorAuthorizations'][number] | null
  >(null);
  const [selectedInfoItem, setSelectedInfoItem] = useState<DashboardSupervisorRequestItem | null>(null);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'TODAS') {
      return inbox;
    }

    if (activeFilter === 'PENDIENTES') {
      return inbox.filter((item) => item.actionable);
    }

    return inbox.filter((item) => item.kind === activeFilter);
  }, [activeFilter, inbox]);

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Solicitudes del equipo</p>
        <p className="mt-1 text-sm text-slate-600">
          Vacaciones quedan visibles como aviso operativo.
          Dia de cumpleanos, justificaciones e incapacidades siguen tu filtro operativo; despues Reclutamiento y Nomina cierran la incapacidad.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'TODAS' as const, label: `Todas (${inbox.length})` },
          {
            key: 'PENDIENTES' as const,
            label: `Pendientes (${inbox.filter((item) => item.actionable).length})`,
          },
          {
            key: 'VACACIONES' as const,
            label: `Vacaciones (${inbox.filter((item) => item.kind === 'VACACIONES').length})`,
          },
          {
            key: 'INCAPACIDAD' as const,
            label: `Incapacidades (${inbox.filter((item) => item.kind === 'INCAPACIDAD').length})`,
          },
          {
            key: 'JUSTIFICACION_FALTA' as const,
            label: `Justificaciones (${inbox.filter((item) => item.kind === 'JUSTIFICACION_FALTA').length})`,
          },
          {
            key: 'CUMPLEANOS' as const,
            label: `Dia cumple (${inbox.filter((item) => item.kind === 'CUMPLEANOS').length})`,
          },
        ].map((item) => {
          const active = activeFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveFilter(item.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-[var(--module-primary)] bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay solicitudes en esta vista.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{item.empleado}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatSupervisorRequestKind(item.kind)} · {formatDateLabel(item.fechaInicio)} a{' '}
                    {formatDateLabel(item.fechaFin)}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.motivo ?? item.comentarios ?? 'Sin detalle adicional.'}
                  </p>
                  {item.kind === 'JUSTIFICACION_FALTA' && (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Requiere aviso previo y receta del IMSS para poder aprobarse.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Cuenta
                  </p>
                  <p className="mt-1 text-sm text-slate-900">
                    {item.cuentaCliente ?? 'Sin cuenta'}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Estado
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSolicitudStatusTone(item.estatus)}`}
                    >
                      {formatSolicitudStatusLabel(item.estatus)}
                    </span>
                    {item.urgencyState && item.kind === 'JUSTIFICACION_FALTA' && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.urgencyState === 'VENCIDA'
                            ? 'bg-rose-100 text-rose-700'
                            : item.urgencyState === 'URGENTE'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.urgencyState === 'VENCIDA'
                          ? 'Vencida'
                          : item.urgencyState === 'URGENTE'
                            ? 'Urgente'
                            : 'En tiempo'}
                      </span>
                    )}
                    {!item.actionable && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        Seguimiento
                      </span>
                    )}
                  </div>
                  {item.kind === 'JUSTIFICACION_FALTA' && (
                    <p className="mt-2 text-xs text-slate-500">
                      {item.tiempoRestanteMinutos === null
                        ? 'Sin SLA visible.'
                        : item.tiempoRestanteMinutos >= 0
                          ? `Tiempo restante: ${formatRemainingMinutes(item.tiempoRestanteMinutos)}`
                          : `Vencida hace ${formatRemainingMinutes(Math.abs(item.tiempoRestanteMinutos))}`}
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant={item.actionable ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (item.actionable) {
                        const authorization = authorizations.find((candidate) => candidate.id === item.id);
                        if (authorization) {
                          setSelectedAuthorization(authorization);
                        }
                        return;
                      }

                      setSelectedInfoItem(item);
                    }}
                  >
                    {item.actionable ? 'Revisar' : 'Ver detalle'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomSheet
        open={Boolean(selectedAuthorization)}
        onClose={() => setSelectedAuthorization(null)}
        title={
          selectedAuthorization
            ? `Solicitud de ${selectedAuthorization.tipo.toLowerCase()}`
            : 'Solicitud'
        }
        description="Aprueba o rechaza sin salir del dashboard."
        initialSnap="partial"
      >
        {selectedAuthorization && (
          <SupervisorApprovalSheet
            item={selectedAuthorization}
            onClose={() => setSelectedAuthorization(null)}
            onResolved={(nextStatus, message) => {
              onResolved(selectedAuthorization.id, nextStatus, message);
              setSelectedAuthorization(null);
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedInfoItem)}
        onClose={() => setSelectedInfoItem(null)}
        title={
          selectedInfoItem
            ? `${formatSupervisorRequestKind(selectedInfoItem.kind)} de ${selectedInfoItem.empleado}`
            : 'Solicitud'
        }
        description="Seguimiento operativo e impacto en asistencia."
        initialSnap="partial"
      >
        {selectedInfoItem && <SupervisorRequestInfoSheet item={selectedInfoItem} />}
      </BottomSheet>
    </div>
  );
}

function SupervisorRequestInfoSheet({ item }: { item: DashboardSupervisorRequestItem }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
        {item.kind === 'INCAPACIDAD'
          ? 'Esta incapacidad sigue una ruta escalonada: supervision valida primero, reclutamiento revisa el documento y nomina formaliza al final.'
          : 'Esta solicitud ya avanzo fuera de tu aprobacion directa.'}
      </div>

      <div className="grid gap-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailValue label="Dermoconsejero" value={item.empleado} />
          <DetailValue label="Tipo" value={formatSupervisorRequestKind(item.kind)} />
          <DetailValue
            label="Periodo"
            value={`${formatDateLabel(item.fechaInicio)} a ${formatDateLabel(item.fechaFin)}`}
          />
          <DetailValue label="Estado" value={formatSolicitudStatusLabel(item.estatus)} />
          {item.kind === 'JUSTIFICACION_FALTA' && item.resolverAntesDe && (
            <DetailValue label="Resolver antes de" value={formatDateTime(item.resolverAntesDe)} />
          )}
        </div>
        <DetailValue
          label="Detalle"
          value={item.motivo ?? item.comentarios ?? 'Sin detalle adicional.'}
        />
        <DetailValue
          label="Asistencia"
          value={
            item.kind === 'INCAPACIDAD' ||
            item.kind === 'VACACIONES' ||
            item.kind === 'CUMPLEANOS' ||
            item.kind === 'JUSTIFICACION_FALTA'
              ? 'Se integra al control de asistencia cuando alcance el estado final correspondiente.'
              : 'Sin impacto directo.'
          }
        />
        {item.justificanteUrl && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Evidencia
            </p>
            <a
              href={item.justificanteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Abrir receta adjunta
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function SupervisorAttendanceReviewSheet({
  item,
  onClose,
  onResolved,
}: {
  item: DashboardSupervisorDailyItem;
  onClose: () => void;
  onResolved: (nextStatus: 'VALIDA' | 'RECHAZADA', message: string) => void;
}) {
  const [state, formAction] = useActionState(
    resolverAsistenciaSupervisor,
    ESTADO_SUPERVISOR_ASISTENCIA_INICIAL
  );
  const [submittedStatus, setSubmittedStatus] = useState<'VALIDA' | 'RECHAZADA' | null>(null);

  useEffect(() => {
    if (!state.ok || !state.message || !submittedStatus) {
      return;
    }

    onResolved(submittedStatus, state.message);
    onClose();
  }, [onClose, onResolved, state.message, state.ok, submittedStatus]);

  const canResolve = Boolean(item.attendanceId) && item.estadoAsistencia !== 'SIN_CHECKIN' && item.estadoAsistencia !== 'CERRADA';

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="asistencia_id" value={item.attendanceId ?? ''} />

      <div className="grid gap-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailValue label="Punto de venta" value={item.pdv} />
          <DetailValue label="Dermoconsejero" value={item.empleado} />
          <DetailValue label="Horario" value={item.horario ?? 'Sin horario'} />
          <DetailValue label="Estado actual" value={getSupervisorAttendanceLabel(item)} />
          <DetailValue label="Check-in" value={formatShortClock(item.checkInUtc) ?? 'Sin registro'} />
          <DetailValue label="GPS" value={item.estadoGps ?? 'Sin GPS'} />
        </div>

        {item.minutosRetardo !== null && (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            La llegada se registro con {item.minutosRetardo} minutos de retardo contra el horario esperado.
          </div>
        )}

        {item.estadoAsistencia === 'SIN_CHECKIN' && (
          <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Todavia no existe un check-in enviado por el dermoconsejero para esta asignacion.
          </div>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Comentarios de supervision
          <textarea
            name="comentarios"
            rows={3}
            className="mt-2 w-full rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--module-primary)] focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            placeholder="Explica por que apruebas o rechazas esta llegada."
          />
        </label>
      </div>

      {state.message && !state.ok && (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" className="rounded-[14px]" onClick={onClose}>
          Cerrar
        </Button>
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="submit"
            name="estatus"
            value="RECHAZADA"
            variant="outline"
            className="rounded-[14px] border-rose-200 text-rose-700 hover:bg-rose-50"
            disabled={!canResolve}
            onClick={() => setSubmittedStatus('RECHAZADA')}
          >
            Rechazar entrada
          </Button>
          <Button
            type="submit"
            name="estatus"
            value="VALIDA"
            className="rounded-[14px]"
            disabled={!canResolve}
            onClick={() => setSubmittedStatus('VALIDA')}
          >
            Aprobar entrada
          </Button>
        </div>
      </div>
    </form>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function DermoFormationAttendanceCard({
  formation,
}: {
  formation: DashboardDermoconsejoData['activeFormation'];
}) {
  const [currentFormation, setCurrentFormation] = useState(formation);
  const [cameraMode, setCameraMode] = useState<'CHECK_IN' | 'CHECK_OUT' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentFormation(formation);
    setFeedback(null);
    setCameraMode(null);
  }, [formation]);

  if (!currentFormation) {
    return null;
  }

  const isPendingArrival = currentFormation.attendanceStatus === 'PENDIENTE';
  const isInProgress = currentFormation.attendanceStatus === 'LLEGADA_REGISTRADA';
  const isCompleted = currentFormation.attendanceStatus === 'COMPLETA';
  const isOnline = currentFormation.modalidad === 'EN_LINEA';

  const submitAttendanceMovement = async (file: File, mode: 'CHECK_IN' | 'CHECK_OUT') => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const gpsCapture = isOnline
        ? {
            position: {
              latitud: null,
              longitud: null,
            },
          }
        : await captureAttendancePosition({
            geocercaLatitud: null,
            geocercaLongitud: null,
            geocercaRadioMetros: null,
          });
      const capturedAt = new Date().toISOString();
      const stamped = await stampAttendanceSelfie(file, {
        capturedAt,
        latitude: gpsCapture.position.latitud,
        longitude: gpsCapture.position.longitud,
        flowLabel: mode === 'CHECK_IN' ? 'Check-in' : 'Check-out',
      });

      const formData = new FormData();
      formData.set('evento_id', currentFormation.id);
      formData.set('selfie_file', stamped.file);
      if (gpsCapture.position.latitud !== null) {
        formData.set('latitude', String(gpsCapture.position.latitud));
      }
      if (gpsCapture.position.longitud !== null) {
        formData.set('longitude', String(gpsCapture.position.longitud));
      }

      try {
        await injectDirectR2Upload(formData, stamped.file, {
          modulo: 'formaciones',
          removeFieldName: 'selfie_file',
          fieldNames: {
            objectKey: 'selfie_r2_object_key',
            sha256: 'selfie_r2_sha256',
            fileName: 'selfie_r2_file_name',
            contentType: 'selfie_r2_type',
            size: 'selfie_r2_size',
          },
        });
      } catch (error) {
        console.error('No fue posible subir la selfie de formación a R2.', error);
      }

      const result =
        mode === 'CHECK_IN'
          ? await registrarLlegadaFormacionDashboard(ESTADO_FORMACION_ADMIN_INICIAL, formData)
          : await registrarSalidaFormacionDashboard(ESTADO_FORMACION_ADMIN_INICIAL, formData);

      if (!result.ok) {
        setFeedback({
          tone: 'error',
          message: result.message ?? 'No fue posible registrar la asistencia de la formacion.',
        });
        return;
      }

      setCurrentFormation((previous) =>
        previous
          ? {
              ...previous,
              attendanceStatus:
                mode === 'CHECK_IN'
                  ? 'LLEGADA_REGISTRADA'
                  : 'COMPLETA',
              checkInUtc: mode === 'CHECK_IN' ? capturedAt : previous.checkInUtc,
              checkOutUtc: mode === 'CHECK_OUT' ? capturedAt : previous.checkOutUtc,
            }
          : previous
      );
      setFeedback({
        tone: 'success',
        message:
          result.message ??
          (mode === 'CHECK_IN'
            ? 'Llegada a formacion registrada.'
            : 'Salida de formacion registrada.'),
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible registrar la captura de la formacion.',
      });
    } finally {
      setIsSubmitting(false);
      setCameraMode(null);
    }
  };

  return (
    <>
      <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sky-950 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              Formacion programada hoy
            </p>
            <p className="mt-1 text-base font-semibold text-slate-950">{currentFormation.nombre}</p>
            <p className="mt-2 text-sm text-slate-700">
              {[
                currentFormation.tipoEvento,
                isOnline ? 'En linea' : 'Presencial',
                currentFormation.sede,
                currentFormation.horarioInicio && currentFormation.horarioFin
                  ? `${currentFormation.horarioInicio} - ${currentFormation.horarioFin}`
                  : currentFormation.horarioInicio ?? currentFormation.horarioFin,
                currentFormation.supervisorNombre
                  ? `Supervisor: ${currentFormation.supervisorNombre}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-2 text-sm text-sky-800">
              Tu asignacion normal en tienda queda suspendida por este evento.
            </p>
            {currentFormation.locationAddress && (
              <p className="mt-2 text-xs text-sky-700">
                Sede operativa: {currentFormation.locationAddress}
                {currentFormation.modalidad === 'PRESENCIAL' &&
                  currentFormation.locationLatitude !== null &&
                  currentFormation.locationLongitude !== null &&
                  ` · ${currentFormation.locationLatitude}, ${currentFormation.locationLongitude}`}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-700'
                : isInProgress
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-sky-100 text-sky-700'
            }`}
          >
            {isCompleted
              ? 'Asistencia completada'
              : isInProgress
                ? 'Formacion en curso'
                : 'Pendiente de llegada'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Entrada
            </p>
            <p className="mt-1 text-sm font-medium text-slate-950">
              {currentFormation.checkInUtc ? formatDateTime(currentFormation.checkInUtc) : 'Pendiente'}
            </p>
          </div>
          <div className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Salida
            </p>
            <p className="mt-1 text-sm font-medium text-slate-950">
              {currentFormation.checkOutUtc ? formatDateTime(currentFormation.checkOutUtc) : 'Pendiente'}
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-[18px] border px-4 py-3 text-sm ${
              feedback.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {isPendingArrival && (
            <Button
              type="button"
              size="lg"
              onClick={() => setCameraMode('CHECK_IN')}
              disabled={isSubmitting}
            >
              Registrar llegada
            </Button>
          )}
          {isInProgress && (
            <Button
              type="button"
              size="lg"
              onClick={() => setCameraMode('CHECK_OUT')}
              disabled={isSubmitting}
            >
              Registrar salida
            </Button>
          )}
          {isCompleted && (
            <span className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm">
              Formacion finalizada
            </span>
          )}
        </div>
      </div>

      <NativeCameraSelfieDialog
        open={cameraMode !== null}
        title={cameraMode === 'CHECK_OUT' ? 'Salida de formacion' : 'Llegada a formacion'}
        description={
          cameraMode === 'CHECK_OUT'
            ? isOnline
              ? 'Sube la captura o fotografia final que compruebe tu permanencia en la sesion en linea.'
              : 'Toma tu selfie final para cerrar la asistencia presencial.'
            : isOnline
              ? 'Sube la captura o fotografia de ingreso a la sesion en linea.'
              : 'Toma tu selfie de llegada para iniciar la asistencia presencial.'
        }
        onClose={() => {
          if (!isSubmitting) {
            setCameraMode(null);
          }
        }}
        onCapture={(file) =>
          submitAttendanceMovement(file, cameraMode === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN')
        }
        captureLabel={
          cameraMode === 'CHECK_OUT'
            ? isOnline
              ? 'Subir evidencia final'
              : 'Capturar salida'
            : isOnline
              ? 'Subir evidencia de ingreso'
              : 'Capturar llegada'
        }
      />
    </>
  );
}

function DermoStatTile({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: ActionGlyphName;
  accent: ShortcutTone;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-slate-50">
          <ActionIconGlyph icon={icon} accent={accent} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DermoQuickActionButton({
  item,
  onClick,
}: {
  item: DashboardDermoconsejoData['quickActions'][number];
  onClick: () => void;
}) {
  const icon = getDermoActionIcon(item.key);

  return (
    <button type="button" onClick={onClick} className="group relative text-center">
      <span
        className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[22px] border shadow-sm transition group-hover:-translate-y-0.5 ${getQuickActionTone(item.accent)}`}
      >
        <ActionIconGlyph icon={icon} accent={item.accent} />
      </span>
      {item.badgeCount && item.badgeCount > 0 && (
        <span className="absolute right-0 top-0 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white shadow-sm">
          {item.badgeCount > 9 ? '9+' : item.badgeCount}
        </span>
      )}
      <span className="mt-2 block text-xs font-medium text-slate-700">{item.label}</span>
    </button>
  );
}

function DermoSupportButton({
  item,
  onClick,
}: {
  item: RoleShortcutItem;
  onClick: () => void;
}) {
  const icon = getRoleShortcutIcon(item.key);

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
    >
      <div className="flex items-center gap-2">
        <ActionIconGlyph icon={icon} accent={item.accent} small />
        <span className="text-xs font-semibold text-slate-900">{item.label}</span>
      </div>
    </button>
  );
}

function DashboardLogoutButton() {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(() => {
      window.location.assign('/logout');
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLogout}
      isLoading={isPending}
      className="min-h-10 rounded-[14px] border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      Cerrar sesion
    </Button>
  );
}

type ActionGlyphName =
  | PremiumIconName
  | 'arrival'
  | 'entrada'
  | 'calendar'
  | 'ventas'
  | 'love'
  | 'warning'
  | 'profile'
  | 'mail'
  | 'notification'
  | 'incapacidad'
  | 'vacaciones'
  | 'cumple'
  | 'store-pin'
  | 'clock'
  | 'module';

function getDermoActionIcon(
  key: DashboardDermoconsejoData['quickActions'][number]['key']
): ActionGlyphName {
  switch (key) {
    case 'calendario':
      return 'calendar';
    case 'ventas':
      return 'ventas';
    case 'love-isdin':
      return 'love';
    case 'comunicacion':
      return 'mail';
    case 'perfil':
      return 'profile';
    case 'incidencias':
      return 'warning';
    case 'registro-extemporaneo':
      return 'clock';
    case 'justificacion-faltas':
      return 'requests';
    case 'incapacidad':
      return 'incapacidad';
    case 'vacaciones':
      return 'vacaciones';
    case 'permiso':
      return 'cumple';
    default:
      return 'module';
  }
}

function ActionIconGlyph({
  icon,
  accent,
  small = false,
  light = false,
}: {
  icon: ActionGlyphName;
  accent: ShortcutTone;
  small?: boolean;
  light?: boolean;
}) {
  const stroke =
    light
      ? '#ffffff'
      : accent === 'amber'
        ? '#d97706'
        : accent === 'rose'
          ? '#e11d48'
          : accent === 'sky'
            ? '#2563eb'
            : accent === 'orange'
              ? '#ea580c'
              : accent === 'purple'
                ? '#9333ea'
            : accent === 'slate'
              ? '#64748b'
              : '#10b981';
  const sizeClass = small ? 'h-[20px] w-[20px]' : 'h-[30px] w-[30px]';
  return (
    <PremiumLineIcon
      name={icon}
      className={sizeClass}
      stroke={stroke}
      strokeWidth={small ? 1.95 : 2.05}
    />
  );
}

function getRoleShortcutIcon(key: RoleShortcutItem['key']): ActionGlyphName {
  switch (key) {
    case 'pdvs':
      return 'stores';
    case 'ruta-semanal':
      return 'route';
    case 'asignaciones':
      return 'assignments';
    case 'asistencias':
      return 'attendance';
    case 'solicitudes':
      return 'requests';
    case 'ventas':
      return 'sales';
    case 'campanas':
      return 'campaigns';
    case 'mensajes':
      return 'messages';
    case 'gastos':
      return 'expenses';
    case 'materiales':
      return 'materials';
    case 'formaciones':
      return 'training';
    default:
      return 'module';
  }
}

function RoleShortcutButton({
  item,
  onClick,
  compact = false,
}: {
  item: RoleShortcutItem;
  onClick: () => void;
  compact?: boolean;
}) {
  const icon = getRoleShortcutIcon(item.key);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border border-[var(--module-border)] bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover ${
        compact ? 'p-4' : 'p-4 sm:p-5'
      }`}
    >
      <div
        className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] ${getQuickActionTone(item.accent)}`}
      >
        <ActionIconGlyph icon={icon} accent={item.accent} small />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-950">{item.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
    </button>
  );
}

function RoleShortcutSheet({ item }: { item: RoleShortcutItem }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] p-4">
        <p className="text-base font-semibold text-slate-950">{item.label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{item.helper}</p>
      </div>
      <Link
        href={item.href}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[14px] bg-[var(--module-primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--module-hover)]"
      >
        Abrir modulo
      </Link>
    </div>
  );
}

function RoleMetricCard({
  label,
  value,
  helper,
  tone = 'slate',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: ShortcutTone;
}) {
  const semantic = resolveKpiSemantic(label);
  const icon = semantic.icon;

  const metricTone =
    tone === 'emerald' || tone === 'sky' || tone === 'amber' || tone === 'rose'
      ? tone
      : tone === 'purple'
        ? 'violet'
        : semantic.tone;

  const toneSurfaceClassName =
    metricTone === 'emerald'
      ? 'border-emerald-100/80 bg-gradient-to-b from-emerald-100/90 via-emerald-50/45 to-white'
      : metricTone === 'sky'
        ? 'border-sky-100/80 bg-gradient-to-b from-sky-100/90 via-sky-50/45 to-white'
        : metricTone === 'amber'
          ? 'border-amber-100/80 bg-gradient-to-b from-amber-100/90 via-amber-50/45 to-white'
          : metricTone === 'rose'
            ? 'border-rose-100/80 bg-gradient-to-b from-rose-100/90 via-rose-50/45 to-white'
            : metricTone === 'violet'
              ? 'border-violet-100/80 bg-gradient-to-b from-violet-100/90 via-violet-50/45 to-white'
            : 'border-[var(--module-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--module-primary)_14%,white)_0%,var(--module-soft-bg)_38%,rgba(255,255,255,0.95)_100%)]';
  const indicatorStyle = {
    borderColor: withAlpha(semantic.color, 0.24),
    backgroundColor: withAlpha(semantic.color, 0.1),
    color: semantic.color,
  };

  return (
    <div
      className={`min-h-[54px] rounded-[14px] border px-3 py-2 shadow-[0_6px_14px_rgba(148,163,184,0.08)] ${toneSurfaceClassName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <div className="mt-1 grid grid-cols-[auto,1fr] items-end gap-x-2 gap-y-0.5">
            <p className="min-w-[24px] text-[1.05rem] font-semibold leading-none tracking-[-0.03em] text-slate-950 sm:text-[1.15rem]">
              {value}
            </p>
            <p className="min-w-0 line-clamp-2 text-[9px] leading-3 text-slate-500">
              {helper}
            </p>
          </div>
        </div>
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[8px]"
          style={indicatorStyle}
        >
          <PremiumLineIcon
            name={icon}
            className="h-4 w-4"
            stroke={semantic.color}
            strokeWidth={1.95}
            variant={semantic.variant}
          />
        </span>
      </div>
    </div>
  );
}

function SupervisorAuthorizationsSection({
  items,
}: {
  items: DashboardPanelData['supervisorAuthorizations'];
}) {
  const [currentItems, setCurrentItems] = useState(items);
  const [selectedItem, setSelectedItem] = useState<
    DashboardPanelData['supervisorAuthorizations'][number] | null
  >(null);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    setCurrentItems(items);
  }, [items]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <>
      <Card className="bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Autorizaciones
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Pendientes de supervision</h2>
          </div>
          <span className="rounded-full border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
            {currentItems.length} ticket{currentItems.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {currentItems.length === 0 ? (
            <p className="rounded-[20px] bg-slate-50 px-4 py-5 text-sm text-slate-500">
              No hay autorizaciones pendientes por revisar en este momento.
            </p>
          ) : (
            currentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItem(item)}
                className="w-full rounded-[22px] border border-[var(--module-border)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--module-soft-bg)] hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{item.empleado}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.tipo} · {formatDateLabel(item.fechaInicio)} a{' '}
                      {formatDateLabel(item.fechaFin)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--module-text)]">
                      {item.cuentaCliente ?? 'Sin cuenta cliente'}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--module-soft-bg)] px-3 py-1 text-xs font-semibold text-[var(--module-text)]">
                    {item.estatus}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      <BottomSheet
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? `Autorizacion ${selectedItem.tipo.toLowerCase()}` : 'Autorizacion'}
        description="Resume el ticket, agrega comentario si hace falta y resuelve sin salir del dashboard."
        initialSnap="partial"
      >
        {selectedItem && (
          <SupervisorApprovalSheet
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onResolved={(nextStatus, message) => {
              setCurrentItems((current) =>
                current.filter((candidate) => candidate.id !== selectedItem.id)
              );
              setSelectedItem(null);
              setToast({
                tone: nextStatus === 'RECHAZADA' ? 'info' : 'success',
                message,
              });
            }}
          />
        )}
      </BottomSheet>

      {toast && <ToastBanner tone={toast.tone} message={toast.message} />}
    </>
  );
}

function DermoVentasSheet({
  data,
  onClose,
  onSuccess,
  onError,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const offline = useOfflineSync();
  const [productoId, setProductoId] = useState(data.catalogoProductos[0]?.id ?? '');
  const [unidades, setUnidades] = useState('1');
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const selectedProducto =
    data.catalogoProductos.find((item) => item.id === productoId) ?? null;

  const canSubmit = Boolean(
    data.context.cuentaClienteId &&
    data.context.pdvId &&
    data.context.attendanceId &&
    data.reportWindow.canReportToday &&
    selectedProducto
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !canSubmit ||
      !data.context.cuentaClienteId ||
      !data.context.pdvId ||
      !data.context.attendanceId
    ) {
      onError('Primero necesitas una jornada activa para registrar ventas desde el dashboard.');
      return;
    }

    if (!selectedProducto) {
      onError('Selecciona un producto del catalogo activo.');
      return;
    }

    const totalUnidades = Number(unidades);

    if (!Number.isFinite(totalUnidades) || totalUnidades <= 0) {
      onError('Las unidades deben ser mayores a cero.');
      return;
    }

    setIsSaving(true);
    setSavedMessage(null);

    try {
      await queueOfflineVenta({
        id: crypto.randomUUID(),
        cuenta_cliente_id: data.context.cuentaClienteId,
        asistencia_id: data.context.attendanceId,
        empleado_id: data.context.empleadoId,
        pdv_id: data.context.pdvId,
        producto_id: selectedProducto.id,
        producto_sku: selectedProducto.sku,
        producto_nombre: selectedProducto.nombre,
        producto_nombre_corto: selectedProducto.nombreCorto,
        fecha_utc: new Date().toISOString(),
        total_unidades: totalUnidades,
        total_monto: 0,
        confirmada: true,
        validada_por_empleado_id: data.context.empleadoId,
        validada_en: new Date().toISOString(),
        observaciones: null,
        origen: 'OFFLINE_SYNC',
        metadata: {
          captura_local: true,
          origen_panel: 'dashboard_bottom_sheet',
          jornada_contexto_id: data.context.attendanceId,
          fecha_operativa: data.context.fechaOperacion,
          metodo_ingreso: offline.isOnline ? 'ONLINE' : 'OFFLINE_SYNC',
          ventana_timezone: data.reportWindow.timezone,
          ventana_estado: data.reportWindow.stateName,
        },
      });

      if (offline.isOnline) {
        await offline.syncNow();
      }

      const successMessage =
        offline.isOnline
          ? `${selectedProducto.nombreCorto} guardado. Puedes capturar otra venta.`
          : `${selectedProducto.nombreCorto} guardado en local. Puedes capturar otra venta.`;

      setUnidades('1');
      setSavedMessage(successMessage);
      onSuccess(successMessage);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No fue posible guardar la venta.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form id="dermo-ventas-sheet-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4">
        <SheetField label="Producto">
          <select
            value={productoId}
            onChange={(event) => setProductoId(event.target.value)}
            className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          >
            <option value="">Selecciona un producto</option>
            {data.catalogoProductos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombreCorto}
              </option>
            ))}
          </select>
        </SheetField>
        {selectedProducto && (
          <div className="rounded-[18px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-3 text-sm text-[var(--module-text)]">
            <p className="font-semibold text-slate-950">{selectedProducto.nombreCorto}</p>
            <p className="mt-1 text-xs text-slate-600">{selectedProducto.nombre}</p>
          </div>
        )}
        <div className="grid gap-4">
          <SheetField label="Unidades">
            <input
              value={unidades}
              onChange={(event) => setUnidades(event.target.value)}
              inputMode="numeric"
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            />
          </SheetField>
        </div>
        {savedMessage && (
          <p className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {savedMessage}
          </p>
        )}
      </div>

      {!canSubmit && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.reportWindow.canReportToday
            ? 'Falta seleccionar un producto valido o contexto del PDV para registrar ventas.'
            : data.reportWindow.helper}
        </p>
      )}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <Button
          type="submit"
          size="lg"
          isLoading={isSaving}
          disabled={!canSubmit}
          className="w-full"
        >
          Guardar y seguir
        </Button>
      </div>
    </form>
  );
}

function DermoLoveSheet({
  data,
  onClose,
  onSuccess,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const offline = useOfflineSync();
  const [state, formAction] = useActionState(
    registrarAfiliacionLoveIsdin,
    ESTADO_LOVE_ISDIN_INICIAL
  );
  const [isPending, startTransition] = useTransition();
  const [isUploadingR2, setIsUploadingR2] = useState(false);
  const canSubmit = Boolean(
    data.context.cuentaClienteId &&
      data.context.pdvId &&
      data.context.attendanceId &&
      data.reportWindow.canReportToday &&
      data.loveQr?.estado === 'ACTIVO'
  );
  const [selectedPhotoName, setSelectedPhotoName] = useState<string | null>(null);
  const [cameraPhotoFile, setCameraPhotoFile] = useState<File | null>(null);
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    setCameraPhotoFile(null);
    setSelectedPhotoName(null);
    setLocalMessage(null);
    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const capturedAt = new Date().toISOString();

    formData.delete('evidencia');
    formData.set('fecha_utc', capturedAt);

    if (cameraPhotoFile && offline.isOnline) {
      setIsUploadingR2(true);
      try {
        await injectDirectR2Upload(formData, cameraPhotoFile, {
          modulo: 'love_isdin',
        });
      } catch (err) {
        console.error('Error en subida R2 LOVE ISDIN:', err)
        setLocalMessage('Error al subir evidencia. Reintentar o continuar sin foto.')
      } finally {
        setIsUploadingR2(false)
      }
    } else if (cameraPhotoFile) {
      formData.append('evidencia', cameraPhotoFile)
    }

    if (!offline.isOnline) {
      if (!canSubmit || !data.context.cuentaClienteId || !data.context.pdvId || !data.context.attendanceId) {
        setLocalMessage(data.reportWindow.helper);
        return;
      }

      const afiliadoNombre = String(formData.get('afiliado_nombre') ?? '').trim();
      const afiliadoContacto = String(formData.get('afiliado_contacto') ?? '').trim();

      if (!afiliadoNombre) {
        setLocalMessage('Captura el nombre del cliente antes de guardar LOVE ISDIN.');
        return;
      }

      startTransition(() => {
        void (async () => {
          try {
            await queueOfflineLoveIsdin({
              id: crypto.randomUUID(),
              cuenta_cliente_id: data.context.cuentaClienteId ?? undefined,
              asistencia_id: data.context.attendanceId ?? undefined,
              empleado_id: data.context.empleadoId,
              pdv_id: data.context.pdvId ?? undefined,
              afiliado_nombre: afiliadoNombre,
              afiliado_contacto: afiliadoContacto || undefined,
              ticket_folio: undefined,
              fecha_utc: capturedAt,
              origen: 'OFFLINE_SYNC',
              metadata: {
                capturado_desde: 'panel_love_isdin_offline',
                fecha_operativa: data.context.fechaOperacion,
                metodo_ingreso: 'OFFLINE_SYNC',
                ventana_timezone: data.reportWindow.timezone,
                ventana_estado: data.reportWindow.stateName ?? undefined,
                evidencia_omitida_offline: Boolean(cameraPhotoFile),
              },
            });
            setCameraPhotoFile(null);
            setSelectedPhotoName(null);
            setLocalMessage(null);
            onSuccess(
              cameraPhotoFile
                ? 'LOVE ISDIN guardado en local. La foto opcional no se envio por estar offline.'
                : 'LOVE ISDIN guardado en local. Se sincronizara al volver la red.'
            );
            onClose();
          } catch (error) {
            setLocalMessage(
              error instanceof Error ? error.message : 'No fue posible guardar LOVE ISDIN en local.'
            );
          }
        })();
      });
      return;
    }

    startTransition(() => {
      void formAction(formData);
    });
  };

  return (
    <>
    <form id="dermo-love-sheet-form" onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
      <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
      <input type="hidden" name="pdv_id" value={data.context.pdvId ?? ''} />
      <input type="hidden" name="asistencia_id" value={data.context.attendanceId ?? ''} />

      <div className="space-y-4">
        <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-5 text-center shadow-[0_16px_40px_rgba(244,114,182,0.14)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">
            LOVE ISDIN
          </p>
          <div className="mt-4 flex justify-center">
            {data.loveQr?.imageUrl ? (
              <img
                src={data.loveQr.imageUrl}
                alt="QR personal LOVE ISDIN"
                className="h-44 w-44 rounded-[24px] border border-rose-200 bg-white p-3"
              />
            ) : data.loveQr ? (
              <div className="flex h-44 w-44 flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-white px-4 text-center text-sm text-rose-700">
                <span className="font-semibold">QR oficial activo</span>
                <span className="mt-2 break-all">{data.loveQr.codigo}</span>
              </div>
            ) : (
              <div className="flex h-44 w-44 items-center justify-center rounded-[24px] border border-rose-200 bg-white text-sm text-rose-400">
                QR oficial no asignado
              </div>
            )}
          </div>
          <p className="mt-3 text-sm font-medium text-rose-700">QR oficial unico del dermoconsejero</p>
        </div>

        <SheetField label="Nombre del cliente">
          <input
            name="afiliado_nombre"
            placeholder="Nombre completo"
            className="mt-2 w-full rounded-[16px] border border-rose-200 bg-rose-50/40 px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
          />
        </SheetField>

        <SheetField label="Correo electronico">
          <input
            name="afiliado_contacto"
            type="email"
            placeholder="cliente@correo.com"
            className="mt-2 w-full rounded-[16px] border border-rose-200 bg-rose-50/40 px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
          />
        </SheetField>

        <div className="rounded-[20px] border border-rose-200 bg-white px-4 py-4">
          <label className="text-sm font-semibold text-slate-900" htmlFor="dermo-love-camera-input">
            Fotografia opcional
          </label>
          <p className="mt-1 text-sm text-slate-500">
            El sistema pondra la fecha y hora reales del registro.
          </p>
          <button
            type="button"
            onClick={() => setIsCameraDialogOpen(true)}
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Abrir camara
          </button>
          {selectedPhotoName && (
            <p className="mt-3 text-sm text-rose-700">Foto lista: {selectedPhotoName}</p>
          )}
        </div>

        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Registro rapido: el QR oficial se resuelve automaticamente desde la asignacion de la dermoconsejera.
          La afiliacion queda marcada por el PDV real del dia operativo y respeta la ventana digital local.
        </div>
      </div>

      {!canSubmit && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {!data.context.attendanceId || !data.reportWindow.canReportToday
            ? data.reportWindow.helper
            : !data.loveQr
              ? 'No tienes un QR oficial activo asignado. Pide apoyo a LOVE ISDIN para reasignarlo.'
              : 'Falta contexto operativo del PDV para registrar LOVE ISDIN desde el dashboard.'}
        </p>
      )}

      {state.message && !state.ok && (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {state.message}
        </p>
      )}
      {localMessage && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {localMessage}
        </p>
      )}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <SheetSubmitButton
          form="dermo-love-sheet-form"
          label={isUploadingR2 ? 'Subiendo evidencia...' : 'Guardar registro'}
          pendingLabel="Guardando..."
          disabled={!canSubmit || isPending || isUploadingR2}
          className="w-full bg-rose-500 text-white shadow-[0_14px_28px_rgba(244,114,182,0.28)] hover:bg-rose-600"
        />
        {isUploadingR2 && (
          <p className="mt-2 text-center text-xs text-rose-600">Subiendo fotografia a la nube...</p>
        )}
      </div>
    </form>
      <NativeCameraSelfieDialog
        open={isCameraDialogOpen}
        title="Fotografia LOVE ISDIN"
        description="Toma la fotografia opcional desde la camara del dispositivo."
        facingMode="environment"
        captureLabel="Capturar fotografia"
        onClose={() => setIsCameraDialogOpen(false)}
        onCapture={async (file) => {
          setCameraPhotoFile(file);
          setSelectedPhotoName(file.name);
        }}
      />
    </>
  );
}

function DermoSolicitudSheet({
  data,
  tipo,
  requesterRole = 'DERMOCONSEJERO',
  onClose,
  onSuccess,
}: {
  data: Pick<DashboardDermoconsejoData, 'context' | 'requestStatus' | 'vacationPolicy'>;
  tipo:
    | 'incapacidad'
    | 'vacaciones'
    | 'permiso'
    | 'aviso-inasistencia'
    | 'justificacion-faltas';
  requesterRole?: 'DERMOCONSEJERO' | 'SUPERVISOR';
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, formAction] = useActionState(registrarSolicitudOperativa, ESTADO_SOLICITUD_INICIAL);
  const [isPending, startTransition] = useTransition();
  const resolvedTipo =
    tipo === 'incapacidad'
      ? 'INCAPACIDAD'
      : tipo === 'vacaciones'
        ? 'VACACIONES'
        : tipo === 'aviso-inasistencia'
          ? 'AVISO_INASISTENCIA'
          : tipo === 'justificacion-faltas'
            ? 'JUSTIFICACION_FALTA'
            : 'PERMISO';
  const canSubmit = Boolean(data.context.cuentaClienteId);
  const isIncapacidad = tipo === 'incapacidad';
  const isAvisoInasistencia = tipo === 'aviso-inasistencia';
  const isJustificacionFalta = tipo === 'justificacion-faltas';
  const isVacaciones = tipo === 'vacaciones';
  const vacationMinDate = new Intl.DateTimeFormat('en-CA').format(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );
  const [showRequestStatus, setShowRequestStatus] = useState(false);
  const [incapacidadClase, setIncapacidadClase] = useState<'INICIAL' | 'SUBSECUENTE'>('INICIAL');
  const [selectedGalleryFile, setSelectedGalleryFile] = useState<string | null>(null);
  const [selectedCameraFile, setSelectedCameraFile] = useState<string | null>(null);
  const [cameraEvidenceFile, setCameraEvidenceFile] = useState<File | null>(null);
  const [evidencePromptOpen, setEvidencePromptOpen] = useState(false);
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const requestStatusItems = useMemo(
    () => data.requestStatus.filter((item) => item.tipo === resolvedTipo),
    [data.requestStatus, resolvedTipo]
  );

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    setIncapacidadClase('INICIAL');
    setSelectedGalleryFile(null);
    setSelectedCameraFile(null);
    setCameraEvidenceFile(null);
    setEvidencePromptOpen(false);
    setShowRequestStatus(false);
    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    formData.delete('justificante_camera');

    if (cameraEvidenceFile) {
      formData.append('justificante_camera', cameraEvidenceFile);
    }

    const justificante =
      cameraEvidenceFile ??
      ((formData.get('justificante') instanceof File && (formData.get('justificante') as File).size > 0)
        ? (formData.get('justificante') as File)
        : null);

    if (justificante) {
      try {
        await injectDirectR2Upload(formData, justificante, {
          modulo: 'solicitudes',
          removeFieldName: cameraEvidenceFile ? 'justificante_camera' : 'justificante',
        });
      } catch (error) {
        console.error('No fue posible subir el justificante a R2.', error);
      }
    }

    startTransition(() => {
      void formAction(formData);
    });
  };

  return (
    <>
    <form id={`dermo-solicitud-${tipo}-form`} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
      <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
      <input
        type="hidden"
        name="supervisor_empleado_id"
        value={data.context.supervisorEmpleadoId ?? ''}
      />
      <input type="hidden" name="tipo" value={resolvedTipo} />
      {isIncapacidad && <input type="hidden" name="incapacidad_clase" value={incapacidadClase} />}

      <div className="grid gap-4">
        {isVacaciones && data.vacationPolicy && (
          <div className="space-y-3 rounded-[20px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-950">Saldo anual</p>
                <p className="mt-1 text-sm text-emerald-800">
                  {data.vacationPolicy.annualUsedDays} dias usados / {data.vacationPolicy.annualAvailableDays} disponibles
                </p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                Dias totales del año: {data.vacationPolicy.annualDays}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <VacationBucketCard
                title="Primer semestre"
                tone="emerald"
                bucket={data.vacationPolicy.firstSemester}
              />
              <VacationBucketCard
                title="Segundo semestre"
                tone="slate"
                bucket={data.vacationPolicy.secondSemester}
              />
            </div>

            {!data.vacationPolicy.eligible ? (
              <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Tus vacaciones se habilitan al cumplir el año. Proxima fecha: {formatVacationDateLabel(data.vacationPolicy.nextUnlockDate)}.
              </div>
            ) : data.vacationPolicy.currentSemester === 'PRIMER_SEMESTRE' ? (
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                El segundo semestre sigue bloqueado hasta {formatVacationDateLabel(data.vacationPolicy.nextUnlockDate)}. Los dias no usados del primer semestre caducan y no se acumulan.
              </div>
            ) : (
              <div className="rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Ya estas en el segundo semestre del ciclo anual. Solo se pueden usar los 6 dias de esta bolsa; los del primer semestre no se transfieren.
              </div>
            )}

            {requesterRole === 'SUPERVISOR' && (
              <VacationTeamLoadList weeks={data.vacationPolicy.teamWeeklyLoad} />
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-surface-subtle px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Estatus de solicitudes</p>
            <p className="text-sm text-slate-500">
              Revisa tus{' '}
              {tipo === 'incapacidad'
                ? 'incapacidades'
                : tipo === 'vacaciones'
                  ? 'vacaciones'
                  : tipo === 'aviso-inasistencia'
                    ? 'avisos de inasistencia'
                    : tipo === 'justificacion-faltas'
                      ? 'justificaciones de faltas'
                      : 'cumpleanos'}{' '}
              enviados.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setShowRequestStatus((current) => !current)}
          >
            {showRequestStatus ? 'Ocultar' : 'Ver estatus'}
          </Button>
        </div>

        {showRequestStatus && (
          <div className="space-y-3 rounded-[18px] border border-border bg-white p-4">
            {requestStatusItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                Todavia no has enviado solicitudes de este tipo.
              </p>
            ) : (
              requestStatusItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[16px] border border-border bg-surface-subtle px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatDateLabel(item.fechaInicio)} al {formatDateLabel(item.fechaFin)}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getSolicitudStatusTone(item.estatus)}`}
                    >
                      {formatSolicitudStatusLabel(item.estatus)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.motivo ?? item.comentarios ?? 'Sin detalle adicional.'}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {isIncapacidad && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                value: 'INICIAL' as const,
                title: 'Incapacidad inicial',
                helper: 'Primer folio o primer certificado del bloque.',
              },
              {
                value: 'SUBSECUENTE' as const,
                title: 'Incapacidad subsecuente',
                helper: 'Continuacion del mismo proceso medico.',
              },
            ].map((item) => {
              const active = incapacidadClase === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setIncapacidadClase(item.value)}
                  className={`rounded-[18px] border px-4 py-4 text-left transition ${
                    active
                      ? 'border-rose-300 bg-rose-50 shadow-[0_10px_24px_rgba(244,114,182,0.14)]'
                      : 'border-border bg-surface-subtle'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.helper}</p>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SheetField label="Fecha inicio">
            <input
              name="fecha_inicio"
              type="date"
              defaultValue={isVacaciones ? vacationMinDate : getLocalDateValue()}
              min={isVacaciones ? vacationMinDate : undefined}
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            />
          </SheetField>
          <SheetField label="Fecha fin">
            <input
              name="fecha_fin"
              type="date"
              defaultValue={isVacaciones ? vacationMinDate : getLocalDateValue()}
              min={isVacaciones ? vacationMinDate : undefined}
              readOnly={isAvisoInasistencia || isJustificacionFalta}
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            />
          </SheetField>
        </div>

        <SheetField
          label={
            isIncapacidad
              ? 'Solicitud'
              : isAvisoInasistencia
                ? 'Motivo del aviso'
                : isJustificacionFalta
                  ? 'Motivo de la justificacion'
                  : 'Motivo'
          }
        >
          <textarea
            name={isIncapacidad ? 'comentarios' : 'motivo'}
            rows={3}
            required={isIncapacidad || isAvisoInasistencia || isJustificacionFalta}
            placeholder={
              isIncapacidad
                ? 'Escribe tu solicitud breve para supervision y reclutamiento.'
                : isAvisoInasistencia
                  ? 'Explica por que no podras asistir a la sucursal este dia.'
                  : isJustificacionFalta
                    ? 'Explica la falta que deseas justificar.'
                    : 'Describe brevemente la solicitud'
            }
            className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
        </SheetField>

        {isIncapacidad ? (
          <>
            <SheetField label="Motivo">
              <input
                name="motivo"
                required
                placeholder="Ej. enfermedad general, accidente, control medico"
                className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
              />
            </SheetField>

            <SheetField label="Evidencia">
              <div className="mt-2 rounded-[16px] border border-rose-200 bg-rose-50 p-3">
                <input
                  ref={galleryInputRef}
                  id="dermo-incapacidad-gallery-input"
                  name="justificante"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    setSelectedGalleryFile(event.currentTarget.files?.[0]?.name ?? null);
                    setCameraEvidenceFile(null);
                    setSelectedCameraFile(null);
                  }}
                />

                {!evidencePromptOpen ? (
                  <button
                    type="button"
                    onClick={() => setEvidencePromptOpen(true)}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Agregar evidencia
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-rose-900">
                      Quieres agregar un documento de tu galeria o quieres abrir tu camara?
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label
                        htmlFor="dermo-incapacidad-gallery-input"
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Galeria
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCameraDialogOpen(true)}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Camara
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-sm text-slate-600">
                  {selectedCameraFile ??
                    selectedGalleryFile ??
                    'Adjunta el documento medico para que supervision, reclutamiento y nomina lo revisen.'}
                </p>
              </div>
            </SheetField>

            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {requesterRole === 'SUPERVISOR'
                ? 'Se enviara a reclutamiento para revision documental y despues a nomina para formalizacion.'
                : 'Primero la valida supervision, despues la revisa reclutamiento y finalmente la formaliza nomina.'}
            </div>
          </>
        ) : isAvisoInasistencia ? (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            La falta por enfermedad solo sera justificable despues si hoy registras este aviso de inasistencia para la misma fecha.
          </div>
        ) : isJustificacionFalta ? (
          <>
            <SheetField label="Receta del IMSS">
              <input
                name="justificante"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </SheetField>

            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              Solo se puede justificar una falta que ya haya sido avisada previamente y que tenga receta del IMSS adjunta.
            </div>
          </>
        ) : (
          <>
            {isVacaciones && (
              <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                La solicitud requiere 30 dias naturales de anticipacion y la aprueba Coordinacion. Supervision solo recibe aviso para ajustar cobertura.
              </div>
            )}
            <SheetField label="Comentarios">
              <textarea
                name="comentarios"
                rows={3}
                placeholder="Detalle adicional para supervisor o nomina"
                className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              />
            </SheetField>

            <SheetField label="Justificante">
              <input
                name="justificante"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </SheetField>
          </>
        )}
      </div>

      {!canSubmit && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta una cuenta cliente operativa para registrar la solicitud.
        </p>
      )}

      {state.message && !state.ok && (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {state.message}
        </p>
      )}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <SheetSubmitButton
          form={`dermo-solicitud-${tipo}-form`}
          label="Enviar solicitud"
          pendingLabel="Enviando..."
          disabled={!canSubmit || isPending}
        />
      </div>
    </form>
      <NativeCameraSelfieDialog
        open={isCameraDialogOpen}
        title="Fotografia de incapacidad"
        description="Captura el documento medico desde la camara del dispositivo."
        facingMode="environment"
        captureLabel="Capturar documento"
        onClose={() => setIsCameraDialogOpen(false)}
        onCapture={async (file) => {
          if (galleryInputRef.current) {
            galleryInputRef.current.value = '';
          }
          setCameraEvidenceFile(file);
          setSelectedCameraFile(file.name);
          setSelectedGalleryFile(null);
          setIsCameraDialogOpen(false);
        }}
      />
    </>
  );
}

function formatSolicitudStatusLabel(status: string) {
  switch (status) {
    case 'ENVIADA':
      return 'Enviada';
    case 'CORRECCION_SOLICITADA':
      return 'Correccion solicitada';
    case 'VALIDADA_SUP':
      return 'Validada';
    case 'REGISTRADA_RH':
    case 'REGISTRADA':
      return 'Aprobada';
    case 'RECHAZADA':
      return 'Rechazada';
    case 'BORRADOR':
      return 'Borrador';
    default:
      return status.replaceAll('_', ' ');
  }
}

function getSolicitudStatusTone(status: string) {
  switch (status) {
    case 'REGISTRADA_RH':
    case 'REGISTRADA':
      return 'bg-emerald-100 text-emerald-700';
    case 'RECHAZADA':
      return 'bg-rose-100 text-rose-700';
    case 'CORRECCION_SOLICITADA':
      return 'bg-amber-100 text-amber-700';
    case 'VALIDADA_SUP':
      return 'bg-sky-100 text-sky-700';
    case 'BORRADOR':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

function formatRemainingMinutes(totalMinutes: number | null) {
  if (totalMinutes === null) {
    return 'Sin tiempo visible';
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }

  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatVacationDateLabel(value: string | null) {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function VacationBucketCard({
  title,
  tone,
  bucket,
}: {
  title: string;
  tone: 'emerald' | 'slate';
  bucket: DashboardVacationPolicySummary['firstSemester'];
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : 'border-slate-200 bg-slate-50 text-slate-900';

  if (!bucket) {
    return (
      <div className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm opacity-80">No hay periodo habilitado todavia.</p>
      </div>
    );
  }

  const usedPct = bucket.totalDays > 0 ? Math.min(100, Math.round((bucket.usedDays / bucket.totalDays) * 100)) : 0;

  return (
    <div className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold">
          {bucket.unlocked ? 'Activo' : 'Bloqueado'}
        </span>
      </div>
      <p className="mt-2 text-sm">
        {bucket.usedDays} usados / {bucket.availableDays} disponibles
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
        <div
          className="h-full rounded-full bg-current transition-all"
          style={{ width: `${Math.max(8, usedPct)}%` }}
        />
      </div>
      <p className="mt-3 text-xs opacity-80">
        {formatVacationDateLabel(bucket.availableFrom)} al {formatVacationDateLabel(bucket.availableUntil)}
      </p>
    </div>
  );
}

function VacationTeamLoadList({ weeks }: { weeks: DashboardVacationPolicySummary['teamWeeklyLoad'] }) {
  if (weeks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-[18px] border border-sky-200 bg-sky-50 p-4">
      <div>
        <p className="text-sm font-semibold text-sky-950">Mapa semanal del equipo</p>
        <p className="mt-1 text-xs text-sky-700">
          Maximo 2 personas de vacaciones por semana en tu equipo.
        </p>
      </div>
      <div className="space-y-2">
        {weeks.map((week) => {
          const fillPct = week.limit > 0 ? Math.min(100, Math.round((week.absentCount / week.limit) * 100)) : 0;
          return (
            <div key={week.weekStart} className="rounded-[14px] border border-white/70 bg-white/70 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-900">
                  {formatVacationDateLabel(week.weekStart)} al {formatVacationDateLabel(week.weekEnd)}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    week.blocked ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {week.absentCount}/{week.limit}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${week.blocked ? 'bg-rose-500' : 'bg-sky-500'}`}
                  style={{ width: `${Math.max(6, fillPct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DermoIncidenciasSheet({
  data,
  onClose,
  onSuccess,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [incidenciaState, incidenciaAction] = useActionState(
    registrarIncidenciaOperativa,
    ESTADO_MENSAJE_INICIAL
  );
  const [solicitudState, solicitudAction] = useActionState(
    registrarSolicitudOperativa,
    ESTADO_SOLICITUD_INICIAL
  );
  const [extemporaneoState, extemporaneoAction] = useActionState(
    registrarRegistroExtemporaneo,
    ESTADO_SOLICITUD_INICIAL
  );
  const [tipo, setTipo] = useState<
    'RETARDO' | 'NO_LLEGARE' | 'DESABASTO' | 'AVISO_INASISTENCIA' | 'REGISTRO_EXTEMPORANEO'
  >('RETARDO');
  const [detalle, setDetalle] = useState('');
  const [fechaAviso, setFechaAviso] = useState(getLocalDateValue());
  const [fechaRegularizar, setFechaRegularizar] = useState(getPreviousDateValue());
  const [tipoRegistroExtemporaneo, setTipoRegistroExtemporaneo] = useState<
    'VENTA' | 'LOVE_ISDIN' | 'AMBAS'
  >('VENTA');
  const [productoIdExtemporaneo, setProductoIdExtemporaneo] = useState(
    data.catalogoProductos[0]?.id ?? ''
  );
  const [unidadesExtemporaneo, setUnidadesExtemporaneo] = useState('1');
  const [loveNombreExtemporaneo, setLoveNombreExtemporaneo] = useState('');
  const [loveContactoExtemporaneo, setLoveContactoExtemporaneo] = useState('');
  const [loveTicketExtemporaneo, setLoveTicketExtemporaneo] = useState('');
  const [lastSubmittedType, setLastSubmittedType] = useState<
    'RETARDO' | 'NO_LLEGARE' | 'DESABASTO' | 'AVISO_INASISTENCIA' | 'REGISTRO_EXTEMPORANEO' | null
  >(null);
  const canSubmitStandard = Boolean(data.context.cuentaClienteId && data.context.supervisorEmpleadoId);
  const canSubmitExtemporaneo = Boolean(data.context.cuentaClienteId);
  const isAvisoInasistencia = tipo === 'AVISO_INASISTENCIA';
  const isExtemporaneo = tipo === 'REGISTRO_EXTEMPORANEO';
  const requiereVenta = tipoRegistroExtemporaneo === 'VENTA' || tipoRegistroExtemporaneo === 'AMBAS';
  const requiereLove = tipoRegistroExtemporaneo === 'LOVE_ISDIN' || tipoRegistroExtemporaneo === 'AMBAS';
  const activeState = isExtemporaneo ? extemporaneoState : isAvisoInasistencia ? solicitudState : incidenciaState;

  useEffect(() => {
    if (
      lastSubmittedType &&
      !['AVISO_INASISTENCIA', 'REGISTRO_EXTEMPORANEO'].includes(lastSubmittedType) &&
      incidenciaState.ok &&
      incidenciaState.message
    ) {
      setDetalle('');
      setFechaAviso(getLocalDateValue());
      setTipo('RETARDO');
      setLastSubmittedType(null);
      onSuccess(incidenciaState.message);
      onClose();
    }
  }, [incidenciaState.message, incidenciaState.ok, lastSubmittedType, onClose, onSuccess]);

  useEffect(() => {
    if (
      lastSubmittedType === 'AVISO_INASISTENCIA' &&
      solicitudState.ok &&
      solicitudState.message
    ) {
      setDetalle('');
      setFechaAviso(getLocalDateValue());
      setTipo('RETARDO');
      setLastSubmittedType(null);
      onSuccess(solicitudState.message);
      onClose();
    }
  }, [lastSubmittedType, onClose, onSuccess, solicitudState.message, solicitudState.ok]);

  useEffect(() => {
    if (
      lastSubmittedType === 'REGISTRO_EXTEMPORANEO' &&
      extemporaneoState.ok &&
      extemporaneoState.message
    ) {
      setDetalle('');
      setFechaRegularizar(getPreviousDateValue());
      setTipoRegistroExtemporaneo('VENTA');
      setProductoIdExtemporaneo(data.catalogoProductos[0]?.id ?? '');
      setUnidadesExtemporaneo('1');
      setLoveNombreExtemporaneo('');
      setLoveContactoExtemporaneo('');
      setLoveTicketExtemporaneo('');
      setTipo('RETARDO');
      setLastSubmittedType(null);
      onSuccess(extemporaneoState.message);
      onClose();
    }
  }, [
    data.catalogoProductos,
    extemporaneoState.message,
    extemporaneoState.ok,
    lastSubmittedType,
    onClose,
    onSuccess,
  ]);

  const optionCards: Array<{
    value: 'RETARDO' | 'NO_LLEGARE' | 'DESABASTO' | 'AVISO_INASISTENCIA' | 'REGISTRO_EXTEMPORANEO';
    title: string;
    helper: string;
  }> = [
    {
      value: 'RETARDO',
      title: 'Retardo',
      helper: 'Avisa que llegaras tarde por un incidente.',
    },
    {
      value: 'NO_LLEGARE',
      title: 'No llegare',
      helper: 'Reporta que no podras llegar a la sucursal.',
    },
    {
      value: 'DESABASTO',
      title: 'Desabasto',
      helper: 'Indica quiebre o falta de producto en PDV.',
    },
    {
      value: 'AVISO_INASISTENCIA',
      title: 'Avisar inasistencia',
      helper: 'Registra el aviso previo que despues habilita la justificacion de falta.',
    },

  ];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLastSubmittedType(tipo);

    const formData = new FormData(event.currentTarget);
    if (tipo === 'REGISTRO_EXTEMPORANEO') {
      const evidencia = formData.get('evidencia');
      if (evidencia instanceof File && evidencia.size > 0) {
        try {
          await injectDirectR2Upload(formData, evidencia, {
            modulo: 'registros_extemporaneos',
            removeFieldName: 'evidencia',
          });
        } catch (error) {
          console.error('No fue posible subir la evidencia extemporánea a R2.', error);
        }
      }
    }

    const submitAction = (
      isExtemporaneo ? extemporaneoAction : isAvisoInasistencia ? solicitudAction : incidenciaAction
    ) as unknown as (payload: FormData) => void;
    submitAction(formData);
  };

  return (
    <form
      id="dermo-incidencias-sheet-form"
      action={isExtemporaneo ? extemporaneoAction : isAvisoInasistencia ? solicitudAction : incidenciaAction}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
      <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
      <input
        type="hidden"
        name="supervisor_empleado_id"
        value={data.context.supervisorEmpleadoId ?? ''}
      />
      <input type="hidden" name="pdv_id" value={data.context.pdvId ?? ''} />
      <input type="hidden" name="pdv_nombre" value={data.store.nombre} />
      {isExtemporaneo ? (
        <input type="hidden" name="tipo_registro" value={tipoRegistroExtemporaneo} />
      ) : isAvisoInasistencia ? (
        <>
          <input type="hidden" name="tipo" value="AVISO_INASISTENCIA" />
          <input type="hidden" name="fecha_inicio" value={fechaAviso} />
          <input type="hidden" name="fecha_fin" value={fechaAviso} />
        </>
      ) : (
        <input type="hidden" name="incidencia_tipo" value={tipo} />
      )}

      <div className="grid gap-3">
        {optionCards.map((item) => {
          const active = item.value === tipo;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTipo(item.value)}
              className={`rounded-[18px] border px-4 py-4 text-left transition ${
                active
                  ? 'border-amber-300 bg-amber-50 shadow-[0_10px_24px_rgba(245,158,11,0.14)]'
                  : 'border-border bg-surface-subtle'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[14px] ${
                    active ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'
                  }`}
                >
                  <ActionIconGlyph icon="warning" accent="amber" small />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.helper}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {isExtemporaneo ? (
        <>
          <SheetField label="Fecha a regularizar">
            <input
              type="date"
              name="fecha_operativa"
              value={fechaRegularizar}
              onChange={(event) => setFechaRegularizar(event.target.value)}
              max={getPreviousDateValue()}
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
              required
            />
          </SheetField>

          <SheetField label="Tipo de registro">
            <select
              value={tipoRegistroExtemporaneo}
              onChange={(event) =>
                setTipoRegistroExtemporaneo(event.target.value as 'VENTA' | 'LOVE_ISDIN' | 'AMBAS')
              }
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
            >
              <option value="VENTA">Venta</option>
              <option value="LOVE_ISDIN">LOVE ISDIN</option>
              <option value="AMBAS">Ambas</option>
            </select>
          </SheetField>

          {requiereVenta && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SheetField label="Producto">
                <select
                  name="producto_id"
                  value={productoIdExtemporaneo}
                  onChange={(event) => setProductoIdExtemporaneo(event.target.value)}
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  required={requiereVenta}
                >
                  <option value="">Selecciona un producto</option>
                  {data.catalogoProductos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombreCorto}
                    </option>
                  ))}
                </select>
              </SheetField>
              <SheetField label="Unidades">
                <input
                  name="venta_total_unidades"
                  type="number"
                  min="1"
                  value={unidadesExtemporaneo}
                  onChange={(event) => setUnidadesExtemporaneo(event.target.value)}
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  required={requiereVenta}
                />
              </SheetField>
            </div>
          )}

          {requiereLove && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SheetField label="Nombre del cliente">
                <input
                  name="love_afiliado_nombre"
                  value={loveNombreExtemporaneo}
                  onChange={(event) => setLoveNombreExtemporaneo(event.target.value)}
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  placeholder="Nombre completo"
                  required={requiereLove}
                />
              </SheetField>
              <SheetField label="Correo o contacto">
                <input
                  name="love_afiliado_contacto"
                  value={loveContactoExtemporaneo}
                  onChange={(event) => setLoveContactoExtemporaneo(event.target.value)}
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  placeholder="correo@cliente.com"
                />
              </SheetField>
              <SheetField label="Folio o ticket (opcional)">
                <input
                  name="love_ticket_folio"
                  value={loveTicketExtemporaneo}
                  onChange={(event) => setLoveTicketExtemporaneo(event.target.value)}
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  placeholder="Folio de apoyo"
                />
              </SheetField>
            </div>
          )}

          <SheetField label="Justificacion obligatoria">
            <textarea
              name="motivo"
              rows={3}
              value={detalle}
              onChange={(event) => setDetalle(event.target.value)}
              placeholder="Explica por que no pudiste registrar dentro de la ventana estandar."
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
              required
            />
          </SheetField>

          <SheetField label="Evidencia opcional">
            <input
              name="evidencia"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-[14px] file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </SheetField>

          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Tu supervisor revisara esta solicitud antes de consolidarla. Solo se aceptan dias con asignacion valida y check-in real.
          </div>
        </>
      ) : isAvisoInasistencia ? (
        <>
          <SheetField label="Dia de la falta avisada">
            <input
              type="date"
              name="fecha_aviso_ui"
              value={fechaAviso}
              onChange={(event) => setFechaAviso(event.target.value)}
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
              required
            />
          </SheetField>

          <SheetField label="Motivo">
            <textarea
              name="motivo"
              rows={3}
              value={detalle}
              onChange={(event) => setDetalle(event.target.value)}
              placeholder="Explica por que no podras asistir para que quede el aviso previo."
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
              required
            />
          </SheetField>

          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Este aviso previo queda ligado a la fecha de la falta y es el requisito para poder
            justificarla despues con receta del IMSS.
          </div>
        </>
      ) : (
        <>
          <SheetField label="Detalle breve">
            <textarea
              name="detalle"
              rows={3}
              value={detalle}
              onChange={(event) => setDetalle(event.target.value)}
              placeholder="Escribe solo lo necesario para que tu supervisor actue rapido."
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
            />
          </SheetField>

          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Se enviara a tu supervisor con la sucursal y el momento real del registro.
          </div>
        </>
      )}

      {!isExtemporaneo && !canSubmitStandard && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Necesitas una asignacion con supervisor para registrar incidencias desde este panel.
        </p>
      )}

      {isExtemporaneo && !canSubmitExtemporaneo && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta una cuenta operativa valida para solicitar el registro extemporaneo.
        </p>
      )}

      {activeState.message && !activeState.ok && (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {activeState.message}
        </p>
      )}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <SheetSubmitButton
          form="dermo-incidencias-sheet-form"
          label={
            isExtemporaneo
              ? 'Enviar a aprobacion'
              : isAvisoInasistencia
                ? 'Enviar aviso previo'
                : 'Enviar incidencia'
          }
          pendingLabel="Enviando..."
          disabled={isExtemporaneo ? !canSubmitExtemporaneo : !canSubmitStandard}
          className="w-full bg-amber-500 text-white shadow-[0_14px_28px_rgba(245,158,11,0.24)] hover:bg-amber-600"
        />
      </div>
    </form>
  );
}

function DermoComunicacionSheet({
  data,
  onClose,
  onSuccess,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    enviarMensajeSoporteDermoconsejo,
    ESTADO_MENSAJE_INICIAL
  );
  const [categoria, setCategoria] = useState<
    'FALLA_APP' | 'BONO' | 'NOMINA' | 'RECIBO_NOMINA' | 'OTRO'
  >('FALLA_APP');
  const canSubmit = Boolean(data.context.cuentaClienteId);

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    setCategoria('FALLA_APP');
    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  const optionCards: Array<{
    value: 'FALLA_APP' | 'BONO' | 'NOMINA' | 'RECIBO_NOMINA' | 'OTRO';
    title: string;
    helper: string;
  }> = [
    {
      value: 'FALLA_APP',
      title: 'Falla en la app',
      helper: 'Reporta errores, bloqueos o algo que no funcione dentro de la aplicacion.',
    },
    {
      value: 'BONO',
      title: 'Bono no recibido',
      helper: 'Avisa que no te depositaron o no se reflejo tu bono.',
    },
    {
      value: 'NOMINA',
      title: 'Nomina no recibida',
      helper: 'Escala que tu nomina no cayo en tiempo o no se refleja.',
    },
    {
      value: 'RECIBO_NOMINA',
      title: 'Recibo pendiente',
      helper: 'Reporta que tu recibo de nomina todavia no llega.',
    },
    {
      value: 'OTRO',
      title: 'Otro caso',
      helper: 'Usa esta opcion para cualquier situacion operativa o administrativa.',
    },
  ];

  return (
    <form id="dermo-comunicacion-sheet-form" action={formAction} className="space-y-4">
      <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
      <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
      <input type="hidden" name="pdv_id" value={data.context.pdvId ?? ''} />
      <input type="hidden" name="pdv_nombre" value={data.store.nombre} />
      <input type="hidden" name="categoria" value={categoria} />

      <div className="grid gap-3">
        {optionCards.map((item) => {
          const active = item.value === categoria;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategoria(item.value)}
              className={`rounded-[18px] border px-4 py-4 text-left transition ${
                active
                  ? 'border-amber-300 bg-amber-50 shadow-[0_10px_24px_rgba(245,158,11,0.12)]'
                  : 'border-border bg-surface-subtle'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[14px] ${
                    active ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'
                  }`}
                >
                  <ActionIconGlyph icon="mail" accent="amber" small />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.helper}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <SheetField label="Mensaje">
        <textarea
          name="detalle"
          rows={4}
          required
          placeholder="Explica brevemente lo que esta pasando para que Coordinacion pueda ayudarte rapido."
          className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
        />
      </SheetField>

      <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Este mensaje se enviara directo a Coordinacion y se copiara a Administracion para trazabilidad.
      </div>

      {!canSubmit && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta una cuenta cliente operativa para enviar el reporte.
        </p>
      )}

      {state.message && !state.ok && (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {state.message}
        </p>
      )}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <SheetSubmitButton
          form="dermo-comunicacion-sheet-form"
          label="Enviar mensaje"
          pendingLabel="Enviando..."
          disabled={!canSubmit}
          className="w-full bg-amber-500 text-white shadow-[0_14px_28px_rgba(245,158,11,0.2)] hover:bg-amber-600"
        />
      </div>
    </form>
  );
}

function DermoPlaceholderSheet({
  title,
  copy,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  copy: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] p-4">
        <p className="text-base font-semibold text-slate-950">{title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
      </div>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--module-text)] shadow-sm"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

function DermoPerfilSheet({
  data,
  onClose,
  onSuccess,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    solicitarCorreccionPerfilDermoconsejo,
    ESTADO_MENSAJE_INICIAL
  );
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionField, setCorrectionField] = useState<
    'CORREO_ELECTRONICO' | 'TELEFONO' | 'DOMICILIO_COMPLETO'
  >('CORREO_ELECTRONICO');
  const [isUploadingR2, setIsUploadingR2] = useState(false);
  const profileRows = [
    { label: 'Nombre', value: data.profile.nombreCompleto },
    { label: 'Rol', value: data.profile.puesto },
    { label: 'Usuario', value: data.profile.username ?? 'Sin usuario visible' },
    { label: 'Correo', value: data.profile.correoElectronico ?? 'Sin correo visible' },
    { label: 'Telefono', value: data.profile.telefono ?? 'Sin telefono visible' },
    { label: 'Zona', value: data.profile.zona ?? 'Sin zona asignada' },
    { label: 'Supervisor', value: data.profile.supervisorNombre ?? 'Sin supervisor visible' },
    { label: 'Sucursal', value: data.profile.tiendaActual },
  ];
  const currentValue =
    correctionField === 'CORREO_ELECTRONICO'
      ? data.profile.correoElectronico ?? 'Sin correo visible'
      : correctionField === 'TELEFONO'
        ? data.profile.telefono ?? 'Sin telefono visible'
        : data.store.direccion ?? 'Sin domicilio visible';
  const evidenceRequired = correctionField !== 'CORREO_ELECTRONICO';

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    setShowCorrectionForm(false);
    setCorrectionField('CORREO_ELECTRONICO');
    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  const handleCorrectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const evidence = formData.get('evidencia');

    if (evidence instanceof File && evidence.size > 0) {
      setIsUploadingR2(true);
      try {
        await injectDirectR2Manifest(formData, [evidence], {
          modulo: 'correccion_perfil_dermoconsejo',
          removeFieldName: 'evidencia',
          manifestFieldName: 'evidencia_r2_manifest',
        });
      } catch (error) {
        console.error('No fue posible subir la evidencia de correccion de perfil a R2.', error);
      } finally {
        setIsUploadingR2(false);
      }
    }

    formAction(formData);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-start">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Atras
        </Button>
      </div>
      <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-950">Perfil operativo</p>
        <p className="mt-1 text-sm text-slate-600">
          Tu informacion base para jornada, mensajes y soporte administrativo.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {profileRows.map((item) => (
          <div key={item.label} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      {data.activeFormation && (
        <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">Formacion activa</p>
          <p className="mt-1 text-sm text-slate-600">
            {data.activeFormation.nombre} · {data.activeFormation.tipo ?? 'Formacion'}
          </p>
          <p className="mt-2 text-xs text-sky-700">
            {data.activeFormation.sede
              ? `${data.activeFormation.sede} · ${formatDateLabel(data.activeFormation.fechaInicio)}`
              : formatDateLabel(data.activeFormation.fechaInicio)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Este evento exime tu asistencia en tienda mientras este activo.
          </p>
          {data.activeFormation.locationAddress && (
            <p className="mt-2 text-xs text-sky-700">
              Sede operativa: {data.activeFormation.locationAddress}
              {data.activeFormation.modalidad === 'PRESENCIAL' &&
                data.activeFormation.locationLatitude !== null &&
                data.activeFormation.locationLongitude !== null &&
                ` · ${data.activeFormation.locationLatitude}, ${data.activeFormation.locationLongitude}`}
            </p>
          )}
        </div>
      )}

      <div className="rounded-[22px] border border-sky-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Correccion de datos</p>
            <p className="mt-1 text-sm text-slate-600">
              Solicita correccion de correo, telefono o domicilio desde esta misma vista.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setShowCorrectionForm((current) => !current)}
          >
            {showCorrectionForm ? 'Ocultar' : 'Solicitar correccion'}
          </Button>
        </div>

        {showCorrectionForm && (
          <form
            id="dermo-profile-correction-form"
            action={formAction}
            onSubmit={handleCorrectionSubmit}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
            <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
            <input type="hidden" name="campo" value={correctionField} />
            <input type="hidden" name="valor_actual" value={currentValue} />

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  value: 'CORREO_ELECTRONICO' as const,
                  title: 'Correo',
                  helper: 'Te enviaremos verificacion al nuevo correo.',
                },
                {
                  value: 'TELEFONO' as const,
                  title: 'Telefono',
                  helper: 'Adjunta evidencia si cambias tu telefono.',
                },
                {
                  value: 'DOMICILIO_COMPLETO' as const,
                  title: 'Domicilio',
                  helper: 'Adjunta comprobante de domicilio actualizado.',
                },
              ].map((item) => {
                const active = correctionField === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCorrectionField(item.value)}
                    className={`rounded-[16px] border px-4 py-4 text-left transition ${
                      active
                        ? 'border-sky-300 bg-sky-50 shadow-[0_10px_24px_rgba(14,165,233,0.12)]'
                        : 'border-border bg-surface-subtle'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{item.helper}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Valor actual
              </p>
              <p className="mt-1 font-medium text-slate-950">{currentValue}</p>
            </div>

            <SheetField
              label={
                correctionField === 'CORREO_ELECTRONICO'
                  ? 'Nuevo correo electronico'
                  : correctionField === 'TELEFONO'
                    ? 'Nuevo telefono'
                    : 'Nuevo domicilio'
              }
            >
              {correctionField === 'DOMICILIO_COMPLETO' ? (
                <textarea
                  name="valor_nuevo"
                  rows={3}
                  required
                  placeholder="Escribe el domicilio completo corregido."
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
                />
              ) : (
                <input
                  name="valor_nuevo"
                  type={correctionField === 'CORREO_ELECTRONICO' ? 'email' : 'text'}
                  required
                  placeholder={
                    correctionField === 'CORREO_ELECTRONICO'
                      ? 'nuevo@correo.com'
                      : 'Ingresa el numero correcto'
                  }
                  className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
                />
              )}
            </SheetField>

            <SheetField label="Detalle">
              <textarea
                name="detalle"
                rows={3}
                placeholder="Explica brevemente la correccion que estas solicitando."
                className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </SheetField>

            <SheetField label={evidenceRequired ? 'Evidencia' : 'Verificacion de correo'}>
              {evidenceRequired ? (
                <input
                  name="evidencia"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                  className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
                />
              ) : (
                <div className="mt-2 rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Al enviar la solicitud te mandaremos la verificacion al nuevo correo para autenticarlo antes de la correccion administrativa.
                </div>
              )}
            </SheetField>

            {state.message && !state.ok && (
              <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {state.message}
              </p>
            )}

            <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
              <SheetSubmitButton
                form="dermo-profile-correction-form"
                label={isUploadingR2 ? 'Subiendo evidencia...' : 'Enviar solicitud'}
                pendingLabel="Enviando..."
                className="w-full"
                disabled={!data.context.cuentaClienteId || isUploadingR2}
              />
              {isUploadingR2 ? (
                <p className="mt-2 text-center text-xs text-sky-700">Subiendo evidencia a la nube...</p>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function NotificationCenterSheet({
  notifications,
  onOpenRoutePlanner,
}: {
  notifications: DashboardDermoconsejoNotificationsSummary;
  onOpenRoutePlanner?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Centro de notificaciones</p>
        <p className="mt-1 text-sm text-slate-600">
          Avisos breves y mensajes internos recientes. Puedes revisar y marcar su lectura desde aqui.
        </p>
      </div>

      {notifications.items.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No tienes notificaciones nuevas por ahora.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.items.map((item) => (
            <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{item.titulo}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                  {item.remitente && <p className="mt-1 text-xs text-slate-500">De: {item.remitente}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
                    item.estado === 'PENDIENTE'
                      ? 'bg-rose-100 text-rose-700'
                      : item.estado === 'LEIDO'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {item.estado === 'PENDIENTE'
                    ? 'Nueva'
                    : item.estado === 'LEIDO'
                      ? 'Leida'
                      : 'Respondida'}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.cuerpo}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.tipo === 'SISTEMA_RUTA' ? (
                  <Button type="button" variant="secondary" onClick={onOpenRoutePlanner}>
                    Abrir ruta semanal
                  </Button>
                ) : (
                  <>
                    <NotificacionReadButton receptorId={item.id} estado={item.estado} />
                    <Link
                      href="/mensajes"
                      className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                    >
                      Abrir mensaje
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificacionReadButton({
  receptorId,
  estado,
}: {
  receptorId: string;
  estado: DashboardDermoconsejoData['notifications']['items'][number]['estado'];
}) {
  const [state, formAction] = useActionState(marcarMensajeLeido, ESTADO_MENSAJE_INICIAL);

  if (estado !== 'PENDIENTE') {
    return (
      <span className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
        Leida
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="receptor_id" value={receptorId} />
      <NotificationReadSubmitButton />
      {state.message && !state.ok ? (
        <p className="mt-2 text-xs text-rose-600">{state.message}</p>
      ) : null}
    </form>
  );
}

function NotificationReadSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Marcando...' : 'Marcar como leida'}
    </button>
  );
}

function DermoCalendarioSheet({ data }: { data: DashboardDermoconsejoData }) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const days = view === 'week' ? data.calendar.week : data.calendar.month;

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-950">Tiendas asignadas</p>
        <p className="mt-1 text-sm text-slate-600">
          Consulta tu plan operativo de la siguiente semana o del siguiente mes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setView('week')}
          className={`min-h-11 rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
            view === 'week'
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => setView('month')}
          className={`min-h-11 rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
            view === 'month'
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          Mes
        </button>
      </div>

      <div className="space-y-3">
        {days.map((day) => (
          <div
            key={day.date}
            className={`rounded-[20px] border px-4 py-4 shadow-sm ${
              day.isToday ? 'border-sky-200 bg-sky-50/70' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {day.weekdayLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{day.shortLabel}</p>
              </div>
              {day.isToday && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold text-sky-700">
                  Hoy
                </span>
              )}
            </div>

            {day.assignments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sin tienda asignada.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {day.assignments.map((assignment) => (
                  <div
                    key={`${day.date}-${assignment.assignmentId}`}
                    className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{assignment.nombre}</p>
                      {assignment.claveBtl && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {assignment.claveBtl}
                        </span>
                      )}
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        {assignment.tipo}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {assignment.direccion ?? 'Direccion no visible'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{assignment.zona ?? 'Sin zona'}</span>
                      <span>·</span>
                      <span>{assignment.horario ?? 'Sin horario visible'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DermoCampanaSheet({
  data,
  onClose,
  onSuccess,
}: {
  data: DashboardDermoconsejoData;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    ejecutarTareasCampanaPdv,
    ESTADO_CAMPANA_ADMIN_INICIAL
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isUploadingR2, setIsUploadingR2] = useState(false);

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  const canSubmit = Boolean(data.shift.isOpen && data.context.attendanceId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const evidence = formData.get('evidencia');

    if (evidence instanceof File && evidence.size > 0) {
      setIsUploadingR2(true);
      try {
        await injectDirectR2Manifest(formData, [evidence], {
          modulo: 'campanas_evidencia',
          removeFieldName: 'evidencia',
          manifestFieldName: 'evidencia_r2_manifest',
        });
      } catch (error) {
        console.error('No fue posible subir la evidencia de campana a R2.', error);
      } finally {
        setIsUploadingR2(false);
      }
    }

    formAction(formData);
  };

  if (!data.activeCampaign) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No hay campana activa para esta sucursal en este momento.
      </div>
    );
  }

  return (
    <form id="dermo-campana-sheet-form" action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="campana_pdv_id" value={data.activeCampaign.campanaPdvId} />

      <div className="rounded-[22px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50 px-4 py-4 text-emerald-950">
        <p className="text-sm font-semibold text-slate-950">{data.activeCampaign.nombre}</p>
        <p className="mt-1 text-sm text-emerald-900">
          Carga la evidencia del dia para tu punto de venta actual y sigue el manual de mercadeo de la campaña.
        </p>
        <p className="mt-2 text-xs font-medium text-amber-800">
          Vigencia: {formatDateLabel(data.activeCampaign.fechaInicio)} a{' '}
          {formatDateLabel(data.activeCampaign.fechaFin)}
        </p>
        {data.activeCampaign.descripcion && (
          <p className="mt-3 text-sm text-emerald-900">{data.activeCampaign.descripcion}</p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] border border-emerald-100 bg-white/85 px-3 py-3 text-xs text-emerald-950 shadow-sm">
            <p className="font-semibold uppercase tracking-[0.14em] text-emerald-700">Productos foco</p>
            <div className="mt-2 space-y-1">
              {data.activeCampaign.productosFoco.length > 0 ? (
                data.activeCampaign.productosFoco.map((item) => <div key={item}>{item}</div>)
              ) : (
                <div>Sin productos foco configurados.</div>
              )}
            </div>
          </div>
          <div className="rounded-[16px] border border-amber-100 bg-white/85 px-3 py-3 text-xs text-emerald-950 shadow-sm">
            <p className="font-semibold uppercase tracking-[0.14em] text-amber-700">Auditoria</p>
            <div className="mt-2 space-y-1">
              {data.activeCampaign.evidenciasRequeridas.length > 0 ? (
                data.activeCampaign.evidenciasRequeridas.map((item) => <div key={item}>{item}</div>)
              ) : (
                <div>Sin evidencias adicionales.</div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-200 bg-white/90 px-3 py-1 text-xs font-medium text-amber-700">
            Cuota adicional: {formatCurrency(data.activeCampaign.cuotaAdicional)}
          </span>
          {data.activeCampaign.manualMercadeoUrl && (
            <a
              href={data.activeCampaign.manualMercadeoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              Abrir {data.activeCampaign.manualMercadeoNombre ?? 'manual de mercadeo'}
            </a>
          )}
        </div>
      </div>

      {data.activeCampaign.instrucciones && (
        <SheetField label="Instrucciones de campaña">
          <div className="mt-2 rounded-[16px] border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm text-slate-700">
            {data.activeCampaign.instrucciones}
          </div>
        </SheetField>
      )}

      {data.activeCampaign.evidenceTemplate.length > 0 && (
        <SheetField label="Tipo de evidencia">
          <select
            name="evidence_requirement_id"
            defaultValue=""
            className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">Selecciona la evidencia que vas a reportar</option>
            {data.activeCampaign.evidenceTemplate.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </SheetField>
      )}

      <SheetField label="Evidencia">
        <input
          type="file"
          name="evidencia"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)}
          className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        />
      </SheetField>

      {!canSubmit && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Primero necesitas una jornada activa en esta sucursal para registrar evidencia de campana.
        </p>
      )}

      {selectedFileName && (
        <p className="rounded-[18px] border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
          Archivo listo: {selectedFileName}
        </p>
      )}

      <SheetField label="Comentario breve">
        <textarea
          name="comentarios"
          rows={3}
          placeholder="Detalle opcional de la ejecucion o la evidencia."
          className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
        />
      </SheetField>

      {state.message && !state.ok && (
        <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.message}
        </p>
      )}

      <div className="grid gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit || isUploadingR2}
          className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
        >
          {isUploadingR2 ? 'Subiendo evidencia...' : 'Guardar evidencia'}
        </Button>
        {isUploadingR2 ? (
          <p className="text-center text-xs text-emerald-700">Subiendo evidencia a la nube...</p>
        ) : null}
      </div>
    </form>
  );
}

function SupervisorApprovalSheet({
  item,
  onClose,
  onResolved,
}: {
  item: DashboardPanelData['supervisorAuthorizations'][number];
  onClose: () => void;
  onResolved: (
    nextStatus: 'RECHAZADA' | 'VALIDADA_SUP' | 'REGISTRADA' | 'CORRECCION_SOLICITADA',
    message: string
  ) => void;
}) {
  const [state, formAction] = useActionState(
    resolverSolicitudDesdeDashboard,
    ESTADO_SOLICITUD_INICIAL
  );
  const [submittedStatus, setSubmittedStatus] = useState<
    'RECHAZADA' | 'VALIDADA_SUP' | 'REGISTRADA' | 'CORRECCION_SOLICITADA' | null
  >(null);

  useEffect(() => {
    if (!state.ok || !state.message || !submittedStatus) {
      return;
    }

    onResolved(submittedStatus, state.message);
    onClose();
  }, [onClose, onResolved, state.message, state.ok, submittedStatus]);

  return (
    <form id={`supervisor-authorization-${item.id}`} action={formAction} className="space-y-4">
      <input type="hidden" name="solicitud_id" value={item.id} />
      <input type="hidden" name="cuenta_cliente_id" value={item.cuentaClienteId} />

      <div className="rounded-[22px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
          Ticket
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">{item.empleado}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {item.tipo} · {formatDateLabel(item.fechaInicio)} a {formatDateLabel(item.fechaFin)}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          {item.motivo ?? 'Sin motivo capturado por el colaborador.'}
        </p>
        {item.comentarios && (
          <p className="mt-3 rounded-[16px] bg-white px-3 py-3 text-sm text-slate-600">
            {item.comentarios}
          </p>
        )}
        {item.justificanteUrl && (
          <div className="mt-3 rounded-[16px] bg-white px-3 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Evidencia adjunta</p>
            <a
              href={item.justificanteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Abrir receta IMSS
            </a>
          </div>
        )}
        {item.tipo === 'JUSTIFICACION_FALTA' && (
          <div className="mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            Esta falta solo puede justificarse si existio aviso previo de inasistencia y la receta del IMSS es valida.
          </div>
        )}
        {item.tipo === 'JUSTIFICACION_FALTA' && item.resolverAntesDe && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>Enviada: {formatDateTime(item.enviadaEn)}</span>
            <span>Resolver antes de: {formatDateTime(item.resolverAntesDe)}</span>
          </div>
        )}
      </div>

      <SheetField label="Comentario de resolucion">
        <textarea
          name="comentarios_resolucion"
          rows={4}
          placeholder="Explica por que apruebas o rechazas esta autorizacion"
          className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
        />
      </SheetField>

      {state.message && !state.ok && (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {state.message}
        </p>
      )}

      <div
        className={`sticky bottom-0 grid gap-3 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 ${
          item.tipo === 'JUSTIFICACION_FALTA' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'
        }`}
      >
        <Button
          type="submit"
          form={`supervisor-authorization-${item.id}`}
          name="estatus"
          value="RECHAZADA"
          variant="outline"
          size="lg"
          className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          onClick={() => setSubmittedStatus('RECHAZADA')}
        >
          Rechazar
        </Button>
        {item.tipo === 'JUSTIFICACION_FALTA' && (
          <Button
            type="submit"
            form={`supervisor-authorization-${item.id}`}
            name="estatus"
            value="CORRECCION_SOLICITADA"
            variant="outline"
            size="lg"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            onClick={() => setSubmittedStatus('CORRECCION_SOLICITADA')}
          >
            Pedir correccion
          </Button>
        )}
        <Button
          type="submit"
          form={`supervisor-authorization-${item.id}`}
          name="estatus"
          value={item.tipo === 'JUSTIFICACION_FALTA' ? 'REGISTRADA' : 'VALIDADA_SUP'}
          size="lg"
          onClick={() =>
            setSubmittedStatus(item.tipo === 'JUSTIFICACION_FALTA' ? 'REGISTRADA' : 'VALIDADA_SUP')
          }
        >
          Aprobar
        </Button>
      </div>
    </form>
  );
}

function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
      {label}
      {children}
    </label>
  );
}

function SheetSubmitButton({
  form,
  label,
  pendingLabel,
  disabled = false,
  className = 'w-full',
}: {
  form: string;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" form={form} size="lg" disabled={disabled || pending} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function DashboardInsightsPanel({ data }: { data: DashboardInsightsData }) {
  const widgets = new Set(data.widgets);
  const maxMontoSemana = data.tendenciaSemana.reduce(
    (current, item) => Math.max(current, item.montoConfirmado),
    0
  );
  const maxAsistenciaMes = data.tendenciaMes.reduce(
    (current, item) => Math.max(current, item.asistenciaPorcentaje),
    0
  );

  return (
    <div className="space-y-6">
      {widgets.has('mapa') && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Mapa de promotores activos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Posicion operativa viva por check-in o geocerca de referencia dentro del filtro
              aplicado.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <PromotoresMap items={data.mapaPromotores} />
          </div>
        </Card>
      )}

      {widgets.has('alertas') && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">
              Alertas operativas en seguimiento
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Geocerca, retardos, cuotas y pendientes de IMSS segun el rol y los filtros aplicados.
            </p>
          </div>
          <div className="space-y-3 px-6 py-5">
            {data.alertasLive.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sin alertas operativas activas en este momento.
              </p>
            ) : (
              data.alertasLive.map((item) => <LiveAlertRow key={item.id} item={item} />)
            )}
          </div>
        </Card>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {widgets.has('pulso_comercial') && (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Pulso comercial de la semana</h2>
              <p className="mt-1 text-sm text-slate-500">
                Monto confirmado y cierres por dia a partir de la vista materializada.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              {data.tendenciaSemana.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavia no hay actividad visible en la ventana semanal.
                </p>
              ) : (
                data.tendenciaSemana.map((item) => (
                  <TrendRow
                    key={item.fecha}
                    item={item}
                    valueLabel={formatCurrency(item.montoConfirmado)}
                    metaLabel={`${item.ventasConfirmadas} ventas`}
                    width={getBarWidth(item.montoConfirmado, maxMontoSemana)}
                    tone="emerald"
                  />
                ))
              )}
            </div>
          </Card>
        )}

        {widgets.has('disciplina') && (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Disciplina operativa</h2>
              <p className="mt-1 text-sm text-slate-500">
                Evolucion de asistencia valida por dia dentro de la ventana mensual.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              {data.tendenciaMes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavia no hay actividad visible en la ventana mensual.
                </p>
              ) : (
                data.tendenciaMes
                  .slice(-10)
                  .map((item) => (
                    <TrendRow
                      key={item.fecha}
                      item={item}
                      valueLabel={`${item.asistenciaPorcentaje.toFixed(2)}%`}
                      metaLabel={`${item.checkInsValidos} check-ins`}
                      width={getBarWidth(item.asistenciaPorcentaje, maxAsistenciaMes)}
                      tone="sky"
                    />
                  ))
              )}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

export function DashboardInsightsSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="h-5 w-56 rounded-full bg-slate-200" />
          <div className="mt-2 h-4 w-72 rounded-full bg-slate-100" />
        </div>
        <div className="h-[320px] animate-pulse bg-gradient-to-br from-slate-100 via-white to-sky-50" />
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SkeletonCard />
        <SkeletonCard />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />;
}

function CompactMetric({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'amber';
}) {
  const valueToneClass = tone === 'amber' ? 'text-amber-800' : 'text-slate-950'

  return (
    <SharedMetricCard
      label={label}
      value={value}
      tone={tone}
      className="rounded-[18px] px-4 py-3 shadow-sm"
      labelClassName="text-[10px]"
      valueClassName={'text-lg ' + valueToneClass}
    />
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      className="rounded-[18px] border-[var(--module-border)] bg-white/80 px-4 py-3 shadow-sm backdrop-blur"
      labelClassName="text-[10px]"
      valueClassName="text-sm font-medium"
    />
  );
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="h-5 w-40 rounded-full bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded-full bg-slate-100" />
      </div>
      <div className="space-y-4 px-6 py-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="h-4 w-20 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function TrendRow({
  item,
  valueLabel,
  metaLabel,
  width,
  tone,
}: {
  item: DashboardTrendItem;
  valueLabel: string;
  metaLabel: string;
  width: string;
  tone: 'emerald' | 'sky';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-[linear-gradient(90deg,var(--module-primary)_0%,rgba(255,255,255,0.96)_160%)]'
      : 'bg-gradient-to-r from-sky-600 to-sky-300';

  return (
    <div className="grid gap-3 sm:grid-cols-[92px_1fr_104px] sm:items-center">
      <div className="text-sm font-medium text-slate-700">{formatDateLabel(item.fecha)}</div>
      <div className="rounded-full bg-slate-100 px-2 py-2">
        <div className={`h-3 rounded-full ${toneClass}`} style={{ width }} />
      </div>
      <div className="text-right text-sm text-slate-600">
        <div className="font-medium text-slate-900">{valueLabel}</div>
        <div className="text-xs text-slate-400">{metaLabel}</div>
      </div>
    </div>
  );
}

function LiveAlertRow({ item }: { item: DashboardLiveAlertItem }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
        <span>{item.tipo}</span>
        <span>{item.fechaOperacion}</span>
        {item.radioToleranciaMetros !== null && <span>Radio {item.radioToleranciaMetros}m</span>}
        {item.estadoGps && <span>{item.estadoGps}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-950">
            {item.tipo === 'IMSS_PENDIENTE' || item.tipo === 'DC_SIN_PDV' ? item.empleado : item.pdv}
          </p>
          <p className="text-sm text-slate-600">
            {item.tipo === 'IMSS_PENDIENTE'
              ? 'Expediente listo para que Nomina procese el alta IMSS.'
              : item.tipo === 'MOVIMIENTO_POR_VENCER'
                ? [item.pdvClaveBtl, item.empleado].filter(Boolean).join(' · ')
                : item.tipo === 'DC_SIN_PDV'
                  ? 'Sin PDV proyectado si no se genera un nuevo movimiento o una base activa.'
                  : item.tipo === 'PDV_LIBRE'
                    ? [item.pdvClaveBtl, item.empleado].filter(Boolean).join(' · ')
                    : [item.pdvClaveBtl, item.empleado].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 text-sm text-amber-900">{item.motivo}</p>
        </div>
        {item.tipo === 'IMSS_PENDIENTE' && (
          <a
            href="/nomina?inbox=altas-imss"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Ver pendientes IMSS
          </a>
        )}
        {item.tipo !== 'IMSS_PENDIENTE' && item.tipo !== 'DC_SIN_PDV' && (
          <div className="text-sm text-slate-600">
            Distancia check-in:{' '}
            <span className="font-medium text-slate-900">
              {item.distanciaCheckInMetros === null
                ? 'sin lectura'
                : `${item.distanciaCheckInMetros}m`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PromotoresMap({ items }: { items: DashboardMapItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  if (items.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No hay promotores activos con coordenadas visibles para el filtro actual.
      </div>
    );
  }

  const mapPoints: MexicoMapPoint[] = items.map((item) => ({
    id: item.id,
    lat: item.latitud,
    lng: item.longitud,
    title: item.empleado,
    subtitle: `${item.pdv} · ${item.zona}`,
    detail: `${item.supervisorNombre} · ${item.estadoGps}`,
    tone:
      item.estadoGps === 'FUERA_GEOCERCA'
        ? 'rose'
        : item.estadoGps === 'SIN_GPS'
          ? 'slate'
          : 'emerald',
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
      <MexicoMap
        points={mapPoints}
        selectedPointId={selectedId}
        onSelect={setSelectedId}
        heightClassName="h-[320px] sm:h-[360px]"
      />

      <div className="space-y-3">
        {items.slice(0, 6).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedId(item.id)}
            className={`block w-full rounded-3xl border px-4 py-4 text-left transition ${
              item.id === selectedId
                ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)]'
                : 'border-slate-200 bg-white hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]'
            }`}
          >
            <p className="text-sm font-semibold text-slate-950">{item.empleado}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.pdv} · {item.zona}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {item.supervisorNombre} · {item.estadoGps}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
