import { Card } from '@/components/ui/card'
import { AsignacionEstadoControls } from './AsignacionEstadoControls'
import type { AsignacionesPanelData } from '../services/asignacionService'

export function AsignacionesPanel({
  data,
  puedeGestionar,
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
}) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!puedeGestionar && data.infraestructuraLista && (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">Vista operativa en solo lectura</p>
          <p className="mt-2 text-sm">
            Solo un administrador puede mover asignaciones entre BORRADOR y PUBLICADA.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Total visible" value={String(data.resumen.total)} />
        <MetricCard label="Borrador" value={String(data.resumen.borrador)} />
        <MetricCard label="Publicadas" value={String(data.resumen.publicada)} />
        <MetricCard label="Coberturas" value={String(data.resumen.coberturas)} />
        <MetricCard label="Con bloqueo" value={String(data.resumen.conBloqueo)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label="Publicadas invalidas"
          value={String(data.resumen.publicadasInvalidas)}
        />
        <Card className="border-slate-200 bg-white">
          <p className="text-sm text-slate-500">Reglas evaluadas</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Geocerca obligatoria, supervisor activo por PDV, cuenta cliente presente y vigencia
            consistente. Publicar solo se habilita cuando la asignacion queda limpia.
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Asignaciones recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Base operativa para planeacion mensual y validacion previa a publicacion.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Validaciones</th>
                <th className="px-6 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {data.asignaciones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Sin registros visibles todavia.
                  </td>
                </tr>
              ) : (
                data.asignaciones.map((asignacion) => (
                  <tr key={asignacion.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-900">{asignacion.empleado ?? 'Sin empleado'}</td>
                    <td className="px-6 py-4 text-slate-600">{asignacion.pdv ?? 'Sin PDV'}</td>
                    <td className="px-6 py-4 text-slate-600">{asignacion.tipo}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {asignacion.fechaInicio}
                      {asignacion.fechaFin ? ` -> ${asignacion.fechaFin}` : ''}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          asignacion.estadoPublicacion === 'PUBLICADA'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {asignacion.estadoPublicacion}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asignacion.validaciones.length === 0 ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                          Lista para publicar
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {asignacion.validaciones.map((validacion) => (
                            <div
                              key={validacion}
                              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                            >
                              {validacion}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <AsignacionEstadoControls
                        asignacionId={asignacion.id}
                        estadoPublicacion={asignacion.estadoPublicacion}
                        bloqueada={asignacion.bloqueada}
                        puedeGestionar={puedeGestionar}
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
