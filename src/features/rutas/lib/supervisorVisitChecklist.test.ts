import { describe, expect, it } from 'vitest'
import { calculateSupervisorChecklistCompletion } from './supervisorVisitChecklist'

describe('calculateSupervisorChecklistCompletion', () => {
  it('excluye el checkbox de ausencia cuando la DC si esta en PDV', () => {
    const score = calculateSupervisorChecklistCompletion({
      registro_supervisor_pdv: true,
      acceso_gerente_solicitado: true,
      dc_no_se_encuentra_en_pdv: false,
    })

    expect(score.totalCount).toBe(11)
    expect(score.checkedCount).toBe(2)
    expect(score.excludedKeys).toContain('dc_no_se_encuentra_en_pdv')
  })

  it('excluye interacciones directas cuando la DC no se encuentra en su PDV', () => {
    const score = calculateSupervisorChecklistCompletion({
      registro_supervisor_pdv: true,
      acceso_gerente_solicitado: true,
      dc_no_se_encuentra_en_pdv: true,
      saludo_personalizado_dc: false,
      cierre_profesional: false,
    })

    expect(score.totalCount).toBe(5)
    expect(score.checkedCount).toBe(3)
    expect(score.excludedKeys).toEqual(
      expect.arrayContaining([
        'saludo_personalizado_dc',
        'horario_dc_registrado',
        'retroalimentacion_venta_entregada',
        'proceso_venta_verificado',
        'pronunciacion_reforzada',
        'feedback_dc_recibida',
        'cierre_profesional',
      ])
    )
  })
})
