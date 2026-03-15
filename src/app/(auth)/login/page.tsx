import { LoginForm } from '@/features/auth/components'

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Field Force Platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Acceso al sistema
        </h1>
        <p className="mt-2 text-slate-600">
          Ingresa con tus credenciales corporativas para continuar.
        </p>
      </div>

      <LoginForm />
    </div>
  )
}
