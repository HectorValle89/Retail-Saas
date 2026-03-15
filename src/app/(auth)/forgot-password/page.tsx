import Link from 'next/link'
import { ForgotPasswordForm } from '@/features/auth/components'

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Recuperacion de acceso
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Restablece tu contrasena
        </h1>
        <p className="mt-2 text-slate-600">
          Ingresa tu correo y te enviaremos un enlace para actualizar tu acceso.
        </p>
      </div>

      <ForgotPasswordForm />

      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al acceso
      </Link>
    </div>
  )
}
