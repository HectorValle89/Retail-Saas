import { requerirActorActivo } from '@/lib/auth/session'

export async function ModulePage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const actor = await requerirActorActivo()

  return (
    <div className="mx-auto max-w-5xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Modulo en preparacion
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
          {description}
        </p>
        <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
          Sesion activa para <span className="font-semibold text-slate-700">{actor.nombreCompleto}</span> con puesto{' '}
          <span className="font-semibold text-slate-700">{actor.puesto}</span>.
        </p>
      </div>
    </div>
  )
}
