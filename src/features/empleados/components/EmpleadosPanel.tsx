import { Card } from '@/components/ui/card'
import type { EmpleadosPanelData } from '../services/empleadoService'

export function EmpleadosPanel({ data }: { data: EmpleadosPanelData }) {
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
        <MetricCard label="Supervisores" value={String(data.resumen.supervisores)} />
        <MetricCard label="Dermoconsejeros" value={String(data.resumen.dermoconsejeros)} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Empleados recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vista inicial del modulo de estructura maestra para identidad laboral.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Puesto</th>
                <th className="px-6 py-3 font-medium">Zona</th>
                <th className="px-6 py-3 font-medium">Contacto</th>
                <th className="px-6 py-3 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {data.empleados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Sin registros visibles todavia.
                  </td>
                </tr>
              ) : (
                data.empleados.map((empleado) => (
                  <tr key={empleado.id} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{empleado.nombreCompleto}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{empleado.puesto}</td>
                    <td className="px-6 py-4 text-slate-600">{empleado.zona ?? 'Sin zona'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {empleado.correoElectronico ?? empleado.telefono ?? 'Sin dato'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {empleado.estatusLaboral}
                      </span>
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
