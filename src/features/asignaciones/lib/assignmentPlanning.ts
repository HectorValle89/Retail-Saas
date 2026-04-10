export const DIA_LABORAL_CODES = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const

export type DiaLaboralCode = (typeof DIA_LABORAL_CODES)[number]

const DIA_SET = new Set<string>(DIA_LABORAL_CODES)
const DIA_INDEX = new Map<DiaLaboralCode, number>(DIA_LABORAL_CODES.map((item, index) => [item, index]))
const DIA_ALIAS_MAP: Record<string, DiaLaboralCode> = {
  L: 'LUN',
  LUN: 'LUN',
  LUNES: 'LUN',
  M: 'MAR',
  MAR: 'MAR',
  MART: 'MAR',
  MARTES: 'MAR',
  X: 'MIE',
  MIE: 'MIE',
  MIER: 'MIE',
  MIERCOLES: 'MIE',
  J: 'JUE',
  JUE: 'JUE',
  JUEV: 'JUE',
  JUEVES: 'JUE',
  V: 'VIE',
  VIE: 'VIE',
  VIER: 'VIE',
  VIERNES: 'VIE',
  S: 'SAB',
  SAB: 'SAB',
  SABA: 'SAB',
  SABADO: 'SAB',
  D: 'DOM',
  DOM: 'DOM',
  DOMI: 'DOM',
  DOMINGO: 'DOM',
}

function normalizeDiaToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeDiaLaboralCode(value: string | null | undefined): DiaLaboralCode | null {
  const normalized = normalizeDiaToken(value)
  const resolved = DIA_ALIAS_MAP[normalized]
  if (resolved) {
    return resolved
  }

  return DIA_SET.has(normalized) ? (normalized as DiaLaboralCode) : null
}

function expandDayRange(start: DiaLaboralCode, end: DiaLaboralCode) {
  const startIndex = DIA_INDEX.get(start) ?? 0
  const codes: DiaLaboralCode[] = []

  let currentIndex = startIndex
  for (let steps = 0; steps < DIA_LABORAL_CODES.length; steps += 1) {
    const code = DIA_LABORAL_CODES[currentIndex]
    codes.push(code)
    if (code === end) {
      break
    }
    currentIndex = (currentIndex + 1) % DIA_LABORAL_CODES.length
  }

  return codes
}

function parseDayGroup(group: string) {
  const normalizedGroup = normalizeDiaToken(group)
  if (!normalizedGroup) {
    return {
      dias: [] as DiaLaboralCode[],
      invalidTokens: [] as string[],
      duplicates: [] as string[],
    }
  }

  if (!normalizedGroup.includes('-')) {
    const code = normalizeDiaLaboralCode(normalizedGroup)
    return code
      ? { dias: [code], invalidTokens: [] as string[], duplicates: [] as string[] }
      : { dias: [] as DiaLaboralCode[], invalidTokens: [group], duplicates: [] as string[] }
  }

  const rawTokens = normalizedGroup.split('-').map((item) => item.trim()).filter(Boolean)
  const mappedTokens = rawTokens.map((token) => normalizeDiaLaboralCode(token))

  if (mappedTokens.some((item) => !item)) {
    const invalidTokens = rawTokens.filter((_, index) => !mappedTokens[index])
    return {
      dias: [] as DiaLaboralCode[],
      invalidTokens,
      duplicates: [] as string[],
    }
  }

  const codes = mappedTokens as DiaLaboralCode[]
  const useRange = codes.length === 2 && rawTokens.every((token) => token.length > 1)

  return {
    dias: useRange ? expandDayRange(codes[0], codes[1]) : codes,
    invalidTokens: [] as string[],
    duplicates: [] as string[],
  }
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

  const groups = raw
    .split(/[;,|/\n]+/)
    .flatMap((item) => item.trim().split(/\s+/))
    .map((item) => item.trim())
    .filter(Boolean)

  const dias: DiaLaboralCode[] = []
  const invalidTokens: string[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    const parsedGroup = parseDayGroup(group)
    invalidTokens.push(...parsedGroup.invalidTokens)

    for (const dia of parsedGroup.dias) {
      if (seen.has(dia)) {
        duplicates.push(dia)
        continue
      }

      seen.add(dia)
      dias.push(dia)
    }
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