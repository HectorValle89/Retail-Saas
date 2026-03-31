'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { actualizarEstadoPeriodoNomina } from '../actions'
import {
  getNominaPeriodoTransitionTargets,
  type NominaPeriodoEstado,
} from '../lib/periodState'
import { ESTADO_NOMINA_INICIAL } from '../state'

const LABELS: Record<NominaPeriodoEstado, string> = {
  BORRADOR: 'Regresar a borrador',
  APROBADO: 'Aprobar periodo',
  DISPERSADO: 'Marcar dispersado',
}

export function PeriodoNominaControls({
  periodoId,
  estado,
}: {
  periodoId: string
  estado: NominaPeriodoEstado
}) {
  const [state, formAction] = useActionState(
    actualizarEstadoPeriodoNomina,
    ESTADO_NOMINA_INICIAL
  )

  const targets = getNominaPeriodoTransitionTargets(estado)

  if (targets.length === 0) {
    return <span className="text-xs text-slate-400">Sin acciones disponibles</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {targets.map((estadoDestino) => (
          <form key={estadoDestino} action={formAction}>
            <input type="hidden" name="periodo_id" value={periodoId} />
            <input type="hidden" name="estado_destino" value={estadoDestino} />
            <SubmitButton estadoDestino={estadoDestino} />
          </form>
        ))}
      </div>
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </div>
  )
}

function SubmitButton({ estadoDestino }: { estadoDestino: NominaPeriodoEstado }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        estadoDestino === 'DISPERSADO'
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : estadoDestino === 'APROBADO'
            ? 'bg-slate-950 text-white hover:bg-slate-800'
            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
      }`}
    >
      {pending ? 'Guardando...' : LABELS[estadoDestino]}
    </button>
  )
}
