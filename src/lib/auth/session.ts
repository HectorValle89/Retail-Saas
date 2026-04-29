import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import { ACTOR_CONTEXT_HEADER } from '@/lib/supabase/proxy'
import { createClient } from '@/lib/supabase/server'
import { isPrimerAccesoPendiente } from '@/lib/auth/firstAccess'
import {
  extractUsuarioOperativoEmpleado,
  resolverUsuarioOperativoPorAuthUserId,
} from '@/lib/auth/usuarioOperativo'
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

function decodeActorContextHeader(value: string | null): {
  authUserId: string
  usuarioId: string
  empleadoId: string
  cuentaClienteId: string | null
  username: string | null
  correoElectronico: string | null
  correoVerificado: boolean
  estadoCuenta: EstadoCuenta
  nombreCompleto: string | null
  puesto: Puesto
  primerAccesoPendiente: boolean
} | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as {
      authUserId: string
      usuarioId: string
      empleadoId: string
      cuentaClienteId: string | null
      username: string | null
      correoElectronico: string | null
      correoVerificado: boolean
      estadoCuenta: EstadoCuenta
      nombreCompleto: string | null
      puesto: Puesto | null
      primerAccesoPendiente: boolean
    }

    if (!parsed.authUserId || !parsed.usuarioId || !parsed.empleadoId || !parsed.estadoCuenta || !parsed.puesto) {
      return null
    }

    return {
      ...parsed,
      puesto: parsed.puesto,
    }
  } catch {
    return null
  }
}

const obtenerActorActualCached = cache(async (): Promise<ActorActual | null> => {
  const headerStore = await headers()
  const supabase = await createClient({ bypassTenantScope: true })
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    return null
  }

  const claims = claimsData.claims as Record<string, unknown>
  const authUserId = typeof claims.sub === 'string' ? claims.sub : null

  if (!authUserId) {
    return null
  }

  const headerActor = decodeActorContextHeader(headerStore.get(ACTOR_CONTEXT_HEADER))
  if (headerActor && headerActor.authUserId === authUserId && headerActor.nombreCompleto) {
    const requestScope = await readRequestAccountScope()
    const cuentaClienteId =
      isSingleTenantBackendEnabled()
        ? requestScope.accountId ?? headerActor.cuentaClienteId
        : headerActor.puesto === 'ADMINISTRADOR'
          ? requestScope.accountId
          : headerActor.cuentaClienteId

    return {
      authUserId,
      usuarioId: headerActor.usuarioId,
      empleadoId: headerActor.empleadoId,
      cuentaClienteId,
      username: headerActor.username,
      correoElectronico: headerActor.correoElectronico,
      correoVerificado: headerActor.correoVerificado,
      estadoCuenta: headerActor.estadoCuenta,
      nombreCompleto: headerActor.nombreCompleto,
      puesto: headerActor.puesto,
      primerAccesoPendiente: headerActor.primerAccesoPendiente,
    }
  }

  const usuarioActual = await resolverUsuarioOperativoPorAuthUserId(supabase, authUserId)
  if (!usuarioActual) {
    return null
  }

  const empleadoActual = extractUsuarioOperativoEmpleado(usuarioActual)
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
    authUserId,
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

  if (actor.estadoCuenta === 'PENDIENTE_PRIMER_LOGIN' || actor.primerAccesoPendiente) {
    redirect('/primer-acceso')
  }

  if (actor.estadoCuenta !== 'ACTIVA') {
    redirect('/activacion')
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
