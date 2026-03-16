import { expect, test } from '@playwright/test'
import {
  readApprovalFlowRule,
  readSchedulePriorityRule,
  readSupervisorInheritanceRule,
  resolveApprovalFlow,
  resolveScheduleHierarchy,
  resolveSupervisorInheritance,
} from '../src/features/reglas/lib/businessRules'

test('prioriza supervisor de PDV por defecto y respeta orden configurable', () => {
  const defaultRule = readSupervisorInheritanceRule(null)
  const defaultResolution = resolveSupervisorInheritance(
    [
      { source: 'PDV', supervisorEmpleadoId: 'sup-pdv', active: true },
      { source: 'EMPLEADO', supervisorEmpleadoId: 'sup-emp', active: true },
      { source: 'ASIGNACION', supervisorEmpleadoId: 'sup-asg', active: true },
    ],
    defaultRule
  )

  expect(defaultResolution).toMatchObject({
    supervisorEmpleadoId: 'sup-pdv',
    source: 'PDV',
  })

  const customResolution = resolveSupervisorInheritance(
    [
      { source: 'PDV', supervisorEmpleadoId: 'sup-pdv', active: true },
      { source: 'EMPLEADO', supervisorEmpleadoId: 'sup-emp', active: true },
      { source: 'ASIGNACION', supervisorEmpleadoId: 'sup-asg', active: true },
    ],
    {
      id: 'rule-1',
      code: 'RULE',
      description: 'Employee first',
      severity: 'ERROR',
      priority: 100,
      active: true,
      sources: ['EMPLEADO', 'PDV', 'ASIGNACION'],
    }
  )

  expect(customResolution).toMatchObject({
    supervisorEmpleadoId: 'sup-emp',
    source: 'EMPLEADO',
  })
})

test('resuelve horario por jerarquia y cae a fallback global si no hay PDV o cadena', () => {
  const scheduleRule = readSchedulePriorityRule({
    id: 'rule-schedule',
    codigo: 'JERARQUIA_HORARIO_PRIORIDADES',
    modulo: 'reglas',
    descripcion: 'Horario PDV > cadena > global',
    severidad: 'ALERTA',
    prioridad: 120,
    condicion: {
      levels: ['PDV_BASE', 'CADENA_BASE', 'GLOBAL'],
    },
    accion: {
      global_fallback: {
        label: 'Horario global agencia',
        hora_entrada: '11:00:00',
        hora_salida: '19:00:00',
      },
    },
    activa: true,
  })

  const chainResolution = resolveScheduleHierarchy(
    [
      {
        level: 'CADENA_BASE',
        label: 'Cadena',
        payload: { source: 'CADENA' },
        available: true,
      },
      {
        level: 'GLOBAL',
        label: 'Global',
        payload: { source: 'GLOBAL' },
        available: true,
      },
    ],
    scheduleRule
  )

  expect(chainResolution.candidate?.payload).toMatchObject({ source: 'CADENA' })

  const globalResolution = resolveScheduleHierarchy(
    [
      {
        level: 'GLOBAL',
        label: 'Global',
        payload: {
          source: 'GLOBAL',
          horaEntrada: scheduleRule.globalFallback?.horaEntrada,
          horaSalida: scheduleRule.globalFallback?.horaSalida,
        },
        available: true,
      },
    ],
    scheduleRule
  )

  expect(globalResolution.candidate?.payload).toMatchObject({
    source: 'GLOBAL',
    horaEntrada: '11:00:00',
    horaSalida: '19:00:00',
  })
})

test('resuelve flujos de aprobacion por tipo de solicitud con overrides', () => {
  const incapacidad = resolveApprovalFlow('INCAPACIDAD', [])
  expect(incapacidad.steps).toHaveLength(2)
  expect(incapacidad.steps[1]).toMatchObject({
    actor: 'NOMINA',
    targetStatus: 'REGISTRADA_RH',
  })

  const vacaciones = readApprovalFlowRule({
    id: 'rule-vacaciones',
    codigo: 'SOLICITUD_APROBACION_VACACIONES',
    modulo: 'solicitudes',
    descripcion: 'Vacaciones con confirmacion final administrativa',
    severidad: 'ERROR',
    prioridad: 300,
    condicion: {
      tipo_solicitud: 'VACACIONES',
      min_notice_days: 45,
    },
    accion: {
      steps: [
        { actor: 'SUPERVISOR', target_status: 'VALIDADA_SUP', sla_hours: 24 },
        { actor: 'ADMINISTRADOR', target_status: 'REGISTRADA', sla_hours: 24 },
      ],
    },
    activa: true,
  })

  expect(vacaciones.minNoticeDays).toBe(45)
  expect(vacaciones.steps[1]).toMatchObject({
    actor: 'ADMINISTRADOR',
    targetStatus: 'REGISTRADA',
  })
})