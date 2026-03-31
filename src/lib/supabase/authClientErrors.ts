const NETWORK_ERROR_PATTERNS = [/failed to fetch/i, /networkerror/i, /load failed/i]

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
