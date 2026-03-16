'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  actualizarCuentaClienteActiva,
  ESTADO_ACCOUNT_SCOPE_INICIAL,
} from '@/actions/accountScope'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import type { AccountScopeData } from '@/lib/tenant/accountScope'

interface AccountScopeSwitcherProps {
  currentAccountId: AccountScopeData['currentAccountId']
  currentAccountLabel: AccountScopeData['currentAccountLabel']
  options: AccountScopeData['options']
}

export function AccountScopeSwitcher({
  currentAccountId,
  currentAccountLabel,
  options,
}: AccountScopeSwitcherProps) {
  const [selectedValue, setSelectedValue] = useState(currentAccountId ?? '')
  const [state, formAction] = useActionState(
    actualizarCuentaClienteActiva,
    ESTADO_ACCOUNT_SCOPE_INICIAL
  )

  const unchanged = selectedValue === (currentAccountId ?? '')
  const selectOptions = [
    { value: '', label: 'Vista global consolidada' },
    ...options.map((item) => ({
      value: item.id,
      label: `${item.nombre} - ${item.identificador}`,
    })),
  ]

  return (
    <Card className="border border-sky-100 bg-sky-50/80 p-4" padding="none">
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Alcance admin
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{currentAccountLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            Cambia entre vista global y una cuenta cliente puntual para revisar la operacion.
          </p>
        </div>

        <form action={formAction} className="space-y-3">
          <Select
            name="account_id"
            aria-label="Seleccion de cuenta cliente activa"
            value={selectedValue}
            onChange={(event) => setSelectedValue(event.target.value)}
            options={selectOptions}
            className="bg-white"
          />
          <div className="flex items-center gap-3">
            <SubmitButton disabled={unchanged} />
            {state.message && (
              <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {state.message}
              </p>
            )}
          </div>
        </form>
      </div>
    </Card>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Aplicando...' : 'Aplicar alcance'}
    </button>
  )
}
