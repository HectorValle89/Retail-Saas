'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import {
  ACTIVE_ACCOUNT_COOKIE,
  getSingleTenantScopeData,
  normalizeRequestedAccountId,
} from '@/lib/tenant/accountScope'
import { isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import type { CuentaCliente } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ESTADO_ACCOUNT_SCOPE_INICIAL,
  type AccountScopeActionState,
} from './accountScopeState'

type AuditLogUploader = {
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<unknown>
  }
}

function buildState(
  partial: Partial<AccountScopeActionState>
): AccountScopeActionState {
  return {
    ...ESTADO_ACCOUNT_SCOPE_INICIAL,
    ...partial,
  }
}

function revalidateScopedRoutes() {
  revalidatePath('/', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/clientes')
  revalidatePath('/campanas')
  revalidatePath('/formaciones')
  revalidatePath('/asignaciones')
  revalidatePath('/asistencias')
  revalidatePath('/ventas')
  revalidatePath('/love-isdin')
  revalidatePath('/solicitudes')
  revalidatePath('/mensajes')
  revalidatePath('/nomina')
  revalidatePath('/gastos')
  revalidatePath('/materiales')
  revalidatePath('/reportes')
}

export async function actualizarCuentaClienteActiva(
  _prevState: AccountScopeActionState,
  formData: FormData
): Promise<AccountScopeActionState> {
  if (isSingleTenantBackendEnabled()) {
    const scope = getSingleTenantScopeData()
    return buildState({
      ok: true,
      message: `La cuenta operativa esta fijada en ${scope.currentAccountLabel}.`,
    })
  }

  const actor = await requerirAdministradorActivo()
  const cookieStore = await cookies()
  const requestedAccountId = normalizeRequestedAccountId(formData.get('account_id'))

  if (!requestedAccountId) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE)
    revalidateScopedRoutes()

    return buildState({
      ok: true,
      message: 'Vista global activada para el administrador.',
    })
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminServiceClient = SupabaseClient<any>
  const typedService = service as AdminServiceClient
  const { data: cuentaClienteRaw, error: cuentaError } = await typedService
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('id', requestedAccountId)
    .maybeSingle()

  const cuentaCliente = cuentaClienteRaw as CuentaCliente | null
 
  if (cuentaError || !cuentaCliente || !cuentaCliente.activa) {
    return buildState({
      message:
        cuentaError?.message ?? 'La cuenta cliente seleccionada no existe o no esta activa.',
    })
  }

  cookieStore.set(ACTIVE_ACCOUNT_COOKIE, requestedAccountId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  })

  const auditClient = typedService as unknown as AuditLogUploader

  await auditClient.from('audit_log').insert({
    tabla: 'cuenta_cliente',
    registro_id: cuentaCliente.id,
    accion: 'EVENTO',
    payload: {
      evento: 'account_scope_actualizado_admin',
      cuenta_cliente_id: cuentaCliente.id,
      cuenta_cliente: cuentaCliente.nombre,
      vista: 'SCOPED',
    },
    usuario_id: actor.usuarioId,
    cuenta_cliente_id: cuentaCliente.id,
  })

  revalidateScopedRoutes()

  return buildState({
    ok: true,
    message: `Vista acotada a ${cuentaCliente.nombre}.`,
  })
}
