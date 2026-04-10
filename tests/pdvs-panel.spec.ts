import { expect, test } from '@playwright/test'
import { obtenerPanelPdvs } from '../src/features/pdvs/services/pdvService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakePdvsSupabase(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      let currentKey = table

      return {
        select() {
          return this
        },
        eq(column: string, value: string | boolean) {
          if (table === 'configuracion') {
            if (value === 'geocerca.radio_default_metros') {
              currentKey = 'configuracion:radio-default'
            } else if (value === 'geocerca.fuera_permitida_con_justificacion') {
              currentKey = 'configuracion:justificacion-default'
            } else if (value === 'asistencias.san_pablo.catalogo_turnos') {
              currentKey = 'configuracion'
            }

            return this
          }

          const result = results[currentKey]
          if (!result || !Array.isArray(result.data)) {
            return this
          }

          currentKey = `${table}:eq:${column}:${String(value)}`
          results[currentKey] = {
            data: result.data.filter((row) => {
              if (!row || typeof row !== 'object') {
                return false
              }

              const candidate = row as Record<string, unknown>
              return String(candidate[column] ?? '') === String(value)
            }),
            error: result.error,
          }

          return this
        },
        in(column: string, values: string[]) {
          const result = results[currentKey]
          if (!result || !Array.isArray(result.data)) {
            return this
          }

          currentKey = `${table}:filtered:${column}:${values.join(',')}`
          results[currentKey] = {
            data: result.data.filter((row) => {
              if (!row || typeof row !== 'object') {
                return false
              }

              const candidate = row as Record<string, unknown>
              return values.includes(String(candidate[column] ?? ''))
            }),
            error: result.error,
          }

          return this
        },
        order() {
          return Promise.resolve(results[currentKey])
        },
        limit() {
          return Promise.resolve(results[currentKey])
        },
        maybeSingle() {
          return Promise.resolve(results[currentKey])
        },
      }
    },
  }
}

test('consolida PDVs, horarios y supervisor vigente', async () => {
  const client = createFakePdvsSupabase({
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'SP001',
          cadena_id: 'cadena-1',
          ciudad_id: 'ciudad-1',
          id_cadena: '1001',
          nombre: 'SAN PABLO DEL VALLE',
          direccion: 'Av. Uno 100',
          zona: 'NORTE',
          formato: '400',
          horario_entrada: '09:00:00',
          horario_salida: '18:00:00',
          estatus: 'ACTIVO',
          metadata: {
            horario_mode: 'CADENA',
            horario_chain_nomenclatura: 'SP-9-18',
            horario_chain_turno: 'Base semanal',
          },
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-15T00:00:00.000Z',
          cadena: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true }],
          ciudad: [{ id: 'ciudad-1', nombre: 'MONTERREY', zona: 'NORTE', activa: true }],
          geocerca_pdv: [
            {
              id: 'geo-1',
              latitud: 25.6701,
              longitud: -100.3096,
              radio_tolerancia_metros: 150,
              permite_checkin_con_justificacion: true,
            },
          ],
          supervisor_pdv: [
            {
              id: 'sup-1',
              activo: true,
              fecha_inicio: '2026-03-01',
              fecha_fin: null,
              empleado: [{ id: 'emp-1', nombre_completo: 'Ana Supervisor', zona: 'NORTE', estatus_laboral: 'ACTIVO' }],
            },
          ],
          horario_pdv: [],
        },
        {
          id: 'pdv-2',
          clave_btl: 'SP002',
          cadena_id: 'cadena-1',
          ciudad_id: 'ciudad-2',
          id_cadena: '1002',
          nombre: 'SAN PABLO CENTRO',
          direccion: 'Av. Dos 200',
          zona: 'CENTRO',
          formato: '270',
          horario_entrada: '10:00:00',
          horario_salida: '19:00:00',
          estatus: 'INACTIVO',
          metadata: { horario_mode: 'PERSONALIZADO' },
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-15T00:00:00.000Z',
          cadena: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true }],
          ciudad: [{ id: 'ciudad-2', nombre: 'CDMX', zona: 'CENTRO', activa: true }],
          geocerca_pdv: [],
          supervisor_pdv: [],
          horario_pdv: [
            {
              id: 'hor-1',
              nivel_prioridad: 1,
              fecha_especifica: null,
              dia_semana: 1,
              codigo_turno: 'CUSTOM-AM',
              hora_entrada: '10:00:00',
              hora_salida: '19:00:00',
              activo: true,
              observaciones: 'Horario retail extendido',
            },
          ],
        },
        {
          id: 'pdv-3',
          clave_btl: 'SP003',
          cadena_id: 'cadena-1',
          ciudad_id: 'ciudad-2',
          id_cadena: '1003',
          nombre: 'SAN PABLO GLOBAL',
          direccion: 'Av. Tres 300',
          zona: 'CENTRO',
          formato: '120',
          horario_entrada: null,
          horario_salida: null,
          estatus: 'ACTIVO',
          metadata: {},
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-15T00:00:00.000Z',
          cadena: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true }],
          ciudad: [{ id: 'ciudad-2', nombre: 'CDMX', zona: 'CENTRO', activa: true }],
          geocerca_pdv: [],
          supervisor_pdv: [],
          horario_pdv: [],
        },
      ],
      error: null,
    },
    cadena: {
      data: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true }],
      error: null,
    },
    ciudad: {
      data: [
        { id: 'ciudad-1', nombre: 'MONTERREY', zona: 'NORTE', activa: true },
        { id: 'ciudad-2', nombre: 'CDMX', zona: 'CENTRO', activa: true },
      ],
      error: null,
    },
    empleado: {
      data: [{ id: 'emp-1', nombre_completo: 'Ana Supervisor', zona: 'NORTE', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' }],
      error: null,
    },
    configuracion: {
      data: {
        valor: {
          turnos: [
            {
              nomenclatura: 'SP-9-18',
              turno: 'Base semanal',
              horario: '09:00 a 18:00',
              hora_entrada: '09:00:00',
              hora_salida: '18:00:00',
              tipo: 'RANGO_HORARIO',
            },
          ],
        },
      },
      error: null,
    },
    'configuracion:radio-default': { data: { valor: 150 }, error: null },
    'configuracion:justificacion-default': { data: { valor: false }, error: null },
    regla_negocio: {
      data: {
        id: 'rule-horario',
        codigo: 'JERARQUIA_HORARIO_PRIORIDADES',
        modulo: 'reglas',
        descripcion: 'Horario PDV > cadena > global',
        severidad: 'ALERTA',
        prioridad: 120,
        condicion: { levels: ['PDV_FECHA', 'PDV_BASE', 'CADENA_BASE', 'GLOBAL'] },
        accion: {
          global_fallback: {
            label: 'Horario global agencia',
            hora_entrada: '11:00:00',
            hora_salida: '19:00:00',
          },
        },
        activa: true,
      },
      error: null,
    },
  })

  const data = await obtenerPanelPdvs(client as never)

  expect(data.infraestructuraLista).toBe(true)
  expect(data.resumen).toMatchObject({
    total: 3,
    activos: 2,
    conGeocerca: 1,
    conSupervisor: 1,
    conHorario: 3,
  })
  expect(data.turnosCadena[0]).toMatchObject({
    nomenclatura: 'SP-9-18',
    turno: 'Base semanal',
  })
  expect(data.geocercaDefaultMetros).toBe(150)
  expect(data.permiteCheckinConJustificacionDefault).toBe(false)
  expect(data.pdvs[0]).toMatchObject({
    id: 'pdv-1',
    cadena: 'SAN PABLO',
    ciudad: 'MONTERREY',
    estado: 'NUEVO LEON',
    horarioMode: 'CADENA',
    supervisorActual: 'Ana Supervisor',
    geocercaCompleta: true,
  })
  expect(data.pdvs[0].horarios[0]).toMatchObject({
    source: 'CADENA',
    code: 'SP-9-18',
    horaEntrada: '09:00:00',
    horaSalida: '18:00:00',
  })
  expect(data.pdvs[1]).toMatchObject({
    id: 'pdv-2',
    horarioMode: 'PERSONALIZADO',
    geocercaCompleta: false,
    estatus: 'INACTIVO',
  })
  expect(data.pdvs[2].horarioMode).toBe('GLOBAL')
  expect(data.pdvs[2].horarios[0]).toMatchObject({
    source: 'GLOBAL',
    horaEntrada: '11:00:00',
    horaSalida: '19:00:00',
  })
  expect(data.estados).toEqual(['CIUDAD DE MEXICO', 'NUEVO LEON'])
})

test('filtra PDVs por supervisor vigente y recalcula opciones dependientes', async () => {
  const client = createFakePdvsSupabase({
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'SP001',
          cadena_id: 'cadena-1',
          ciudad_id: 'ciudad-1',
          id_cadena: '1001',
          nombre: 'SAN PABLO DEL VALLE',
          direccion: 'Av. Uno 100',
          zona: 'NORTE',
          formato: '400',
          horario_entrada: '09:00:00',
          horario_salida: '18:00:00',
          estatus: 'ACTIVO',
          metadata: { horario_mode: 'CADENA', horario_chain_nomenclatura: 'SP-9-18' },
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-15T00:00:00.000Z',
          cadena: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true }],
          ciudad: [{ id: 'ciudad-1', nombre: 'MONTERREY', zona: 'NORTE', activa: true }],
          geocerca_pdv: [
            {
              id: 'geo-1',
              latitud: 25.6701,
              longitud: -100.3096,
              radio_tolerancia_metros: 150,
              permite_checkin_con_justificacion: true,
            },
          ],
          supervisor_pdv: [
            {
              id: 'sup-1',
              activo: true,
              fecha_inicio: '2026-03-01',
              fecha_fin: null,
              empleado: [{ id: 'legacy-id', nombre_completo: 'Adriana Yulisma', zona: 'NORTE', estatus_laboral: 'ACTIVO' }],
            },
          ],
          horario_pdv: [],
        },
        {
          id: 'pdv-2',
          clave_btl: 'SP002',
          cadena_id: 'cadena-2',
          ciudad_id: 'ciudad-2',
          id_cadena: '2002',
          nombre: 'LIVERPOOL SUR',
          direccion: 'Av. Dos 200',
          zona: 'CENTRO',
          formato: '270',
          horario_entrada: '10:00:00',
          horario_salida: '19:00:00',
          estatus: 'ACTIVO',
          metadata: {},
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-15T00:00:00.000Z',
          cadena: [{ id: 'cadena-2', codigo: 'LIV', nombre: 'LIVERPOOL', activa: true }],
          ciudad: [{ id: 'ciudad-2', nombre: 'CDMX', zona: 'CENTRO', activa: true }],
          geocerca_pdv: [],
          supervisor_pdv: [],
          horario_pdv: [],
        },
      ],
      error: null,
    },
    cadena: {
      data: [
        { id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO', activa: true },
        { id: 'cadena-2', codigo: 'LIV', nombre: 'LIVERPOOL', activa: true },
      ],
      error: null,
    },
    ciudad: {
      data: [
        { id: 'ciudad-1', nombre: 'MONTERREY', zona: 'NORTE', activa: true },
        { id: 'ciudad-2', nombre: 'CDMX', zona: 'CENTRO', activa: true },
      ],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Adriana Yulisma', zona: 'NORTE', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' },
        { id: 'emp-2', nombre_completo: 'Otra Supervisora', zona: 'CENTRO', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' },
      ],
      error: null,
    },
    configuracion: {
      data: {
        valor: {
          turnos: [
            {
              nomenclatura: 'SP-9-18',
              turno: 'Base semanal',
              horario: '09:00 a 18:00',
              hora_entrada: '09:00:00',
              hora_salida: '18:00:00',
              tipo: 'RANGO_HORARIO',
            },
          ],
        },
      },
      error: null,
    },
    'configuracion:radio-default': { data: { valor: 150 }, error: null },
    'configuracion:justificacion-default': { data: { valor: false }, error: null },
    regla_negocio: {
      data: {
        id: 'rule-horario',
        codigo: 'JERARQUIA_HORARIO_PRIORIDADES',
        modulo: 'reglas',
        descripcion: 'Horario PDV > cadena > global',
        severidad: 'ALERTA',
        prioridad: 120,
        condicion: { levels: ['PDV_FECHA', 'PDV_BASE', 'CADENA_BASE', 'GLOBAL'] },
        accion: {
          global_fallback: {
            label: 'Horario global agencia',
            hora_entrada: '11:00:00',
            hora_salida: '19:00:00',
          },
        },
        activa: true,
      },
      error: null,
    },
    supervisor_pdv: {
      data: [
        { pdv_id: 'pdv-1', empleado_id: 'emp-1', activo: true },
        { pdv_id: 'pdv-2', empleado_id: 'emp-2', activo: true },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelPdvs(client as never, {
    search: '',
    cadenaId: '',
    ciudadId: '',
    estado: '',
    zona: '',
    supervisorId: 'emp-1',
    estatus: 'ACTIVO',
  })

  expect(data.hasActiveFilters).toBe(true)
  expect(data.pdvs).toHaveLength(1)
  expect(data.pdvs[0]?.id).toBe('pdv-1')
  expect(data.cadenas).toEqual([{ id: 'cadena-1', codigo: 'SAN', nombre: 'SAN PABLO' }])
  expect(data.ciudades).toEqual([{ id: 'ciudad-1', nombre: 'MONTERREY', zona: 'NORTE', estado: 'NUEVO LEON' }])
  expect(data.estados).toEqual(['NUEVO LEON'])
  expect(data.zonas).toEqual(['NORTE'])
  expect(data.supervisores).toEqual([{ id: 'emp-1', nombreCompleto: 'Adriana Yulisma', zona: 'NORTE' }])
})

test('degrada el panel si la tabla pdv no esta disponible', async () => {
  const client = createFakePdvsSupabase({
    pdv: {
      data: null,
      error: { message: 'relation public.pdv does not exist' },
    },
    cadena: { data: [], error: null },
    ciudad: { data: [], error: null },
    empleado: { data: [], error: null },
    configuracion: { data: null, error: null },
    'configuracion:radio-default': { data: null, error: null },
    'configuracion:justificacion-default': { data: null, error: null },
    regla_negocio: { data: null, error: null },
  })

  const data = await obtenerPanelPdvs(client as never)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('relation public.pdv does not exist')
  expect(data.pdvs).toHaveLength(0)
  expect(data.geocercaDefaultMetros).toBe(150)
})