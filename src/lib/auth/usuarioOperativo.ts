import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoCuenta, Puesto } from '@/types/database'
import { obtenerClienteAdmin } from './admin'

type MaybeMany<T> = T | T[] | null

type UsuarioOperativoEmpleadoRow = {
  id: string
  nombre_completo: string
  puesto: Puesto
  metadata: Record<string, unknown> | null
}

export type UsuarioOperativoSessionRow = {
  id: string
  empleado_id: string
  cuenta_cliente_id: string | null
  auth_user_id: string | null
  username: string | null
  correo_electronico: string | null
  correo_verificado: boolean
  estado_cuenta: EstadoCuenta
  empleado: MaybeMany<UsuarioOperativoEmpleadoRow>
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return trimmed || null
}

function normalizeUsername(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

function first<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildSelectClause() {
  return 'id, empleado_id, cuenta_cliente_id, auth_user_id, username, correo_electronico, correo_verificado, estado_cuenta, empleado:empleado_id(id, nombre_completo, puesto, metadata)'
}

function toSessionRow(value: unknown): UsuarioOperativoSessionRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const row = value as UsuarioOperativoSessionRow
  return row.id && row.empleado_id ? row : null
}

async function readUsuarioByColumn(
  supabase: SupabaseClient,
  column: 'auth_user_id' | 'username' | 'correo_electronico',
  value: string
) {
  const { data, error } = await supabase
    .from('usuario')
    .select(buildSelectClause())
    .eq(column, value)
    .maybeSingle()

  if (error) {
    throw error
  }

  return toSessionRow(data)
}

async function refreshUsuarioByAuthId(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from('usuario')
    .select(buildSelectClause())
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return toSessionRow(data)
}

async function ensureEmpleadoSeleccionado(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  usuario: UsuarioOperativoSessionRow | null
) {
  if (!usuario) {
    return null
  }

  const empleadoActual = first(usuario.empleado)
  if (empleadoActual) {
    return usuario
  }

  const { data, error } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto, metadata')
    .eq('id', usuario.empleado_id)
    .maybeSingle()

  if (error) {
    throw error
  }

  const empleadoSeleccionado = data ?? null

  return {
    ...usuario,
    empleado: empleadoSeleccionado,
  }
}

export async function resolverUsuarioOperativoPorAuthUserId(
  supabase: SupabaseClient,
  authUserId: string
): Promise<UsuarioOperativoSessionRow | null> {
  const direct = await refreshUsuarioByAuthId(supabase, authUserId)
  if (direct) {
    return direct
  }

  const { service, error: adminError } = obtenerClienteAdmin()
  if (!service) {
    if (adminError) {
      throw new Error(adminError)
    }

    return null
  }

  const { data: authUserResponse, error: authUserError } = await service.auth.admin.getUserById(authUserId)
  if (authUserError || !authUserResponse.user) {
    return null
  }

  const authEmail = normalizeEmail(authUserResponse.user.email)
  const metadata = (authUserResponse.user.user_metadata ?? null) as Record<string, unknown> | null
  const authUsername = normalizeUsername(
    typeof metadata?.username === 'string' ? metadata.username : null
  )

  let fallback: UsuarioOperativoSessionRow | null = null

  if (authUsername) {
    fallback = await readUsuarioByColumn(supabase, 'username', authUsername)
  }

  if (!fallback && authEmail) {
    fallback = await readUsuarioByColumn(supabase, 'correo_electronico', authEmail)
  }

  if (!fallback) {
    return null
  }

  const updates: Record<string, unknown> = {}

  if (fallback.auth_user_id !== authUserId) {
    updates.auth_user_id = authUserId
  }

  if (authEmail && normalizeEmail(fallback.correo_electronico) !== authEmail) {
    updates.correo_electronico = authEmail
  }

  if (authUserResponse.user.email_confirmed_at) {
    updates.correo_verificado = true
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString()

    const { error: updateError } = await service
      .from('usuario')
      .update(updates)
      .eq('id', fallback.id)

    if (updateError) {
      throw new Error(updateError.message)
    }
  }

  const refreshed = await refreshUsuarioByAuthId(supabase, authUserId)
  const usuarioRecuperado = refreshed ?? fallback
  return ensureEmpleadoSeleccionado(service, usuarioRecuperado)
}

export function extractUsuarioOperativoEmpleado(usuario: UsuarioOperativoSessionRow | null) {
  return first(usuario?.empleado)
}
