export const DIA_LABORAL_CODES = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const

export type DiaLaboralCode = (typeof DIA_LABORAL_CODES)[number]

const DIA_SET = new Set<string>(DIA_LABORAL_CODES)

export function normalizeDiaLaboralCode(value: string | null | undefined): DiaLaboralCode | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return DIA_SET.has(normalized) ? (normalized as DiaLaboralCode) : null
}

export function parseDiasLaborales(value: string | null | undefined) {
  const raw = String(value ?? '').trim()

  if (!raw) {
    return {
      dias: [] as DiaLaboralCode[],
      invalidTokens: [] as string[],
      duplicates: [] as string[],
    }
  }

  const tokens = raw
    .split(/[;,|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const dias: DiaLaboralCode[] = []
  const invalidTokens: string[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()

  for (const token of tokens) {
    const normalized = normalizeDiaLaboralCode(token)

    if (!normalized) {
      invalidTokens.push(token)
      continue
    }

    if (seen.has(normalized)) {
      duplicates.push(normalized)
      continue
    }

    seen.add(normalized)
    dias.push(normalized)
  }

  const ordenados = DIA_LABORAL_CODES.filter((dia) => seen.has(dia))

  return {
    dias: ordenados,
    invalidTokens,
    duplicates,
  }
}

export function serializeDiasLaborales(dias: DiaLaboralCode[]) {
  if (dias.length === 0) {
    return null
  }

  return DIA_LABORAL_CODES.filter((dia) => dias.includes(dia)).join(',')
}

export function normalizeIsoDate(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function rangesOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null
) {
  const normalizedEndA = endA ?? '9999-12-31'
  const normalizedEndB = endB ?? '9999-12-31'

  return startA <= normalizedEndB && startB <= normalizedEndA
}

export function diasSeSolapan(
  left: DiaLaboralCode[],
  right: DiaLaboralCode[]
) {
  const leftSet = new Set(left.length > 0 ? left : DIA_LABORAL_CODES)
  const rightValues = right.length > 0 ? right : DIA_LABORAL_CODES

  return rightValues.some((dia) => leftSet.has(dia))
}

export function countWeeklyLaborDays(dias: DiaLaboralCode[]) {
  return dias.length > 0 ? dias.length : DIA_LABORAL_CODES.length
}

export function buildWeekBucket(value: string) {
  const date = new Date(`${value}T12:00:00Z`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const dayOfYear = Math.floor((date.getTime() - firstDay.getTime()) / 86400000) + 1
  const week = Math.ceil(dayOfYear / 7)

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
