export const runtime = 'edge';
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

      <LoginForm initialError={error} />
    </div>
  )
}

