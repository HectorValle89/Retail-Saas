'use client'

import { useActionState, useDeferredValue, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { ModalPanel } from '@/components/ui/modal-panel'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
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
  const selectedUser = data.usuarios.find((usuario) => usuario.id === selectedUserId) ?? null

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
              Vista resumida por empleado. Las acciones administrativas y el detalle completo viven
              dentro de la ficha individual.
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

      <div className="space-y-3">
        {usuariosFiltrados.length === 0 ? (
          <Card className="px-6 py-8 text-center text-slate-500">
            No hay usuarios que coincidan con los filtros activos.
          </Card>
        ) : (
          usuariosFiltrados.map((usuario) => (
            <UsuarioRow
              key={usuario.id}
              canManage={data.provisionamiento.backendAdminConfigurado}
              onOpenDetail={() => setSelectedUserId(usuario.id)}
              usuario={usuario}
            />
          ))
        )}
      </div>

      {selectedUser ? (
        <UsuarioDetailModal
          canManage={data.provisionamiento.backendAdminConfigurado}
          onClose={() => setSelectedUserId(null)}
          puestos={data.puestosDisponibles}
          usuario={selectedUser}
        />
      ) : null}
    </div>
  )
}

function UsuarioRow({
  usuario,
  canManage,
  onOpenDetail,
}: {
  usuario: UsuarioListadoItem
  canManage: boolean
  onOpenDetail: () => void
}) {
  return (
    <Card className="border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-950">{usuario.empleado}</p>
            <StatusPill
              label={usuario.estadoCuenta}
              className={getEstadoCuentaTone(usuario.estadoCuenta)}
            />
            <StatusPill
              label={getEstadoSesionLabel(usuario.estadoSesion)}
              className={getEstadoSesionTone(usuario.estadoSesion)}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{formatPuesto(usuario.puesto)}</span>
            <span>{usuario.username ?? 'Sin username'}</span>
            <span>{usuario.cuentaCliente ?? 'Interno'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill
              label={usuario.authVinculado ? 'AUTH OK' : 'SIN AUTH'}
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
            {usuario.sesionesActivas > 0 ? (
              <StatusPill
                label={`${usuario.sesionesActivas} sesiones activas`}
                className="bg-violet-100 text-violet-700"
              />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row lg:flex-col lg:items-end">
          <button
            type="button"
            onClick={onOpenDetail}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Ver empleado
          </button>
          {!canManage ? (
            <p className="max-w-52 text-xs text-amber-700">
              El backend admin debe estar listo para operar cambios.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function UsuarioDetailModal({
  usuario,
  puestos,
  canManage,
  onClose,
}: {
  usuario: UsuarioListadoItem
  puestos: string[]
  canManage: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<'resumen' | 'acciones' | 'seguridad' | 'actividad' | 'sesiones'>('resumen')

  return (
    <ModalPanel
      open
      onClose={onClose}
      title={usuario.empleado}
      subtitle={`${formatPuesto(usuario.puesto)} · ${usuario.username ?? 'Sin username'}`}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={usuario.estadoCuenta}
                  className={getEstadoCuentaTone(usuario.estadoCuenta)}
                />
                <StatusPill
                  label={getEstadoSesionLabel(usuario.estadoSesion)}
                  className={getEstadoSesionTone(usuario.estadoSesion)}
                />
                <StatusPill
                  label={usuario.authVinculado ? 'AUTH VINCULADO' : 'SIN AUTH'}
                  className={
                    usuario.authVinculado
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-700'
                  }
                />
                <StatusPill
                  label={usuario.correoVerificado ? 'EMAIL VERIFICADO' : 'EMAIL SIN VERIFICAR'}
                  className={
                    usuario.correoVerificado
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-amber-100 text-amber-700'
                  }
                />
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Cuenta
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {usuario.cuentaCliente ?? 'Interno'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {usuario.cuentaClienteIdentificador ?? 'Sin cuenta cliente'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Correo auth
                  </p>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-900">
                    {usuario.correoAuth ?? 'Sin correo auth'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Ultimo acceso app
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {formatDateTime(usuario.ultimoAccesoEn)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Sesiones activas
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {usuario.sesionesActivas}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid min-w-[220px] gap-3 rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:grid-cols-2 lg:w-[260px] lg:grid-cols-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Puesto actual
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {formatPuesto(usuario.puesto)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Username
                </p>
                <p className="mt-2 break-words text-base font-semibold text-slate-950">
                  {usuario.username ?? 'Sin username'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          <DetailTabButton active={tab === 'resumen'} onClick={() => setTab('resumen')}>
            Resumen
          </DetailTabButton>
          <DetailTabButton active={tab === 'acciones'} onClick={() => setTab('acciones')}>
            Acciones
          </DetailTabButton>
          <DetailTabButton active={tab === 'seguridad'} onClick={() => setTab('seguridad')}>
            Seguridad
          </DetailTabButton>
          <DetailTabButton active={tab === 'actividad'} onClick={() => setTab('actividad')}>
            Actividad
          </DetailTabButton>
          <DetailTabButton active={tab === 'sesiones'} onClick={() => setTab('sesiones')}>
            Sesiones
          </DetailTabButton>
        </div>

        {tab === 'resumen' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard
              title="Resumen del acceso"
              description="Ficha operativa resumida del empleado y su cuenta de acceso."
            >
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <InfoRow label="Empleado" value={usuario.empleado} />
                <InfoRow label="Puesto actual" value={formatPuesto(usuario.puesto)} />
                <InfoRow label="Username" value={usuario.username ?? 'Sin username'} />
                <InfoRow label="Correo negocio" value={usuario.correo ?? 'Sin correo'} />
                <InfoRow label="Correo auth" value={usuario.correoAuth ?? 'Sin correo auth'} />
                <InfoRow label="Cuenta cliente" value={usuario.cuentaCliente ?? 'Interno'} />
                <InfoRow
                  label="Identificador cuenta"
                  value={usuario.cuentaClienteIdentificador ?? 'Sin cuenta cliente'}
                />
                <InfoRow label="Ultimo acceso app" value={formatDateTime(usuario.ultimoAccesoEn)} />
              </div>
            </DetailCard>

            <DetailCard
              title="Diagnostico de sesion"
              description="Estado de claims, actividad reciente y trazabilidad auth."
            >
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <InfoRow label="Estado sesion" value={getEstadoSesionLabel(usuario.estadoSesion)} />
                <InfoRow label="Sesiones activas" value={String(usuario.sesionesActivas)} />
                <InfoRow
                  label="Ultimo sign-in auth"
                  value={formatDateTime(usuario.ultimoSignInAuthEn)}
                />
                <InfoRow
                  label="Contexto auth"
                  value={formatDateTime(usuario.authContextUpdatedAt)}
                />
                <InfoRow label="Actualizado" value={formatDateTime(usuario.actualizadoEn)} />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'acciones' ? (
          <DetailCard
            title="Acciones administrativas"
            description="Operaciones directas sobre el empleado y su acceso."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailSubsection
                title="Cambio organizacional"
                description="Ajusta el puesto que gobierna permisos y rol del sistema."
              >
                <CambioPuestoForm
                  currentPuesto={usuario.puesto}
                  disabled={!canManage}
                  empleado={usuario.empleado}
                  puestos={puestos}
                  usuarioId={usuario.id}
                />
              </DetailSubsection>

              <DetailSubsection
                title="Reset de acceso"
                description="Envio manual de reset para cuentas activas con correo auth real."
              >
                <ResetPasswordForm
                  disabled={!canManage || !usuario.puedeResetPassword}
                  disabledReason={usuario.motivoNoReset}
                  empleado={usuario.empleado}
                  usuarioId={usuario.id}
                />
              </DetailSubsection>
            </div>
          </DetailCard>
        ) : null}

        {tab === 'seguridad' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard
              title="Estado de la cuenta"
              description="Control de suspension o reactivacion del acceso administrativo."
            >
              <EstadoCuentaForm
                currentState={usuario.estadoCuenta}
                disabled={!canManage}
                empleado={usuario.empleado}
                usuarioId={usuario.id}
              />
            </DetailCard>

            <DetailCard
              title="Postura de seguridad"
              description="Lectura rapida del estado de autenticacion y elegibilidad de reset."
            >
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <InfoRow label="Auth vinculado" value={usuario.authVinculado ? 'Si' : 'No'} />
                <InfoRow label="Email verificado" value={usuario.correoVerificado ? 'Si' : 'No'} />
                <InfoRow
                  label="Puede recibir reset"
                  value={usuario.puedeResetPassword ? 'Si' : 'No'}
                />
                <InfoRow
                  label="Motivo bloqueo reset"
                  value={usuario.motivoNoReset ?? 'Sin bloqueo'}
                />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'actividad' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard
              title="Trazabilidad reciente"
              description="Fechas clave para soporte operativo y diagnostico administrativo."
            >
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <InfoRow label="Actualizado" value={formatDateTime(usuario.actualizadoEn)} />
                <InfoRow label="Ultimo acceso app" value={formatDateTime(usuario.ultimoAccesoEn)} />
                <InfoRow
                  label="Ultimo sign-in auth"
                  value={formatDateTime(usuario.ultimoSignInAuthEn)}
                />
                <InfoRow
                  label="Contexto auth"
                  value={formatDateTime(usuario.authContextUpdatedAt)}
                />
              </div>
            </DetailCard>

            <DetailCard
              title="Lectura operativa"
              description="Resumen ejecutivo para entender el estado del usuario sin entrar a acciones."
            >
              <div className="space-y-3 text-sm text-slate-600">
                <SummaryLine
                  label="Estado de cuenta"
                  value={usuario.estadoCuenta}
                />
                <SummaryLine
                  label="Estado de sesion"
                  value={getEstadoSesionLabel(usuario.estadoSesion)}
                />
                <SummaryLine
                  label="Cuenta cliente"
                  value={usuario.cuentaCliente ?? 'Interno'}
                />
                <SummaryLine
                  label="Correo negocio"
                  value={usuario.correo ?? 'Sin correo'}
                />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'sesiones' ? (
          <DetailCard
            title="Sesiones activas"
            description="Sesiones abiertas actualmente en auth para este usuario."
          >
            {usuario.sesiones.length > 0 ? (
              <SessionDetails sessions={usuario.sesiones} />
            ) : (
              <p className="text-sm text-slate-500">No hay sesiones activas registradas.</p>
            )}
          </DetailCard>
        ) : null}
      </div>
    </ModalPanel>
  )
}
function DetailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
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
              label: `${empleado.nombreCompleto} / ${formatPuesto(empleado.puesto)}${empleado.idNomina ? ` / nomina ${empleado.idNomina}` : ''}`,
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
  return <SharedMetricCard label={label} value={value} />
}

function DetailCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function DetailSubsection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
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
