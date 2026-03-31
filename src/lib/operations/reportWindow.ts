import {
  DEFAULT_MEXICO_OPERATION_TIMEZONE,
  extractTimePartsInTimezone,
  formatIsoDateInTimezone,
  formatTimeInTimezone,
  isTimestampWithinOperationDate,
  resolveMexicoTimezoneFromState,
} from '@/lib/geo/mexicoStateTimezone'

export type ReportWindowStatus =
  | 'SIN_CHECKIN'
  | 'JORNADA_ACTIVA'
  | 'PENDIENTE_REPORTE'
  | 'VENTANA_CERRADA'

interface ResolveReportWindowInput {
  operationDate: string
  pdvState: string | null | undefined
  checkInUtc: string | null
  checkOutUtc: string | null
  nowUtc?: string | Date
}

export interface ReportWindowResolution {
  status: ReportWindowStatus
  timezone: string
  stateName: string | null
  operationDate: string
  deadlineLabel: string
  deadlineLocalTime: string
  canReportToday: boolean
  hasValidCheckIn: boolean
  checkedOut: boolean
}

export interface ReportTimestampResolution {
  timezone: string
  stateName: string | null
  operationDate: string
  registrationDate: string
  registrationClock: string
  withinStandardWindow: boolean
  outOfWindow: boolean
}

export function resolveOperationalTimezone(stateName: string | null | undefined) {
  return resolveMexicoTimezoneFromState(stateName)
}

export function resolveReportWindow({
  operationDate,
  pdvState,
  checkInUtc,
  checkOutUtc,
  nowUtc = new Date(),
}: ResolveReportWindowInput): ReportWindowResolution {
  const timezone = resolveOperationalTimezone(pdvState)
  const stateName = pdvState?.trim() || null
  const deadlineLocalTime = '23:59:59'
  const hasValidCheckIn = Boolean(checkInUtc)
  const checkedOut = Boolean(checkOutUtc)
  const nowOperationDate = formatIsoDateInTimezone(nowUtc, timezone)
  const withinStandardWindow = nowOperationDate === operationDate

  let status: ReportWindowStatus

  if (!hasValidCheckIn) {
    status = 'SIN_CHECKIN'
  } else if (withinStandardWindow && !checkedOut) {
    status = 'JORNADA_ACTIVA'
  } else if (withinStandardWindow) {
    status = 'PENDIENTE_REPORTE'
  } else {
    status = 'VENTANA_CERRADA'
  }

  return {
    status,
    timezone,
    stateName,
    operationDate,
    deadlineLabel: `${operationDate} ${deadlineLocalTime}`,
    deadlineLocalTime,
    canReportToday: hasValidCheckIn && withinStandardWindow,
    hasValidCheckIn,
    checkedOut,
  }
}

export function resolveTimestampAgainstReportWindow({
  timestampUtc,
  operationDate,
  pdvState,
}: {
  timestampUtc: string | Date
  operationDate: string
  pdvState: string | null | undefined
}): ReportTimestampResolution {
  const timezone = resolveOperationalTimezone(pdvState)
  const stateName = pdvState?.trim() || null
  const registrationDate = formatIsoDateInTimezone(timestampUtc, timezone)
  const registrationClock = formatTimeInTimezone(timestampUtc, timezone)
  const withinStandardWindow = isTimestampWithinOperationDate(timestampUtc, operationDate, timezone)

  return {
    timezone,
    stateName,
    operationDate,
    registrationDate,
    registrationClock,
    withinStandardWindow,
    outOfWindow: !withinStandardWindow,
  }
}

export function buildReportWindowMetadata({
  timestampUtc,
  operationDate,
  pdvState,
  source,
}: {
  timestampUtc: string | Date
  operationDate: string
  pdvState: string | null | undefined
  source: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
}) {
  const timestamp = resolveTimestampAgainstReportWindow({
    timestampUtc,
    operationDate,
    pdvState,
  })
  const localTimeParts = extractTimePartsInTimezone(timestampUtc, timestamp.timezone)

  return {
    fecha_operativa: operationDate,
    fecha_registro: typeof timestampUtc === 'string' ? timestampUtc : timestampUtc.toISOString(),
    metodo_ingreso: source,
    fuera_de_ventana: timestamp.outOfWindow,
    ventana_timezone: timestamp.timezone,
    ventana_estado: timestamp.stateName,
    ventana_local_fecha_registro: timestamp.registrationDate,
    ventana_local_hora_registro: timestamp.registrationClock,
    ventana_local_minutos_registro:
      localTimeParts ? localTimeParts.hour * 60 + localTimeParts.minute : null,
    ventana_deadline_local: `${operationDate} 23:59:59`,
    gap_dias_retraso:
      timestamp.registrationDate === operationDate
        ? 0
        : Math.max(
            0,
            Math.round(
              (new Date(`${timestamp.registrationDate}T12:00:00Z`).getTime() -
                new Date(`${operationDate}T12:00:00Z`).getTime()) /
                (24 * 60 * 60 * 1000)
            )
          ),
  }
}

export function buildReportWindowHelperText(window: ReportWindowResolution) {
  if (!window.hasValidCheckIn) {
    return 'Primero necesitas un check-in valido del mismo dia para capturar ventas y LOVE ISDIN.'
  }

  if (window.status === 'JORNADA_ACTIVA') {
    return `Tu jornada fisica sigue activa. Puedes reportar hasta las ${window.deadlineLocalTime} (${window.timezone}).`
  }

  if (window.status === 'PENDIENTE_REPORTE') {
    return `Tu jornada fisica ya cerro, pero tu jornada digital sigue abierta hasta las ${window.deadlineLocalTime} (${window.timezone}).`
  }

  return `La ventana digital de reporte cerro a las ${window.deadlineLocalTime} (${window.timezone}).`
}
