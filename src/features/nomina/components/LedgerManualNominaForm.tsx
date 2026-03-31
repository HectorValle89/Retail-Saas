'use client'

import { useActionState } from 'react'
import { registrarMovimientoManualNomina } from '../actions'
import { ESTADO_NOMINA_INICIAL } from '../state'

export function LedgerManualNominaForm({
  periodoId,
}: {
  periodoId: string | null
}) {
  const [state, formAction] = useActionState(
    registrarMovimientoManualNomina,
    ESTADO_NOMINA_INICIAL
  )

  return (
    <form action={formAction} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="periodo_id" value={periodoId ?? ''} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Empleado ID</span>
          <input name="empleado_id" required disabled={!periodoId} placeholder="uuid del empleado" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Cuenta cliente ID</span>
          <input name="cuenta_cliente_id" disabled={!periodoId} placeholder="opcional" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Tipo</span>
          <select name="tipo_movimiento" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100">
            <option value="PERCEPCION">Percepcion</option>
            <option value="DEDUCCION">Deduccion</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Concepto</span>
          <input name="concepto" required disabled={!periodoId} placeholder="AJUSTE_MANUAL" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Motivo</span>
          <input name="motivo" required disabled={!periodoId} placeholder="Correccion de bono" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Monto MXN</span>
          <input name="monto" type="number" min="0.01" step="0.01" required disabled={!periodoId} placeholder="0.00" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
      </div>
      <label className="space-y-1 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Notas</span>
        <textarea name="notas" rows={3} disabled={!periodoId} placeholder="Detalle adicional del ajuste" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
          {state.message ?? (periodoId ? 'Cada ajuste manual conserva autor y motivo dentro del ledger.' : 'Necesitas un periodo en borrador para registrar ajustes manuales.')}
        </p>
        <button type="submit" disabled={!periodoId} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          Registrar ajuste
        </button>
      </div>
    </form>
  )
}
