import { describe, expect, it } from 'vitest'
import { selectReusableAttendanceDraftContext } from './attendanceDraftContext'

describe('selectReusableAttendanceDraftContext', () => {
  it('prefers the first open reusable context and skips closed historical records', () => {
    const context = selectReusableAttendanceDraftContext([
      {
        id: 'closed-1',
        asignacionId: 'asig-1',
        checkInUtc: '2026-04-17T08:00:00.000Z',
        checkOutUtc: '2026-04-17T17:00:00.000Z',
        estatus: 'CERRADA',
      },
      {
        id: 'reusable-1',
        asignacionId: 'asig-2',
        checkInUtc: '2026-04-17T08:00:00.000Z',
        checkOutUtc: null,
        estatus: 'VALIDA',
      },
      {
        id: 'rejected-1',
        asignacionId: 'asig-3',
        checkInUtc: '2026-04-17T08:00:00.000Z',
        checkOutUtc: null,
        estatus: 'RECHAZADA',
      },
    ] as unknown as Parameters<typeof selectReusableAttendanceDraftContext>[0])

    expect(context?.id).toBe('reusable-1')
  })

  it('returns null when no reusable context exists', () => {
    const context = selectReusableAttendanceDraftContext([
      {
        id: 'closed-1',
        asignacionId: 'asig-1',
        checkInUtc: '2026-04-17T08:00:00.000Z',
        checkOutUtc: '2026-04-17T17:00:00.000Z',
        estatus: 'CERRADA',
      },
      {
        id: 'open-without-assignment',
        asignacionId: null,
        checkInUtc: '2026-04-17T08:00:00.000Z',
        checkOutUtc: null,
        estatus: 'VALIDA',
      },
    ] as unknown as Parameters<typeof selectReusableAttendanceDraftContext>[0])

    expect(context).toBeNull()
  })
})
