'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { actualizarCuentaClienteActiva } from '@/actions/accountScope'
import { ESTADO_ACCOUNT_SCOPE_INICIAL } from '@/actions/accountScopeState'
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
    <div className="rounded-[18px] bg-surface-subtle/90 p-3 ring-1 ring-border/60">
      <div className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Alcance admin
        </p>
        <p className="mt-1 truncate text-sm font-medium text-slate-900">{currentAccountLabel}</p>
      </div>

      <form action={formAction} className="space-y-2.5">
        <Select
          name="account_id"
          aria-label="Seleccion de cuenta cliente activa"
          value={selectedValue}
          onChange={(event) => setSelectedValue(event.target.value)}
          options={selectOptions}
          className="bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton disabled={unchanged} />
          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {state.message}
            </p>
          )}
        </div>
      </form>
    </div>
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
