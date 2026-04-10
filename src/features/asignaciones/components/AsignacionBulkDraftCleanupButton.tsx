'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { limpiarTodosLosBorradoresAsignaciones } from '../actions'
import { ESTADO_ASIGNACION_INICIAL } from '../state'

export function AsignacionBulkDraftCleanupButton({
  total,
  puedeGestionar,
}: {
  total: number
  puedeGestionar: boolean
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    limpiarTodosLosBorradoresAsignaciones,
    ESTADO_ASIGNACION_INICIAL
  )

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  if (!puedeGestionar) {
    return null
  }

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        if (total <= 0) {
          event.preventDefault()
          return
        }

        if (!window.confirm(`Se eliminaran ${total} borrador(es) de la cuenta activa. Esta accion no se puede deshacer. Deseas continuar?`)) {
          event.preventDefault()
        }
      }}
    >
      <SubmitButton disabled={total <= 0} total={total} />
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

function SubmitButton({ disabled, total }: { disabled: boolean; total: number }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Limpiando...' : `Limpiar borrador (${total})`}
    </button>
  )
}