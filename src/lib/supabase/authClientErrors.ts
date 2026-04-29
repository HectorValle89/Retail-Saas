const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /unexpected token/i,
  /not valid json/i,
  /error code:\s*1016/i,
  /invalid json/i,
]

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error) {
    const { message } = error as { message?: unknown }
    if (typeof message === 'string') {
      return message
    }
  }

  return ''
}

export function isSupabaseAuthNetworkError(error: unknown): boolean {
  const message = extractErrorMessage(error)

  if (!message) {
    return false
  }

  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function getSupabaseAuthFriendlyErrorMessage(
  error: unknown,
  fallback = 'No fue posible conectar con el servicio de autenticacion. Reintenta en unos minutos.'
) {
  const message = extractErrorMessage(error)

  if (!message) {
    return fallback
  }

  if (isSupabaseAuthNetworkError(message)) {
    return fallback
  }

  return message
}
