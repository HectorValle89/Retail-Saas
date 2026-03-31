'use client'

import { useActionState, useDeferredValue, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  getSingleTenantAccountLabel,
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import {
  actualizarEstadoCuentaUsuario,
  actualizarPuestoUsuario,
  crearUsuarioAdministrativo,
  enviarResetPasswordUsuario,
} from '../actions'
import { ESTADO_USUARIO_ADMIN_INICIAL } from '../state'
import type {
  CuentaClienteDisponibleItem,
  EmpleadoDisponibleItem,
  EstadoSesionUsuario,
  UsuarioListadoItem,
  UsuarioSessionItem,
  UsuariosPanelData,
} from '../services/usuarioService'

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPuesto(value: string) {
  return value.replace(/_/g, ' ')
}

function getEstadoCuentaTone(value: string) {
  if (value === 'ACTIVA') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'PROVISIONAL' || value === 'PENDIENTE_VERIFICACION_EMAIL') {
    return 'bg-amber-100 text-amber-700'
  }

  if (value === 'SUSPENDIDA') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function getEstadoSesionTone(value: EstadoSesionUsuario) {
  switch (value) {
    case 'ACTIVA':
      return 'bg-emerald-100 text-emerald-700'
    case 'REQUIERE_REFRESH':
      return 'bg-amber-100 text-amber-700'
    case 'ESPERA_PRIMER_LOGIN':
      return 'bg-sky-100 text-sky-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getEstadoSesionLabel(value: EstadoSesionUsuario) {
  switch (value) {
    case 'ACTIVA':
      return 'Sesion activa'
    case 'REQUIERE_REFRESH':
      return 'Requiere refresh'
    case 'SIN_SESION_ACTIVA':
      return 'Sin sesion activa'
    case 'ESPERA_PRIMER_LOGIN':
      return 'Pendiente primer login'
    default:
      return 'Sin acceso'
  }
}

export function UsuariosPanel({ data }: { data: UsuariosPanelData }) {
  const fixedAccount = resolveSingleTenantAccountOption(data.cuentasClienteDisponibles)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('ALL')
  const [puestoFilter, setPuestoFilter] = useState('ALL')
  const [cuentaFilter, setCuentaFilter] = useState(
    useSingleTenantUi ? fixedAccount?.id ?? 'ALL' : 'ALL'
  )
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const usuariosFiltrados = data.usuarios.filter((usuario) => {
    const matchSearch = !deferredSearch
      ? true
      : [
          usuario.empleado,
          usuario.username,
          usuario.correo,
          usuario.correoAuth,
          usuario.cuentaCliente,
          usuario.cuentaClienteIdentificador,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(deferredSearch))

    const matchEstado = estadoFilter === 'ALL' || usuario.estadoCuenta === estadoFilter
    const matchPuesto = puestoFilter === 'ALL' || usuario.puesto === puestoFilter
    const matchCuenta =
      cuentaFilter === 'ALL' ||
      (cuentaFilter === 'INTERNO'
        ? !usuario.cuentaClienteId
        : usuario.cuentaClienteId === cuentaFilter)

    return matchSearch && matchEstado && matchPuesto && matchCuenta
  })

  const mostrarAlertaProvisionamiento =
    !data.provisionamiento.backendAdminConfigurado || data.provisionamiento.usuariosSinAuth > 0

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {mostrarAlertaProvisionamiento && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Provisionamiento administrativo pendiente</p>
          <div className="mt-2 space-y-1 text-sm">
            {!data.provisionamiento.backendAdminConfigurado && (
              <p>
                {data.mensajeBackendAdmin ??
                  'Falta configurar SUPABASE_SERVICE_ROLE_KEY para operar altas, resets y sincronizacion auth.'}
              </p>
            )}
            {data.provisionamiento.usuariosSinAuth > 0 && (
              <p>
                Existen {data.provisionamiento.usuariosSinAuth} usuarios sin vinculacion a
                <code> auth.users</code>.
              </p>
            )}
          </div>
        </Card>
      )}

      {!data.sesionesOperativasDisponibles && data.mensajeSesiones && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Vista de sesiones degradada</p>
          <p className="mt-2 text-sm">{data.mensajeSesiones}</p>
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
        <MetricCard label="Bloqueados" value={String(data.provisionamiento.bloqueados)} />
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Alta administrativa</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Crea el usuario provisional solo para expedientes que ya cerraron alta IMSS. El
              panel devuelve el username y password temporal para arrancar el flujo de activacion.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Empleados disponibles:{' '}
            <span className="font-semibold text-slate-900">{data.empleadosDisponibles.length}</span>
          </p>
        </div>

        <div className="mt-5">
          <CrearUsuarioForm
            cuentasCliente={data.cuentasClienteDisponibles}
            empleados={data.empleadosDisponibles}
            disabled={!data.provisionamiento.backendAdminConfigurado}
            fixedAccountId={useSingleTenantUi ? fixedAccount?.id ?? '' : ''}
            useSingleTenantUi={useSingleTenantUi}
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Estado de usuarios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Filtros operativos por estado, puesto y cuenta cliente, con diagnostico de sesiones
              activas, claims stale y acciones administrativas.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Mostrando <span className="font-semibold text-slate-900">{usuariosFiltrados.length}</span>{' '}
            de <span className="font-semibold text-slate-900">{data.usuarios.length}</span> usuarios.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Empleado, username, correo o cuenta"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Estado"
            value={estadoFilter}
            onChange={(event) => setEstadoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              ...data.estadosDisponibles.map((estado) => ({
                value: estado,
                label: estado,
              })),
            ]}
          />
          <Select
            label="Puesto"
            value={puestoFilter}
            onChange={(event) => setPuestoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              ...data.puestosDisponibles.map((puesto) => ({
                value: puesto,
                label: formatPuesto(puesto),
              })),
            ]}
          />
          {useSingleTenantUi ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Cuenta operativa</p>
              <div className="rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-slate-900">
                {getSingleTenantAccountLabel()}
              </div>
            </div>
          ) : (
            <Select
              label="Cuenta cliente"
              value={cuentaFilter}
              onChange={(event) => setCuentaFilter(event.target.value)}
              options={[
                { value: 'ALL', label: 'Todas' },
                { value: 'INTERNO', label: 'Interno' },
                ...data.cuentasClienteDisponibles.map((cuenta) => ({
                  value: cuenta.id,
                  label: `${cuenta.nombre} (${cuenta.identificador})`,
                })),
              ]}
            />
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Acceso</th>
                <th className="px-6 py-3 font-medium">Cuenta</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Sesion</th>
                <th className="px-6 py-3 font-medium">Rol</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No hay usuarios que coincidan con los filtros activos.
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map((usuario) => (
                  <UsuarioRow
                    key={usuario.id}
                    canManage={data.provisionamiento.backendAdminConfigurado}
                    expanded={expandedUserId === usuario.id}
                    onToggleSessions={() =>
                      setExpandedUserId((current) => (current === usuario.id ? null : usuario.id))
                    }
                    puestos={data.puestosDisponibles}
                    usuario={usuario}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function UsuarioRow({
  usuario,
  puestos,
  canManage,
  expanded,
  onToggleSessions,
}: {
  usuario: UsuarioListadoItem
  puestos: string[]
  canManage: boolean
  expanded: boolean
  onToggleSessions: () => void
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-6 py-4">
          <div className="font-medium text-slate-900">{usuario.empleado}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
            {formatPuesto(usuario.puesto)}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{usuario.username ?? 'Sin username'}</div>
          <div className="mt-1 text-xs text-slate-500">negocio: {usuario.correo ?? 'sin correo'}</div>
          <div className="mt-1 text-xs text-slate-500">auth: {usuario.correoAuth ?? 'sin correo auth'}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={usuario.authVinculado ? 'VINCULADO' : 'PENDIENTE'}
              className={
                usuario.authVinculado
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-700'
              }
            />
            <StatusPill
              label={usuario.correoVerificado ? 'EMAIL OK' : 'SIN VERIFICAR'}
              className={
                usuario.correoVerificado
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-amber-100 text-amber-700'
              }
            />
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{usuario.cuentaCliente ?? 'Interno'}</div>
          <div className="mt-1 text-xs text-slate-400">
            {usuario.cuentaClienteIdentificador ?? 'sin cuenta cliente'}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={usuario.estadoCuenta}
            className={getEstadoCuentaTone(usuario.estadoCuenta)}
          />
          <div className="mt-2 text-xs text-slate-500">
            actualizado: {formatDateTime(usuario.actualizadoEn)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ultimo acceso app: {formatDateTime(usuario.ultimoAccesoEn)}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={getEstadoSesionLabel(usuario.estadoSesion)}
            className={getEstadoSesionTone(usuario.estadoSesion)}
          />
          <div className="mt-2 text-xs text-slate-500">sesiones activas: {usuario.sesionesActivas}</div>
          <div className="mt-1 text-xs text-slate-500">
            ultimo sign-in auth: {formatDateTime(usuario.ultimoSignInAuthEn)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            contexto auth: {formatDateTime(usuario.authContextUpdatedAt)}
          </div>
          {usuario.sesiones.length > 0 && (
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-sky-700 hover:text-sky-900"
              onClick={onToggleSessions}
            >
              {expanded
                ? 'Ocultar sesiones activas'
                : `Ver ${usuario.sesiones.length} sesiones activas`}
            </button>
          )}
        </td>
        <td className="px-6 py-4">
          <CambioPuestoForm
            currentPuesto={usuario.puesto}
            disabled={!canManage}
            empleado={usuario.empleado}
            puestos={puestos}
            usuarioId={usuario.id}
          />
        </td>
        <td className="px-6 py-4">
          <div className="space-y-4">
            <EstadoCuentaForm
              currentState={usuario.estadoCuenta}
              disabled={!canManage}
              empleado={usuario.empleado}
              usuarioId={usuario.id}
            />
            <ResetPasswordForm
              disabled={!canManage || !usuario.puedeResetPassword}
              disabledReason={usuario.motivoNoReset}
              empleado={usuario.empleado}
              usuarioId={usuario.id}
            />
          </div>
        </td>
      </tr>
      {expanded && usuario.sesiones.length > 0 && (
        <tr className="border-t border-slate-100 bg-slate-50/70">
          <td colSpan={7} className="px-6 py-4">
            <SessionDetails sessions={usuario.sesiones} />
          </td>
        </tr>
      )}
    </>
  )
}

function CrearUsuarioForm({
  empleados,
  cuentasCliente,
  disabled,
  fixedAccountId,
  useSingleTenantUi,
}: {
  empleados: EmpleadoDisponibleItem[]
  cuentasCliente: CuentaClienteDisponibleItem[]
  disabled: boolean
  fixedAccountId: string
  useSingleTenantUi: boolean
}) {
  const [state, formAction] = useActionState(
    crearUsuarioAdministrativo,
    ESTADO_USUARIO_ADMIN_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
        <Select
          label="Empleado"
          name="empleado_id"
          disabled={disabled || empleados.length === 0}
          options={[
            {
              value: '',
              label: empleados.length === 0 ? 'Sin empleados disponibles' : 'Selecciona empleado',
            },
            ...empleados.map((empleado) => ({
              value: empleado.id,
              label: `${empleado.nombreCompleto} / ${empleado.idNomina ?? 'sin nomina'} / ${formatPuesto(empleado.puesto)}`,
            })),
          ]}
        />
        <Input
          label="Username"
          name="username"
          disabled={disabled}
          placeholder="Opcional; si se deja vacio se genera automaticamente"
        />
        {useSingleTenantUi ? (
          <div className="space-y-2">
            <input type="hidden" name="cuenta_cliente_id" value={fixedAccountId} />
            <p className="text-sm font-medium text-slate-700">Cuenta operativa</p>
            <div className="rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-slate-900">
              {getSingleTenantAccountLabel()}
            </div>
          </div>
        ) : (
          <Select
            label="Cuenta cliente"
            name="cuenta_cliente_id"
            disabled={disabled}
            options={[
              { value: '', label: 'Interno / sin cuenta' },
              ...cuentasCliente
                .filter((cuenta) => cuenta.activa)
                .map((cuenta) => ({
                  value: cuenta.id,
                  label: `${cuenta.nombre} (${cuenta.identificador})`,
                })),
            ]}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          disabled={disabled || empleados.length === 0}
          idleLabel="Crear usuario provisional"
          pendingLabel="Creando..."
          variant="primary"
        />
        {disabled && (
          <p className="text-sm text-amber-700">
            Configura backend admin para habilitar el alta de usuarios.
          </p>
        )}
      </div>
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
      {state.ok && state.generatedUsername && state.temporaryPassword && (
        <div className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-3">
          <CredentialBlock label="Username" value={state.generatedUsername} />
          <CredentialBlock label="Password temporal" value={state.temporaryPassword} />
          <CredentialBlock label="Correo auth" value={state.temporaryEmail ?? 'sin correo'} />
        </div>
      )}
    </form>
  )
}

function CambioPuestoForm({
  usuarioId,
  currentPuesto,
  puestos,
  empleado,
  disabled,
}: {
  usuarioId: string
  currentPuesto: string
  puestos: string[]
  empleado: string
  disabled: boolean
}) {
  const [state, formAction] = useActionState(
    actualizarPuestoUsuario,
    ESTADO_USUARIO_ADMIN_INICIAL
  )

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }

        const form = event.currentTarget
        const select = form.elements.namedItem('puesto_destino') as HTMLSelectElement | null
        const destino = select?.value ?? currentPuesto

        if (!window.confirm(`Cambiar el puesto de ${empleado} a ${formatPuesto(destino)}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <Select
        name="puesto_destino"
        defaultValue={currentPuesto}
        disabled={disabled}
        options={puestos.map((puesto) => ({
          value: puesto,
          label: formatPuesto(puesto),
        }))}
      />
      <SubmitButton
        disabled={disabled}
        idleLabel="Cambiar puesto"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function EstadoCuentaForm({
  usuarioId,
  currentState,
  empleado,
  disabled,
}: {
  usuarioId: string
  currentState: string
  empleado: string
  disabled: boolean
}) {
  const [state, formAction] = useActionState(
    actualizarEstadoCuentaUsuario,
    ESTADO_USUARIO_ADMIN_INICIAL
  )

  const accionCuenta = currentState === 'SUSPENDIDA' ? 'REACTIVAR' : 'SUSPENDER'

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }

        const verbo = accionCuenta === 'SUSPENDER' ? 'suspender' : 'reactivar'

        if (!window.confirm(`Confirmar ${verbo} la cuenta de ${empleado}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <input type="hidden" name="accion_cuenta" value={accionCuenta} />
      <SubmitButton
        disabled={disabled || currentState === 'BAJA'}
        idleLabel={accionCuenta === 'SUSPENDER' ? 'Suspender cuenta' : 'Reactivar cuenta'}
        pendingLabel="Guardando..."
        variant={accionCuenta === 'SUSPENDER' ? 'danger' : 'secondary'}
      />
      {currentState === 'BAJA' && (
        <p className="text-xs text-slate-400">Las cuentas en BAJA no se gestionan desde aqui.</p>
      )}
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function ResetPasswordForm({
  usuarioId,
  empleado,
  disabled,
  disabledReason,
}: {
  usuarioId: string
  empleado: string
  disabled: boolean
  disabledReason: string | null
}) {
  const [state, formAction] = useActionState(
    enviarResetPasswordUsuario,
    ESTADO_USUARIO_ADMIN_INICIAL
  )

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }

        if (!window.confirm(`Enviar email de reset de password a ${empleado}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <SubmitButton
        disabled={disabled}
        idleLabel="Enviar reset"
        pendingLabel="Enviando..."
        variant="outline"
      />
      {disabled && disabledReason && <p className="text-xs text-slate-400">{disabledReason}</p>}
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function SessionDetails({ sessions }: { sessions: UsuarioSessionItem[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-900">Sesiones activas en auth</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">
                  {session.userAgent ?? 'Agente no identificado'}
                </p>
                <p className="mt-1 text-xs text-slate-400">{session.ip ?? 'IP no disponible'}</p>
              </div>
              <StatusPill
                label={session.activa ? 'ACTIVA' : 'INACTIVA'}
                className={
                  session.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                }
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <span>creada: {formatDateTime(session.creadaEn)}</span>
              <span>refrescada: {formatDateTime(session.refrescadaEn)}</span>
              <span>actualizada: {formatDateTime(session.actualizadaEn)}</span>
              <span>expira: {formatDateTime(session.expiraEn)}</span>
              <span>aal: {session.aal ?? 'n/a'}</span>
              <span>tag: {session.tag ?? 'n/a'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CredentialBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{label}</p>
      <p className="mt-2 break-all text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  disabled,
  variant,
}: {
  idleLabel: string
  pendingLabel: string
  disabled?: boolean
  variant: 'primary' | 'secondary' | 'outline' | 'danger'
}) {
  const { pending } = useFormStatus()

  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800'
      : variant === 'secondary'
        ? 'bg-sky-600 text-white hover:bg-sky-500'
        : variant === 'danger'
          ? 'bg-rose-600 text-white hover:bg-rose-500'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
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

function StatusPill({
  label,
  className,
}: {
  label: ReactNode
  className: string
}) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
