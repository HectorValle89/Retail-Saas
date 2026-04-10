import { expect, test } from '@playwright/test'
import { obtenerPanelReglas } from '../src/features/reglas/services/reglaService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeReglasSupabase(result: QueryResult) {
  return {
    from() {
      let orderCalls = 0

      return {
        select() {
          return this
        },
        order() {
          orderCalls += 1

          if (orderCalls >= 2) {
            return Promise.resolve(result)
          }

          return this
        },
      }
    },
  }
}

test('consolida resumen, reglas operativas y flujos de aprobacion', async () => {
  const client = createFakeReglasSupabase({
    data: [
      {
        id: 'rule-sup',
        codigo: 'JERARQUIA_SUPERVISOR_PDV_EMPLEADO_ASIGNACION',
        modulo: 'reglas',
        descripcion: 'Supervisor PDV > empleado > asignacion',
        severidad: 'ERROR',
        prioridad: 110,
        condicion: { sources: ['PDV', 'EMPLEADO', 'ASIGNACION'] },
        accion: { persist_to_assignment: true },
        activa: true,
      },
      {
        id: 'rule-horario',
        codigo: 'JERARQUIA_HORARIO_PRIORIDADES',
        modulo: 'reglas',
        descripcion: 'Horario PDV > cadena > global',
        severidad: 'ALERTA',
        prioridad: 120,
        condicion: { levels: ['PDV_BASE', 'CADENA_BASE', 'GLOBAL'] },
        accion: {
          global_fallback: {
            label: 'Horario global agencia',
            hora_entrada: '11:00:00',
            hora_salida: '19:00:00',
          },
        },
        activa: true,
      },
      {
        id: 'rule-vac',
        codigo: 'SOLICITUD_APROBACION_VACACIONES',
        modulo: 'solicitudes',
        descripcion: 'Vacaciones con aprobacion directa de coordinacion',
        severidad: 'ERROR',
        prioridad: 210,
        condicion: { tipo_solicitud: 'VACACIONES', min_notice_days: 30 },
        accion: {
          steps: [
            { actor: 'COORDINADOR', target_status: 'REGISTRADA', sla_hours: 48 },
          ],
        },
        activa: true,
      },
      {
        id: 'rule-custom',
        codigo: 'ASIGNACION_PDV_SIN_GEOCERCA',
        modulo: 'asignaciones',
        descripcion: 'No publicar sin geocerca',
        severidad: 'ERROR',
        prioridad: 510,
        condicion: { requires_geofence: true },
        accion: { block_publish: true },
        activa: true,
      },
    ],
    error: null,
  })

  const data = await obtenerPanelReglas(client as never)

  expect(data.infraestructuraLista).toBe(true)
  expect(data.resumen).toMatchObject({
    total: 4,
    activas: 4,
    errores: 3,
    alertas: 1,
    approvalFlows: 5,
    operativas: 3,
  })
  expect(data.supervisorRule.sources).toEqual(['PDV', 'EMPLEADO', 'ASIGNACION'])
  expect(data.scheduleRule.globalFallback).toMatchObject({
    horaEntrada: '11:00:00',
    horaSalida: '19:00:00',
  })
  expect(data.approvalFlows.find((item) => item.solicitudTipo === 'VACACIONES')).toMatchObject({
    minNoticeDays: 30,
  })
  expect(data.inventory.find((item) => item.code === 'ASIGNACION_PDV_SIN_GEOCERCA')).toMatchObject({
    module: 'asignaciones',
    active: true,
  })
})

test('degrada a defaults cuando la tabla de reglas no esta disponible', async () => {
  const client = createFakeReglasSupabase({
    data: null,
    error: { message: 'relation public.regla_negocio does not exist' },
  })

  const data = await obtenerPanelReglas(client as never)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('relation public.regla_negocio does not exist')
  expect(data.supervisorRule.sources).toEqual(['PDV', 'EMPLEADO', 'ASIGNACION'])
  expect(data.scheduleRule.globalFallback).toMatchObject({
    horaEntrada: '11:00:00',
    horaSalida: '19:00:00',
  })
  expect(data.approvalFlows).toHaveLength(5)
})