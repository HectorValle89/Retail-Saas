import { describe, expect, it } from 'vitest'
import { getRutaSemanalResubmissionSuccessMessage, isRouteDuplicateError } from './routeSaveErrors'

describe('routeSaveErrors', () => {
  it('detecta errores de duplicado de Supabase y Postgres', () => {
    expect(
      isRouteDuplicateError(
        new Error(
          'duplicate key value violates unique constraint "ruta_semanal_visita_ruta_semanal_id_dia_semana_pdv_id_key"'
        )
      )
    ).toBe(true)
    expect(isRouteDuplicateError(new Error('already exists'))).toBe(true)
    expect(isRouteDuplicateError(new Error('permission denied'))).toBe(false)
  })

  it('usa un mensaje de reenvío neutro para la ruta semanal', () => {
    expect(getRutaSemanalResubmissionSuccessMessage()).toBe(
      'Ruta semanal reenviada a coordinacion para aprobacion.'
    )
  })
})
