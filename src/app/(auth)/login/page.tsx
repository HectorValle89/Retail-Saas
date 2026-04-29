import Image from 'next/image'
import { LoginForm } from '@/features/auth/components/LoginForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function resolveError(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {}
  const error = resolveError(params.error)
  const notice = resolveError(params.notice)

  return (
    <div className="space-y-5">
      <div className="space-y-3 text-left">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="relative h-12 w-12 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
            <Image
              src="/beteele-app-icon.png"
              alt="Beteele One"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#1a7fd4]">
              Beteele One
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Acceso corporativo
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#1a7fd4]">
            Inicio seguro
          </p>
          <h1 className="max-w-md text-[clamp(2.2rem,4vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-slate-950">
            Iniciar sesion
          </h1>
        </div>

        <p className="max-w-md text-[15px] leading-7 text-slate-600">
          Entra con tus credenciales corporativas para continuar tu operacion.
        </p>
      </div>

      <LoginForm initialError={error} initialNotice={notice} />
    </div>
  )
}
