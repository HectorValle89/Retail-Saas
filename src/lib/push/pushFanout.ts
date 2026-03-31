export interface OperationalPushPayload {
  employeeIds: string[]
  title: string
  body: string
  path: string
  tag: string
  cuentaClienteId?: string | null
  audit?: {
    tabla: string
    registroId: string
    accion: string
  }
  data?: Record<string, unknown>
}

function getPushFunctionUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Push fanout no configurado: falta NEXT_PUBLIC_SUPABASE_URL.')
  }

  return `${supabaseUrl}/functions/v1/mensajes-push`
}

function getServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('Push fanout no configurado: falta SUPABASE_SERVICE_ROLE_KEY.')
  }

  return serviceRoleKey
}

export async function sendOperationalPushNotification(payload: OperationalPushPayload) {
  const employeeIds = Array.from(
    new Set(payload.employeeIds.map((item) => item.trim()).filter(Boolean))
  )

  if (employeeIds.length === 0) {
    return
  }

  const response = await fetch(getPushFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getServiceRoleKey()}`,
    },
    body: JSON.stringify({
      employeeIds,
      title: payload.title,
      body: payload.body,
      path: payload.path,
      tag: payload.tag,
      cuentaClienteId: payload.cuentaClienteId ?? null,
      data: payload.data ?? {},
      audit: payload.audit ?? null,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'La Edge Function de push no respondio correctamente.')
  }
}
