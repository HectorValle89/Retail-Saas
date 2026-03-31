'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Card, EvidencePreview } from '@/components/ui'
import {
  getSingleTenantAccountLabel,
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import { actualizarEstatusSolicitud, registrarSolicitudOperativa } from '../actions'
import { resolverRegistroExtemporaneoDesdePanel } from '../extemporaneoActions'
import { ESTADO_SOLICITUD_INICIAL } from '../state'
import type { SolicitudCalendarDay, SolicitudListadoItem, SolicitudesPanelData } from '../services/solicitudService'

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

function buildMonthHref(data: SolicitudesPanelData, delta: number) {
  const [yearRaw, monthRaw] = data.calendario.month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + delta, 1))
  const params = buildFilterParams(data)
  params.set('month', new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit' }).format(value))
  params.set('page', '1')
  return `/solicitudes?${params.toString()}`
}

function buildCalendarDayLabel(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDate()
}

function getCalendarEventTone(tipo: string) {
  if (tipo === 'INCAPACIDAD') {
    return 'bg-rose-100 text-rose-700'
  }

  if (tipo === 'VACACIONES') {
    return 'bg-amber-100 text-amber-800'
  }

  if (tipo === 'AVISO_INASISTENCIA') {
    return 'bg-orange-100 text-orange-800'
  }

  if (tipo === 'JUSTIFICACION_FALTA') {
    return 'bg-cyan-100 text-cyan-800'
  }

  return 'bg-sky-100 text-sky-700'
}

function MetricGlyph() {
  return (
    <span className="metric-icon-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M5 12h14" strokeLinecap="round" />
        <path d="M12 5v14" strokeLinecap="round" />
        <path d="M7 7l10 10" strokeLinecap="round" opacity="0.15" />
      </svg>
    </span>
  )
}

export function SolicitudesPanel({ data }: { data: SolicitudesPanelData }) {
  const [state, formAction] = useActionState(registrarSolicitudOperativa, ESTADO_SOLICITUD_INICIAL)
  const canPrev = data.paginacion.page > 1
  const canNext = data.paginacion.page < data.paginacion.totalPages
  const fixedAccount = resolveSingleTenantAccountOption(data.cuentas)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)

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

      <Card className="space-y-5 bg-white p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
            Incidencias justificadas
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">Registrar solicitud</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Registra avisos, justificaciones y solicitudes operativas con reglas de aprobacion, evidencia y trazabilidad completa.
          </p>
        </div>

        <form action={formAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <SubmitButton label="Registrar solicitud" pendingLabel="Registrando..." />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      </Card>

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

      {data.calendario.canView && (
        <Card className="space-y-5 bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                Calendario de ausencias
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Vista mensual para supervisor y coordinación
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Cruza incapacidades, vacaciones y permisos aprobados o en flujo para anticipar cobertura operativa.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PaginationLink href={buildMonthHref(data, -1)} disabled={false}>Mes anterior</PaginationLink>
              <span className="text-sm font-medium text-slate-700">{data.calendario.monthLabel}</span>
              <PaginationLink href={buildMonthHref(data, 1)} disabled={false}>Mes siguiente</PaginationLink>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map((label) => (
              <div key={label} className="rounded-2xl bg-slate-50 px-2 py-3">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {data.calendario.days.map((day) => (
              <CalendarDayCard key={day.date} day={day} />
            ))}
          </div>
        </Card>
      )}

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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Registros extemporaneos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Buffer de ventas y LOVE ISDIN fuera de ventana, pendiente de aprobacion de supervision.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric label="Total" value={String(data.resumenExtemporaneo.total)} />
              <MiniMetric label="Pendientes" value={String(data.resumenExtemporaneo.pendientes)} />
              <MiniMetric label="Aprobados" value={String(data.resumenExtemporaneo.aprobados)} />
              <MiniMetric label="Rechazados" value={String(data.resumenExtemporaneo.rechazados)} />
            </div>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          {data.registrosExtemporaneos.length === 0 ? (
            <p className="text-sm text-slate-500">Todavia no hay registros extemporaneos en esta cuenta.</p>
          ) : (
            data.registrosExtemporaneos.map((item) => (
              <div
                key={item.id}
                className="rounded-[18px] border border-border/60 bg-white px-4 py-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-950">{item.empleado}</p>
                      <StatusPill active={item.estatus === 'APROBADO'} label={item.estatus} />
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {item.tipoRegistro}
                      </span>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                        Gap {item.gapDiasRetraso}d
                      </span>
                      {item.recurrenciaMes > 2 && (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
                          Recurrente este mes: {item.recurrenciaMes}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {item.pdvClaveBtl ?? 'Sin clave'} · {item.pdv ?? 'Sin PDV'} · {item.fechaOperativa}
                      {item.supervisor ? ` · Supervisor: ${item.supervisor}` : ''}
                    </p>
                    <p className="text-sm text-slate-700">{item.motivo}</p>
                    {item.tipoRegistro !== 'LOVE_ISDIN' && Boolean(item.ventaPayload.producto_nombre) && (
                      <p className="text-xs text-slate-500">
                        Venta: {String(item.ventaPayload.producto_nombre ?? '')} · {String(item.ventaPayload.total_unidades ?? 0)} unidades
                      </p>
                    )}
                    {item.tipoRegistro !== 'VENTA' && Boolean(item.lovePayload.afiliado_nombre) && (
                      <p className="text-xs text-slate-500">
                        LOVE: {String(item.lovePayload.afiliado_nombre ?? '')}
                        {item.lovePayload.afiliado_contacto ? ` · ${String(item.lovePayload.afiliado_contacto)}` : ''}
                      </p>
                    )}
                    {(item.evidenciaThumbnailUrl || item.evidenciaUrl) && (
                      <EvidencePreview
                        url={item.evidenciaThumbnailUrl ?? item.evidenciaUrl}
                        hash={item.evidenciaThumbnailHash ?? item.evidenciaHash}
                        label={`Evidencia extemporanea ${item.tipoRegistro}`}
                        emptyLabel="Sin evidencia"
                      />
                    )}
                    {item.motivoRechazo && (
                      <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Motivo de rechazo: {item.motivoRechazo}
                      </div>
                    )}
                  </div>

                  <div className="w-full max-w-sm space-y-3 lg:w-80">
                    {item.requiereAccionActor ? (
                      <>
                        <form action={resolverRegistroExtemporaneoDesdePanel} className="space-y-2">
                          <input type="hidden" name="registro_extemporaneo_id" value={item.id} />
                          <input type="hidden" name="decision" value="APROBAR" />
                          <button
                            type="submit"
                            className="w-full rounded-[12px] bg-[var(--module-primary)] px-4 py-2.5 text-sm font-medium text-white"
                          >
                            Aprobar y consolidar
                          </button>
                        </form>
                        <form action={resolverRegistroExtemporaneoDesdePanel} className="space-y-2">
                          <input type="hidden" name="registro_extemporaneo_id" value={item.id} />
                          <input type="hidden" name="decision" value="RECHAZAR" />
                          <textarea
                            name="motivo_rechazo"
                            rows={2}
                            className="w-full rounded-[12px] border border-border bg-surface-subtle px-3 py-2 text-sm text-slate-900"
                            placeholder="Motivo de rechazo"
                            required
                          />
                          <button
                            type="submit"
                            className="w-full rounded-[12px] border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-700"
                          >
                            Rechazar
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {item.estatus === 'PENDIENTE_APROBACION'
                          ? 'Pendiente de revision por el supervisor asignado.'
                          : item.estatus === 'APROBADO'
                            ? 'Ya consolidado en la base final.'
                            : 'Cerrado con rechazo.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

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

function CalendarDayCard({ day }: { day: SolicitudCalendarDay }) {
  return (
    <div
      className={`min-h-36 rounded-3xl border p-3 ${
        day.inCurrentMonth ? 'border-border/60 bg-white shadow-sm' : 'border-border/40 bg-slate-50/80'
      } ${day.isToday ? 'ring-2 ring-[var(--module-border)]' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${day.inCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
          {buildCalendarDayLabel(day.date)}
        </span>
        <span className="text-[11px] text-slate-400">{day.events.length}</span>
      </div>

      <div className="mt-3 space-y-2">
        {day.events.length === 0 ? (
          <p className="text-xs text-slate-400">Sin ausencias</p>
        ) : (
          day.events.slice(0, 3).map((event) => (
            <div key={`${day.date}-${event.id}`} className={`rounded-2xl px-3 py-2 text-left text-xs ${getCalendarEventTone(event.tipo)}`}>
              <div className="font-medium">{event.empleado}</div>
              <div className="mt-1">{event.tipo}</div>
            </div>
          ))
        )}
        {day.events.length > 3 && (
          <p className="text-xs text-slate-500">+{day.events.length - 3} mas</p>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
        </div>
        <MetricGlyph />
      </div>
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-subtle px-3 py-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
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
