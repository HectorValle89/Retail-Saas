import { Card } from '@/components/ui/card'
import type { ConfiguracionPanelData } from '../services/configuracionService'

export function ConfiguracionPanel({ data }: { data: ConfiguracionPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Parametros" value={String(data.resumen.parametros)} />
        <MetricCard label="Reglas activas" value={String(data.resumen.reglasActivas)} />
        <MetricCard label="Misiones activas" value={String(data.resumen.misionesActivas)} />
        <MetricCard label="Modulos cubiertos" value={String(data.resumen.modulosCubiertos)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Parametros globales</h2>
            <p className="mt-1 text-sm text-slate-500">
              Configuracion operativa y de seguridad derivada del backlog activo.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Clave</th>
                  <th className="px-6 py-3 font-medium">Modulo</th>
                  <th className="px-6 py-3 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.parametros.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                      Sin parametros visibles todavia.
                    </td>
                  </tr>
                ) : (
                  data.parametros.map((parametro) => (
                    <tr key={parametro.id} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{parametro.clave}</div>
                        <div className="text-xs text-slate-500">
                          {parametro.descripcion ?? 'Sin descripcion'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{parametro.modulo}</td>
                      <td className="px-6 py-4 text-slate-600">{parametro.valor}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Reglas vigentes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reglas base de operacion y validacion priorizadas por severidad.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {data.reglas.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">
                  Sin reglas visibles todavia.
                </p>
              ) : (
                data.reglas.map((regla) => (
                  <div key={regla.id} className="px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{regla.codigo}</p>
                        <p className="mt-1 text-sm text-slate-600">{regla.descripcion}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {regla.severidad}
                      </span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {regla.modulo} / prioridad {regla.prioridad}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Catalogo de misiones</h2>
              <p className="mt-1 text-sm text-slate-500">
                Misiones fisicas antifraude listas para check-in.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {data.misiones.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">
                  Sin misiones visibles todavia.
                </p>
              ) : (
                data.misiones.map((mision) => (
                  <div key={mision.id} className="flex items-start justify-between gap-3 px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-900">
                        {mision.orden ? `${mision.orden}. ` : ''}
                        {mision.instruccion}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {mision.activa ? 'ACTIVA' : 'INACTIVA'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
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
