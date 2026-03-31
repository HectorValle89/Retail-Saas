import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  countUnconfirmedAttendanceSales,
  hasAttendanceOverlap,
  hasCheckoutCoordinates,
  isCheckInBeforeCheckOut,
} from './asistenciaRules'

function buildIsoTime(baseDay: string, hour: number, minute: number) {
  return `${baseDay}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`
}

describe('attendance properties', () => {
  it('always requires check-in to happen before or at check-out', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (inHour, inMinute, outHour, outMinute) => {
          const checkIn = buildIsoTime('2026-03-16', inHour, inMinute)
          const checkOut = buildIsoTime('2026-03-16', outHour, outMinute)
          const expected = Date.parse(checkIn) <= Date.parse(checkOut)

          expect(isCheckInBeforeCheckOut(checkIn, checkOut)).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('detects attendance overlap symmetrically for the same employee and date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (aStartHour, aStartMinute, aEndHour, aEndMinute, bStartHour, bStartMinute, bEndHour, bEndMinute) => {
          const left = {
            employeeId: 'emp-1',
            date: '2026-03-16',
            checkInUtc: buildIsoTime('2026-03-16', aStartHour, aStartMinute),
            checkOutUtc: buildIsoTime('2026-03-16', aEndHour, aEndMinute),
          }
          const right = {
            employeeId: 'emp-1',
            date: '2026-03-16',
            checkInUtc: buildIsoTime('2026-03-16', bStartHour, bStartMinute),
            checkOutUtc: buildIsoTime('2026-03-16', bEndHour, bEndMinute),
          }

          fc.pre(isCheckInBeforeCheckOut(left.checkInUtc, left.checkOutUtc))
          fc.pre(isCheckInBeforeCheckOut(right.checkInUtc, right.checkOutUtc))

          expect(hasAttendanceOverlap(left, right)).toBe(hasAttendanceOverlap(right, left))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('requires both checkout coordinates to be finite numbers', () => {
    expect(hasCheckoutCoordinates(19.4326, -99.1332)).toBe(true)
    expect(hasCheckoutCoordinates(null, -99.1332)).toBe(false)
    expect(hasCheckoutCoordinates(19.4326, null)).toBe(false)
    expect(hasCheckoutCoordinates(Number.NaN, -99.1332)).toBe(false)
  })

  it('counts only unconfirmed sales linked to the attendance', () => {
    expect(
      countUnconfirmedAttendanceSales([
        { confirmada: true },
        { confirmada: false },
        { confirmada: null },
        { confirmada: true },
      ])
    ).toBe(2)
  })
})