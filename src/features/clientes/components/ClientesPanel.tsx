import { Card } from '@/components/ui/card'
import type { ClientesPanelData } from '../services/clienteService'

export function ClientesPanel({ data }: { data: ClientesPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Cuentas visibles" value={String(data.resumen.total)} />
        <MetricCard label="Cuentas activas" value={String(data.resumen.activas)} />
        <MetricCard label="PDVs activos" value={String(data.resumen.pdvsActivos)} />
        <MetricCard label="Movimientos" value={String(data.resumen.movimientosHistoricos)} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Cuentas cliente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vista multi-tenant de clientes, configuracion operativa y cobertura actual de PDVs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">PDVs activos</th>
                <th className="px-6 py-3 font-medium">Historico</th>
                <th className="px-6 py-3 font-medium">Contexto</th>
                <th className="px-6 py-3 font-medium">Ultimo cambio</th>
              </tr>
            </thead>
            <tbody>
              {data.cuentas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin cuentas cliente visibles todavia.
                  </td>
                </tr>
              ) : (
                data.cuentas.map((cuenta) => (
                  <tr key={cuenta.id} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{cuenta.nombre}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                        {cuenta.identificador}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill active={cuenta.activa} label={cuenta.activa ? 'ACTIVA' : 'INACTIVA'} />
                    </td>
                    <td className="px-6 py-4 text-slate-600">{cuenta.pdvsActivos}</td>
                    <td className="px-6 py-4 text-slate-600">{cuenta.pdvsHistoricos}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{cuenta.modoOperacion ?? 'Sin modo'}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {cuenta.timezone ?? 'Sin timezone'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{cuenta.ultimoCambio ?? 'Sin movimientos'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Historial reciente de PDVs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Trazabilidad de asignacion de PDVs a clientes para auditoria operativa y cambios de cartera.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Cadena</th>
                <th className="px-6 py-3 font-medium">Zona</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.historial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin historial visible todavia.
                  </td>
                </tr>
              ) : (
                data.historial.map((movimiento) => (
                  <tr key={movimiento.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 text-slate-900">{movimiento.cuentaCliente}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{movimiento.pdvClaveBtl}</div>
                      <div className="mt-1 text-xs text-slate-400">{movimiento.pdvNombre}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{movimiento.cadena ?? 'Sin cadena'}</td>
                    <td className="px-6 py-4 text-slate-600">{movimiento.zona ?? 'Sin zona'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {movimiento.fechaInicio}
                      {movimiento.fechaFin ? ` -> ${movimiento.fechaFin}` : ' -> vigente'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={movimiento.activo}
                        label={movimiento.activo ? 'ACTIVA' : 'CERRADA'}
                      />
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
