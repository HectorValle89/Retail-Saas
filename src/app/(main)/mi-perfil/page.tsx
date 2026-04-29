import { SecurityCredentialsPanel } from '@/features/auth/components'
import { requerirActorActivo } from '@/lib/auth/session'

export default async function MiPerfilPage() {
  const actor = await requerirActorActivo()

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Mi perfil
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">Seguridad y acceso</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Desde aqui puedes reforzar tu seguridad, cambiar tu contrasena actual y solicitar la validacion de un correo nuevo sin perder el control de tu cuenta.
        </p>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-700">
          Acceso activo: <span className="font-semibold text-slate-950">{actor.correoElectronico ?? actor.username ?? 'sin acceso visible'}</span>
        </p>
      </div>

      <SecurityCredentialsPanel correoActual={actor.correoElectronico} />
    </div>
  )
}

