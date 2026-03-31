'use client'

import { useActionState } from 'react'
import { crearPeriodoNomina } from '../actions'
import { ESTADO_NOMINA_INICIAL } from '../state'

export function CreatePeriodoNominaForm() {
  const [state, formAction] = useActionState(crearPeriodoNomina, ESTADO_NOMINA_INICIAL)

  return (
    <form action={formAction} className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
      <label className="space-y-1 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Clave</span>
        <input name="clave" required placeholder="2026-03-Q2" className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0" />
      </label>
      <label className="space-y-1 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Fecha inicio</span>
        <input type="date" name="fecha_inicio" required className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0" />
      </label>
      <label className="space-y-1 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Fecha fin</span>
        <input type="date" name="fecha_fin" required className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0" />
      </label>
      <label className="space-y-1 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Observaciones</span>
        <input name="observaciones" placeholder="Corte quincenal" className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0" />
      </label>
      <div className="md:col-span-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
          {state.message ?? 'Genera el siguiente periodo en estado borrador y estima colaboradoras incluidas.'}
        </p>
        <button type="submit" className="inline-flex items-center justify-center rounded-2xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          Crear periodo
        </button>
      </div>
    </form>
  )
}
