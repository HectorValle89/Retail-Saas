import type { UiChangeTarget } from '@/lib/ui-change/types'

export type ModuleTagInput = {
  module: string
  accountId?: string | null
  employeeId?: string | null
  supervisorId?: string | null
  period?: string | null
}

function normalizePeriod(period?: string | null) {
  const normalized = period?.trim() ?? ''
  if (!normalized) {
    return null
  }

  const isoDateMatch = normalized.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoDateMatch) {
    return isoDateMatch[0]
  }

  return normalized
}

export function buildModuleCacheTags({
  module,
  accountId,
  employeeId,
  supervisorId,
  period,
}: ModuleTagInput) {
  const tags = new Set<string>([`module:${module}`])

  if (accountId) {
    tags.add(`module:${module}:cuenta:${accountId}`)
  }

  if (employeeId) {
    tags.add(`module:${module}:empleado:${employeeId}`)
  }

  if (supervisorId) {
    tags.add(`module:${module}:supervisor:${supervisorId}`)
  }

  const normalizedPeriod = normalizePeriod(period)
  if (normalizedPeriod) {
    tags.add(`module:${module}:periodo:${normalizedPeriod}`)
  }

  return Array.from(tags)
}

export function buildModuleCacheTagsFromUiChangeTarget(target: UiChangeTarget) {
  const tags = new Set(
    buildModuleCacheTags({
      module: target.module,
      accountId: target.cuentaClienteId ?? null,
      employeeId: target.empleadoId ?? null,
      supervisorId: target.supervisorEmpleadoId ?? null,
      period: target.metadata?.periodo as string | null | undefined,
    })
  )

  if (target.scopeKey.startsWith('periodo:')) {
    tags.add(`module:${target.module}:${target.scopeKey}`)
  }

  return Array.from(tags)
}
