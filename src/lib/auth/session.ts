import { redirect } from 'next/navigation'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import { createClient } from '@/lib/supabase/server'
import { isPrimerAccesoPendiente } from '@/lib/auth/firstAccess'
import type { EstadoCuenta, Puesto } from '@/types/database'

export interface ActorActual {
  authUserId: string
  usuarioId: string
  empleadoId: string
  cuentaClienteId: string | null
  username: string | null
  correoElectronico: string | null
  correoVerificado: boolean
  estadoCuenta: EstadoCuenta
  nombreCompleto: string
  puesto: Puesto
  primerAccesoPendiente?: boolean
}

export async function obtenerActorActual(): Promise<ActorActual | null> {
  const supabase = await createClient({ bypassTenantScope: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id, username, correo_electronico, correo_verificado, estado_cuenta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!usuario) {
    return null
  }

  const { data: empleado } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, metadata')
    .eq('id', usuario.empleado_id)
    .maybeSingle()

  if (!empleado) {
    return null
  }

  const requestScope = await readRequestAccountScope()
  const cuentaClienteId =
    isSingleTenantBackendEnabled()
      ? requestScope.accountId ?? usuario.cuenta_cliente_id
      : empleado.puesto === 'ADMINISTRADOR'
        ? requestScope.accountId
        : usuario.cuenta_cliente_id

  return {
    authUserId: user.id,
    usuarioId: usuario.id,
    empleadoId: usuario.empleado_id,
    cuentaClienteId,
    username: usuario.username,
    correoElectronico: usuario.correo_electronico,
    correoVerificado: usuario.correo_verificado,
    estadoCuenta: usuario.estado_cuenta as EstadoCuenta,
    nombreCompleto: empleado.nombre_completo,
    puesto: empleado.puesto as Puesto,
    primerAccesoPendiente: isPrimerAccesoPendiente(empleado.metadata),
  }
}

export async function requerirActorAutenticado() {
  const actor = await obtenerActorActual()

  if (!actor) {
    redirect('/login')
  }

  return actor
}

export async function requerirActorActivo() {
  const actor = await requerirActorAutenticado()

  if (actor.estadoCuenta !== 'ACTIVA') {
    redirect('/activacion')
  }

  if (actor.primerAccesoPendiente) {
    redirect('/primer-acceso')
  }

  return actor
}

export async function requerirAdministradorActivo() {
  const actor = await requerirActorActivo()

  if (actor.puesto !== 'ADMINISTRADOR') {
    redirect('/dashboard')
  }

  return actor
}

export async function requerirPuestosActivos(puestos: Puesto[]) {
  const actor = await requerirActorActivo()

  if (!puestos.includes(actor.puesto)) {
    redirect('/dashboard')
  }

  return actor
}

export async function requerirOperadorNomina() {
  return requerirPuestosActivos(['ADMINISTRADOR', 'NOMINA'])
}
