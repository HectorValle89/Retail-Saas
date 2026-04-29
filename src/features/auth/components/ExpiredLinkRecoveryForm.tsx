'use client'

import { useState } from 'react'
import { generarNuevoEnlaceExpirado } from '@/actions/auth'
import { Button } from '@/components/ui/button'

export function ExpiredLinkRecoveryForm({
  flowId,
}: {
  flowId?: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await generarNuevoEnlaceExpirado(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess('Listo. Generamos un enlace nuevo y lo enviamos otra vez a tu correo.')
    setLoading(false)
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-5">
      <input type="hidden" name="flow_id" value={flowId ?? ''} />
      <p className="text-sm text-slate-700">
        Cuando generes un enlace nuevo, el anterior quedara invalidado automaticamente.
      </p>

      {error && (
        <div className="rounded-[16px] border border-error-300 bg-[#fff4f3] p-3">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-[16px] border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      <Button type="submit" isLoading={loading} className="w-full rounded-[18px]">
        Generar nuevo enlace de acceso
      </Button>
    </form>
  )
}

