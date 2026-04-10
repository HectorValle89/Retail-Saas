import type { Solicitud } from '@/types/database'

export const VACATION_ANNUAL_DAYS = 12
export const VACATION_SEMESTER_DAYS = 6
export const VACATION_MIN_NOTICE_DAYS = 30
export const VACATION_TEAM_WEEKLY_LIMIT = 2

export interface VacationRangeLike {
  empleadoId?: string | null
  fechaInicio: string
  fechaFin: string
  estatus?: Solicitud['estatus'] | string | null
}

export interface VacationBucketSnapshot {
  key: string
  label: 'PRIMER_SEMESTRE' | 'SEGUNDO_SEMESTRE'
  availableFrom: string
  availableUntil: string
  totalDays: number
  usedDays: number
  availableDays: number
  unlocked: boolean
}

export interface VacationPolicySnapshot {
  ingresoOficial: string | null
  eligible: boolean
  annualDays: number
  annualUsedDays: number
  annualAvailableDays: number
  currentSemester: 'PRIMER_SEMESTRE' | 'SEGUNDO_SEMESTRE' | null
  currentSemesterLabel: string | null
  nextUnlockDate: string | null
  anniversaryStart: string | null
  anniversaryEnd: string | null
  firstSemester: VacationBucketSnapshot | null
  secondSemester: VacationBucketSnapshot | null
}

export interface VacationRequestValidationResult {
  snapshot: VacationPolicySnapshot
  requestedDays: number
  requestedByBucket: Record<string, number>
  affectedWeeks: string[]
}

type VacationBucketAssignment = {
  key: string
  label: 'PRIMER_SEMESTRE' | 'SEGUNDO_SEMESTRE'
  cycleStart: string
  cycleEnd: string
  availableFrom: string
  availableUntil: string
}

function parseIsoDate(value: string) {
  const [yearRaw, monthRaw, dayRaw] = value.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const day = Number(dayRaw)
  return new Date(Date.UTC(year, monthIndex, day))
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addUtcMonths(value: Date, months: number) {
  const next = new Date(value)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function addUtcYears(value: Date, years: number) {
  const next = new Date(value)
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}

function diffCalendarDays(start: string, end: string) {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)
}

export function listIsoDatesInRange(fechaInicio: string, fechaFin: string) {
  const startDate = parseIsoDate(fechaInicio)
  const endDate = parseIsoDate(fechaFin)
  const dates: string[] = []

  for (let cursor = startDate; cursor <= endDate; cursor = addUtcDays(cursor, 1)) {
    dates.push(formatIsoDate(cursor))
  }

  return dates
}

function buildCycleBoundaries(ingresoOficial: string, referenceDate: string) {
  const ingreso = parseIsoDate(ingresoOficial)
  const target = parseIsoDate(referenceDate)

  if (target < addUtcYears(ingreso, 1)) {
    return null
  }

  let cycleStart = addUtcYears(ingreso, 1)
  let cycleEnd = addUtcYears(cycleStart, 1)

  while (target >= cycleEnd) {
    cycleStart = cycleEnd
    cycleEnd = addUtcYears(cycleEnd, 1)
  }

  return {
    cycleStart: formatIsoDate(cycleStart),
    cycleEnd: formatIsoDate(addUtcDays(cycleEnd, -1)),
    secondSemesterStart: formatIsoDate(addUtcMonths(cycleStart, 6)),
  }
}

function resolveVacationBucketForDate(ingresoOficial: string, targetDate: string): VacationBucketAssignment | null {
  const boundaries = buildCycleBoundaries(ingresoOficial, targetDate)

  if (!boundaries) {
    return null
  }

  if (targetDate < boundaries.secondSemesterStart) {
    return {
      key: `${boundaries.cycleStart}:PRIMER_SEMESTRE`,
      label: 'PRIMER_SEMESTRE',
      cycleStart: boundaries.cycleStart,
      cycleEnd: boundaries.cycleEnd,
      availableFrom: boundaries.cycleStart,
      availableUntil: formatIsoDate(addUtcDays(parseIsoDate(boundaries.secondSemesterStart), -1)),
    }
  }

  return {
    key: `${boundaries.cycleStart}:SEGUNDO_SEMESTRE`,
    label: 'SEGUNDO_SEMESTRE',
    cycleStart: boundaries.cycleStart,
    cycleEnd: boundaries.cycleEnd,
    availableFrom: boundaries.secondSemesterStart,
    availableUntil: boundaries.cycleEnd,
  }
}

function createUsageMap(ingresoOficial: string, approvedRanges: VacationRangeLike[]) {
  const usageMap = new Map<string, Set<string>>()

  approvedRanges.forEach((range) => {
    listIsoDatesInRange(range.fechaInicio, range.fechaFin).forEach((date) => {
      const bucket = resolveVacationBucketForDate(ingresoOficial, date)

      if (!bucket) {
        return
      }

      const current = usageMap.get(bucket.key) ?? new Set<string>()
      current.add(date)
      usageMap.set(bucket.key, current)
    })
  })

  return usageMap
}

function buildBucketSnapshot(
  bucket: VacationBucketAssignment,
  usageMap: Map<string, Set<string>>,
  todayIso: string
): VacationBucketSnapshot {
  const usedDays = usageMap.get(bucket.key)?.size ?? 0
  const availableDays = Math.max(0, VACATION_SEMESTER_DAYS - usedDays)
  const unlocked = todayIso >= bucket.availableFrom

  return {
    key: bucket.key,
    label: bucket.label,
    availableFrom: bucket.availableFrom,
    availableUntil: bucket.availableUntil,
    totalDays: VACATION_SEMESTER_DAYS,
    usedDays,
    availableDays,
    unlocked,
  }
}

export function buildVacationPolicySnapshot(input: {
  ingresoOficial: string | null
  todayIso: string
  approvedRanges: VacationRangeLike[]
}): VacationPolicySnapshot {
  if (!input.ingresoOficial) {
    return {
      ingresoOficial: null,
      eligible: false,
      annualDays: VACATION_ANNUAL_DAYS,
      annualUsedDays: 0,
      annualAvailableDays: 0,
      currentSemester: null,
      currentSemesterLabel: null,
      nextUnlockDate: null,
      anniversaryStart: null,
      anniversaryEnd: null,
      firstSemester: null,
      secondSemester: null,
    }
  }

  const todayBucket = resolveVacationBucketForDate(input.ingresoOficial, input.todayIso)

  if (!todayBucket) {
    const firstAnniversary = formatIsoDate(addUtcYears(parseIsoDate(input.ingresoOficial), 1))
    return {
      ingresoOficial: input.ingresoOficial,
      eligible: false,
      annualDays: VACATION_ANNUAL_DAYS,
      annualUsedDays: 0,
      annualAvailableDays: 0,
      currentSemester: null,
      currentSemesterLabel: null,
      nextUnlockDate: firstAnniversary,
      anniversaryStart: null,
      anniversaryEnd: null,
      firstSemester: null,
      secondSemester: null,
    }
  }

  const usageMap = createUsageMap(input.ingresoOficial, input.approvedRanges)
  const firstSemesterBucket: VacationBucketAssignment = {
    key: `${todayBucket.cycleStart}:PRIMER_SEMESTRE`,
    label: 'PRIMER_SEMESTRE',
    cycleStart: todayBucket.cycleStart,
    cycleEnd: todayBucket.cycleEnd,
    availableFrom: todayBucket.cycleStart,
    availableUntil: formatIsoDate(addUtcDays(parseIsoDate(addUtcMonths(parseIsoDate(todayBucket.cycleStart), 6).toISOString().slice(0, 10)), -1)),
  }
  const secondSemesterStart = formatIsoDate(addUtcMonths(parseIsoDate(todayBucket.cycleStart), 6))
  const secondSemesterBucket: VacationBucketAssignment = {
    key: `${todayBucket.cycleStart}:SEGUNDO_SEMESTRE`,
    label: 'SEGUNDO_SEMESTRE',
    cycleStart: todayBucket.cycleStart,
    cycleEnd: todayBucket.cycleEnd,
    availableFrom: secondSemesterStart,
    availableUntil: todayBucket.cycleEnd,
  }

  const firstSemester = buildBucketSnapshot(firstSemesterBucket, usageMap, input.todayIso)
  const secondSemester = buildBucketSnapshot(secondSemesterBucket, usageMap, input.todayIso)
  const annualUsedDays = firstSemester.usedDays + secondSemester.usedDays
  const annualAvailableDays = firstSemester.availableDays + secondSemester.availableDays

  return {
    ingresoOficial: input.ingresoOficial,
    eligible: true,
    annualDays: VACATION_ANNUAL_DAYS,
    annualUsedDays,
    annualAvailableDays,
    currentSemester: todayBucket.label,
    currentSemesterLabel:
      todayBucket.label === 'PRIMER_SEMESTRE' ? 'Semestre actual' : 'Semestre habilitado',
    nextUnlockDate: todayBucket.label === 'PRIMER_SEMESTRE' ? secondSemester.availableFrom : null,
    anniversaryStart: todayBucket.cycleStart,
    anniversaryEnd: todayBucket.cycleEnd,
    firstSemester,
    secondSemester,
  }
}

function ensureAllRequestedDatesUnlocked(
  ingresoOficial: string,
  todayIso: string,
  requestedDates: string[]
) {
  const todayBucket = resolveVacationBucketForDate(ingresoOficial, todayIso)

  if (!todayBucket) {
    throw new Error('Todavia no cumples el año requerido para solicitar vacaciones.')
  }

  requestedDates.forEach((date) => {
    const requestedBucket = resolveVacationBucketForDate(ingresoOficial, date)

    if (!requestedBucket) {
      throw new Error('Todavia no cumples el año requerido para solicitar vacaciones.')
    }

    if (requestedBucket.cycleStart !== todayBucket.cycleStart) {
      throw new Error('Solo puedes solicitar vacaciones dentro del ciclo anual actualmente habilitado.')
    }

    if (todayBucket.label === 'PRIMER_SEMESTRE' && requestedBucket.label === 'SEGUNDO_SEMESTRE') {
      throw new Error(
        `Los días del segundo semestre se habilitan hasta ${requestedBucket.availableFrom}.`
      )
    }
  })
}

function buildRequestedDaysByBucket(ingresoOficial: string, requestedDates: string[]) {
  return requestedDates.reduce<Record<string, number>>((acc, date) => {
    const bucket = resolveVacationBucketForDate(ingresoOficial, date)

    if (!bucket) {
      return acc
    }

    acc[bucket.key] = (acc[bucket.key] ?? 0) + 1
    return acc
  }, {})
}

export function getWeekStartIso(date: string) {
  const value = parseIsoDate(date)
  const day = value.getUTCDay()
  const delta = day === 0 ? -6 : 1 - day
  return formatIsoDate(addUtcDays(value, delta))
}

export function listWeekStartsInRange(fechaInicio: string, fechaFin: string) {
  const weeks = new Set<string>()
  listIsoDatesInRange(fechaInicio, fechaFin).forEach((date) => weeks.add(getWeekStartIso(date)))
  return Array.from(weeks).sort()
}

function overlapsWeek(range: VacationRangeLike, weekStart: string) {
  const weekEnd = formatIsoDate(addUtcDays(parseIsoDate(weekStart), 6))
  return range.fechaInicio <= weekEnd && range.fechaFin >= weekStart
}

export function buildVacationTeamWeeklyLoad(
  teamRanges: VacationRangeLike[],
  fromDate: string,
  weeks: number
) {
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = formatIsoDate(addUtcDays(parseIsoDate(getWeekStartIso(fromDate)), index * 7))
    const weekEnd = formatIsoDate(addUtcDays(parseIsoDate(weekStart), 6))
    const employeeIds = new Set<string>()

    teamRanges.forEach((range) => {
      if (range.empleadoId && overlapsWeek(range, weekStart)) {
        employeeIds.add(range.empleadoId)
      }
    })

    return {
      weekStart,
      weekEnd,
      absentCount: employeeIds.size,
      limit: VACATION_TEAM_WEEKLY_LIMIT,
      blocked: employeeIds.size >= VACATION_TEAM_WEEKLY_LIMIT,
    }
  })
}

export function validateVacationRequestPolicy(input: {
  ingresoOficial: string | null
  todayIso: string
  fechaInicio: string
  fechaFin: string
  approvedEmployeeRanges: VacationRangeLike[]
  approvedTeamRanges: VacationRangeLike[]
  currentEmployeeId: string
}) : VacationRequestValidationResult {
  if (!input.ingresoOficial) {
    throw new Error('No existe una fecha oficial de ingreso para calcular vacaciones.')
  }

  if (input.fechaFin < input.fechaInicio) {
    throw new Error('La fecha final no puede ser menor a la fecha inicial.')
  }

  if (diffCalendarDays(input.todayIso, input.fechaInicio) < VACATION_MIN_NOTICE_DAYS) {
    throw new Error('Antelación insuficiente. Debes solicitar vacaciones con al menos 30 días naturales.')
  }

  const requestedDates = listIsoDatesInRange(input.fechaInicio, input.fechaFin)
  ensureAllRequestedDatesUnlocked(input.ingresoOficial, input.todayIso, requestedDates)

  const snapshot = buildVacationPolicySnapshot({
    ingresoOficial: input.ingresoOficial,
    todayIso: input.todayIso,
    approvedRanges: input.approvedEmployeeRanges,
  })
  const requestedByBucket = buildRequestedDaysByBucket(input.ingresoOficial, requestedDates)
  const currentBuckets = [snapshot.firstSemester, snapshot.secondSemester].filter(
    (item): item is VacationBucketSnapshot => Boolean(item)
  )

  currentBuckets.forEach((bucket) => {
    const requestedDays = requestedByBucket[bucket.key] ?? 0

    if (requestedDays > 0 && requestedDays > bucket.availableDays) {
      throw new Error(`Solo puedes solicitar hasta ${bucket.availableDays} días en este periodo.`)
    }
  })

  listWeekStartsInRange(input.fechaInicio, input.fechaFin).forEach((weekStart) => {
    const absentEmployees = new Set<string>()
    input.approvedTeamRanges.forEach((range) => {
      if (range.empleadoId === input.currentEmployeeId) {
        return
      }

      if (range.empleadoId && overlapsWeek(range, weekStart)) {
        absentEmployees.add(range.empleadoId)
      }
    })

    if (absentEmployees.size >= VACATION_TEAM_WEEKLY_LIMIT) {
      throw new Error(
        'Cupo de ausencias completo para esta semana en tu equipo. Intenta con otra fecha.'
      )
    }
  })

  return {
    snapshot,
    requestedDays: requestedDates.length,
    requestedByBucket,
    affectedWeeks: listWeekStartsInRange(input.fechaInicio, input.fechaFin),
  }
}
