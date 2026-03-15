import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#d9ecff_0%,_#f7fbff_45%,_#eef3f8_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl rounded-[32px] border border-slate-200 bg-white/85 p-10 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
            Field Force Platform
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Plataforma corporativa para operacion, supervision y control de personal retail.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            La aplicacion se redefine sobre los modulos, flujos y reglas establecidos en
            `design.md`, `requirements.md` y `tasks.md`: asistencias, asignaciones, ventas,
            nomina, cuotas, auditoria y operacion multirol.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Iniciar sesion
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Ver dashboard base
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
