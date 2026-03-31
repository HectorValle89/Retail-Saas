'use server'

import { requerirActorActivo } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { PushSubscriptionRegistro } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
 type TypedSupabaseClient = SupabaseClient<any>

interface PushSubscriptionInput {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string | null
}

interface PushSubscriptionActionState {
  ok: boolean
  message: string | null
}

const ESTADO_PUSH_INICIAL: PushSubscriptionActionState = {
  ok: false,
  message: null,
}

function buildState(partial: Partial<PushSubscriptionActionState>): PushSubscriptionActionState {
  return {
    ...ESTADO_PUSH_INICIAL,
    ...partial,
  }
}

function normalizeEndpoint(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('El endpoint push es obligatorio.')
  }

  return trimmed
}

export async function registrarSuscripcionPush(input: PushSubscriptionInput): Promise<PushSubscriptionActionState> {
  try {
    const actor = await requerirActorActivo()
    const service = createServiceClient() as TypedSupabaseClient
    const endpoint = normalizeEndpoint(input.endpoint)
    const p256dh = input.keys.p256dh?.trim()
    const auth = input.keys.auth?.trim()

    if (!p256dh || !auth) {
      throw new Error('La suscripcion push esta incompleta.')
    }

    const payload = {
      cuenta_cliente_id: actor.cuentaClienteId,
      usuario_id: actor.usuarioId,
      empleado_id: actor.empleadoId,
      endpoint,
      p256dh,
      auth,
      user_agent: input.userAgent?.trim() || null,
      ultima_suscripcion_en: new Date().toISOString(),
      ultimo_error: null,
      activa: true,
      metadata: {
        puesto: actor.puesto,
      },
    }

    const { error } = await service
      .from('push_subscription')
      .upsert(payload, { onConflict: 'endpoint' })

    if (error) {
      throw new Error(error.message)
    }

    return buildState({ ok: true, message: 'Notificaciones push activadas.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible activar las notificaciones push.' })
  }
}

export async function desactivarSuscripcionPush(endpoint: string): Promise<PushSubscriptionActionState> {
  try {
    const actor = await requerirActorActivo()
    const service = createServiceClient() as TypedSupabaseClient
    const normalizedEndpoint = normalizeEndpoint(endpoint)

    const { error } = await service
      .from('push_subscription')
      .update({ activa: false, ultimo_error: null })
      .eq('endpoint', normalizedEndpoint)
      .eq('empleado_id', actor.empleadoId)

    if (error) {
      throw new Error(error.message)
    }

    return buildState({ ok: true, message: 'Notificaciones push desactivadas.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible desactivar las notificaciones push.' })
  }
}

export async function obtenerEstadoPushActual() {
  try {
    const actor = await requerirActorActivo()
    const service = createServiceClient() as TypedSupabaseClient
    const { data, error } = await service
      .from('push_subscription')
      .select('id, endpoint, activa, ultimo_error, updated_at')
      .eq('empleado_id', actor.empleadoId)
      .eq('activa', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    const subscription = data as Pick<PushSubscriptionRegistro, 'id' | 'endpoint' | 'activa' | 'ultimo_error' | 'updated_at'> | null
    return {
      ok: true,
      hasActiveSubscription: Boolean(subscription?.activa),
      endpoint: subscription?.endpoint ?? null,
      lastError: subscription?.ultimo_error ?? null,
      updatedAt: subscription?.updated_at ?? null,
    }
  } catch (error) {
    return {
      ok: false,
      hasActiveSubscription: false,
      endpoint: null,
      lastError: error instanceof Error ? error.message : 'No fue posible consultar el estado push.',
      updatedAt: null,
    }
  }
}
