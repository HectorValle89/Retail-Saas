'use client'

import { useActionState, useState } from 'react'
import { confirmarPrimerAccesoDatos, solicitarCorreccionPrimerAcceso } from '@/actions/auth'
import { Button } from '@/components/ui/button'

type AuthActionState = {
  error: string | null
}

const INITIAL_STATE: AuthActionState = {
  error: null,
}

export interface FirstAccessField {
  label: string
  value: string
}

export function FirstAccessReviewForm({
  nombreCompleto,
  username,
  fields,
}: {
  nombreCompleto: string
  username: string | null
  fields: FirstAccessField[]
}) {
  const [confirmState, confirmAction] = useActionState(confirmarPrimerAccesoDatos, INITIAL_STATE)
  const [correctionState, correctionAction] = useActionState(
    solicitarCorreccionPrimerAcceso,
    INITIAL_STATE
  )
  const [showCorrectionForm, setShowCorrectionForm] = useState(false)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-950">{nombreCompleto}</p>
        <p className="mt-1">
          Usuario provisional: <span className="font-medium">{username ?? 'sin username visible'}</span>
        </p>
        <p className="mt-3">
          Antes de entrar a la operacion, revisa estos datos. Puedes confirmarlos si estan bien o
          pedir una correccion para que el equipo administrativo la atienda.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      <form action={confirmAction} className="space-y-3 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4">
        {confirmState.error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {confirmState.error}
          </p>
        )}
        <p className="text-sm text-slate-700">
          Si tus datos ya estan correctos, confirma y continuamos al dashboard.
        </p>
        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
          Confirmar datos y continuar
        </Button>
      </form>

      <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Solicitar correccion</p>
            <p className="mt-1 text-sm text-slate-700">
              Usa esta opcion si detectas informacion incorrecta en tus datos iniciales.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCorrectionForm((value) => !value)}
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          >
            {showCorrectionForm ? 'Ocultar correccion' : 'Pedir correccion'}
          </Button>
        </div>

        {showCorrectionForm && (
          <form action={correctionAction} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="detalle">
              Describe que dato debemos corregir
            </label>
            <textarea
              id="detalle"
              name="detalle"
              rows={4}
              required
              placeholder="Ejemplo: mi telefono esta mal, mi fecha de nacimiento no coincide o mi domicilio necesita actualizacion."
              className="w-full rounded-[14px] border border-amber-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
            />

            {correctionState.error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {correctionState.error}
              </p>
            )}

            <Button type="submit" className="w-full bg-amber-500 text-white hover:bg-amber-600">
              Enviar correccion y continuar
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
