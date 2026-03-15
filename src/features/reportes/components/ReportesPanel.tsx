import { Card } from '@/components/ui/card'
import type { ReportesPanelData } from '../services/reporteService'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ReportesPanel({ data }: { data: ReportesPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Jornadas validas" value={String(data.resumen.jornadasValidas)} />
        <MetricCard label="Jornadas pendientes" value={String(data.resumen.jornadasPendientes)} />
        <MetricCard label="Ventas confirmadas" value={String(data.resumen.ventasConfirmadas)} />
        <MetricCard label="Monto confirmado" value={formatCurrency(data.resumen.montoConfirmado)} />
        <MetricCard label="Cuotas cumplidas" value={String(data.resumen.cuotasCumplidas)} />
        <MetricCard label="Neto nomina" value={formatCurrency(data.resumen.netoNominaEstimado)} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Consolidado por cliente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vista ejecutiva para asistencia, ventas, cumplimiento de cuotas y neto estimado de nomina por cartera.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Jornadas</th>
                <th className="px-6 py-3 font-medium">Ventas</th>
                <th className="px-6 py-3 font-medium">Cuotas</th>
                <th className="px-6 py-3 font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {data.clientes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Sin datos consolidados visibles todavia.
                  </td>
                </tr>
              ) : (
                data.clientes.map((item) => (
                  <tr key={item.identificador ?? item.cuentaCliente} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.cuentaCliente}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.identificador ?? 'sin identificador'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.jornadasValidas} validas</div>
                      <div className="mt-1 text-xs text-amber-700">{item.jornadasPendientes} pendientes</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.ventasConfirmadas} confirmadas</div>
                      <div className="mt-1 text-xs text-slate-400">{formatCurrency(item.montoConfirmado)}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.cuotasCumplidas}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatCurrency(item.netoNominaEstimado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Ranking comercial</h2>
            <p className="mt-1 text-sm text-slate-500">
              Top de colaboradoras por monto confirmado y unidades cerradas.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Colaborador</th>
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-6 py-3 font-medium">Volumen</th>
                  <th className="px-6 py-3 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.rankingVentas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Sin ventas confirmadas visibles todavia.
                    </td>
                  </tr>
                ) : (
                  data.rankingVentas.map((item) => (
                    <tr key={`${item.idNomina ?? item.empleado}-${item.cuentaCliente ?? 'sin-cuenta'}`} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.empleado}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.cuentaCliente ?? 'Sin cliente'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.ventasConfirmadas} cierres</div>
                        <div className="mt-1 text-xs text-slate-400">{item.unidadesConfirmadas} uds</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-emerald-700">{formatCurrency(item.montoConfirmado)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Ranking de cumplimiento</h2>
            <p className="mt-1 text-sm text-slate-500">
              Seguimiento de cuota, bono estimado y disciplina operativa por colaboradora.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Colaborador</th>
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-6 py-3 font-medium">Cuota</th>
                  <th className="px-6 py-3 font-medium">Jornadas</th>
                </tr>
              </thead>
              <tbody>
                {data.rankingCuotas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Sin cuotas visibles todavia.
                    </td>
                  </tr>
                ) : (
                  data.rankingCuotas.map((item) => (
                    <tr key={`${item.idNomina ?? item.empleado}-${item.cuentaCliente ?? 'sin-cuenta'}`} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.empleado}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.cuentaCliente ?? 'Sin cliente'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.cumplimiento.toFixed(2)}%</div>
                        <div className="mt-1 text-xs text-slate-400">{item.cuotaEstado} / bono {formatCurrency(item.bonoEstimado)}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.jornadasValidas} validas</div>
                        <div className="mt-1 text-xs text-amber-700">{item.jornadasPendientes} pendientes</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Bitacora reciente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Eventos recientes de auditoria para seguimiento administrativo y trazabilidad del flujo operativo.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Tabla</th>
                <th className="px-6 py-3 font-medium">Accion</th>
                <th className="px-6 py-3 font-medium">Actor</th>
                <th className="px-6 py-3 font-medium">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {data.bitacora.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Sin eventos de bitacora visibles todavia.
                  </td>
                </tr>
              ) : (
                data.bitacora.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">{formatDate(item.fecha)}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.tabla}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.registroId ?? 'sin registro'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.accion}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.usuario ?? 'sistema'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.cuentaCliente ?? 'sin cliente'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.resumen}</td>
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