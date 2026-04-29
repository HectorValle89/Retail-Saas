export interface AssignmentRestOverrideLike {
  id: string
  asignacion_id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  vigente_desde: string
  vigente_hasta: string | null
  modo: 'EXPLICITO' | 'REGLA_MENSUAL' | null
  regla_descanso: Record<string, unknown> | null
  fechas_descanso: string[] | null
  fechas_trabajo: string[] | null
  observaciones: string | null
  activo: boolean
  metadata?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export const WEEKDAY_MONTHLY_RULES = [
  { code: 'DOM', label: 'Domingo' },
  { code: 'LUN', label: 'Lunes' },
  { code: 'MAR', label: 'Martes' },
  { code: 'MIE', label: 'Miércoles' },
  { code: 'JUE', label: 'Jueves' },
  { code: 'VIE', label: 'Viernes' },
  { code: 'SAB', label: 'Sábado' },
] as const

export type AssignmentRestWeekdayCode = (typeof WEEKDAY_MONTHLY_RULES)[number]['code']

const WEEKDAY_CODES = WEEKDAY_MONTHLY_RULES.map((item) => item.code) as AssignmentRestWeekdayCode[]

export type AssignmentRestOverrideDecision = 'REST' | 'WORK' | 'NONE'

export interface AssignmentRestMonthlyRule {
  kind: 'MONTHLY_WEEKDAY_OCCURRENCIES'
  timezone?: string | null
  rest: Array<{
    weekday: AssignmentRestWeekdayCode
    occurrences: number[]
  }>
  work: Array<{
    weekday: AssignmentRestWeekdayCode
    occurrences: number[]
  }>
}

function normalizeIsoDate(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function normalizeIsoDateList(value: unknown) {
  const input = Array.isArray(value) ? value : []
  const normalized = Array.from(
    new Set(
      input
        .map((item) => normalizeIsoDate(typeof item === 'string' ? item : null))
        .filter((item): item is string => Boolean(item))
    )
  )

  return normalized.sort((left, right) => left.localeCompare(right))
}

function normalizeWeekdayCode(value: unknown): AssignmentRestWeekdayCode | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  return WEEKDAY_CODES.includes(normalized as AssignmentRestWeekdayCode)
    ? (normalized as AssignmentRestWeekdayCode)
    : null
}

function normalizeOccurrenceList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[]
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 5)
    )
  ).sort((left, right) => left - right)
}

function normalizeRuleEntries(
  value: unknown
): Array<{
  weekday: AssignmentRestWeekdayCode
  occurrences: number[]
}> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record =
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null
      const weekday = normalizeWeekdayCode(record?.weekday)
      const occurrences = normalizeOccurrenceList(record?.occurrences)

      if (!weekday || occurrences.length === 0) {
        return null
      }

      return { weekday, occurrences }
    })
    .filter((item): item is { weekday: AssignmentRestWeekdayCode; occurrences: number[] } => Boolean(item))
}

export function normalizeAssignmentRestMonthlyRule(value: unknown): AssignmentRestMonthlyRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (record.kind !== 'MONTHLY_WEEKDAY_OCCURRENCIES') {
    return null
  }

  return {
    kind: 'MONTHLY_WEEKDAY_OCCURRENCIES',
    timezone: typeof record.timezone === 'string' ? record.timezone : null,
    rest: normalizeRuleEntries(record.rest),
    work: normalizeRuleEntries(record.work),
  }
}

function getWeekdayCode(targetDate: string): AssignmentRestWeekdayCode {
  const date = new Date(`${targetDate}T12:00:00Z`)
  return WEEKDAY_CODES[date.getUTCDay()] ?? 'DOM'
}

function getWeekdayOccurrenceInMonth(targetDate: string) {
  const date = new Date(`${targetDate}T12:00:00Z`)
  return Math.floor((date.getUTCDate() - 1) / 7) + 1
}

function matchesMonthlyRule(rule: AssignmentRestMonthlyRule, kind: 'rest' | 'work', targetDate: string) {
  const weekday = getWeekdayCode(targetDate)
  const occurrence = getWeekdayOccurrenceInMonth(targetDate)
  const entries = kind === 'rest' ? rule.rest : rule.work

  return entries.some((entry) => entry.weekday === weekday && entry.occurrences.includes(occurrence))
}

export function resolveRestOverrideDecision(
  override: AssignmentRestOverrideLike,
  targetDate: string
): AssignmentRestOverrideDecision {
  if (!override.activo) {
    return 'NONE'
  }

  if (override.vigente_desde > targetDate) {
    return 'NONE'
  }

  if (override.vigente_hasta && override.vigente_hasta < targetDate) {
    return 'NONE'
  }

  const fechasTrabajo = normalizeIsoDateList(override.fechas_trabajo ?? [])
  if (fechasTrabajo.includes(targetDate)) {
    return 'WORK'
  }

  const fechasDescanso = normalizeIsoDateList(override.fechas_descanso ?? [])
  if (fechasDescanso.includes(targetDate)) {
    return 'REST'
  }

  const monthlyRule = normalizeAssignmentRestMonthlyRule(override.regla_descanso)
  if (!monthlyRule) {
    return 'NONE'
  }

  if (matchesMonthlyRule(monthlyRule, 'work', targetDate)) {
    return 'WORK'
  }

  if (matchesMonthlyRule(monthlyRule, 'rest', targetDate)) {
    return 'REST'
  }

  return 'NONE'
}

export function isRestOverrideActiveOnDate(override: AssignmentRestOverrideLike, targetDate: string) {
  return resolveRestOverrideDecision(override, targetDate) === 'REST'
}

export function selectRestOverrideForAssignmentDate(
  assignmentId: string,
  targetDate: string,
  overrides: AssignmentRestOverrideLike[]
) {
  return (
    overrides.find(
      (override) =>
        override.asignacion_id === assignmentId && resolveRestOverrideDecision(override, targetDate) !== 'NONE'
    ) ?? null
  )
}

export function summarizeRestOverrideDates(override: AssignmentRestOverrideLike) {
  const descansos = normalizeIsoDateList(override.fechas_descanso ?? [])
  const trabajos = normalizeIsoDateList(override.fechas_trabajo ?? [])

  return {
    descansos,
    trabajos,
    regla: normalizeAssignmentRestMonthlyRule(override.regla_descanso),
    total: descansos.length + trabajos.length,
  }
}
