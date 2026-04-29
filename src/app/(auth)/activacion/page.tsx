import { redirect } from 'next/navigation'
import {
  ActivationAccountForm,
  ActivationPendingForm,
} from '@/features/auth/components'
import { findActiveAuthFlowByUser } from '@/lib/auth/accessFlow'
import { obtenerActorActual } from '@/lib/auth/session'

function ProgressStep({
  step,
  title,
  active,
  done,
}: {
  step: string
  title: string
  active?: boolean
  done?: boolean
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-3 text-sm ${
        active
          ? 'border-sky-300 bg-sky-50 text-sky-900'
          : done
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">
        Paso {step}
      </p>
      <p className="mt-1 font-semibold">{title}</p>
    </div>
  )
}

export default async function ActivacionPage() {
  const actor = await obtenerActorActual()

  if (!actor) {
    redirect('/login')
  }

  if (actor.estadoCuenta === 'PENDIENTE_PRIMER_LOGIN') {
    redirect('/primer-acceso')
  }

  if (actor.estadoCuenta === 'ACTIVA') {
    redirect(actor.primerAccesoPendiente ? '/primer-acceso' : '/dashboard')
  }

  const flow = await findActiveAuthFlowByUser(actor.usuarioId, 'PRIMER_INGRESO')

  if (flow?.estado === 'EMAIL_CONFIRMED_PASSWORD_PENDING') {
    redirect(`/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=credential-transition`)
  }

  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Activacion guiada
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Activa tu acceso paso a paso
        </h1>
        <p className="mt-2 text-slate-600">
          Vamos a pasar tu cuenta provisional a un acceso definitivo y seguro.
          Veras siempre tu paso actual y el correo que estamos usando.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProgressStep step="1" title="Entraste con usuario provisional" done />
        <ProgressStep
          step="2"
          title="Registras tu correo real"
          active={actor.estadoCuenta === 'PROVISIONAL'}
          done={actor.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL'}
        />
        <ProgressStep
          step="3"
          title="Confirmas el correo"
          active={actor.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL'}
        />
        <ProgressStep step="4" title="Creas tu contrasena final" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        Usuario provisional: <span className="font-semibold text-slate-950">{actor.username ?? 'sin username visible'}</span>
      </div>

      {actor.estadoCuenta === 'PROVISIONAL' && (
        <div className="space-y-5">
          <div className="rounded-[22px] border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">Paso 2 de 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Registra el correo que usaras para entrar despues
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              En cuanto lo registres, te mandaremos un enlace de confirmacion.
              Ese correo sera tu acceso definitivo cuando cierres el proceso.
            </p>
          </div>

          <ActivationAccountForm correoInicial={actor.correoElectronico} />
        </div>
      )}

      {actor.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL' && (
        <div className="space-y-5">
          <div className="rounded-[22px] border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">Paso 3 de 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Aun estamos esperando que confirmes tu correo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Entra a tu bandeja de entrada, abre el correo de confirmacion y toca el enlace
              <span className="font-semibold text-slate-950"> Confirmar cambio de correo</span>.
              Desde ahi te llevaremos al formulario donde crearas tu contrasena final.
            </p>
          </div>

          <ActivationPendingForm correoPendiente={flow?.correo_pendiente ?? actor.correoElectronico} />
        </div>
      )}

      {actor.estadoCuenta !== 'PROVISIONAL' &&
        actor.estadoCuenta !== 'PENDIENTE_VERIFICACION_EMAIL' && (
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
        )}
    </div>
  )
}
