import 'server-only'

import type { ActorActual } from '@/lib/auth/session'
import {
  type AccountScopeData,
  type AccountScopeOption,
  getSingleTenantScopeData,
} from '@/lib/tenant/accountScope'
import { isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import { createServiceClient } from '@/lib/supabase/server'
import type { CuentaCliente } from '@/types/database'

function buildDisabledScope(currentAccountId: string | null): AccountScopeData {
  return {
    enabled: false,
    currentAccountId,
    currentAccountLabel: currentAccountId ? 'Cuenta seleccionada' : 'Vista global',
    options: [],
  }
}

function buildAdminScope(
  currentAccountId: string | null,
  options: AccountScopeOption[]
): AccountScopeData {
  const current = options.find((item) => item.id === currentAccountId) ?? null

  return {
    enabled: true,
    currentAccountId: current?.id ?? null,
    currentAccountLabel: current?.nombre ?? 'Vista global',
    options,
  }
}

export async function obtenerAccountScopeData(
  actor: ActorActual
): Promise<AccountScopeData> {
  if (isSingleTenantBackendEnabled()) {
    return getSingleTenantScopeData()
  }

  if (actor.puesto !== 'ADMINISTRADOR') {
    return buildDisabledScope(actor.cuentaClienteId)
  }

  let supabase

  try {
    supabase = createServiceClient()
  } catch {
    return buildDisabledScope(actor.cuentaClienteId)
  }

  const { data, error } = await supabase
    .from('cuenta_cliente')
    .select('id, identificador, nombre, activa')
    .eq('activa', true)
    .order('nombre', { ascending: true })

  if (error) {
    return buildDisabledScope(actor.cuentaClienteId)
  }

  const options = ((data ?? []) as CuentaCliente[]).map((cuenta) => ({
    id: cuenta.id,
    identificador: cuenta.identificador,
    nombre: cuenta.nombre,
    activa: cuenta.activa,
  }))

  return buildAdminScope(actor.cuentaClienteId, options)
}
