'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  actualizarEstadoPeriodoNomina,
  ESTADO_PERIODO_NOMINA_INICIAL,
} from '../actions'

export function PeriodoNominaControls({
  periodoId,
  estado,
}: {
  periodoId: string
  estado: 'ABIERTO' | 'CERRADO'
}) {
  const [state, formAction] = useActionState(
    actualizarEstadoPeriodoNomina,
    ESTADO_PERIODO_NOMINA_INICIAL
  )

  const estadoDestino = estado === 'ABIERTO' ? 'CERRADO' : 'ABIERTO'

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="periodo_id" value={periodoId} />
      <input type="hidden" name="estado_destino" value={estadoDestino} />
      <SubmitButton estadoDestino={estadoDestino} />
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function SubmitButton({ estadoDestino }: { estadoDestino: 'ABIERTO' | 'CERRADO' }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        estadoDestino === 'CERRADO'
          ? 'bg-slate-950 text-white hover:bg-slate-800'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
      }`}
    >
      {pending
        ? 'Guardando...'
        : estadoDestino === 'CERRADO'
          ? 'Cerrar periodo'
          : 'Reabrir periodo'}
    </button>
  )
}
