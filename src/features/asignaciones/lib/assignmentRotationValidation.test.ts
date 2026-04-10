import { describe, expect, it } from 'vitest'
import type { AsignacionValidable } from './assignmentValidation'
import {
  evaluateRotationMasterImpact,
  type AssignmentRotationValidationData,
} from './assignmentRotationValidation'

function buildRotationData(): AssignmentRotationValidationData {
  return {
    rotationByPdvId: {
      'pdv-a': {
        pdvId: 'pdv-a',
        claveBtl: 'BTL-A',
        clasificacionMaestra: 'ROTATIVO',
        grupoRotacionCodigo: 'ROT-TEST-001',
        grupoTamano: 2,
        slotRotacion: 'A',
      },
      'pdv-b': {
        pdvId: 'pdv-b',
        claveBtl: 'BTL-B',
        clasificacionMaestra: 'ROTATIVO',
        grupoRotacionCodigo: 'ROT-TEST-001',
        grupoTamano: 2,
        slotRotacion: 'B',
      },
    },
    groupsByCode: {
      'ROT-TEST-001': [
        {
          pdvId: 'pdv-a',
          claveBtl: 'BTL-A',
          clasificacionMaestra: 'ROTATIVO',
          grupoRotacionCodigo: 'ROT-TEST-001',
          grupoTamano: 2,
          slotRotacion: 'A',
        },
        {
          pdvId: 'pdv-b',
          claveBtl: 'BTL-B',
          clasificacionMaestra: 'ROTATIVO',
          grupoRotacionCodigo: 'ROT-TEST-001',
          grupoTamano: 2,
          slotRotacion: 'B',
        },
      ],
    },
    assignmentsByPdv: {
      'pdv-a': [
        {
          id: 'asig-a',
          empleado_id: 'dc-1',
          pdv_id: 'pdv-a',
          supervisor_empleado_id: null,
          tipo: 'ROTATIVA',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-30',
          dias_laborales: 'LUN,MAR,MIE',
        },
      ],
      'pdv-b': [
        {
          id: 'asig-b',
          empleado_id: 'dc-1',
          pdv_id: 'pdv-b',
          supervisor_empleado_id: null,
          tipo: 'ROTATIVA',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-30',
          dias_laborales: 'JUE,VIE,SAB',
        },
      ],
    },
  }
}

describe('assignmentRotationValidation', () => {
  it('genera alerta cuando un movimiento deja el grupo sin cobertura en un PDV hermano', () => {
    const draft: AsignacionValidable = {
      id: 'asig-a',
      cuenta_cliente_id: 'cliente-1',
      empleado_id: 'dc-1',
      pdv_id: 'pdv-x',
      tipo: 'FIJA',
      fecha_inicio: '2026-04-01',
      fecha_fin: '2026-04-30',
      dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB',
      dia_descanso: 'DOM',
      horario_referencia: null,
    }

    const issues = evaluateRotationMasterImpact(draft, {
      rotationData: buildRotationData(),
      previousPdvId: 'pdv-a',
    })

    expect(issues.some((issue) => issue.code === 'ROTACION_MAESTRA_SIN_COBERTURA')).toBe(true)
  })

  it('genera alerta cuando un grupo queda partido entre distintas DCs', () => {
    const draft: AsignacionValidable = {
      id: 'asig-a',
      cuenta_cliente_id: 'cliente-1',
      empleado_id: 'dc-2',
      pdv_id: 'pdv-a',
      tipo: 'ROTATIVA',
      fecha_inicio: '2026-04-01',
      fecha_fin: '2026-04-30',
      dias_laborales: 'LUN,MAR,MIE',
      dia_descanso: 'DOM',
      horario_referencia: null,
    }

    const issues = evaluateRotationMasterImpact(draft, {
      rotationData: buildRotationData(),
    })

    expect(issues.some((issue) => issue.code === 'ROTACION_MAESTRA_PARTIDA')).toBe(true)
  })
})