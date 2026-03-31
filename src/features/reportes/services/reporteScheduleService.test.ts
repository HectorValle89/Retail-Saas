import { describe, expect, it } from 'vitest'
import { computeNextScheduledRun, getScheduledReportPeriod } from './reporteScheduleService'

describe('reporteScheduleService', () => {
  it('calcula la siguiente ejecucion semanal en UTC', () => {
    const next = computeNextScheduledRun({
      periodicidad: 'SEMANAL',
      diaSemana: 5,
      horaUtc: '08:30',
      now: new Date('2026-03-18T12:00:00.000Z'),
    })

    expect(next).toBe('2026-03-20T08:30:00.000Z')
  })

  it('salta a la siguiente semana si el slot semanal ya paso', () => {
    const next = computeNextScheduledRun({
      periodicidad: 'SEMANAL',
      diaSemana: 3,
      horaUtc: '08:30',
      now: new Date('2026-03-18T12:00:00.000Z'),
    })

    expect(next).toBe('2026-03-25T08:30:00.000Z')
  })

  it('calcula la siguiente ejecucion mensual en UTC', () => {
    const next = computeNextScheduledRun({
      periodicidad: 'MENSUAL',
      diaMes: 25,
      horaUtc: '09:00',
      now: new Date('2026-03-18T12:00:00.000Z'),
    })

    expect(next).toBe('2026-03-25T09:00:00.000Z')
  })

  it('mueve el mensual al siguiente mes cuando el dia ya paso', () => {
    const next = computeNextScheduledRun({
      periodicidad: 'MENSUAL',
      diaMes: 10,
      horaUtc: '09:00',
      now: new Date('2026-03-18T12:00:00.000Z'),
    })

    expect(next).toBe('2026-04-10T09:00:00.000Z')
  })

  it('deriva el periodo en formato YYYY-MM desde UTC', () => {
    expect(getScheduledReportPeriod(new Date('2026-03-31T23:59:59.000Z'))).toBe('2026-03')
  })
})
