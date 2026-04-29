import { requerirAdministradorActivo } from '@/lib/auth/session'
import { UsuariosPanel } from '@/features/usuarios/components/UsuariosPanel'
import { obtenerPanelUsuarios } from '@/features/usuarios/services/usuarioService'
import { readRuntimeEnv } from '@/lib/runtime/env'

export const metadata = {
  title: 'Usuarios | Field Force Platform',
}

export default async function AdminUsersPage() {
  const actor = await requerirAdministradorActivo()
  const data = await obtenerPanelUsuarios(actor, {
    backendAdminConfigurado: Boolean(readRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY')),
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control de acceso
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Gestion de usuarios</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Estado administrativo de usuarios, vinculacion con auth, activacion y acceso multi-tenant.
        </p>
      </header>

      <UsuariosPanel actor={actor} data={data} />
    </div>
  )
}
