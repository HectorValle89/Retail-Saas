'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { ModalPanel } from '@/components/ui/modal-panel'
import {
  CancelarAltaForm,
  CerrarBajaEmpleadoNominaForm,
  DetailCard,
  DocumentoUploadForm,
  DocumentosList,
  ImssEstadoForm,
  InfoRow,
  ReadOnlyWorkflowCard,
  StatusPill as WorkflowStatusPill,
} from '@/features/empleados/components/EmpleadosPanel'
import { resolverSolicitudDesdeDashboard } from '@/features/solicitudes/actions'
import { ESTADO_SOLICITUD_INICIAL } from '@/features/solicitudes/state'
import {
  normalizePayrollInboxKey,
  type PayrollInboxLaneKey,
} from '@/features/empleados/lib/workflowInbox'
import type { NominaWorkspaceData } from '@/features/nomina/services/nominaWorkspaceService'

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin fecha'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin fecha'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function buildAttendanceExportHref(month: string) {
  const params = new URLSearchParams({
    month,
    format: 'xlsx',
  })

  return `/api/asistencias/export?${params.toString()}`
}

export function NominaWorkspacePanel({
  data,
  initialInbox = 'ALL',
  compact = false,
}: {
  data: NominaWorkspaceData
  initialInbox?: string
  compact?: boolean
}) {
  const [inboxFilter, setInboxFilter] = useState<PayrollInboxLaneKey | 'ALL'>(
    normalizePayrollInboxKey(initialInbox)
  )
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [selectedSolicitudId, setSelectedSolicitudId] = useState<string | null>(null)

  const visibleInbox =
    inboxFilter === 'ALL' ? data.payrollInbox : data.payrollInbox.filter((lane) => lane.key === inboxFilter)
  const selectedTicket =
    data.payrollInbox.flatMap((lane) => lane.items).find((item) => item.id === selectedTicketId) ?? null
  const selectedSolicitud =
    data.incapacidadesPendientes.find((item) => item.id === selectedSolicitudId) ?? null

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className={`grid gap-4 ${compact ? 'md:grid-cols-2 xl:grid-cols-5' : 'md:grid-cols-3 xl:grid-cols-5'}`}>
        <MetricCard label="Altas IMSS" value={String(data.summary.altasImssPendientes)} />
        <MetricCard label="En proceso" value={String(data.summary.altasEnProceso)} />
        <MetricCard label="Observadas" value={String(data.summary.altasObservadas)} />
        <MetricCard label="Bajas pendientes" value={String(data.summary.bajasPendientes)} />
        <MetricCard label="Incapacidades" value={String(data.summary.incapacidadesPendientes)} />
      </div>

      <Card className="space-y-4 border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Canvas de altas</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Flujo IMSS y handoff de reclutamiento</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Este canvas concentra las altas pendientes, altas en proceso, observaciones de nómina y cierres institucionales.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-full bg-[var(--module-primary)] px-4 py-2 text-sm font-semibold text-white">
            Total {data.summary.totalMovimientos}
          </span>
        </div>

        <PayrollInboxBoard
          lanes={visibleInbox}
          activeFilter={inboxFilter}
          onFilterChange={setInboxFilter}
          onOpen={(item) => setSelectedTicketId(item.id)}
        />
      </Card>

      <Card className="space-y-4 border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Calendario mensual</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Asistencias para prenómina y nómina</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Nómina solo necesita abrir el calendario administrativo y descargar la lista mensual para procesar prenómina y nómina.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/asistencias?month=${data.attendanceMonth}`}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Abrir asistencias
            </Link>
            <a
              href={buildAttendanceExportHref(data.attendanceMonth)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Descargar asistencias
            </a>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Incapacidades</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Revision final de IMSS</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Aqui llegan solo las incapacidades ya validadas por Reclutamiento. Nómina puede descargar el documento, revisar IMSS y formalizar el cierre final.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            Pendientes {data.incapacidadesPendientes.length}
          </span>
        </div>

        <div className="space-y-3">
          {data.incapacidadesPendientes.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              No hay incapacidades pendientes de formalizacion en IMSS.
            </p>
          ) : (
            data.incapacidadesPendientes.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <WorkflowStatusPill label="INCAPACIDAD" className="bg-violet-100 text-violet-700" />
                      <WorkflowStatusPill label={item.estatus} className="bg-sky-100 text-sky-700" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{item.empleadoNombre}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(item.fechaInicio)} a {formatDate(item.fechaFin)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{item.motivo ?? 'Sin motivo capturado.'}</p>
                    {item.comentarios ? <p className="mt-2 text-xs text-slate-500">{item.comentarios}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {item.justificanteUrl ? (
                      <a
                        href={item.justificanteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Descargar archivo
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedSolicitudId(item.id)}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--module-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--module-hover)]"
                    >
                      Revisar incapacidad
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {selectedTicket ? <PayrollTicketModal item={selectedTicket} onClose={() => setSelectedTicketId(null)} /> : null}
      {selectedSolicitud ? <NominaIncapacidadModal item={selectedSolicitud} onClose={() => setSelectedSolicitudId(null)} /> : null}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      className="min-w-0 px-4 py-5"
      labelClassName="text-xs leading-4 text-center"
      valueClassName="w-full truncate text-[1.1rem] leading-tight tracking-[-0.02em] text-center sm:text-[1.25rem]"
    />
  )
}

function PayrollInboxBoard({
  lanes,
  activeFilter,
  onFilterChange,
  onOpen,
}: {
  lanes: NominaWorkspaceData['payrollInbox']
  activeFilter: PayrollInboxLaneKey | 'ALL'
  onFilterChange: (value: PayrollInboxLaneKey | 'ALL') => void
  onOpen: (item: NominaWorkspaceData['payrollInbox'][number]['items'][number]) => void
}) {
  const [selectedLaneKey, setSelectedLaneKey] = useState<PayrollInboxLaneKey | null>(
    activeFilter !== 'ALL' ? activeFilter : null
  )
  const totalItems = lanes.reduce((total, lane) => total + lane.items.length, 0)
  const selectedLane = selectedLaneKey ? lanes.find((lane) => lane.key === selectedLaneKey) ?? null : null

  function openLane(laneKey: PayrollInboxLaneKey) {
    setSelectedLaneKey(laneKey)
    onFilterChange(laneKey)
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {lanes.map((lane) => (
          <button
            key={lane.key}
            type="button"
            onClick={() => openLane(lane.key)}
            className={`rounded-[20px] border p-4 text-left transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)] ${
              activeFilter === lane.key
                ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)]'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-950">{lane.label}</h3>
                <p className="mt-1 text-xs text-slate-500">Abrir bandeja</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {lane.items.length}
              </span>
            </div>
          </button>
        ))}
        {totalItems === 0 && (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 md:col-span-2 xl:col-span-3 2xl:col-span-6">
            No hay tickets activos en el flujo IMSS.
          </div>
        )}
      </div>

      {selectedLane ? (
        <PayrollLaneModal
          lane={selectedLane}
          onClose={() => {
            setSelectedLaneKey(null)
            onFilterChange('ALL')
          }}
          onOpen={onOpen}
        />
      ) : null}
    </>
  )
}

function PayrollLaneModal({
  lane,
  onClose,
  onOpen,
}: {
  lane: NominaWorkspaceData['payrollInbox'][number]
  onClose: () => void
  onOpen: (item: NominaWorkspaceData['payrollInbox'][number]['items'][number]) => void
}) {
  return (
    <ModalPanel open onClose={onClose} title={lane.label} subtitle={lane.description} maxWidthClassName="max-w-6xl">
      <div className="space-y-3">
        {lane.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            Sin tickets en esta bandeja.
          </div>
        ) : (
          lane.items.map((item) => (
            <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_180px_180px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {item.movementType}
                      </span>
                      <WorkflowStatusPill
                        label={item.statusLabel}
                        className={item.movementType === 'BAJA' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{item.employeeSummary.nombreCompleto}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.employeeSummary.nss ?? item.employeeSummary.curp ?? 'Sin NSS/CURP'}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Puesto</p>
                    <p className="mt-2 text-sm text-slate-700">{item.employeeSummary.puesto.replace(/_/g, ' ')}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Documentos</p>
                    <p className="mt-2 text-sm text-slate-700">{item.documentsSummary}</p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3 xl:max-w-[340px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Observacion</p>
                  <p className="text-sm leading-6 text-slate-600">
                    {item.lastObservation ?? 'Sin observaciones registradas.'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center xl:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpen(item)
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Ver ticket
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </ModalPanel>
  )
}

function PayrollTicketModal({
  item,
  onClose,
}: {
  item: NominaWorkspaceData['payrollInbox'][number]['items'][number]
  onClose: () => void
}) {
  const employee = item.employee
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const canCancelAlta = item.movementType === 'ALTA' && (
    item.stage === 'PENDIENTE_IMSS_NOMINA' ||
    item.stage === 'EN_FLUJO_IMSS' ||
    item.stage === 'RECLUTAMIENTO_CORRECCION_ALTA' ||
    item.stage === 'PENDIENTE_ACCESO_ADMIN'
  )

  return (
    <ModalPanel
      open
      onClose={onClose}
      title={employee.nombreCompleto}
      subtitle={`${item.movementType} · ${item.statusLabel}`}
      maxWidthClassName="max-w-5xl"
    >
      <div className="space-y-4">
        {canCancelAlta ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Control de alta</p>
              <p className="mt-1 text-xs text-slate-500">
                Si la persona ya no seguira con la agencia, puedes cancelar el proceso completo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              Cancelar proceso completo
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <DetailCard title="Resumen" description="Ticket recibido desde Reclutamiento.">
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
              <InfoRow label="NSS" value={employee.nss ?? 'Sin NSS'} />
              <InfoRow label="CURP" value={employee.curp ?? 'Sin CURP'} />
              <InfoRow label="Puesto" value={employee.puesto.replace(/_/g, ' ')} />
              <InfoRow label="Zona" value={employee.zona ?? 'Sin zona'} />
              <InfoRow label="Fecha alta" value={formatDate(employee.fechaAlta)} />
              <InfoRow label="Fecha baja" value={formatDate(employee.fechaBaja)} />
            </div>
            {item.lastObservation ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {item.lastObservation}
              </div>
            ) : null}
          </DetailCard>

          <DetailCard title="Acciones de nomina" description="Solo herramientas de IMSS y cierre institucional.">
            {item.movementType === 'BAJA' ? (
              item.stage === 'PENDIENTE_BAJA_IMSS' ? (
                <CerrarBajaEmpleadoNominaForm empleado={employee} />
              ) : (
                <ReadOnlyWorkflowCard
                  lines={[
                    `workflow: ${employee.workflowStage ?? 'sin etapa'}`,
                    `estado IMSS: ${employee.imssEstado}`,
                    `observacion: ${item.lastObservation ?? 'sin observaciones'}`,
                  ]}
                />
              )
            ) : item.stage === 'PENDIENTE_ACCESO_ADMIN' ? (
              <ReadOnlyWorkflowCard
                lines={[
                  'Alta IMSS cerrada.',
                  'Administracion ya puede crear el acceso provisional.',
                  `estado IMSS: ${employee.imssEstado}`,
                ]}
              />
            ) : (
              <ImssEstadoForm empleado={employee} />
            )}
          </DetailCard>

          <DetailCard
            title={item.movementType === 'BAJA' ? 'Soporte institucional' : 'Carga IMSS'}
            description={
              item.movementType === 'BAJA'
                ? 'Nomina puede adjuntar o revisar el comprobante oficial de baja.'
                : 'Aqui se revisa el expediente recibido y se carga el PDF de alta IMSS.'
            }
          >
            <DocumentoUploadForm empleado={employee} actorPuesto="NOMINA" />
          </DetailCard>

          <div className="xl:col-span-2">
            <DetailCard
              title="Documentos"
              description="Expediente previo, soportes corregidos y comprobantes institucionales."
            >
              <DocumentosList documentos={employee.documentos} />
            </DetailCard>
          </div>
        </div>
      </div>

      {cancelModalOpen ? (
        <ModalPanel
          open
          onClose={() => setCancelModalOpen(false)}
          title="Cancelar proceso de alta"
          subtitle={employee.nombreCompleto}
          maxWidthClassName="max-w-2xl"
        >
          <CancelarAltaForm empleado={employee} />
        </ModalPanel>
      ) : null}
    </ModalPanel>
  )
}

function NominaIncapacidadModal({
  item,
  onClose,
}: {
  item: NominaWorkspaceData['incapacidadesPendientes'][number]
  onClose: () => void
}) {
  return (
    <ModalPanel open onClose={onClose} title={item.empleadoNombre} subtitle="Revision final de incapacidad" maxWidthClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-[22px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-text)]">
            Ticket
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{item.empleadoNombre}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {formatDate(item.fechaInicio)} a {formatDate(item.fechaFin)}
          </p>
          <p className="mt-3 text-sm text-slate-600">{item.motivo ?? 'Sin motivo capturado por el colaborador.'}</p>
          {item.comentarios ? (
            <p className="mt-3 rounded-[16px] bg-white px-3 py-3 text-sm text-slate-600">{item.comentarios}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>Enviada: {formatDateTime(item.enviadaEn)}</span>
            <span>Sup: {formatDateTime(item.validadaSupervisorEn)}</span>
            <span>Reclutamiento: {formatDateTime(item.validadaReclutamientoEn)}</span>
          </div>
          {item.justificanteUrl ? (
            <div className="mt-4">
              <a
                href={item.justificanteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Descargar archivo adjunto
              </a>
            </div>
          ) : null}
        </div>

        <NominaIncapacidadResolutionForm item={item} onResolved={onClose} />
      </div>
    </ModalPanel>
  )
}

function NominaIncapacidadResolutionForm({
  item,
  onResolved,
}: {
  item: NominaWorkspaceData['incapacidadesPendientes'][number]
  onResolved: () => void
}) {
  const [state, formAction] = useActionState(resolverSolicitudDesdeDashboard, ESTADO_SOLICITUD_INICIAL)
  const [submittedStatus, setSubmittedStatus] = useState<'REGISTRADA_RH' | 'RECHAZADA' | 'CORRECCION_SOLICITADA' | null>(null)

  useEffect(() => {
    if (!state.ok || !submittedStatus) {
      return
    }

    onResolved()
  }, [onResolved, state.ok, submittedStatus])

  return (
    <form id={`nomina-incapacidad-${item.id}`} action={formAction} className="space-y-4">
      <input type="hidden" name="solicitud_id" value={item.id} />
      <input type="hidden" name="cuenta_cliente_id" value={item.cuentaClienteId} />

      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Comentario de resolucion
        <textarea
          name="comentarios_resolucion"
          rows={4}
          placeholder="Deja la observacion interna o el resultado de la revision en IMSS"
          className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
        />
      </label>

      {state.message && (
        <p className={`rounded-[18px] px-4 py-3 text-sm ${state.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-900' : 'border border-rose-200 bg-rose-50 text-rose-900'}`}>
          {state.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="submit"
          form={`nomina-incapacidad-${item.id}`}
          name="estatus"
          value="RECHAZADA"
          onClick={() => setSubmittedStatus('RECHAZADA')}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
        >
          Rechazar
        </button>
        <button
          type="submit"
          form={`nomina-incapacidad-${item.id}`}
          name="estatus"
          value="CORRECCION_SOLICITADA"
          onClick={() => setSubmittedStatus('CORRECCION_SOLICITADA')}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
        >
          Pedir correccion
        </button>
        <button
          type="submit"
          form={`nomina-incapacidad-${item.id}`}
          name="estatus"
          value="REGISTRADA_RH"
          onClick={() => setSubmittedStatus('REGISTRADA_RH')}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--module-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--module-hover)]"
        >
          Aprobar en IMSS
        </button>
      </div>
    </form>
  )
}
