import { LoginForm } from '@/features/auth/components'

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Beteele One
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Iniciar sesion
        </h1>
        <p className="mt-2 text-slate-600">
          Accede con tus credenciales corporativas.
        </p>
      </div>

      <LoginForm />
    </div>
  )
}
