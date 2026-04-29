'use client'

import { useState } from 'react'
import {
  cambiarPasswordAutenticado,
  iniciarCambioCorreoAutenticado,
} from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SecurityCredentialsPanel({
  correoActual,
}: {
  correoActual: string | null
}) {
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [loadingEmail, setLoadingEmail] = useState(false)

  async function handlePassword(formData: FormData) {
    setLoadingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    const result = await cambiarPasswordAutenticado(formData)

    if (result?.error) {
      setPasswordError(result.error)
      setLoadingPassword(false)
      return
    }

    setPasswordSuccess('Actualizamos tu contrasena y enviamos un correo informativo.')
    setLoadingPassword(false)
  }

  async function handleEmail(formData: FormData) {
    setLoadingEmail(true)
    setEmailError(null)
    setEmailSuccess(null)
    const result = await iniciarCambioCorreoAutenticado(formData)

    if (result?.error) {
      setEmailError(result.error)
      setLoadingEmail(false)
      return
    }

    setEmailSuccess(
      'Registramos el cambio. Mantendremos tu correo actual hasta que valides el nuevo enlace desde la bandeja de entrada.'
    )
    setLoadingEmail(false)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Cambio de contrasena
        </p>
        <h2 className="mt-3 text-xl font-semibold text-slate-950">Actualiza tu seguridad</h2>
        <p className="mt-2 text-sm text-slate-600">
          Para proteger tu cuenta, confirma primero tu contrasena actual y luego define una nueva.
        </p>

        <form action={handlePassword} className="mt-5 space-y-4">
          <Input id="current_password" name="current_password" type="password" label="Contrasena actual" required />
          <Input id="password" name="password" type="password" label="Nueva contrasena" required />
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            label="Confirmar nueva contrasena"
            required
          />

          {passwordError && (
            <div className="rounded-[16px] border border-error-300 bg-[#fff4f3] p-3">
              <p className="text-sm text-error-700">{passwordError}</p>
            </div>
          )}

          {passwordSuccess && (
            <div className="rounded-[16px] border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-700">{passwordSuccess}</p>
            </div>
          )}

          <Button type="submit" isLoading={loadingPassword} className="w-full rounded-[18px]">
            Guardar nueva contrasena
          </Button>
        </form>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Cambio de correo
        </p>
        <h2 className="mt-3 text-xl font-semibold text-slate-950">Actualizar correo principal</h2>
        <p className="mt-2 text-sm text-slate-600">
          Hoy tu acceso sigue usando <span className="font-semibold text-slate-950">{correoActual ?? 'tu correo activo'}</span>.
          El sistema mantendra ese correo hasta que el nuevo quede validado.
        </p>

        <form action={handleEmail} className="mt-5 space-y-4">
          <Input
            id="current_password_email"
            name="current_password"
            type="password"
            label="Contrasena actual"
            required
          />
          <Input id="next_email" name="next_email" type="email" label="Nuevo correo" required />

          {emailError && (
            <div className="rounded-[16px] border border-error-300 bg-[#fff4f3] p-3">
              <p className="text-sm text-error-700">{emailError}</p>
            </div>
          )}

          {emailSuccess && (
            <div className="rounded-[16px] border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-700">{emailSuccess}</p>
            </div>
          )}

          <Button type="submit" isLoading={loadingEmail} className="w-full rounded-[18px]">
            Enviar validacion al nuevo correo
          </Button>
        </form>
      </section>
    </div>
  )
}

