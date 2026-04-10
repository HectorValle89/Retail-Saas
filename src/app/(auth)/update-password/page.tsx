export const runtime = 'edge';
import { UpdatePasswordForm } from '@/features/auth/components'

export default function UpdatePasswordPage() {
  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
          <svg className="h-7 w-7 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Seguridad
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Define una nueva contrasena
        </h1>
        <p className="mt-2 text-slate-600">
          Usa una contrasena segura y distinta a la anterior.
        </p>
      </div>

      <UpdatePasswordForm />
    </div>
  )
}

