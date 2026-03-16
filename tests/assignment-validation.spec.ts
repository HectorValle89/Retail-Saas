import { expect, test } from '@playwright/test'
import {
  evaluarReglasAsignacion,
  evaluarValidacionesAsignacion,
  obtenerReferenciaValidacion,
  requiereConfirmacionAlertas,
  resumirIssuesAsignacion,
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

  return [{ pdv_id: pdvId, activo: true, fecha_fin: null, empleado_id: 'sup-1' }]
}

test('evalua reglas bloqueantes y conserva etiquetas legadas de validacion', () => {
  const asignacion: AsignacionValidable = {
    cuenta_cliente_id: null,
    empleado_id: 'emp-1',
    pdv_id: 'pdv-1',
    tipo: 'FIJA',
    fecha_inicio: '2026-03-15',
    fecha_fin: '2026-03-14',
    dias_laborales: 'LUN,LUN,XXX',
    dia_descanso: 'LUN',
  }

  const context: AsignacionValidationContext = {
    employee: {
      id: 'emp-1',
      puesto: 'SUPERVISOR',
      estatus_laboral: 'BAJA',
      telefono: null,
      correo_electronico: null,
    },
    pdv: {
      id: 'pdv-1',
      estatus: 'INACTIVO',
      radio_tolerancia_metros: 20,
      cadena_codigo: 'SAN_PABLO',
      factor_cuota_default: 0,
    },
    pdvsConGeocerca: new Set<string>(),
    supervisoresPorPdv: {
      'pdv-1': [{ pdv_id: 'pdv-1', activo: false, fecha_fin: '2026-03-10' }],
    },
    comparableAssignments: [
      {
        id: 'asig-2',
        empleado_id: 'emp-1',
        pdv_id: 'pdv-2',
        supervisor_empleado_id: 'sup-2',
        tipo: 'FIJA',
        fecha_inicio: '2026-03-01',
        fecha_fin: '2026-03-15',
        dias_laborales: 'LUN,MAR',
      },
    ],
    historicalAssignmentsForPdv: [],
    horariosPorPdv: { 'pdv-1': 0 },
  }

  const issues = evaluarReglasAsignacion(asignacion, context)
  const blockingLabels = evaluarValidacionesAsignacion(asignacion, context)

  expect(blockingLabels).toEqual([
    'Sin cuenta cliente',
    'PDV inactivo',
    'DC dado de baja',
    'DC sin rol DC',
    'PDV sin geocerca',
    'PDV sin supervisor activo',
    'Dias laborales invalidos',
    'Descansos contradictorios',
    'Vigencia invalida',
    'Doble asignacion obligatoria',
    'Cuota invalida',
  ])
  expect(issues.some((issue) => issue.code === 'DC_SIN_CONTACTO')).toBe(true)
  expect(issues.some((issue) => issue.code === 'GEOCERCA_FUERA_DE_RANGO')).toBe(true)
  expect(issues.some((issue) => issue.code === 'PDV_SIN_HORARIOS_SAN_PABLO')).toBe(true)
  expect(issues.some((issue) => issue.code === 'PRIMERA_ASIGNACION_PDV')).toBe(true)
  expect(requiereConfirmacionAlertas(issues)).toBe(true)
})

test('separa errores, alertas y avisos sin bloquear guardado por issues no criticos', () => {
  const asignacion: AsignacionValidable = {
    id: 'asig-1',
    cuenta_cliente_id: 'cliente-1',
    empleado_id: 'emp-1',
    pdv_id: 'pdv-1',
    supervisor_empleado_id: 'sup-2',
    tipo: 'ROTATIVA',
    fecha_inicio: '2026-03-15',
    fecha_fin: '2026-03-15',
    dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB,DOM',
    dia_descanso: null,
    horario_referencia: null,
  }

  const issues = evaluarReglasAsignacion(asignacion, {
    employee: {
      id: 'emp-1',
      puesto: 'DERMOCONSEJERO',
      estatus_laboral: 'ACTIVO',
      telefono: null,
      correo_electronico: 'dc@example.com',
    },
    pdv: {
      id: 'pdv-1',
      estatus: 'ACTIVO',
      radio_tolerancia_metros: 320,
      cadena_codigo: 'SAN_PABLO',
      factor_cuota_default: 1,
    },
    pdvsConGeocerca: new Set<string>(['pdv-1']),
    supervisoresPorPdv: {
      'pdv-1': [{ pdv_id: 'pdv-1', activo: true, fecha_fin: null, empleado_id: 'sup-1' }],
    },
    comparableAssignments: [
      {
        id: 'asig-2',
        empleado_id: 'emp-1',
        pdv_id: 'pdv-2',
        supervisor_empleado_id: 'sup-1',
        tipo: 'ROTATIVA',
        fecha_inicio: '2026-03-16',
        fecha_fin: '2026-03-20',
        dias_laborales: 'LUN,MAR,MIE',
      },
      {
        id: 'asig-3',
        empleado_id: 'emp-1',
        pdv_id: 'pdv-3',
        supervisor_empleado_id: 'sup-1',
        tipo: 'ROTATIVA',
        fecha_inicio: '2026-03-17',
        fecha_fin: '2026-03-21',
        dias_laborales: 'JUE,VIE',
      },
      {
        id: 'asig-4',
        empleado_id: 'emp-1',
        pdv_id: 'pdv-4',
        supervisor_empleado_id: 'sup-1',
        tipo: 'ROTATIVA',
        fecha_inicio: '2026-03-18',
        fecha_fin: '2026-03-22',
        dias_laborales: 'SAB,DOM',
      },
    ],
    historicalAssignmentsForPdv: [
      {
        id: 'asig-0',
        empleado_id: 'emp-2',
        pdv_id: 'pdv-1',
        supervisor_empleado_id: 'sup-1',
        tipo: 'FIJA',
        fecha_inicio: '2026-02-01',
        fecha_fin: '2026-02-28',
        dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
      },
    ],
    horariosPorPdv: { 'pdv-1': 0 },
  })

  const resumen = resumirIssuesAsignacion(issues)

  expect(resumen.errores).toHaveLength(0)
  expect(resumen.alertas.map((item) => item.code)).toEqual([
    'DC_SIN_CONTACTO',
    'GEOCERCA_FUERA_DE_RANGO',
    'ROTATIVA_SOBRECARGADA',
    'SIN_DESCANSO_SEMANAL',
    'PDV_SIN_HORARIOS_SAN_PABLO',
  ])
  expect(resumen.avisos.map((item) => item.code)).toEqual(['CAMBIO_SUPERVISOR'])
  expect(requiereConfirmacionAlertas(issues)).toBe(true)
  expect(requiereConfirmacionAlertas(resumen.avisos)).toBe(false)
})

test('mantiene invariantes de validacion bloqueante en 250 escenarios pseudoaleatorios', () => {
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
        empleado_id: `emp-${index}`,
        pdv_id: pdvId,
        tipo: 'FIJA',
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dias_laborales: 'LUN,MAR,VIE',
        dia_descanso: 'DOM',
      },
      {
        employee: {
          id: `emp-${index}`,
          puesto: 'DERMOCONSEJERO',
          estatus_laboral: 'ACTIVO',
          telefono: '5555555555',
          correo_electronico: 'dc@example.com',
        },
        pdv: {
          id: pdvId,
          estatus: 'ACTIVO',
          radio_tolerancia_metros: 150,
          cadena_codigo: 'GENERICA',
          factor_cuota_default: 1,
        },
        pdvsConGeocerca: tieneGeocerca ? new Set<string>([pdvId]) : new Set<string>(),
        supervisoresPorPdv: {
          [pdvId]: buildSupervisores(pdvId, referencia, supervisorActivo),
        },
        comparableAssignments: [],
        historicalAssignmentsForPdv: [],
        horariosPorPdv: { [pdvId]: 1 },
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