'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  actualizarEstadoPublicacionAsignacion,
  ESTADO_ASIGNACION_INICIAL,
} from '../actions'

interface AsignacionEstadoControlsProps {
  asignacionId: string
  estadoPublicacion: string
  bloqueada: boolean
  puedeGestionar: boolean
  alertasCount: number
  requiereConfirmacionAlertas: boolean
}

export function AsignacionEstadoControls({
  asignacionId,
  estadoPublicacion,
  bloqueada,
  puedeGestionar,
  alertasCount,
  requiereConfirmacionAlertas,
}: AsignacionEstadoControlsProps) {
  const [state, formAction] = useActionState(
    actualizarEstadoPublicacionAsignacion,
    ESTADO_ASIGNACION_INICIAL
  )

  if (!puedeGestionar) {
    return <p className="text-xs text-slate-400">Solo lectura</p>
  }

  if (estadoPublicacion === 'BORRADOR' && bloqueada) {
    return <p className="text-xs text-amber-700">Corrige validaciones para publicar</p>
  }

  const estadoDestino = estadoPublicacion === 'PUBLICADA' ? 'BORRADOR' : 'PUBLICADA'
  const showAlertConfirmation =
    estadoDestino === 'PUBLICADA' && requiereConfirmacionAlertas && alertasCount > 0

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="asignacion_id" value={asignacionId} />
      <input type="hidden" name="estado_destino" value={estadoDestino} />
      {showAlertConfirmation && (
        <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <input
            type="checkbox"
            name="confirmar_alertas"
            value="true"
            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-700"
          />
          <span>
            Confirmo publicar con {alertasCount} alerta(alertas) no bloqueante(s).
          </span>
        </label>
      )}
      <SubmitButton estadoDestino={estadoDestino} />
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function SubmitButton({ estadoDestino }: { estadoDestino: 'BORRADOR' | 'PUBLICADA' }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        estadoDestino === 'PUBLICADA'
          ? 'bg-slate-950 text-white hover:bg-slate-800'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
      }`}
    >
      {pending
        ? 'Guardando...'
        : estadoDestino === 'PUBLICADA'
          ? 'Publicar'
          : 'Volver a borrador'}
    </button>
  )
}