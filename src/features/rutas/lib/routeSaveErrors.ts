const ROUTE_DUPLICATE_ERROR_PATTERNS = [
  /duplicate key value violates unique constraint/i,
  /already exists/i,
  /duplicate/i,
]

export function isRouteDuplicateError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''

  return ROUTE_DUPLICATE_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function getRutaSemanalResubmissionSuccessMessage() {
  return 'Ruta semanal reenviada a coordinacion para aprobacion.'
}
