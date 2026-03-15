import { Card } from '@/components/ui/card'
import type { PdvsPanelData } from '../services/pdvService'

export function PdvsPanel({ data }: { data: PdvsPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total visible" value={String(data.resumen.total)} />
        <MetricCard label="Activos" value={String(data.resumen.activos)} />
        <MetricCard label="Con geocerca" value={String(data.resumen.conGeocerca)} />
        <MetricCard label="Con supervisor" value={String(data.resumen.conSupervisor)} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">PDVs recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Base de catalogo maestro de operacion y geocercas.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Cadena</th>
                <th className="px-6 py-3 font-medium">Ciudad</th>
                <th className="px-6 py-3 font-medium">Geocerca</th>
                <th className="px-6 py-3 font-medium">Supervisor</th>
              </tr>
            </thead>
            <tbody>
              {data.pdvs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Sin registros visibles todavia.
                  </td>
                </tr>
              ) : (
                data.pdvs.map((pdv) => (
                  <tr key={pdv.id} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{pdv.nombre}</div>
                      <div className="text-xs text-slate-500">{pdv.claveBtl}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{pdv.cadena ?? 'Sin cadena'}</td>
                    <td className="px-6 py-4 text-slate-600">{pdv.ciudad ?? 'Sin ciudad'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {pdv.radioMetros ? `${pdv.radioMetros} m` : 'No configurada'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{pdv.supervisor ?? 'Pendiente'}</td>
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
