import { cache } from 'react'
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

type UsuarioActorRow = {
  id: string
  empleado_id: string
  cuenta_cliente_id: string | null
  username: string | null
  correo_electronico: string | null
  correo_verificado: boolean
  estado_cuenta: EstadoCuenta
  empleado:
    | {
        id: string
        nombre_completo: string
        puesto: Puesto
        metadata: Record<string, unknown> | null
      }
    | Array<{
        id: string
        nombre_completo: string
        puesto: Puesto
        metadata: Record<string, unknown> | null
      }>
    | null
}

function normalizeEmpleado(
  value: UsuarioActorRow['empleado']
): {
  id: string
  nombre_completo: string
  puesto: Puesto
  metadata: Record<string, unknown> | null
} | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? (value[0] ?? null) : value
}

const obtenerActorActualCached = cache(async (): Promise<ActorActual | null> => {
  const supabase = await createClient({ bypassTenantScope: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select(
      'id, empleado_id, cuenta_cliente_id, username, correo_electronico, correo_verificado, estado_cuenta, empleado:empleado_id(id, nombre_completo, puesto, metadata)'
    )
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const usuarioActual = (usuario ?? null) as UsuarioActorRow | null
  if (!usuarioActual) {
    return null
  }

  const empleadoActual = normalizeEmpleado(usuarioActual.empleado)
  if (!empleadoActual) {
    return null
  }

  const requestScope = await readRequestAccountScope()
  const cuentaClienteId =
    isSingleTenantBackendEnabled()
      ? requestScope.accountId ?? usuarioActual.cuenta_cliente_id
      : empleadoActual.puesto === 'ADMINISTRADOR'
        ? requestScope.accountId
        : usuarioActual.cuenta_cliente_id

  return {
    authUserId: user.id,
    usuarioId: usuarioActual.id,
    empleadoId: usuarioActual.empleado_id,
    cuentaClienteId,
    username: usuarioActual.username,
    correoElectronico: usuarioActual.correo_electronico,
    correoVerificado: usuarioActual.correo_verificado,
    estadoCuenta: usuarioActual.estado_cuenta,
    nombreCompleto: empleadoActual.nombre_completo,
    puesto: empleadoActual.puesto,
    primerAccesoPendiente: isPrimerAccesoPendiente(empleadoActual.metadata),
  }
})

export async function obtenerActorActual(): Promise<ActorActual | null> {
  return obtenerActorActualCached()
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
