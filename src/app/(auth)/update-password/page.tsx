import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UpdatePasswordForm } from '@/features/auth/components'
import { findAuthFlowById } from '@/lib/auth/accessFlow'

type UpdatePasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function resolveValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = searchParams ? await searchParams : {}
  const flowId = resolveValue(params.flow_id)
  const mode = resolveValue(params.mode)
  let flow = null

  if (flowId) {
    try {
      flow = await findAuthFlowById(flowId)
    } catch {
      redirect('/login?error=' + encodeURIComponent('No fue posible cargar tu enlace de acceso. Solicita uno nuevo.'))
    }

    if (!flow) {
      redirect(`/enlace-caducado?flow_id=${encodeURIComponent(flowId)}`)
    }
  }

  const title =
    flow?.tipo_flujo === 'RESET_PASSWORD'
      ? 'Restablece tu contrasena'
      : flow?.tipo_flujo === 'CHANGE_EMAIL'
        ? 'Confirma tu nuevo acceso'
        : 'Crea tus credenciales definitivas'

  const intro =
    flow?.tipo_flujo === 'RESET_PASSWORD'
      ? 'Este paso cerrara tu recuperacion de acceso. Cuando confirmes, te llevaremos al login para entrar con la nueva contrasena.'
      : 'Tu correo ya quedo validado. Ahora define la contrasena final con la que entraras al sistema.'

  if (!flowId && !mode) {
    redirect('/login')
  }

  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
          <svg className="h-7 w-7 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          {flow?.tipo_flujo === 'RESET_PASSWORD' ? 'Recuperacion de acceso' : 'Paso 4 de 4'}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-slate-600">{intro}</p>
      </div>

      {flow && (
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Correo confirmado</p>
          <p className="mt-2">
            {flow.correo_confirmado ?? flow.correo_pendiente ?? flow.correo_anterior ?? 'Sin correo disponible'}
          </p>
          <p className="mt-3 text-slate-600">
            Al confirmar este formulario, invalidaremos las credenciales provisionales y te pediremos volver a iniciar sesion.
          </p>
        </div>
      )}

      <UpdatePasswordForm
        flowId={flow?.id ?? flowId}
        correo={flow?.correo_confirmado ?? flow?.correo_pendiente ?? flow?.correo_anterior}
        submitLabel={flow?.tipo_flujo === 'RESET_PASSWORD' ? 'Guardar nueva contrasena' : 'Confirmar credenciales'}
      />

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
