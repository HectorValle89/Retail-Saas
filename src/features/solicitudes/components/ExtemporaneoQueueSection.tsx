'use client'

import { EvidencePreview } from '@/components/ui'
import { Card } from '@/components/ui/card'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { resolverRegistroExtemporaneoDesdePanel } from '../extemporaneoActions'
import type {
  RegistroExtemporaneoListadoItem,
  RegistroExtemporaneoResumen,
} from '../extemporaneoService'

export function ExtemporaneoQueueSection({
  title,
  description,
  emptyMessage,
  resumen,
  registros,
}: {
  title: string
  description: string
  emptyMessage: string
  resumen: RegistroExtemporaneoResumen
  registros: RegistroExtemporaneoListadoItem[]
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border/60 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniMetric label="Total" value={String(resumen.total)} />
            <MiniMetric label="Pendientes" value={String(resumen.pendientes)} />
            <MiniMetric label="Aprobados" value={String(resumen.aprobados)} />
            <MiniMetric label="Rechazados" value={String(resumen.rechazados)} />
          </div>
        </div>
      </div>

      <div className="space-y-3 px-6 py-5">
        {registros.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          registros.map((item) => (
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
                  {item.tipoRegistro !== 'LOVE_ISDIN' &&
                    Boolean(item.ventaPayload.producto_nombre) && (
                      <p className="text-xs text-slate-500">
                        Venta: {String(item.ventaPayload.producto_nombre ?? '')} ·{' '}
                        {String(item.ventaPayload.total_unidades ?? 0)} unidades
                      </p>
                    )}
                  {item.tipoRegistro !== 'VENTA' &&
                    Boolean(item.lovePayload.afiliado_nombre) && (
                      <p className="text-xs text-slate-500">
                        LOVE: {String(item.lovePayload.afiliado_nombre ?? '')}
                        {item.lovePayload.afiliado_contacto
                          ? ` · ${String(item.lovePayload.afiliado_contacto)}`
                          : ''}
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
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      className="rounded-2xl bg-surface-subtle px-3 py-3 text-center shadow-none"
      labelClassName="text-[10px]"
      valueClassName="text-base sm:text-lg"
    />
  )
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const toneClass =
    label === 'RECHAZADO'
      ? 'bg-rose-100 text-rose-700'
      : active
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-100 text-slate-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${toneClass}`}>{label}</span>
}
