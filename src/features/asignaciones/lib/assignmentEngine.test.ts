import { describe, expect, it } from 'vitest'
import {
  buildAssignmentEngineAlerts,
  buildAssignmentTransitionPlan,
} from './assignmentEngine'

describe('assignmentEngine', () => {
  it('cierra asignacion activa y crea retorno automatico cuando un movimiento temporal debe volver a base', () => {
    const plan = buildAssignmentTransitionPlan(
      {
        id: 'draft-1',
        cuenta_cliente_id: 'c1',
        empleado_id: 'emp-1',
        pdv_id: 'pdv-b',
        supervisor_empleado_id: 'sup-1',
        tipo: 'COBERTURA',
        factor_tiempo: 1,
        dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
        dia_descanso: 'DOM',
        horario_referencia: 'TC',
        fecha_inicio: '2026-04-10',
        fecha_fin: '2026-04-15',
        naturaleza: 'COBERTURA_TEMPORAL',
        retorna_a_base: true,
        asignacion_base_id: null,
        asignacion_origen_id: null,
        prioridad: 200,
        motivo_movimiento: 'COBERTURA_TEMPORAL',
        observaciones: null,
      },
      [
        {
          id: 'base-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-a',
          supervisor_empleado_id: 'sup-1',
          tipo: 'FIJA',
          factor_tiempo: 1,
          dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
          dia_descanso: 'DOM',
          horario_referencia: 'TC',
          fecha_inicio: '2026-03-01',
          fecha_fin: null,
          naturaleza: 'BASE',
          retorna_a_base: false,
          asignacion_base_id: null,
          asignacion_origen_id: null,
          prioridad: 100,
          motivo_movimiento: null,
          observaciones: null,
          estado_publicacion: 'PUBLICADA',
        },
      ]
    )

    expect(plan.ignoredComparableIds).toEqual(['base-1'])
    expect(plan.updates).toEqual([
      {
        id: 'base-1',
        patch: {
          fecha_fin: '2026-04-09',
          observaciones: '[AUTO CIERRE 2026-04-10]',
        },
      },
    ])
    expect(plan.continuationInsert).toMatchObject({
      empleado_id: 'emp-1',
      pdv_id: 'pdv-a',
      fecha_inicio: '2026-04-16',
      fecha_fin: null,
      naturaleza: 'BASE',
      motivo_movimiento: 'RETORNO_AUTOMATICO_A_BASE',
      generado_automaticamente: true,
    })
  })

  it('genera alertas por temporales por vencer y huecos operativos', () => {
    const alerts = buildAssignmentEngineAlerts(
      [
        {
          id: 'mov-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'COBERTURA',
          factor_tiempo: 1,
          dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
          dia_descanso: 'DOM',
          horario_referencia: 'TC',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-03',
          naturaleza: 'COBERTURA_TEMPORAL',
          retorna_a_base: false,
          asignacion_base_id: null,
          asignacion_origen_id: null,
          prioridad: 200,
          motivo_movimiento: 'COBERTURA_TEMPORAL',
          observaciones: null,
          estado_publicacion: 'PUBLICADA',
        },
      ],
      '2026-04-01'
    )

    expect(alerts.map((item) => item.code)).toEqual([
      'TEMPORAL_POR_VENCER',
      'DC_SIN_PDV_PROXIMO',
      'PDV_QUEDARA_LIBRE',
    ])
  })
})
