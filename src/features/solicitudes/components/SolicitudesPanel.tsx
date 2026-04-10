'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Card, EvidencePreview, MetricCard as SharedMetricCard } from '@/components/ui'
import {
  getSingleTenantAccountLabel,
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import { actualizarEstatusSolicitud, registrarSolicitudOperativa } from '../actions'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { ESTADO_SOLICITUD_INICIAL } from '../state'
import type { SolicitudListadoItem, SolicitudesPanelData } from '../services/solicitudService'

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function formatApprovalPath(value: string[]) {
  return value.join(' -> ')
}

function buildPageHref(data: SolicitudesPanelData, page: number) {
  const params = buildFilterParams(data)
  params.set('page', String(page))
  params.set('pageSize', String(data.paginacion.pageSize))
  return `/solicitudes?${params.toString()}`
}

function buildFilterParams(data: SolicitudesPanelData) {
  const params = new URLSearchParams()

  if (data.filtros.tipo) {
    params.set('tipo', data.filtros.tipo)
  }

  if (data.filtros.estatus) {
    params.set('estatus', data.filtros.estatus)
  }

  if (data.filtros.empleadoId) {
    params.set('empleado_id', data.filtros.empleadoId)
  }

  if (data.filtros.fechaInicio) {
    params.set('fecha_inicio', data.filtros.fechaInicio)
  }

  if (data.filtros.fechaFin) {
    params.set('fecha_fin', data.filtros.fechaFin)
  }

  if (data.filtros.month) {
    params.set('month', data.filtros.month)
  }

  return params
}

export function SolicitudesPanel({ data }: { data: SolicitudesPanelData }) {
  const [state, formAction] = useActionState(registrarSolicitudOperativa, ESTADO_SOLICITUD_INICIAL)
  const canPrev = data.paginacion.page > 1
  const canNext = data.paginacion.page < data.paginacion.totalPages
  const fixedAccount = resolveSingleTenantAccountOption(data.cuentas)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)
  const canRegister = data.actorPuesto === 'DERMOCONSEJERO' || data.actorPuesto === 'SUPERVISOR'
  const [isUploadingR2, setIsUploadingR2] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    const justificante = formData.get('justificante')
    if (justificante instanceof File && justificante.size > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Upload(formData, justificante, {
          modulo: 'solicitudes',
          removeFieldName: 'justificante',
        })
      } catch (error) {
        console.error('No fue posible subir justificante a R2.', error)
      } finally {
        setIsUploadingR2(false)
      }
    }

    const action = formAction as unknown as (payload: FormData) => void
    action(formData)
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="bg-amber-50 text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Solicitudes totales" value={String(data.resumen.total)} />
        <MetricCard label="Pendientes" value={String(data.resumen.pendientes)} />
        <MetricCard label="Aprobadas" value={String(data.resumen.aprobadas)} />
        <MetricCard label="Validadas SUP" value={String(data.resumen.validadasSupervisor)} />
        <MetricCard label="Registradas RH" value={String(data.resumen.registradasRh)} />
        <MetricCard label="Bandeja accionable" value={String(data.resumen.pendientesAccionables)} />
      </div>

      {canRegister ? (
        <Card className="space-y-5 bg-white p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Incidencias justificadas
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Registrar solicitud</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Este registro solo vive para dermoconsejo y supervisión. Los demás roles aquí solo consultan y confirman el flujo.
            </p>
          </div>

          <form action={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {useSingleTenantUi ? (
              <>
                <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
                <label className="block text-sm text-slate-600">
                  Cuenta operativa
                  <div className="mt-2 min-h-[50px] rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-slate-900">
                    {getSingleTenantAccountLabel()}
                  </div>
                </label>
              </>
            ) : (
              <label className="block text-sm text-slate-600">
                Cuenta cliente
                <select name="cuenta_cliente_id" className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]">
                  {data.cuentas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm text-slate-600">
              Empleado
              <select name="empleado_id" className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]">
                {data.empleados.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Supervisor
              <select name="supervisor_empleado_id" className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]">
                <option value="">Sin supervisor</option>
                {data.supervisores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Tipo
              <select name="tipo" className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]">
                <option value="AVISO_INASISTENCIA">AVISO_INASISTENCIA</option>
                <option value="JUSTIFICACION_FALTA">JUSTIFICACION_FALTA</option>
                <option value="INCAPACIDAD">INCAPACIDAD</option>
                <option value="VACACIONES">VACACIONES</option>
                <option value="PERMISO">PERMISO</option>
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Fecha inicio
              <input
                name="fecha_inicio"
                type="date"
                defaultValue={getLocalDateValue()}
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Fecha fin
              <input
                name="fecha_fin"
                type="date"
                defaultValue={getLocalDateValue()}
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-2">
              Justificante
              <input
                name="justificante"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-2 block w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-[14px] file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-4">
              Motivo
              <textarea
                name="motivo"
                rows={3}
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                placeholder="Describe la incapacidad, permiso o contexto operativo."
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-4">
              Comentarios
              <textarea
                name="comentarios"
                rows={2}
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                placeholder="Notas internas para seguimiento."
              />
            </label>

            <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
              <SubmitButton
                label={isUploadingR2 ? 'Subiendo justificante...' : 'Registrar solicitud'}
                pendingLabel="Registrando..."
              />
              <StateMessage ok={state.ok} message={state.message} />
            </div>
          </form>
        </Card>
      ) : (
        <Card className="space-y-4 bg-white p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Flujo informativo
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Solicitudes solo de consulta y confirmación</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Para tu puesto este módulo ya no crea solicitudes nuevas. Aquí solo revisas, confirmas o cierras el flujo según tu rol.
            </p>
          </div>
          <div className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
            El calendario de ausencias ya vive en{' '}
            <Link href="/asistencias" className="font-medium underline underline-offset-2">
              Asistencias
            </Link>
            . Las ventas tardias y LOVE tardio ya se revisan en sus propios modulos.
          </div>
        </Card>
      )}

      <Card className="space-y-5 bg-white p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Filtros operativos
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">Explorar solicitudes</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Filtra por tipo, estado, colaboradora y rango para revisar ausencias y aprobaciones sin perder el contexto del mes.
          </p>
        </div>

        <form action="/solicitudes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={String(data.paginacion.pageSize)} />

          <label className="block text-sm text-slate-600">
            Tipo
            <select
              name="tipo"
              defaultValue={data.filtros.tipo}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            >
              <option value="">Todos</option>
              <option value="AVISO_INASISTENCIA">AVISO_INASISTENCIA</option>
              <option value="JUSTIFICACION_FALTA">JUSTIFICACION_FALTA</option>
              <option value="INCAPACIDAD">INCAPACIDAD</option>
              <option value="VACACIONES">VACACIONES</option>
              <option value="PERMISO">PERMISO</option>
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Estado
            <select
              name="estatus"
              defaultValue={data.filtros.estatus}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            >
              <option value="">Todos</option>
              <option value="BORRADOR">BORRADOR</option>
              <option value="ENVIADA">ENVIADA</option>
              <option value="VALIDADA_SUP">VALIDADA_SUP</option>
              <option value="REGISTRADA_RH">REGISTRADA_RH</option>
              <option value="REGISTRADA">REGISTRADA</option>
              <option value="CORRECCION_SOLICITADA">CORRECCION_SOLICITADA</option>
              <option value="RECHAZADA">RECHAZADA</option>
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Empleado
            <select
              name="empleado_id"
              defaultValue={data.filtros.empleadoId}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            >
              <option value="">Todos</option>
              {data.empleados.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Desde
            <input
              name="fecha_inicio"
              type="date"
              defaultValue={data.filtros.fechaInicio}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <label className="block text-sm text-slate-600">
            Hasta
            <input
              name="fecha_fin"
              type="date"
              defaultValue={data.filtros.fechaFin}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <label className="block text-sm text-slate-600">
            Mes calendario
            <input
              name="month"
              type="month"
              defaultValue={data.filtros.month}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="xl:col-span-6 flex flex-wrap items-center gap-3">
            <Button type="submit">Aplicar filtros</Button>
            <Link
              href="/solicitudes"
              prefetch={false}
              className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </Card>

      {data.actorPuesto && ['SUPERVISOR', 'COORDINADOR', 'NOMINA', 'ADMINISTRADOR'].includes(data.actorPuesto) && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-950">Bandeja de pendientes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Solicitudes que aun requieren accion de {data.actorPuesto} en esta pagina.
            </p>
          </div>

          <div className="space-y-3 px-6 py-5">
            {data.pendientesAccionables.length === 0 ? (
              <p className="text-sm text-slate-500">No hay solicitudes pendientes por resolver para tu puesto en esta pagina.</p>
            ) : (
              data.pendientesAccionables.map((item) => (
                <PendingActionRow key={item.id} item={item} />
              ))
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Solicitudes recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Seguimiento por colaborador, tipo, justificante, aprobacion y notificacion al DC.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Periodo</th>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Tipo / evidencia</th>
                <th className="px-6 py-3 font-medium">Flujo</th>
                <th className="px-6 py-3 font-medium">Resolucion</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.solicitudes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin solicitudes visibles todavia.
                  </td>
                </tr>
              ) : (
                data.solicitudes.map((item) => (
                  <tr key={item.id} className="border-t border-border/40 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.fechaInicio}</div>
                      <div className="mt-1 text-xs text-slate-400">hasta {item.fechaFin}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{item.empleado}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.supervisor ?? 'Sin supervisor'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.cuentaCliente ?? 'Sin cliente'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.tipo}</div>
                      <div className="mt-2">
                        <EvidencePreview
                          url={item.justificanteUrl}
                          hash={item.justificanteHash}
                          label={`Justificante ${item.tipo}`}
                          emptyLabel="Sin justificante"
                        />
                      </div>
                      {item.motivo && <div className="mt-2 text-xs text-slate-500">{item.motivo}</div>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="text-xs text-slate-500">{formatApprovalPath(item.approvalPath)}</div>
                      <div className="mt-2 text-xs text-slate-400">
                        {item.diaJustificado
                          ? 'Dia justificado en asistencias'
                          : item.justificaAsistencia
                            ? 'Justifica asistencia al aprobarse'
                            : 'No impacta asistencia'}
                      </div>
                      {item.siguienteActor && (
                        <div className="mt-2 text-xs font-medium text-amber-700">Siguiente actor: {item.siguienteActor}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill active={item.estadoResolucion === 'APROBADA'} label={item.estadoResolucion} />
                      <div className="mt-2 text-xs text-slate-500">Interno: {item.estatus}</div>
                      {item.comentarios && <div className="mt-2 text-xs text-slate-500">{item.comentarios}</div>}
                      {item.notificaciones[0] && (
                        <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <div className="font-medium text-slate-900">Ultima notificacion</div>
                          <div className="mt-1">{item.notificaciones[0].mensaje}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <form action={actualizarEstatusSolicitud} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="solicitud_id" value={item.id} />
                        <input type="hidden" name="cuenta_cliente_id" value={item.cuentaClienteId} />
                        <select
                          name="estatus"
                          defaultValue={item.estatus}
                          className="rounded-[12px] border border-border bg-surface-subtle px-3 py-2 text-xs text-slate-900"
                        >
                          <option value="BORRADOR">BORRADOR</option>
                          <option value="ENVIADA">ENVIADA</option>
                          <option value="VALIDADA_SUP">VALIDADA_SUP</option>
                          <option value="REGISTRADA_RH">REGISTRADA_RH</option>
                          <option value="REGISTRADA">REGISTRADA</option>
                          <option value="CORRECCION_SOLICITADA">CORRECCION_SOLICITADA</option>
                          <option value="RECHAZADA">RECHAZADA</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-[12px] bg-[var(--module-primary)] px-3 py-2 text-xs font-medium text-white"
                        >
                          Actualizar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Paginacion incremental</p>
            <p className="mt-1 text-xs text-slate-500">
              Pagina {data.paginacion.page} de {data.paginacion.totalPages} | maximo {data.paginacion.pageSize} registros por pagina | total {data.paginacion.totalItems}
            </p>
          </div>
          <div className="flex gap-3">
            <PaginationLink href={buildPageHref(data, Math.max(1, data.paginacion.page - 1))} disabled={!canPrev}>Anterior</PaginationLink>
            <PaginationLink href={buildPageHref(data, Math.min(data.paginacion.totalPages, data.paginacion.page + 1))} disabled={!canNext}>Siguiente</PaginationLink>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function PendingActionRow({ item }: { item: SolicitudListadoItem }) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border/60 bg-white px-4 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-medium text-slate-950">{item.empleado} · {item.tipo}</p>
        <p className="mt-1 text-sm text-slate-500">{item.cuentaCliente ?? 'Sin cliente'} · {item.fechaInicio} a {item.fechaFin}</p>
        <p className="mt-1 text-xs text-amber-700">Pendiente por {item.siguienteActor ?? 'resolver'}</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill active={false} label={item.estadoResolucion} />
      </div>
    </div>
  )
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const toneClass =
    label === 'RECHAZADA'
      ? 'bg-rose-100 text-rose-700'
      : label === 'CORRECCION_SOLICITADA'
        ? 'bg-amber-100 text-amber-800'
        : active
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-700'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  )
}

function StateMessage({ ok, message }: { ok: boolean; message: string | null }) {
  if (!message) {
    return null
  }

  return <p className={`text-sm ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message}</p>
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: string }) {
  if (disabled) {
    return <span className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm text-slate-400">{children}</span>
  }

  return <Link href={href} prefetch={false} className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]">{children}</Link>
}
