'use client'

import { useState } from 'react'
import { updatePassword } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function UpdatePasswordForm({
  flowId,
  correo,
  submitLabel = 'Confirmar credenciales',
}: {
  flowId?: string | null
  correo?: string | null
  submitLabel?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await updatePassword(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {flowId && <input type="hidden" name="flow_id" value={flowId} />}

      {correo && (
        <Input
          id="correo_bloqueado"
          name="correo_bloqueado"
          type="email"
          label="Correo confirmado"
          value={correo}
          readOnly
          disabled
          className="bg-slate-100 text-slate-700"
        />
      )}

      <Input
        id="password"
        name="password"
        type="password"
        label="Nueva contrasena"
        placeholder="Minimo 8 caracteres"
        hint="Debe incluir una mayuscula, una minuscula y un numero"
        required
        minLength={8}
      />

      <Input
        id="confirm_password"
        name="confirm_password"
        type="password"
        label="Confirmar contrasena"
        placeholder="Repite tu nueva contrasena"
        required
        minLength={8}
      />

      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 p-3">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      <Button type="submit" isLoading={loading} className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
