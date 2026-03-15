import { expect, test } from '@playwright/test'
import {
  evaluarValidacionesAsignacion,
  obtenerReferenciaValidacion,
  type AsignacionValidable,
  type AsignacionValidationContext,
  type SupervisorAsignacionRow,
} from '../src/features/asignaciones/lib/assignmentValidation'

function createDeterministicRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1103515245 + 12345) >>> 0
    return state / 0xffffffff
  }
}

function buildSupervisores(
  pdvId: string,
  referencia: string,
  activo: boolean
): SupervisorAsignacionRow[] {
  if (!activo) {
    return [{ pdv_id: pdvId, activo: false, fecha_fin: referencia }]
  }

  return [{ pdv_id: pdvId, activo: true, fecha_fin: null }]
}

test('evalua reglas base de publicacion en escenarios controlados', () => {
  const asignacion: AsignacionValidable = {
    cuenta_cliente_id: null,
    pdv_id: 'pdv-1',
    fecha_inicio: '2026-03-15',
    fecha_fin: '2026-03-14',
  }

  const context: AsignacionValidationContext = {
    pdvsConGeocerca: new Set<string>(),
    supervisoresPorPdv: {
      'pdv-1': [{ pdv_id: 'pdv-1', activo: false, fecha_fin: '2026-03-10' }],
    },
  }

  const validaciones = evaluarValidacionesAsignacion(asignacion, context)

  expect(validaciones).toEqual([
    'Sin cuenta cliente',
    'PDV sin geocerca',
    'PDV sin supervisor activo',
    'Vigencia invalida',
  ])
})

test('mantiene invariantes de validacion en 250 escenarios pseudoaleatorios', () => {
  const random = createDeterministicRandom(14145500)
  const today = new Date().toISOString().slice(0, 10)

  for (let index = 0; index < 250; index += 1) {
    const pdvId = `pdv-${index}`
    const fechaInicio = random() > 0.5 ? today : '2026-12-31'
    const fechaFin =
      random() > 0.5
        ? null
        : random() > 0.5
          ? fechaInicio
          : '2026-01-01'
    const cuentaClienteId = random() > 0.35 ? `cliente-${index}` : null
    const tieneGeocerca = random() > 0.4
    const supervisorActivo = random() > 0.45
    const referencia = obtenerReferenciaValidacion(fechaInicio, today)

    const validaciones = evaluarValidacionesAsignacion(
      {
        cuenta_cliente_id: cuentaClienteId,
        pdv_id: pdvId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      },
      {
        pdvsConGeocerca: tieneGeocerca ? new Set<string>([pdvId]) : new Set<string>(),
        supervisoresPorPdv: {
          [pdvId]: buildSupervisores(pdvId, referencia, supervisorActivo),
        },
      }
    )

    expect(validaciones.includes('Sin cuenta cliente'), `iteracion ${index}`).toBe(!cuentaClienteId)
    expect(validaciones.includes('PDV sin geocerca'), `iteracion ${index}`).toBe(!tieneGeocerca)
    expect(validaciones.includes('PDV sin supervisor activo'), `iteracion ${index}`).toBe(
      !supervisorActivo
    )
    expect(validaciones.includes('Vigencia invalida'), `iteracion ${index}`).toBe(
      Boolean(fechaFin && fechaFin < fechaInicio)
    )
  }
})