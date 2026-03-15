import { Card } from '@/components/ui/card'
import type { NominaPanelData } from '../services/nominaService'
import { PeriodoNominaControls } from './PeriodoNominaControls'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin fecha'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value))
}

export function NominaPanel({ data }: { data: NominaPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Periodos" value={String(data.resumen.periodos)} />
        <MetricCard label="Periodo abierto" value={data.resumen.periodoAbierto ?? 'Ninguno'} />
        <MetricCard label="Colaboradores" value={String(data.resumen.colaboradores)} />
        <MetricCard label="Percepciones" value={formatCurrency(data.resumen.percepciones)} />
        <MetricCard label="Deducciones" value={formatCurrency(data.resumen.deducciones)} />
        <MetricCard label="Neto estimado" value={formatCurrency(data.resumen.netoEstimado)} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Periodos de nomina</h2>
          <p className="mt-1 text-sm text-slate-500">
            Control de periodos abiertos y cerrados para consolidar cuotas y movimientos del ledger.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Periodo</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Cuotas</th>
                <th className="px-6 py-3 font-medium">Ledger</th>
                <th className="px-6 py-3 font-medium">Cierre</th>
                <th className="px-6 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {data.periodos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Sin periodos de nomina visibles todavia.
                  </td>
                </tr>
              ) : (
                data.periodos.map((periodo) => (
                  <tr key={periodo.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{periodo.clave}</div>
                      {periodo.observaciones && (
                        <div className="mt-1 text-xs text-slate-400">{periodo.observaciones}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {periodo.fechaInicio} a {periodo.fechaFin}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={periodo.estado === 'ABIERTO'}
                        label={periodo.estado}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-600">{periodo.cuotas}</td>
                    <td className="px-6 py-4 text-slate-600">{periodo.movimientosLedger}</td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(periodo.fechaCierre)}</td>
                    <td className="px-6 py-4">
                      <PeriodoNominaControls periodoId={periodo.id} estado={periodo.estado} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Pre-nomina del periodo activo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Consolidado por colaborador con jornadas, ventas confirmadas, cuota comercial y efecto estimado en percepciones netas.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Colaborador</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Jornadas</th>
                <th className="px-6 py-3 font-medium">Ventas</th>
                <th className="px-6 py-3 font-medium">Cuota</th>
                <th className="px-6 py-3 font-medium">Ledger</th>
                <th className="px-6 py-3 font-medium">Neto estimado</th>
              </tr>
            </thead>
            <tbody>
              {data.preNomina.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Sin colaboradores consolidados para el periodo activo.
                  </td>
                </tr>
              ) : (
                data.preNomina.map((item) => (
                  <tr key={`${item.empleadoId}-${item.cuentaClienteId ?? 'sin-cuenta'}`} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.empleado}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.idNomina ?? 'Sin nomina'} · {item.puesto ?? 'Sin puesto'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.cuentaCliente ?? 'Sin cliente'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.jornadasValidadas} validadas</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.jornadasPendientes} pendientes
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.ventasConfirmadas} confirmadas</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatCurrency(item.montoConfirmado)} · {item.unidadesConfirmadas} uds
                      </div>
                      <div className="mt-1 text-xs text-amber-700">
                        {item.ventasPendientes} pendientes · {formatCurrency(item.montoPendiente)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <StatusPill
                        active={item.cuotaEstado === 'CUMPLIDA'}
                        label={item.cuotaEstado ?? 'SIN CUOTA'}
                      />
                      <div className="mt-2 text-xs text-slate-500">
                        {item.objetivoMonto > 0
                          ? `${item.cumplimiento.toFixed(2)}% de ${formatCurrency(item.objetivoMonto)}`
                          : 'Sin objetivo cargado'}
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        Bono estimado: {formatCurrency(item.bonoEstimado)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>Percepciones: {formatCurrency(item.percepciones + item.ajustes)}</div>
                      <div className="mt-1 text-xs text-rose-700">
                        Deducciones: {formatCurrency(item.deducciones)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-900 font-semibold">
                      {formatCurrency(item.netoEstimado)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Cuotas comerciales</h2>
            <p className="mt-1 text-sm text-slate-500">
              Objetivos por colaborador para alimentar bono estimado y riesgo comercial del periodo.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Colaborador</th>
                  <th className="px-6 py-3 font-medium">Cliente / cadena</th>
                  <th className="px-6 py-3 font-medium">Objetivo</th>
                  <th className="px-6 py-3 font-medium">Avance</th>
                  <th className="px-6 py-3 font-medium">Bono</th>
                </tr>
              </thead>
              <tbody>
                {data.cuotas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Sin cuotas visibles todavia.
                    </td>
                  </tr>
                ) : (
                  data.cuotas.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.empleado}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.idNomina ?? 'Sin nomina'} · {item.puesto ?? 'Sin puesto'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{item.cuentaCliente ?? 'Sin cliente'}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.cadena ?? 'Sin cadena'} · {item.periodoClave ?? 'Sin periodo'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{formatCurrency(item.objetivoMonto)}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.objetivoUnidades} uds</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <StatusPill active={item.estado === 'CUMPLIDA'} label={item.estado} />
                        <div className="mt-2">{formatCurrency(item.avanceMonto)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.avanceUnidades} uds · {item.cumplimiento.toFixed(2)}% · factor {item.factorCuota.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-emerald-700">
                        {formatCurrency(item.bonoEstimado)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Ledger reciente</h2>
            <p className="mt-1 text-sm text-slate-500">
              Percepciones, deducciones y ajustes ligados al periodo de nomina activo.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Movimiento</th>
                  <th className="px-6 py-3 font-medium">Colaborador</th>
                  <th className="px-6 py-3 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                      Sin movimientos de ledger visibles.
                    </td>
                  </tr>
                ) : (
                  data.ledger.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        <StatusPill
                          active={item.tipoMovimiento !== 'DEDUCCION'}
                          label={item.tipoMovimiento}
                        />
                        <div className="mt-2 font-medium text-slate-900">{item.concepto}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.periodoClave ?? 'Sin periodo'} · {formatDate(item.createdAt)}
                        </div>
                        {item.notas && (
                          <div className="mt-1 text-xs text-slate-500">{item.notas}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.empleado}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.idNomina ?? 'Sin nomina'} · {item.cuentaCliente ?? 'Sin cliente'}
                        </div>
                      </td>
                      <td className={`px-6 py-4 font-medium ${item.tipoMovimiento === 'DEDUCCION' ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {item.tipoMovimiento === 'DEDUCCION' ? '-' : '+'}
                        {formatCurrency(item.monto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
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

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  )
}

