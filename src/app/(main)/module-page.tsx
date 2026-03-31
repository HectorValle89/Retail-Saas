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
    <div className="page-shell max-w-5xl">
      <div className="page-hero">
        <p className="page-hero-eyebrow">
          Beteele One
        </p>
        <h1 className="page-hero-title">{title}</h1>
        <p className="page-hero-copy">
          {description}
        </p>
        <p className="surface-soft mt-6 px-4 py-4 text-sm text-slate-500">
          Acceso activo: <span className="font-semibold text-slate-700">{actor.nombreCompleto}</span>.
        </p>
      </div>
    </div>
  )
}
