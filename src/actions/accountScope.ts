'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import {
  ACTIVE_ACCOUNT_COOKIE,
  normalizeRequestedAccountId,
} from '@/lib/tenant/accountScope'

export interface AccountScopeActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_ACCOUNT_SCOPE_INICIAL: AccountScopeActionState = {
  ok: false,
  message: null,
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
  revalidatePath('/asignaciones')
  revalidatePath('/asistencias')
  revalidatePath('/ventas')
  revalidatePath('/nomina')
  revalidatePath('/reportes')
}

export async function actualizarCuentaClienteActiva(
  _prevState: AccountScopeActionState,
  formData: FormData
): Promise<AccountScopeActionState> {
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

  const { data: cuentaCliente, error: cuentaError } = await service
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('id', requestedAccountId)
    .maybeSingle()

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

  await service.from('audit_log').insert({
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
