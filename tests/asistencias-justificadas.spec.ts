import { expect, test } from '@playwright/test'
import { obtenerPanelAsistencias } from '../src/features/asistencias/services/asistenciaService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakeClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }

      const chain = {
        select(
          _columns?: string,
          options?: {
            count?: 'exact' | 'planned' | 'estimated'
            head?: boolean
          }
        ) {
          if (options?.head) {
            return Promise.resolve({
              data: null,
              error: entry.error,
              count: Array.isArray(entry.data) ? entry.data.length : 0,
            })
          }

          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        not() {
          return chain
        },
        gte() {
          return chain
        },
        lte() {
          return chain
        },
        or() {
          return chain
        },
        order() {
          return chain
        },
        range() {
          return Promise.resolve(entry)
        },
        limit() {
          return Promise.resolve(entry)
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve(entry).then(resolve)
        },
      }

      return chain
    },
  }
}

test('marca la asistencia como dia justificado cuando existe solicitud aprobada en el rango', async () => {
  const client = createFakeClient({
    asistencia: {
      data: [
        {
          id: 'asis-1',
          cuenta_cliente_id: 'c1',
          asignacion_id: 'asg-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          mision_dia_id: 'mision-1',
          fecha_operacion: '2026-03-17',
          empleado_nombre: 'Ana Uno',
          pdv_clave_btl: 'LIV-001',
          pdv_nombre: 'Liverpool Norte',
          pdv_zona: 'Norte',
          cadena_nombre: 'Liverpool',
          check_in_utc: null,
          check_out_utc: null,
          distancia_check_in_metros: null,
          estado_gps: 'PENDIENTE',
          justificacion_fuera_geocerca: null,
          mision_codigo: 'MISION-001',
          mision_instruccion: 'Activar visibilidad solar',
          biometria_estado: 'PENDIENTE',
          estatus: 'PENDIENTE_VALIDACION',
          cuenta_cliente: { nombre: 'ISDIN Mexico' },
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [
        {
          pdv_id: 'pdv-1',
          latitud: 19.4326,
          longitud: -99.1332,
          radio_tolerancia_metros: 100,
          permite_checkin_con_justificacion: true,
        },
      ],
      error: null,
    },
    solicitud: {
      data: [
        {
          id: 'sol-1',
          empleado_id: 'emp-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-03-16',
          fecha_fin: '2026-03-18',
          estatus: 'REGISTRADA_RH',
          metadata: {
            justifica_asistencia: true,
          },
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelAsistencias(client as never)

  expect(data.resumen).toMatchObject({
    total: 1,
    justificadas: 1,
  })
  expect(data.asistencias[0]).toMatchObject({
    empleado: 'Ana Uno',
    diaJustificado: true,
    solicitudRelacionadaTipo: 'INCAPACIDAD',
    solicitudRelacionadaEstatus: 'REGISTRADA_RH',
  })
})


test('marca el dia como justificado cuando existe formacion activa para el colaborador', async () => {
  const client = createFakeClient({
    asistencia: {
      data: [
        {
          id: 'asis-2',
          cuenta_cliente_id: 'c1',
          asignacion_id: 'asg-2',
          empleado_id: 'emp-2',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-2',
          mision_dia_id: 'mision-1',
          fecha_operacion: '2026-03-20',
          empleado_nombre: 'Beto Dos',
          pdv_clave_btl: 'LIV-002',
          pdv_nombre: 'Liverpool Sur',
          pdv_zona: 'Sur',
          cadena_nombre: 'Liverpool',
          check_in_utc: null,
          check_out_utc: null,
          distancia_check_in_metros: null,
          estado_gps: 'PENDIENTE',
          justificacion_fuera_geocerca: null,
          mision_codigo: 'MISION-001',
          mision_instruccion: 'Activar visibilidad solar',
          biometria_estado: 'PENDIENTE',
          estatus: 'PENDIENTE_VALIDACION',
          cuenta_cliente: { nombre: 'ISDIN Mexico' },
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [
        {
          pdv_id: 'pdv-2',
          latitud: 19.4326,
          longitud: -99.1332,
          radio_tolerancia_metros: 100,
          permite_checkin_con_justificacion: true,
        },
      ],
      error: null,
    },
    solicitud: { data: [], error: null },
    formacion_evento: {
      data: [
        {
          id: 'evento-1',
          nombre: 'Capacitacion marzo',
          tipo: 'PRODUCTO',
          fecha_inicio: '2026-03-20',
          fecha_fin: '2026-03-20',
          estado: 'PROGRAMADA',
          participantes: [],
          metadata: {
            targeting_mode: 'PDV_SCOPE',
            state_names: ['Ciudad de Mexico'],
            supervisor_ids: [],
            coordinator_ids: [],
            pdv_ids: ['pdv-2'],
          },
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelAsistencias(client as never)

  expect(data.resumen.justificadas).toBe(1)
  expect(data.asistencias[0]).toMatchObject({
    empleado: 'Beto Dos',
    diaJustificado: true,
    solicitudRelacionadaTipo: 'FORMACION',
    solicitudRelacionadaEstatus: 'PROGRAMADA',
  })
})
