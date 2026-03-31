'use client'

import { useActionState } from 'react'
import { guardarDefinicionCuotaNomina } from '../actions'
import { ESTADO_NOMINA_INICIAL } from '../state'

export function QuotaDefinitionForm({
  periodoId,
}: {
  periodoId: string | null
}) {
  const [state, formAction] = useActionState(
    guardarDefinicionCuotaNomina,
    ESTADO_NOMINA_INICIAL
  )

  return (
    <form action={formAction} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="periodo_id" value={periodoId ?? ''} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Empleado ID</span>
          <input name="empleado_id" required disabled={!periodoId} placeholder="uuid del empleado" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Cuenta cliente ID</span>
          <input name="cuenta_cliente_id" required disabled={!periodoId} placeholder="uuid de cuenta" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Cadena ID</span>
          <input name="cadena_id" disabled={!periodoId} placeholder="opcional" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Factor cuota</span>
          <input name="factor_cuota" type="number" min="0.01" step="0.01" defaultValue="1" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Objetivo venta MXN</span>
          <input name="objetivo_monto" type="number" min="0" step="0.01" required disabled={!periodoId} placeholder="0.00" className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Objetivo unidades</span>
          <input name="objetivo_unidades" type="number" min="0" step="1" defaultValue="0" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Objetivo LOVE diario</span>
          <input name="love_objetivo" type="number" min="0" step="1" defaultValue="0" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Objetivo visitas</span>
          <input name="visitas_objetivo" type="number" min="0" step="1" defaultValue="0" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
        <label className="space-y-1 text-sm text-slate-600 md:col-span-2 xl:col-span-1">
          <span className="font-medium text-slate-900">Bono estimado MXN</span>
          <input name="bono_estimado" type="number" min="0" step="0.01" defaultValue="0" disabled={!periodoId} className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
          {state.message ?? (periodoId ? 'Define o actualiza la cuota comercial del periodo activo con metas de ventas, LOVE diario y visitas.' : 'Necesitas un periodo en borrador para definir cuotas.')}
        </p>
        <button type="submit" disabled={!periodoId} className="inline-flex items-center justify-center rounded-2xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
          Guardar cuota
        </button>
      </div>
    </form>
  )
}
