export interface WeekDayOption {
  value: number
  label: string
  shortLabel: string
}

export const WEEK_DAY_OPTIONS: WeekDayOption[] = [
  { value: 1, label: 'Lunes', shortLabel: 'LUN' },
  { value: 2, label: 'Martes', shortLabel: 'MAR' },
  { value: 3, label: 'Miercoles', shortLabel: 'MIE' },
  { value: 4, label: 'Jueves', shortLabel: 'JUE' },
  { value: 5, label: 'Viernes', shortLabel: 'VIE' },
  { value: 6, label: 'Sabado', shortLabel: 'SAB' },
  { value: 7, label: 'Domingo', shortLabel: 'DOM' },
]

function toUtcDate(value?: string | Date) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`)
  }

  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function getWeekStartIso(value?: string | Date) {
  const date = toUtcDate(value)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return toIsoDate(date)
}

export function getWeekEndIso(weekStart: string) {
  const date = toUtcDate(weekStart)
  date.setUTCDate(date.getUTCDate() + 6)
  return toIsoDate(date)
}

export function getWeekDayLabel(dayNumber: number) {
  return WEEK_DAY_OPTIONS.find((item) => item.value === dayNumber)?.label ?? 'Sin dia'
}

export function getWeekDayShortLabel(dayNumber: number) {
  return WEEK_DAY_OPTIONS.find((item) => item.value === dayNumber)?.shortLabel ?? 'NA'
}

export function normalizeWeekStart(value?: string | Date) {
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
  return getWeekStartIso(normalized ?? value)
}

export function rangesOverlapIso(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null
) {
  const normalizedLeftEnd = leftEnd ?? leftStart
  const normalizedRightEnd = rightEnd ?? rightStart

  return leftStart <= normalizedRightEnd && rightStart <= normalizedLeftEnd
}

export function isAssignmentActiveForWeek(
  item: {
    fecha_inicio: string
    fecha_fin: string | null
    estado_publicacion?: string | null
  },
  weekStart: string,
  weekEnd: string
) {
  return Boolean(
    item.estado_publicacion === undefined ||
      item.estado_publicacion === null ||
      item.estado_publicacion === 'PUBLICADA'
  ) && rangesOverlapIso(item.fecha_inicio, item.fecha_fin, weekStart, weekEnd)
}

export function sortWeeklyVisits<T extends { diaSemana: number; orden: number }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.diaSemana !== right.diaSemana) {
      return left.diaSemana - right.diaSemana
    }

    return left.orden - right.orden
  })
}