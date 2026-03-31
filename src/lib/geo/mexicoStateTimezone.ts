import { normalizeMexicoCatalogText } from './mexicoCityState'

const MEXICO_STATE_TIMEZONE_MAP = new Map<string, string>([
  ['BAJA CALIFORNIA', 'America/Tijuana'],
  ['BAJA CALIFORNIA SUR', 'America/Mazatlan'],
  ['CHIHUAHUA', 'America/Mazatlan'],
  ['COAHUILA', 'America/Monterrey'],
  ['COAHUILA DE ZARAGOZA', 'America/Monterrey'],
  ['NAYARIT', 'America/Mazatlan'],
  ['NUEVO LEON', 'America/Monterrey'],
  ['QUINTANA ROO', 'America/Cancun'],
  ['SINALOA', 'America/Mazatlan'],
  ['SONORA', 'America/Hermosillo'],
  ['TAMAULIPAS', 'America/Monterrey'],
])

export const DEFAULT_MEXICO_OPERATION_TIMEZONE = 'America/Mexico_City'

export function resolveMexicoTimezoneFromState(stateName: string | null | undefined) {
  const normalized = normalizeMexicoCatalogText(stateName)
  if (!normalized) {
    return DEFAULT_MEXICO_OPERATION_TIMEZONE
  }

  return MEXICO_STATE_TIMEZONE_MAP.get(normalized) ?? DEFAULT_MEXICO_OPERATION_TIMEZONE
}

export function formatIsoDateInTimezone(
  value: string | Date,
  timeZone: string = DEFAULT_MEXICO_OPERATION_TIMEZONE
) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

export function formatTimeInTimezone(
  value: string | Date,
  timeZone: string = DEFAULT_MEXICO_OPERATION_TIMEZONE
) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

export function extractTimePartsInTimezone(
  value: string | Date,
  timeZone: string = DEFAULT_MEXICO_OPERATION_TIMEZONE
) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(typeof value === 'string' ? new Date(value) : value)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? Number.NaN)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? Number.NaN)
  const second = Number(parts.find((part) => part.type === 'second')?.value ?? Number.NaN)

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    return null
  }

  return { hour, minute, second }
}

export function isTimestampWithinOperationDate(
  value: string | Date,
  operationDate: string,
  timeZone: string = DEFAULT_MEXICO_OPERATION_TIMEZONE
) {
  return formatIsoDateInTimezone(value, timeZone) === operationDate
}
