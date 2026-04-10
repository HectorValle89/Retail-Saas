export const runtime = 'edge';
import { redirect } from 'next/navigation'
import { ActivationAccountForm } from '@/features/auth/components'
import { obtenerActorActual } from '@/lib/auth/session'

export default async function ActivacionPage() {
  const actor = await obtenerActorActual()

  if (!actor) {
    redirect('/login')
  }

  if (actor.estadoCuenta === 'ACTIVA') {
    redirect('/dashboard')
  }

  if (actor.estadoCuenta === 'PROVISIONAL') {
    return (
      <div className="space-y-8">
        <div className="text-center lg:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Activacion de cuenta
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Registra tu correo corporativo
          </h1>
          <p className="mt-2 text-slate-600">
            Tu cuenta esta en estado provisional. Para continuar, ingresa el correo
            que usaras para verificar y activar tu acceso.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Usuario temporal: <span className="font-semibold text-slate-950">{actor.username ?? 'sin username'}</span>
        </div>

        <ActivationAccountForm correoInicial={actor.correoElectronico} />
      </div>
    )
  }

  if (actor.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL') {
    return (
      <div className="space-y-8">
        <div className="text-center lg:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Verificacion pendiente
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Confirma tu correo para activar la cuenta
          </h1>
          <p className="mt-2 text-slate-600">
            Enviamos el enlace de verificacion a <span className="font-semibold">{actor.correoElectronico ?? 'tu correo registrado'}</span>.
            Despues de confirmar, define tu contrasena final desde el enlace recibido.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        Cuenta no operativa
      </p>
      <h1 className="text-3xl font-semibold text-slate-950">
        Tu cuenta no puede acceder al sistema
      </h1>
      <p className="text-slate-600">
        Estado actual: <span className="font-semibold">{actor.estadoCuenta}</span>. Contacta al administrador o a reclutamiento para revision.
      </p>
    </div>
  )
}

