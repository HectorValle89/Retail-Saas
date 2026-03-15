'use client'

import { useState } from 'react'
import { updatePassword } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function UpdatePasswordForm() {
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
      <Input
        id="password"
        name="password"
        type="password"
        label="Nueva contrasena"
        placeholder="Minimo 8 caracteres"
        hint="Elige una contrasena segura"
        required
        minLength={8}
      />

      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 p-3">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      <Button type="submit" isLoading={loading} className="w-full">
        Actualizar contrasena
      </Button>
    </form>
  )
}
