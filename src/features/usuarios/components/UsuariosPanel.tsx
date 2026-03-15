import { Card } from '@/components/ui/card'
import type { UsuariosPanelData } from '../services/usuarioService'

export function UsuariosPanel({ data }: { data: UsuariosPanelData }) {
  const mostrarAlertaProvisionamiento =
    !data.provisionamiento.backendAdminConfigurado || data.provisionamiento.usuariosSinAuth > 0

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {mostrarAlertaProvisionamiento && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Provisionamiento de auth pendiente</p>
          <div className="mt-2 space-y-1 text-sm">
            {!data.provisionamiento.backendAdminConfigurado && (
              <p>
                Falta configurar <code>SUPABASE_SERVICE_ROLE_KEY</code> para operar
                provisionamiento y sincronizacion administrativa.
              </p>
            )}
            {data.provisionamiento.usuariosSinAuth > 0 && (
              <p>
                Existen {data.provisionamiento.usuariosSinAuth} usuarios sin
                vinculacion a <code>auth.users</code>, por lo que hoy no pueden iniciar sesion.
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Usuarios visibles" value={String(data.resumen.total)} />
        <MetricCard label="Activas" value={String(data.resumen.activas)} />
        <MetricCard label="Sin auth" value={String(data.resumen.sinAuth)} />
        <MetricCard
          label="Pendientes activacion"
          value={String(data.resumen.pendientesActivacion)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Backend admin"
          value={data.provisionamiento.backendAdminConfigurado ? 'Listo' : 'Falta'}
        />
        <MetricCard
          label="Usuarios con auth"
          value={String(data.provisionamiento.usuariosConAuth)}
        />
        <MetricCard
          label="Listos para operar"
          value={String(data.provisionamiento.listosParaOperar)}
        />
        <MetricCard
          label="Bloqueados"
          value={String(data.provisionamiento.bloqueados)}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Estado de usuarios</h2>
          <p className="mt-1 text-sm text-slate-500">
            Fuente administrativa para revisar provisionamiento, estado de cuenta y cartera cliente.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Acceso</th>
                <th className="px-6 py-3 font-medium">Cuenta cliente</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Auth</th>
                <th className="px-6 py-3 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.usuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin usuarios visibles todavia.
                  </td>
                </tr>
              ) : (
                data.usuarios.map((usuario) => (
                  <tr key={usuario.id} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{usuario.empleado}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                        {usuario.puesto}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{usuario.username ?? 'Sin username'}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {usuario.correo ?? 'Sin correo'}
                        {usuario.correoVerificado ? ' · verificado' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{usuario.cuentaCliente ?? 'Interno'}</td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={
                          usuario.estadoCuenta === 'ACTIVA' ||
                          usuario.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL'
                        }
                        label={usuario.estadoCuenta}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={usuario.authVinculado}
                        label={usuario.authVinculado ? 'VINCULADO' : 'PENDIENTE'}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-600">{usuario.actualizadoEn}</td>
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
