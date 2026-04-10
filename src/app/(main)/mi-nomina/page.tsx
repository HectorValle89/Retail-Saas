export const runtime = 'edge';
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerRecibosNominaEmpleado } from '@/features/nomina/services/nominaReceiptService'
import { Card } from '@/components/ui/card'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'

export const metadata = {
  title: 'Mi nomina | Field Force Platform',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

export default async function MiNominaPage() {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const recibos = await obtenerRecibosNominaEmpleado(supabase, actor.empleadoId)

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
          Consulta personal
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Mi nomina</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Vista de solo lectura de tus recibos por periodo con detalle de percepciones, deducciones y movimientos del ledger.
        </p>
      </header>

      <div className="space-y-6">
        {recibos.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">Todavia no tienes recibos de nomina visibles.</p>
          </Card>
        ) : (
          recibos.map((recibo) => (
            <Card key={`${recibo.periodoId}-${recibo.cuentaCliente ?? 'sin-cuenta'}`} className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{recibo.periodoClave}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {recibo.empleado} Â· {recibo.idNomina ?? 'Sin nomina'} Â· {recibo.puesto ?? 'Sin puesto'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {recibo.fechaInicio} a {recibo.fechaFin} Â· {recibo.cuentaCliente ?? 'Sin cliente'}
                  </p>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${recibo.estado === 'DISPERSADO' ? 'bg-emerald-100 text-emerald-800' : recibo.estado === 'APROBADO' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                  {recibo.estado}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Percepciones" value={formatCurrency(recibo.percepciones)} />
                <MetricCard label="Deducciones" value={formatCurrency(recibo.deducciones)} />
                <MetricCard label="Bono cuota" value={formatCurrency(recibo.bonoEstimado)} />
                <MetricCard label="Neto" value={formatCurrency(recibo.neto)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.75fr,1.25fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-900">Cumplimiento:</span> {recibo.cumplimiento.toFixed(2)}%</p>
                  <p className="mt-2"><span className="font-medium text-slate-900">Estado cuota:</span> {recibo.cuotaEstado ?? 'Sin cuota'}</p>
                  <p className="mt-2"><span className="font-medium text-slate-900">Fecha cierre:</span> {recibo.fechaCierre ?? 'Pendiente'}</p>
                </div>
                <div className="overflow-x-auto rounded-3xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Movimiento</th>
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recibo.movimientos.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-slate-500">Sin movimientos visibles.</td>
                        </tr>
                      ) : (
                        recibo.movimientos.map((movimiento) => (
                          <tr key={movimiento.id} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3 text-slate-600">
                              <div className="font-medium text-slate-900">{movimiento.concepto}</div>
                              <div className="mt-1 text-xs text-slate-400">{movimiento.tipoMovimiento}</div>
                              {movimiento.notas && <div className="mt-1 text-xs text-slate-500">{movimiento.notas}</div>}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{new Date(movimiento.createdAt).toLocaleDateString('es-MX')}</td>
                            <td className={`px-4 py-3 font-medium ${movimiento.tipoMovimiento === 'DEDUCCION' ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {movimiento.tipoMovimiento === 'DEDUCCION' ? '-' : '+'}
                              {formatCurrency(movimiento.monto)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} valueClassName="text-2xl sm:text-[2rem]" />
}
