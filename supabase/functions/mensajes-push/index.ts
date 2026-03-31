/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.0'
import webpush from 'npm:web-push@3.6.7'

interface PushPayloadRequest {
  mensajeId?: string
  employeeIds?: string[]
  title?: string
  body?: string
  path?: string
  tag?: string
  cuentaClienteId?: string | null
  data?: Record<string, unknown>
  audit?: {
    tabla: string
    registroId: string
    accion: string
  } | null
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  empleado_id: string
}

interface ResolvedPushMessage {
  cuentaClienteId: string | null
  employeeIds: string[]
  payload: string
  audit:
    | {
        tabla: string
        registroId: string
        accion: string
      }
    | null
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:retail@example.com'

if (supabaseUrl && serviceRoleKey && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

async function resolvePushMessage(
  supabase: ReturnType<typeof createClient>,
  body: PushPayloadRequest
): Promise<ResolvedPushMessage> {
  if (body.mensajeId) {
    const { data: messageRaw, error: messageError } = await supabase
      .from('mensaje_interno')
      .select('id, titulo, cuerpo, tipo, cuenta_cliente_id')
      .eq('id', body.mensajeId)
      .maybeSingle()

    if (messageError || !messageRaw) {
      throw new Error(messageError?.message ?? 'Message not found.')
    }

    const { data: recipientsRaw, error: recipientsError } = await supabase
      .from('mensaje_receptor')
      .select('empleado_id')
      .eq('mensaje_id', body.mensajeId)

    if (recipientsError) {
      throw new Error(recipientsError.message)
    }

    const employeeIds = Array.from(
      new Set((recipientsRaw ?? []).map((item) => item.empleado_id).filter(Boolean))
    )

    return {
      cuentaClienteId: messageRaw.cuenta_cliente_id,
      employeeIds,
      payload: JSON.stringify({
        title: messageRaw.titulo,
        body: messageRaw.cuerpo,
        data: {
          mensajeId: messageRaw.id,
          path: '/mensajes',
          tipo: messageRaw.tipo,
          cuentaClienteId: messageRaw.cuenta_cliente_id,
        },
        tag: `mensaje-${messageRaw.id}`,
      }),
      audit: {
        tabla: 'push_subscription',
        registroId: body.mensajeId,
        accion: 'fanout_mensaje_push',
      },
    }
  }

  const employeeIds = Array.from(new Set((body.employeeIds ?? []).filter(Boolean)))
  if (employeeIds.length === 0) {
    throw new Error('employeeIds is required.')
  }

  if (!body.title || !body.body) {
    throw new Error('title and body are required.')
  }

  return {
    cuentaClienteId: body.cuentaClienteId ?? null,
    employeeIds,
    payload: JSON.stringify({
      title: body.title,
      body: body.body,
      data: {
        ...(body.data ?? {}),
        path: body.path || '/dashboard',
        cuentaClienteId: body.cuentaClienteId ?? null,
      },
      tag: body.tag || 'retail-operational-push',
    }),
    audit: body.audit ?? null,
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: 'Push environment is not configured.' }, { status: 500 })
  }

  const body = (await request.json().catch(() => ({}))) as PushPayloadRequest

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let resolvedMessage: ResolvedPushMessage
  try {
    resolvedMessage = await resolvePushMessage(supabase, body)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid push payload.' },
      { status: 400 }
    )
  }

  if (resolvedMessage.employeeIds.length === 0) {
    return Response.json({ ok: true, sent: 0, skipped: 0 })
  }

  const { data: subscriptionsRaw, error: subscriptionsError } = await supabase
    .from('push_subscription')
    .select('id, endpoint, p256dh, auth, empleado_id')
    .eq('activa', true)
    .in('empleado_id', resolvedMessage.employeeIds)

  if (subscriptionsError) {
    return Response.json({ error: subscriptionsError.message }, { status: 500 })
  }

  const subscriptions = (subscriptionsRaw ?? []) as SubscriptionRow[]

  let sent = 0
  let skipped = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        resolvedMessage.payload
      )

      sent += 1
      await supabase
        .from('push_subscription')
        .update({ ultimo_envio_en: new Date().toISOString(), ultimo_error: null })
        .eq('id', subscription.id)
    } catch (error) {
      skipped += 1
      const message = error instanceof Error ? error.message : 'Unknown push error.'
      await supabase
        .from('push_subscription')
        .update({ ultimo_error: message, activa: !message.includes('410') && !message.includes('404') })
        .eq('id', subscription.id)
    }
  }

  if (resolvedMessage.audit) {
    await supabase.from('audit_log').insert({
      tabla: resolvedMessage.audit.tabla,
      registro_id: resolvedMessage.audit.registroId,
      accion: 'EVENTO',
      payload: {
        accion: resolvedMessage.audit.accion,
        sent,
        skipped,
        total_subscriptions: subscriptions.length,
      },
      cuenta_cliente_id: resolvedMessage.cuentaClienteId,
    })
  }

  return Response.json({ ok: true, sent, skipped, total: subscriptions.length })
})
