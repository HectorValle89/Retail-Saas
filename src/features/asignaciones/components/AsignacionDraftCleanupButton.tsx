'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { limpiarBorradorAsignacion } from '../actions'
import { ESTADO_ASIGNACION_INICIAL } from '../state'

export function AsignacionDraftCleanupButton({
  asignacionId,
  puedeGestionar,
  compact = false,
}: {
  asignacionId: string
  puedeGestionar: boolean
  compact?: boolean
}) {
  const [state, formAction] = useActionState(
    limpiarBorradorAsignacion,
    ESTADO_ASIGNACION_INICIAL
  )
  const router = useRouter()

  useEffect(() => {
    if (!state.ok) {
      return
    }

    if (state.redirectTo) {
      router.replace(state.redirectTo)
      return
    }

    router.refresh()
  }, [router, state.ok, state.redirectTo])

  if (!puedeGestionar) {
    return null
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="asignacion_id" value={asignacionId} />
      <SubmitButton compact={compact} />
      {state.message && (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function SubmitButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'w-full' : ''}`}
    >
      {pending ? 'Limpiando...' : 'Limpiar borrador'}
    </button>
  )
}
