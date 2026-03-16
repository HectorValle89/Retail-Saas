import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { getWeekEndIso, getWeekStartIso, sortWeeklyVisits } from '../src/features/rutas/lib/weeklyRoute'
import { obtenerPanelRutaSemanal } from '../src/features/rutas/services/rutaSemanalService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakeRutaSemanalSupabase(results: Record<string, QueryResult>) {
  const eqValues = new Map<string, string>()

  return {
    from(table: string) {
      return {
        select() {
          return this
        },
        eq(column: string, value: string) {
          eqValues.set(`${table}:${column}`, value)
          return this
        },
        order() {
          return this
        },
        limit() {
          return Promise.resolve(results[table] ?? { data: [], error: null })
        },
        maybeSingle() {
          return Promise.resolve(results[table] ?? { data: null, error: null })
        },
      }
    },
    getEqValue(table: string, column: string) {
      return eqValues.get(`${table}:${column}`) ?? null
    },
  }
}

const semanaInicio = getWeekStartIso('2026-03-15')
const semanaFin = getWeekEndIso(semanaInicio)

const supervisorActor: ActorActual = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-super',
  cuentaClienteId: 'cuenta-1',
  username: 'supervisor1',
  correoElectronico: 'supervisor@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Ana Supervisor',
  puesto: 'SUPERVISOR',
}

test('consolida ruta semanal, ordena visitas y expone solo PDVs con asignacion activa publicada', async () => {
  const client = createFakeRutaSemanalSupabase({
    ruta_semanal: {
      data: [
        {
          id: 'ruta-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          semana_inicio: semanaInicio,
          estatus: 'PUBLICADA',
          notas: 'Ruta norte',
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T11:00:00.000Z',
          supervisor: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
        },
      ],
      error: null,
    },
    ruta_semanal_visita: {
      data: [
        {
          id: 'visita-2',
          ruta_semanal_id: 'ruta-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-2',
          asignacion_id: 'asig-2',
          dia_semana: 3,
          orden: 2,
          estatus: 'PLANIFICADA',
          selfie_url: null,
          evidencia_url: null,
          checklist_calidad: {},
          comentarios: null,
          completada_en: null,
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
        },
        {
          id: 'visita-1',
          ruta_semanal_id: 'ruta-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-1',
          asignacion_id: 'asig-1',
          dia_semana: 1,
          orden: 1,
          estatus: 'COMPLETADA',
          selfie_url: 'https://cdn.example.com/selfie.jpg',
          evidencia_url: null,
          checklist_calidad: { fachada_ok: true },
          comentarios: 'Sin incidencias',
          completada_en: '2026-03-11T15:00:00.000Z',
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-11T15:00:00.000Z',
        },
      ],
      error: null,
    },
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'SP001',
          nombre: 'San Pablo Valle',
          zona: 'NORTE',
          direccion: 'Av Uno 100',
          estatus: 'ACTIVO',
        },
        {
          id: 'pdv-2',
          clave_btl: 'SP002',
          nombre: 'San Pablo Centro',
          zona: 'CENTRO',
          direccion: 'Av Dos 200',
          estatus: 'ACTIVO',
        },
        {
          id: 'pdv-3',
          clave_btl: 'SP003',
          nombre: 'San Pablo Draft',
          zona: 'SUR',
          direccion: 'Av Tres 300',
          estatus: 'ACTIVO',
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [
        { pdv_id: 'pdv-1', latitud: 25.671, longitud: -100.31 },
        { pdv_id: 'pdv-2', latitud: 25.672, longitud: -100.305 },
      ],
      error: null,
    },
    asignacion: {
      data: [
        {
          id: 'asig-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-1',
          fecha_inicio: semanaInicio,
          fecha_fin: semanaFin,
          estado_publicacion: 'PUBLICADA',
        },
        {
          id: 'asig-2',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-2',
          fecha_inicio: semanaInicio,
          fecha_fin: null,
          estado_publicacion: 'PUBLICADA',
        },
        {
          id: 'asig-3',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-3',
          fecha_inicio: semanaInicio,
          fecha_fin: semanaFin,
          estado_publicacion: 'BORRADOR',
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelRutaSemanal(client as never, supervisorActor)

  expect(client.getEqValue('ruta_semanal', 'supervisor_empleado_id')).toBe('emp-super')
  expect(client.getEqValue('asignacion', 'supervisor_empleado_id')).toBe('emp-super')
  expect(data.infraestructuraLista).toBe(true)
  expect(data.puedeEditar).toBe(true)
  expect(data.resumen).toMatchObject({
    totalRutas: 1,
    totalVisitas: 2,
    visitasCompletadas: 1,
    pdvsAsignables: 2,
  })
  expect(data.rutas[0]).toMatchObject({
    id: 'ruta-1',
    supervisor: 'Ana Supervisor',
    semanaInicio,
    semanaFin,
    visitasCompletadas: 1,
    totalVisitas: 2,
  })
  expect(data.rutas[0].visitas.map((item) => item.id)).toEqual(['visita-1', 'visita-2'])
  expect(data.rutas[0].visitas[0]).toMatchObject({
    diaSemana: 1,
    orden: 1,
    pdv: 'San Pablo Valle',
    latitud: 25.671,
    longitud: -100.31,
    estatus: 'COMPLETADA',
  })
  expect(data.pdvsDisponibles.map((item) => item.id)).toEqual(['pdv-2', 'pdv-1'])
  expect(data.pdvsDisponibles.every((item) => item.id !== 'pdv-3')).toBe(true)
})

test('expone vista de solo lectura para coordinacion y filtra por cuenta activa', async () => {
  const client = createFakeRutaSemanalSupabase({
    ruta_semanal: {
      data: [
        {
          id: 'ruta-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          semana_inicio: semanaInicio,
          estatus: 'EN_PROGRESO',
          notas: null,
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-12T11:00:00.000Z',
          supervisor: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
        },
        {
          id: 'ruta-2',
          cuenta_cliente_id: 'cuenta-2',
          supervisor_empleado_id: 'emp-other',
          semana_inicio: semanaInicio,
          estatus: 'PUBLICADA',
          notas: null,
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-12T11:00:00.000Z',
          supervisor: [{ id: 'emp-other', nombre_completo: 'Pedro Supervisor', zona: 'SUR' }],
        },
      ],
      error: null,
    },
    ruta_semanal_visita: {
      data: [
        {
          id: 'visita-1',
          ruta_semanal_id: 'ruta-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-1',
          asignacion_id: 'asig-1',
          dia_semana: 4,
          orden: 1,
          estatus: 'PLANIFICADA',
          selfie_url: null,
          evidencia_url: null,
          checklist_calidad: {},
          comentarios: null,
          completada_en: null,
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
        },
        {
          id: 'visita-2',
          ruta_semanal_id: 'ruta-2',
          cuenta_cliente_id: 'cuenta-2',
          supervisor_empleado_id: 'emp-other',
          pdv_id: 'pdv-2',
          asignacion_id: 'asig-2',
          dia_semana: 5,
          orden: 1,
          estatus: 'PLANIFICADA',
          selfie_url: null,
          evidencia_url: null,
          checklist_calidad: {},
          comentarios: null,
          completada_en: null,
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
        },
      ],
      error: null,
    },
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'SP001',
          nombre: 'San Pablo Valle',
          zona: 'NORTE',
          direccion: 'Av Uno 100',
          estatus: 'ACTIVO',
        },
        {
          id: 'pdv-2',
          clave_btl: 'SP002',
          nombre: 'San Pablo Sur',
          zona: 'SUR',
          direccion: 'Av Dos 200',
          estatus: 'ACTIVO',
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [{ pdv_id: 'pdv-1', latitud: 25.671, longitud: -100.31 }],
      error: null,
    },
  })

  const data = await obtenerPanelRutaSemanal(client as never, {
    ...supervisorActor,
    empleadoId: 'emp-coord',
    puesto: 'COORDINADOR',
    nombreCompleto: 'Coord Uno',
  })

  expect(client.getEqValue('ruta_semanal', 'supervisor_empleado_id')).toBeNull()
  expect(data.puedeEditar).toBe(false)
  expect(data.rutas).toHaveLength(1)
  expect(data.rutas[0].id).toBe('ruta-1')
  expect(data.pdvsDisponibles).toEqual([])
})

test('degrada con mensaje de infraestructura si faltan tablas de ruta', async () => {
  const client = createFakeRutaSemanalSupabase({
    ruta_semanal: {
      data: null,
      error: { message: 'relation "public.ruta_semanal" does not exist' },
    },
    ruta_semanal_visita: {
      data: [],
      error: null,
    },
    pdv: {
      data: [],
      error: null,
    },
    geocerca_pdv: {
      data: [],
      error: null,
    },
    asignacion: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelRutaSemanal(client as never, supervisorActor)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('ruta_semanal')
  expect(data.puedeEditar).toBe(true)
})

test('ordena visitas por dia y orden dentro del mismo dia', async () => {
  expect(
    sortWeeklyVisits([
      { diaSemana: 5, orden: 2, id: 'b' },
      { diaSemana: 1, orden: 3, id: 'c' },
      { diaSemana: 1, orden: 1, id: 'a' },
    ]).map((item) => item.id)
  ).toEqual(['a', 'c', 'b'])
})