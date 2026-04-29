import { describe, expect, it } from 'vitest'
import { isFallbackableAttendanceRpcError } from './attendanceSyncErrors'

describe('isFallbackableAttendanceRpcError', () => {
  it('detecta el mismatch de fecha_operacion date/text como error recuperable', () => {
    expect(
      isFallbackableAttendanceRpcError(
        'column "fecha_operacion" is of type date but expression is of type text'
      )
    ).toBe(true)
  })

  it('detecta la ausencia de la RPC como error recuperable', () => {
    expect(
      isFallbackableAttendanceRpcError(
        'Could not find the function public.rpc_registrar_asistencia_dc'
      )
    ).toBe(true)
  })

  it('detecta la asignacion operativa faltante como error recuperable', () => {
    expect(
      isFallbackableAttendanceRpcError(
        'No existe una asignacion publicada y vigente para este check-in.'
      )
    ).toBe(true)
  })

  it('detecta el operador date/text de la RPC como error recuperable', () => {
    expect(
      isFallbackableAttendanceRpcError('operator does not exist: date <= text')
    ).toBe(true)
  })

  it('ignora errores no relacionados con la persistencia de asistencia', () => {
    expect(isFallbackableAttendanceRpcError('La jornada ya esta cerrada.')).toBe(false)
  })
})
