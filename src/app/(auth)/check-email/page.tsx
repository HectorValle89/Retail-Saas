import Link from 'next/link'

export default function CheckEmailPage() {
  return (
    <div className="space-y-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <svg className="h-10 w-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Activacion de cuenta
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Revisa tu correo
        </h1>
        <p className="mt-3 text-slate-600">
          Te enviamos un enlace para continuar con la activacion de tu acceso corporativo.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        Si no aparece el mensaje, revisa spam o solicita un nuevo envio desde soporte interno.
      </div>

      <Link
        href="/login"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al acceso
      </Link>
    </div>
  )
}
