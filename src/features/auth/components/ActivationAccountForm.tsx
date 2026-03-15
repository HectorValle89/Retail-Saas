'use client'

import { useState } from 'react'
import { iniciarActivacionCuenta } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ActivationAccountForm({
  correoInicial,
}: {
  correoInicial?: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await iniciarActivacionCuenta(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Input
        id="correo_electronico"
        name="correo_electronico"
        type="email"
        label="Correo electronico"
        placeholder="nombre@empresa.com"
        defaultValue={correoInicial ?? ''}
        required
      />

      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 p-3">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      <Button type="submit" isLoading={loading} className="w-full">
        Enviar correo de verificacion
      </Button>
    </form>
  )
}
