'use client'

import { useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { ModalPanel } from '@/components/ui/modal-panel'
import type { NominaPanelData } from '../services/nominaService'
import { CreatePeriodoNominaForm } from './CreatePeriodoNominaForm'
import { LedgerManualNominaForm } from './LedgerManualNominaForm'
import { PeriodoNominaControls } from './PeriodoNominaControls'
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
import {
  normalizePayrollInboxKey,
  type PayrollInboxLaneKey,
} from '@/features/empleados/lib/workflowInbox'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

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

function resolveExportPeriod(clave: string | null) {
  if (!clave) {
    return null
  }

  const match = clave.match(/\d{4}-\d{2}/)
  return match ? match[0] : null
}

function buildNominaExportHref(periodo: string, format: 'csv' | 'xlsx') {
  const params = new URLSearchParams({
    section: 'nomina',
    periodo,
    format,
  })

  return `/api/reportes/export?${params.toString()}`
}

export function NominaPanel({
  data,
  initialInbox = 'ALL',
}: {
  data: NominaPanelData
  initialInbox?: string
}) {
  const exportablePeriod = resolveExportPeriod(data.periodoExportableClave ?? data.resumen.periodoAbierto)
  const [inboxFilter, setInboxFilter] = useState<PayrollInboxLaneKey | 'ALL'>(
    normalizePayrollInboxKey(initialInbox)
  )
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const visibleInbox =
    inboxFilter === 'ALL' ? data.payrollInbox : data.payrollInbox.filter((lane) => lane.key === inboxFilter)
  const selectedTicket =
    data.payrollInbox.flatMap((lane) => lane.items).find((item) => item.id === selectedTicketId) ?? null

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <PayrollInboxBoard
        lanes={visibleInbox}
        activeFilter={inboxFilter}
        onFilterChange={setInboxFilter}
        onOpen={(item) => setSelectedTicketId(item.id)}
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <MetricCard label="Periodos" value={String(data.resumen.periodos)} />
        <MetricCard label="Periodo activo" value={data.resumen.periodoAbierto ?? 'Ninguno'} />
        <MetricCard label="Colaboradores" value={String(data.resumen.colaboradores)} />
        <MetricCard label="Percepciones" value={formatCurrency(data.resumen.percepciones)} />
        <MetricCard label="Deducciones" value={formatCurrency(data.resumen.deducciones)} />
        <MetricCard label="Reembolsos gasto" value={formatCurrency(data.resumen.reembolsosGastos)} />
        <MetricCard label="Neto estimado" value={formatCurrency(data.resumen.netoEstimado)} />
      </div>

      <Card className="space-y-4 border-sky-200 bg-sky-50/50">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Generacion y dispersion</h2>
          <p className="mt-1 text-sm text-slate-600">
            Genera periodos en borrador, apruebalos antes de dispersion y exporta la nomina bancaria desde aqui.
          </p>
        </div>
        <CreatePeriodoNominaForm />
        <div className="flex flex-wrap gap-3">
          <ExportLink href={exportablePeriod ? buildNominaExportHref(exportablePeriod, 'csv') : null} label="Exportar CSV" />
          <ExportLink href={exportablePeriod ? buildNominaExportHref(exportablePeriod, 'xlsx') : null} label="Exportar XLSX" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Periodos de nomina</h2>
          <p className="mt-1 text-sm text-slate-500">
            Historial de periodos con ciclo borrador → aprobado → dispersado y corte operativo visible.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Periodo</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Incluidas</th>
                <th className="px-6 py-3 font-medium">Cuotas</th>
                <th className="px-6 py-3 font-medium">Ledger</th>
                <th className="px-6 py-3 font-medium">Cierre</th>
                <th className="px-6 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {data.periodos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Sin periodos de nomina visibles todavia.
                  </td>
                </tr>
              ) : (
                data.periodos.map((periodo) => (
                  <tr key={periodo.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{periodo.clave}</div>
                      {periodo.observaciones && (
                        <div className="mt-1 text-xs text-slate-400">{periodo.observaciones}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {periodo.fechaInicio} a {periodo.fechaFin}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill estado={periodo.estado} />
                    </td>
                    <td className="px-6 py-4 text-slate-600">{periodo.empleadosIncluidos}</td>
                    <td className="px-6 py-4 text-slate-600">{periodo.cuotas}</td>
                    <td className="px-6 py-4 text-slate-600">{periodo.movimientosLedger}</td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(periodo.fechaCierre)}</td>
                    <td className="px-6 py-4">
                      <PeriodoNominaControls periodoId={periodo.id} estado={periodo.estado} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Pre-nomina del periodo activo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Consolidado por colaborador con jornadas, ventas confirmadas, cuota comercial y efecto estimado en percepciones netas.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Colaborador</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Jornadas</th>
                <th className="px-6 py-3 font-medium">Ventas</th>
                <th className="px-6 py-3 font-medium">Cuota</th>
                <th className="px-6 py-3 font-medium">Disciplina</th>
                <th className="px-6 py-3 font-medium">Ledger</th>
                <th className="px-6 py-3 font-medium">Neto estimado</th>
              </tr>
            </thead>
            <tbody>
              {data.preNomina.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Sin colaboradores consolidados para el periodo activo.
                  </td>
                </tr>
              ) : (
                data.preNomina.map((item) => (
                  <tr key={`${item.empleadoId}-${item.cuentaClienteId ?? 'sin-cuenta'}`} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.empleado}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.idNomina ?? 'Sin nomina'} / {item.puesto ?? 'Sin puesto'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.cuentaCliente ?? 'Sin cliente'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.jornadasValidadas} validadas</div>
                      <div className="mt-1 text-xs text-slate-400">{item.jornadasPendientes} pendientes</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.ventasConfirmadas} confirmadas</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatCurrency(item.montoConfirmado)} / {item.unidadesConfirmadas} uds
                      </div>
                      <div className="mt-1 text-xs text-amber-700">
                        {item.ventasPendientes} pendientes / {formatCurrency(item.montoPendiente)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{item.cuotaEstado ?? 'SIN CUOTA'}</span>
                      <div className="mt-2 text-xs text-slate-500">
                        {item.objetivoMonto > 0
                          ? `${item.cumplimiento.toFixed(2)}% de ${formatCurrency(item.objetivoMonto)}`
                          : 'Sin objetivo cargado'}
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        Bono estimado: {formatCurrency(item.bonoEstimado)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.retardos} retardos</div>
                      <div className="mt-1 text-xs text-violet-700">{item.ausenciasJustificadas} justificadas</div>
                      <div className="mt-1 text-xs text-rose-700">{item.faltas} faltas</div>
                      <div className="mt-1 text-xs text-slate-400">{item.faltasAdministrativas} administrativas</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>Percepciones: {formatCurrency(item.percepciones + item.ajustes)}</div>
                      <div className="mt-1 text-xs text-rose-700">Deducciones: {formatCurrency(item.deducciones)}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{formatCurrency(item.netoEstimado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Cuotas comerciales</h2>
            <p className="mt-1 text-sm text-slate-500">Modulo suspendido temporalmente.</p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Suspendido hasta definir el motor de cuotas</p>
              <p className="mt-2">
                Por ahora las cuotas no se editaran ni se calcularan dentro de este modulo.
                Nomina trabajara con un reporte mensual de piezas vendidas por dermoconsejera y
                por PDV para calcular bonos fuera de la plataforma.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Que se retomara despues</p>
              <ul className="mt-2 space-y-1">
                <li>- Calculo automatico de cuotas por PDV y dermoconsejera.</li>
                <li>- Impacto directo de piezas vendidas en bonos y cumplimiento.</li>
                <li>- Motor interno para distribuir y recalcular cuotas.</li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Ledger reciente</h2>
              <p className="mt-1 text-sm text-slate-500">
                Percepciones, deducciones y ajustes ligados al periodo activo.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Movimiento</th>
                    <th className="px-6 py-3 font-medium">Colaborador</th>
                    <th className="px-6 py-3 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                        Sin movimientos de ledger visibles.
                      </td>
                    </tr>
                  ) : (
                    data.ledger.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 text-slate-600">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.tipoMovimiento === 'DEDUCCION' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {item.tipoMovimiento}
                          </span>
                          <div className="mt-2 font-medium text-slate-900">{item.concepto}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.periodoClave ?? 'Sin periodo'} / {formatDate(item.createdAt)}
                          </div>
                          {item.referenciaTabla && (
                            <div className="mt-1 text-xs text-amber-700">
                              Referencia: {item.referenciaTabla} {item.referenciaId ?? 'sin id'}
                            </div>
                          )}
                          {item.notas && <div className="mt-1 text-xs text-slate-500">{item.notas}</div>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <div className="font-medium text-slate-900">{item.empleado}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.idNomina ?? 'Sin nomina'} / {item.cuentaCliente ?? 'Sin cliente'}
                          </div>
                        </td>
                        <td className={`px-6 py-4 font-medium ${item.tipoMovimiento === 'DEDUCCION' ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {item.tipoMovimiento === 'DEDUCCION' ? '-' : '+'}
                          {formatCurrency(item.monto)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950">Ajuste manual de ledger</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sirve para registrar correcciones manuales de pago o descuento que no vienen del
                calculo automatico. Solo se permite en borrador para no tocar periodos ya cerrados.
              </p>
            </div>
            <LedgerManualNominaForm periodoId={data.periodoActivoId} />
          </Card>
        </div>
      </div>

      {selectedTicket ? <PayrollTicketModal item={selectedTicket} onClose={() => setSelectedTicketId(null)} /> : null}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white px-4 py-5">
      <div className="flex min-h-[92px] flex-col items-center justify-center text-center">
        <p className="text-xs leading-4 text-slate-500">{label}</p>
        <p className="mt-3 w-full truncate text-[1.1rem] font-semibold leading-tight tracking-[-0.02em] text-slate-950 sm:text-[1.25rem]">
          {value}
        </p>
      </div>
    </Card>
  )
}

function PayrollInboxBoard({
  lanes,
  activeFilter,
  onFilterChange,
  onOpen,
}: {
  lanes: NominaPanelData['payrollInbox']
  activeFilter: PayrollInboxLaneKey | 'ALL'
  onFilterChange: (value: PayrollInboxLaneKey | 'ALL') => void
  onOpen: (item: NominaPanelData['payrollInbox'][number]['items'][number]) => void
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
    <Card className="space-y-5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Bandeja de Nomina</h2>
          <p className="mt-1 text-sm text-slate-500">
            Altas IMSS y bajas institucionales recibidas desde Reclutamiento.
          </p>
        </div>
        <span className="inline-flex items-center justify-center rounded-full bg-[var(--module-primary)] px-4 py-2 text-sm font-semibold text-white">
          Total {totalItems}
        </span>
      </div>

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
    </Card>
  )
}

function PayrollTicketModal({
  item,
  onClose,
}: {
  item: NominaPanelData['payrollInbox'][number]['items'][number]
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

        <DetailCard title="Acciones de Nomina" description="Solo herramientas de IMSS y cierre institucional.">
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
            <DocumentosList documentos={employee.documentos as never} />
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

function InboxFilterChip({
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
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-[var(--module-primary)] text-white'
          : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function ExportLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
        {label}
      </span>
    )
  }

  return (
    <a href={href} className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
      {label}
    </a>
  )
}

function PayrollLaneRow({
  item,
  onOpen,
}: {
  item: NominaPanelData['payrollInbox'][number]['items'][number]
  onOpen: (item: NominaPanelData['payrollInbox'][number]['items'][number]) => void
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
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
            onClick={() => onOpen(item)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Ver ticket
          </button>
        </div>
      </div>
    </div>
  )
}

function PayrollLaneModal({
  lane,
  onClose,
  onOpen,
}: {
  lane: NominaPanelData['payrollInbox'][number]
  onClose: () => void
  onOpen: (item: NominaPanelData['payrollInbox'][number]['items'][number]) => void
}) {
  return (
    <ModalPanel
      open
      onClose={onClose}
      title={lane.label}
      subtitle={lane.description}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-3">
        {lane.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            Sin tickets en esta bandeja.
          </div>
        ) : (
          lane.items.map((item) => (
            <PayrollLaneRow
              key={item.id}
              item={item}
              onOpen={(nextItem) => {
                onClose()
                onOpen(nextItem)
              }}
            />
          ))
        )}
      </div>
    </ModalPanel>
  )
}

function StatusPill({ estado }: { estado: 'BORRADOR' | 'APROBADO' | 'DISPERSADO' }) {
  const styles =
    estado === 'BORRADOR'
      ? 'bg-amber-100 text-amber-800'
      : estado === 'APROBADO'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-emerald-100 text-emerald-800'

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles}`}>{estado}</span>
}
