import { describe, expect, it } from 'vitest'
import { selectAttendanceMission, type AttendanceMissionCatalogItem } from './attendanceMission'

const MISSIONS: AttendanceMissionCatalogItem[] = [
  {
    id: 'mission-a',
    codigo: 'A',
    instruccion: 'Validar anaquel principal.',
    orden: 1,
    peso: 10,
  },
  {
    id: 'mission-b',
    codigo: 'B',
    instruccion: 'Confirmar inventario visible.',
    orden: 2,
    peso: 10,
  },
]

describe('selectAttendanceMission', () => {
  it('returns null when catalog is empty', () => {
    expect(
      selectAttendanceMission({
        empleadoId: 'emp-1',
        pdvId: 'pdv-1',
        fechaOperacion: '2026-03-17',
        missions: [],
      })
    ).toEqual({
      mission: null,
      avoidedImmediateRepeat: false,
    })
  })

  it('returns the same mission for the same employee, pdv and date', () => {
    const first = selectAttendanceMission({
      empleadoId: 'emp-1',
      pdvId: 'pdv-1',
      fechaOperacion: '2026-03-17',
      missions: MISSIONS,
    })

    const second = selectAttendanceMission({
      empleadoId: 'emp-1',
      pdvId: 'pdv-1',
      fechaOperacion: '2026-03-17',
      missions: MISSIONS,
    })

    expect(first.mission?.id).toBeTruthy()
    expect(first).toEqual(second)
  })

  it('avoids repeating the previous mission when alternatives exist', () => {
    const initial = selectAttendanceMission({
      empleadoId: 'emp-2',
      pdvId: 'pdv-9',
      fechaOperacion: '2026-03-17',
      missions: MISSIONS,
    })

    const next = selectAttendanceMission({
      empleadoId: 'emp-2',
      pdvId: 'pdv-9',
      fechaOperacion: '2026-03-17',
      previousMissionId: initial.mission?.id,
      missions: MISSIONS,
    })

    expect(next.mission?.id).not.toBe(initial.mission?.id)
    expect(next.avoidedImmediateRepeat).toBe(true)
  })

  it('falls back to the only mission available', () => {
    const onlyMission = MISSIONS.slice(0, 1)

    expect(
      selectAttendanceMission({
        empleadoId: 'emp-3',
        pdvId: 'pdv-7',
        fechaOperacion: '2026-03-17',
        previousMissionId: 'mission-a',
        missions: onlyMission,
      })
    ).toEqual({
      mission: onlyMission[0],
      avoidedImmediateRepeat: false,
    })
  })
})
