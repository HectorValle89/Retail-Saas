import { Card } from '@/components/ui/card'
import type { ActorActual } from '@/lib/auth/session'
import type {
  DashboardLiveAlertItem,
  DashboardPanelData,
  DashboardTrendItem,
} from '../services/dashboardService'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin refresh'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getBarWidth(current: number, max: number) {
  if (max <= 0) {
    return '0%'
  }

  return `${Math.max(8, Math.round((current / max) * 100))}%`
}

export function DashboardPanel({
  actor,
  data,
}: {
  actor: ActorActual
  data: DashboardPanelData
}) {
  const maxMontoSemana = data.tendenciaSemana.reduce(
    (current, item) => Math.max(current, item.montoConfirmado),
    0
  )
  const maxAsistenciaMes = data.tendenciaMes.reduce(
    (current, item) => Math.max(current, item.asistenciaPorcentaje),
    0
  )

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="grid gap-6 px-8 py-10 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
              Field Force Platform
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Operacion diaria de {data.scopeLabel}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              {actor.nombreCompleto} entra como <span className="font-semibold text-white">{actor.puesto}</span>.
              Este tablero ya consolida asistencias, ventas, cuotas y nomina desde `dashboard_kpis`.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
              Snapshot
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SnapshotMetric label="Fecha corte" value={data.stats.fechaCorte ?? 'Sin datos'} />
              <SnapshotMetric label="Refresh" value={formatDateTime(data.refreshedAt)} />
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
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Promotores activos hoy" value={String(data.stats.promotoresActivosHoy)} />
        <MetricCard label="Check-ins validos" value={String(data.stats.checkInsValidosHoy)} />
        <MetricCard label="Ventas confirmadas" value={String(data.stats.ventasConfirmadasHoy)} />
        <MetricCard label="Monto confirmado" value={formatCurrency(data.stats.montoConfirmadoHoy)} />
        <MetricCard label="Afiliaciones LOVE" value={String(data.stats.afiliacionesLoveHoy)} />
        <MetricCard
          label="Cuotas cumplidas"
          value={String(data.stats.cuotasCumplidasPeriodo)}
        />
        <MetricCard
          label="Neto nomina"
          value={formatCurrency(data.stats.netoNominaPeriodo)}
        />
        <MetricCard
          label="Asistencia operativa"
          value={`${data.stats.asistenciaPorcentajeHoy.toFixed(2)}%`}
        />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Alertas live de geocerca</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDVs con radio menor a 50m o mayor a 300m mientras la jornada sigue activa.
          </p>
        </div>
        <div className="space-y-3 px-6 py-5">
          {data.alertasLive.length === 0 ? (
            <p className="text-sm text-slate-500">Sin alertas live fuera de rango en este momento.</p>
          ) : (
            data.alertasLive.map((item) => <LiveAlertRow key={item.id} item={item} />)
          )}
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Pulso comercial de la semana</h2>
            <p className="mt-1 text-sm text-slate-500">
              Monto confirmado y cierres por dia a partir de la vista materializada.
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            {data.tendenciaSemana.length === 0 ? (
              <p className="text-sm text-slate-500">Todavia no hay actividad visible en la ventana semanal.</p>
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

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Disciplina operativa</h2>
            <p className="mt-1 text-sm text-slate-500">
              Evolucion de asistencia valida por dia dentro de la ventana mensual.
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            {data.tendenciaMes.length === 0 ? (
              <p className="text-sm text-slate-500">Todavia no hay actividad visible en la ventana mensual.</p>
            ) : (
              data.tendenciaMes.slice(-10).map((item) => (
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
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Cartera visible</h2>
          <p className="mt-1 text-sm text-slate-500">
            Corte operativo por cuenta cliente con ventas, alertas, cuotas y nomina estimada.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
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
                  <tr key={item.cuentaClienteId} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.cuentaCliente}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.identificador ?? 'sin identificador'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.promotoresActivos} promotores activos</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.checkInsValidos} check-ins validos · {item.jornadasPendientes} pendientes
                      </div>
                      <div className="mt-1 text-xs text-amber-700">
                        {item.alertasOperativas} alertas · {item.asistenciaPorcentaje.toFixed(2)}% asistencia
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
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  )
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  )
}

function TrendRow({
  item,
  valueLabel,
  metaLabel,
  width,
  tone,
}: {
  item: DashboardTrendItem
  valueLabel: string
  metaLabel: string
  width: string
  tone: 'emerald' | 'sky'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
      : 'bg-gradient-to-r from-sky-600 to-sky-300'

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
  )
}

function LiveAlertRow({ item }: { item: DashboardLiveAlertItem }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
        <span>{item.fechaOperacion}</span>
        <span>Radio {item.radioToleranciaMetros}m</span>
        <span>{item.estadoGps}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-950">{item.pdv}</p>
          <p className="text-sm text-slate-600">
            {item.pdvClaveBtl} · {item.empleado}
          </p>
          <p className="mt-2 text-sm text-amber-900">{item.motivo}</p>
        </div>
        <div className="text-sm text-slate-600">
          Distancia check-in:{' '}
          <span className="font-medium text-slate-900">
            {item.distanciaCheckInMetros === null ? 'sin lectura' : `${item.distanciaCheckInMetros}m`}
          </span>
        </div>
      </div>
    </div>
  )
}