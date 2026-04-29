import Link from 'next/link'
import { ExpiredLinkRecoveryForm } from '@/features/auth/components/ExpiredLinkRecoveryForm'
import { findAuthFlowById } from '@/lib/auth/accessFlow'
import { buildManagedFlowContinuationRoute, canResumeManagedFlow } from '@/lib/auth/flowRouting'

type ExpiredLinkPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function resolveValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export default async function EnlaceCaducadoPage({ searchParams }: ExpiredLinkPageProps) {
  const params = searchParams ? await searchParams : {}
  const flowId = resolveValue(params.flow_id)
  const flow = flowId ? await findAuthFlowById(flowId) : null
  const canResume = canResumeManagedFlow(flow)
  const resumeHref = flow ? buildManagedFlowContinuationRoute(flow) : '/login'

  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          Enlace caducado
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Este enlace de verificacion ya no es valido
        </h1>
        <p className="mt-2 text-slate-600">
          Por seguridad, los enlaces tienen vigencia limitada. Podemos generarte uno nuevo sin empezar de cero.
        </p>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-950">Correo asociado</p>
        <p className="mt-2">
          {flow?.correo_pendiente ?? flow?.correo_confirmado ?? flow?.correo_anterior ?? 'No disponible'}
        </p>
      </div>

      {canResume ? (
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Tu enlace ya fue validado
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Ya puedes continuar con la creacion de tu contrasena
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            Si volviste a abrir este enlace despues de confirmar tu correo, no necesitas empezar de cero.
            Continua al paso de credenciales para terminar tu acceso.
          </p>
          <Link
            href={resumeHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-[18px] bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Continuar con mi contrasena
          </Link>
        </div>
      ) : (
        <ExpiredLinkRecoveryForm flowId={flow?.id ?? flowId} />
      )}

      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al acceso
      </Link>
    </div>
  )
}
