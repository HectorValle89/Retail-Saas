'use client'

import { useState } from 'react'
import { cambiarCorreoPendienteActivacion, reenviarCorreoActivacion } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ActivationPendingForm({
  correoPendiente,
}: {
  correoPendiente: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loadingResend, setLoadingResend] = useState(false)
  const [loadingChange, setLoadingChange] = useState(false)

  async function handleResend() {
    setLoadingResend(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await reenviarCorreoActivacion()
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess('Enviamos un enlace nuevo al correo registrado.')
      }
    } finally {
      setLoadingResend(false)
    }
  }

  async function handleChange(formData: FormData) {
    setLoadingChange(true)
    setError(null)
    setSuccess(null)

    const result = await cambiarCorreoPendienteActivacion(formData)

    if (result?.error) {
      setError(result.error)
      setLoadingChange(false)
      return
    }

    setSuccess('Actualizamos el correo pendiente y enviamos un enlace nuevo.')
    setLoadingChange(false)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-950">Aun estamos esperando tu confirmacion</p>
        <p className="mt-2">
          Tu enlace activo se envio a <span className="font-semibold">{correoPendiente ?? 'tu correo registrado'}</span>.
          Hasta confirmarlo, no podemos abrir el sistema.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          isLoading={loadingResend}
          onClick={handleResend}
          className="min-h-[3.5rem] rounded-[18px] border-sky-300 bg-white text-sky-900 hover:bg-sky-50"
        >
          Reenviar correo de confirmacion
        </Button>
        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Si escribiste mal tu correo, corrigelo aqui mismo y te mandamos un enlace nuevo.
        </div>
      </div>

      <form action={handleChange} className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-5">
        <Input
          id="correo_electronico"
          name="correo_electronico"
          type="email"
          label="Cambiar correo ingresado"
          placeholder="nombre@empresa.com"
          defaultValue={correoPendiente ?? ''}
          required
        />

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

        <Button type="submit" isLoading={loadingChange} className="w-full min-h-[3.5rem] rounded-[18px]">
          Guardar correo y reenviar enlace
        </Button>
      </form>
    </div>
  )
}

