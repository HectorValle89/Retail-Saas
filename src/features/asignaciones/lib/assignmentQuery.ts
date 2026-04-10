function sanitizePostgrestValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\"/g, '\\\"')
}

export function buildPostgrestInFilter(values: string[]) {
  return values
    .filter(Boolean)
    .map((value) => `"${sanitizePostgrestValue(value)}"`)
    .join(',')
}

export function buildAssignmentScopeOrFilter(input: {
  empleadoIds?: string[]
  pdvIds?: string[]
}) {
  const clauses: string[] = []
  const employeeFilter = buildPostgrestInFilter(input.empleadoIds ?? [])
  const pdvFilter = buildPostgrestInFilter(input.pdvIds ?? [])

  if (employeeFilter) {
    clauses.push(`empleado_id.in.(${employeeFilter})`)
  }

  if (pdvFilter) {
    clauses.push(`pdv_id.in.(${pdvFilter})`)
  }

  return clauses.join(',')
}
