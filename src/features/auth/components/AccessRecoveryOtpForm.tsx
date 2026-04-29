'use client'

import { useState } from 'react'
import {
  enviarOtpRescateActivacion,
  validarOtpRescateActivacion,
} from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AccessRecoveryOtpForm({
  initialEmail,
}: {
  initialEmail?: string
}) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [otpSent, setOtpSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingValidate, setLoadingValidate] = useState(false)

  async function handleSend(formData: FormData) {
    setLoadingSend(true)
    setError(null)
    setSuccess(null)

    const result = await enviarOtpRescateActivacion(formData)
    if (result?.error) {
      setError(result.error)
      setLoadingSend(false)
      return
    }

    setOtpSent(true)
    setSuccess('Te enviamos un codigo de 6 digitos para retomar la activacion.')
    setLoadingSend(false)
  }

  async function handleValidate(formData: FormData) {
    setLoadingValidate(true)
    setError(null)
    setSuccess(null)

    const result = await validarOtpRescateActivacion(formData)
    if (result?.error) {
      setError(result.error)
      setLoadingValidate(false)
    }
  }

  return (
    <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5">
      <p className="text-sm font-semibold text-slate-950">Retomar activacion</p>
      <p className="mt-2 text-sm text-slate-700">
        Si tu correo ya quedo validado pero cerraste antes de crear tu contrasena, genera un codigo para volver directo al paso de seguridad.
      </p>

      <form action={handleSend} className="mt-4 space-y-4">
        <Input
          id="rescue_email"
          name="email"
          type="email"
          label="Correo ya verificado"
          placeholder="nombre@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <Button
          type="submit"
          isLoading={loadingSend}
          className="w-full rounded-[18px] bg-amber-500 text-white hover:bg-amber-600"
        >
          Enviar codigo de acceso
        </Button>
      </form>

      {otpSent && (
        <form action={handleValidate} className="mt-4 space-y-4 rounded-[18px] border border-white/70 bg-white p-4">
          <input type="hidden" name="email" value={email} />
          <Input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            label="Codigo de 6 digitos"
            placeholder="123456"
            required
          />

          <Button type="submit" isLoading={loadingValidate} className="w-full rounded-[18px]">
            Validar codigo y continuar
          </Button>
        </form>
      )}

      {error && (
        <div className="mt-4 rounded-[16px] border border-error-300 bg-[#fff4f3] p-3">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-[16px] border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}
    </div>
  )
}

