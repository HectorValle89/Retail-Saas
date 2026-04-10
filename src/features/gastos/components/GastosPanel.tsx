'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Card, EvidencePreview, MetricCard as SharedMetricCard } from '@/components/ui'
import { ClientImageFileInput } from '@/components/ui/client-image-file-input'
import { getSingleTenantAccountLabel, isSingleTenantUiEnabled, resolveSingleTenantAccountOption } from '@/lib/tenant/singleTenant'
import { actualizarEstatusGasto, registrarGastoOperativo } from '../actions'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { ESTADO_GASTO_INICIAL } from '../state'
import type { GastosPanelData } from '../services/gastoService'

function formatCurrency(value: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function formatApprovalStage(value: string) {
  return value.replace(/_/g, ' ')
}

export function GastosPanel({ data }: { data: GastosPanelData }) {
  const [state, formAction] = useActionState(registrarGastoOperativo, ESTADO_GASTO_INICIAL)
  const [isUploadingR2, setIsUploadingR2] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fixedAccount = resolveSingleTenantAccountOption(data.cuentas)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)

  const handleInterceptedSubmit = async (formData: FormData) => {
    const comprobante = formData.get('comprobante') as File | null
    if (comprobante && comprobante.size > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Upload(formData, comprobante, {
          modulo: 'gastos',
          removeFieldName: 'comprobante',
        })
      } catch (err) {
        console.error('Error en subida R2:', err)
      } finally {
        setIsUploadingR2(false)
      }
    }

    // Submit form con datos R2 o fallback tradicional
    const action = formAction as unknown as (formData: FormData) => void
    action(formData)
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Gastos visibles" value={String(data.resumen.total)} />
        <MetricCard label="Solicitado" value={formatCurrency(data.resumen.montoSolicitado)} />
        <MetricCard label="Pendientes" value={String(data.resumen.pendientes)} />
        <MetricCard label="Aprobados / reembolsados" value={String(data.resumen.aprobados)} />
      </div>

      <Card className="space-y-5 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Control operativo
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">Registrar gasto</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Base funcional para viaticos y gastos operativos ligados a cuenta, persona, PDV y evento de formacion cuando aplique.
          </p>
        </div>

        <form
          ref={formRef}
          action={handleInterceptedSubmit}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {useSingleTenantUi ? (
            <>
              <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
              <div className="block text-sm text-slate-600">
                Cuenta operativa
                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                  {getSingleTenantAccountLabel()}
                </div>
              </div>
            </>
          ) : (
            <label className="block text-sm text-slate-600">
              Cuenta cliente
              <select name="cuenta_cliente_id" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
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
            <select name="empleado_id" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
              {data.empleados.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Supervisor
            <select name="supervisor_empleado_id" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
              <option value="">Sin supervisor</option>
              {data.supervisores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Fecha
            <input
              name="fecha_gasto"
              type="date"
              defaultValue={getLocalDateValue()}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <label className="block text-sm text-slate-600">
            Tipo
            <select name="tipo" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
              <option value="VIATICOS">VIATICOS</option>
              <option value="TRANSPORTE">TRANSPORTE</option>
              <option value="ALIMENTOS">ALIMENTOS</option>
              <option value="MATERIAL_POP">MATERIAL_POP</option>
              <option value="FORMACION">FORMACION</option>
              <option value="HOSPEDAJE">HOSPEDAJE</option>
              <option value="OTRO">OTRO</option>
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Monto
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0"
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <label className="block text-sm text-slate-600 xl:col-span-2">
            PDV
            <select name="pdv_id" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
              <option value="">Sin PDV asociado</option>
              {data.pdvs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-600 xl:col-span-2">
            Formacion relacionada
            <select name="formacion_evento_id" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900">
              <option value="">Sin formacion asociada</option>
              {data.formaciones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-600 xl:col-span-4">
            Comprobante
            <ClientImageFileInput
              name="comprobante"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={isUploadingR2}
            />
            {isUploadingR2 && (
              <p className="mt-2 text-sm text-sky-600">Subiendo comprobante a la nube...</p>
            )}
          </label>

          <label className="block text-sm text-slate-600 xl:col-span-4">
            Notas
            <textarea
              name="notas"
              rows={3}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="Comentario operativo o detalle del comprobante."
            />
          </label>

          <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
            <SubmitButton label="Registrar gasto" pendingLabel="Registrando..." />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Reporte por empleado y categoria</h2>
          <p className="mt-1 text-sm text-slate-500">
            Consolidado operativo por periodo, persona y categoria para seguimiento y conciliacion rapida.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Periodo</th>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Categoria</th>
                <th className="px-6 py-3 font-medium">Registros</th>
                <th className="px-6 py-3 font-medium">Solicitado</th>
                <th className="px-6 py-3 font-medium">Aprobado</th>
                <th className="px-6 py-3 font-medium">Reembolsado</th>
              </tr>
            </thead>
            <tbody>
              {data.reporteEmpleado.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Sin consolidado visible todavia.
                  </td>
                </tr>
              ) : (
                data.reporteEmpleado.map((item) => (
                  <tr key={item.key} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">{item.periodo}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.empleado}</td>
                    <td className="px-6 py-4 text-slate-600">{item.tipo}</td>
                    <td className="px-6 py-4 text-slate-600">{item.registros}</td>
                    <td className="px-6 py-4 text-slate-600">{formatCurrency(item.montoSolicitado)}</td>
                    <td className="px-6 py-4 text-slate-600">{formatCurrency(item.montoAprobado)}</td>
                    <td className="px-6 py-4 font-medium text-emerald-700">{formatCurrency(item.montoReembolsado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Gastos recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Seguimiento por cuenta, colaborador, estatus y monto solicitado.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Contexto</th>
                <th className="px-6 py-3 font-medium">Tipo / monto</th>
                <th className="px-6 py-3 font-medium">Estatus / control</th>
              </tr>
            </thead>
            <tbody>
              {data.gastos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Sin gastos visibles todavia.
                  </td>
                </tr>
              ) : (
                data.gastos.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">{item.fechaGasto}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{item.empleado}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.supervisor ?? 'Sin supervisor'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{item.cuentaCliente ?? 'Sin cliente'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.pdv ?? 'Sin PDV'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.formacion ?? 'Sin formacion'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.tipo}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatCurrency(item.monto, item.moneda)}
                      </div>
                      <div className="mt-2">
                        <EvidencePreview
                          url={item.comprobanteUrl}
                          hash={item.comprobanteHash}
                          label={`Comprobante ${item.tipo}`}
                          emptyLabel="Sin comprobante"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill active={item.estatus === 'APROBADO' || item.estatus === 'REEMBOLSADO'} label={item.estatus} />
                      <div className="mt-2 text-xs text-slate-500">
                        Etapa: {formatApprovalStage(item.approvalStage)}
                      </div>
                      {item.notas && <div className="mt-2 text-xs text-slate-500">{item.notas}</div>}
                      <form action={actualizarEstatusGasto} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="gasto_id" value={item.id} />
                        <input type="hidden" name="cuenta_cliente_id" value={item.cuentaClienteId} />
                        <select
                          name="estatus"
                          defaultValue={item.estatus}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                        >
                          <option value="PENDIENTE">PENDIENTE</option>
                          <option value="APROBADO">APROBADO</option>
                          <option value="RECHAZADO">RECHAZADO</option>
                          <option value="REEMBOLSADO">REEMBOLSADO</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white"
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
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
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
