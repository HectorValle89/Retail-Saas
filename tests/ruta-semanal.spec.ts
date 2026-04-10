import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { getWeekEndIso, getWeekStartIso, sortWeeklyVisits } from '../src/features/rutas/lib/weeklyRoute'
import { parseRutaSemanalWorkflowMetadata } from '../src/features/rutas/lib/routeWorkflow'
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
          metadata: {
            expectedMonthlyVisits: 12,
            approval: { state: 'APROBADA', note: 'OK', reviewedAt: '2026-03-10T12:00:00.000Z' },
          },
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
          metadata: {
            checkIn: {
              at: '2026-03-11T14:00:00.000Z',
              gpsState: 'DENTRO_GEOCERCA',
            },
          },
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
          metadata: {
            checkIn: {
              at: '2026-03-11T13:00:00.000Z',
              gpsState: 'DENTRO_GEOCERCA',
            },
            checkOut: {
              at: '2026-03-11T15:00:00.000Z',
              gpsState: 'DENTRO_GEOCERCA',
            },
          },
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

  const data = await obtenerPanelRutaSemanal(client as never, supervisorActor, {
    referenceDate: '2026-03-11',
  })

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
    approvalState: 'APROBADA',
    expectedMonthlyVisits: 12,
  })
  expect(data.rutas[0].visitas.map((item) => item.id)).toEqual(['visita-1', 'visita-2'])
  expect(data.rutas[0].visitas[0]).toMatchObject({
    diaSemana: 1,
    orden: 1,
    pdv: 'San Pablo Valle',
    latitud: 25.671,
    longitud: -100.31,
    estatus: 'COMPLETADA',
    checkInAt: '2026-03-11T13:00:00.000Z',
    checkOutAt: '2026-03-11T15:00:00.000Z',
  })
  expect(data.rutaSemanaActual?.id).toBe('ruta-1')
  expect(data.visitasHoy).toHaveLength(1)
  expect(data.visitasHoy[0]?.id).toBe('visita-2')
  expect(data.pdvsDisponibles.map((item) => item.id)).toEqual(['pdv-2', 'pdv-1'])
  expect(data.pdvsDisponibles.every((item) => item.id !== 'pdv-3')).toBe(true)
})

test('supervisor puede planear ruta con PDVs heredados aunque no existan asignaciones DC activas', async () => {
  const client = createFakeRutaSemanalSupabase({
    ruta_semanal: {
      data: [
        {
          id: 'ruta-base',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          semana_inicio: semanaInicio,
          estatus: 'BORRADOR',
          notas: null,
          metadata: {
            minimumVisitsPerPdv: 4,
            expectedMonthlyVisits: 8,
          },
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T11:00:00.000Z',
          supervisor: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
        },
      ],
      error: null,
    },
    ruta_semanal_visita: {
      data: [],
      error: null,
    },
    pdv: {
      data: [
        {
          id: 'pdv-base-1',
          clave_btl: 'SP100',
          nombre: 'Base Norte 1',
          zona: 'NORTE',
          direccion: 'Av Base 100',
          estatus: 'ACTIVO',
          formato: 'FARMACIA',
          supervisor_pdv: [
            {
              id: 'sp-1',
              activo: true,
              fecha_inicio: semanaInicio,
              fecha_fin: null,
              empleado: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
            },
          ],
        },
        {
          id: 'pdv-base-2',
          clave_btl: 'SP200',
          nombre: 'Base Norte 2',
          zona: 'NORTE',
          direccion: 'Av Base 200',
          estatus: 'ACTIVO',
          formato: 'FARMACIA',
          supervisor_pdv: [
            {
              id: 'sp-2',
              activo: true,
              fecha_inicio: semanaInicio,
              fecha_fin: null,
              empleado: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
            },
          ],
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [
        { pdv_id: 'pdv-base-1', latitud: 25.671, longitud: -100.31 },
        { pdv_id: 'pdv-base-2', latitud: 25.672, longitud: -100.305 },
      ],
      error: null,
    },
    asignacion: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelRutaSemanal(client as never, supervisorActor, {
    referenceDate: '2026-03-11',
  })

  expect(data.pdvsDisponibles).toHaveLength(2)
  expect(data.pdvsDisponibles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'pdv-base-1',
        asignacionId: null,
        nombre: 'Base Norte 1',
      }),
      expect.objectContaining({
        id: 'pdv-base-2',
        asignacionId: null,
        nombre: 'Base Norte 2',
      }),
    ])
  )
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
          metadata: {},
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
          metadata: {},
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
          metadata: {},
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
          metadata: {},
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

  const data = await obtenerPanelRutaSemanal(
    client as never,
    {
      ...supervisorActor,
      empleadoId: 'emp-coord',
      puesto: 'COORDINADOR',
      nombreCompleto: 'Coord Uno',
    },
    {
      referenceDate: '2026-03-15',
    }
  )

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

  const data = await obtenerPanelRutaSemanal(client as never, supervisorActor, {
    referenceDate: '2026-03-15',
  })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('ruta_semanal')
  expect(data.puedeEditar).toBe(true)
})

test('war room respeta cuotas mensuales por PDV cuando existen en metadata', async () => {
  const client = createFakeRutaSemanalSupabase({
    ruta_semanal: {
      data: [
        {
          id: 'ruta-war-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          semana_inicio: semanaInicio,
          estatus: 'PUBLICADA',
          notas: null,
          metadata: {
            expectedMonthlyVisits: 8,
            minimumVisitsPerPdv: 4,
            pdvMonthlyQuotas: {
              'pdv-1': 6,
              'pdv-2': 2,
            },
            approval: { state: 'APROBADA', note: null, reviewedAt: null },
            changeRequest: { status: 'NINGUNO', note: null },
          },
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-12T11:00:00.000Z',
          supervisor: [{ id: 'emp-super', nombre_completo: 'Ana Supervisor', zona: 'NORTE' }],
        },
      ],
      error: null,
    },
    ruta_semanal_visita: {
      data: [
        {
          id: 'visita-1',
          ruta_semanal_id: 'ruta-war-1',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-1',
          asignacion_id: 'asig-1',
          dia_semana: 1,
          orden: 1,
          estatus: 'COMPLETADA',
          selfie_url: null,
          evidencia_url: null,
          checklist_calidad: {},
          comentarios: null,
          completada_en: '2026-03-11T15:00:00.000Z',
          metadata: {},
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
          formato: 'FARMACIA',
          supervisor_pdv: [],
        },
        {
          id: 'pdv-2',
          clave_btl: 'SP002',
          nombre: 'San Pablo Centro',
          zona: 'NORTE',
          direccion: 'Av Dos 200',
          estatus: 'ACTIVO',
          formato: 'FARMACIA',
          supervisor_pdv: [],
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
          horario_referencia: '09:00-18:00',
        },
        {
          id: 'asig-2',
          cuenta_cliente_id: 'cuenta-1',
          supervisor_empleado_id: 'emp-super',
          pdv_id: 'pdv-2',
          fecha_inicio: semanaInicio,
          fecha_fin: semanaFin,
          estado_publicacion: 'PUBLICADA',
          horario_referencia: '09:00-18:00',
        },
      ],
      error: null,
    },
    solicitud: {
      data: [],
      error: null,
    },
    empleado: {
      data: [
        {
          id: 'emp-super',
          nombre_completo: 'Ana Supervisor',
          puesto: 'SUPERVISOR',
          zona: 'NORTE',
          estatus_laboral: 'ACTIVO',
          supervisor_empleado_id: null,
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelRutaSemanal(
    client as never,
    {
      ...supervisorActor,
      empleadoId: 'emp-coord',
      puesto: 'COORDINADOR',
      nombreCompleto: 'Coord Uno',
    },
    {
      referenceDate: '2026-03-15',
    }
  )

  expect(data.warRoom.supervisors).toHaveLength(1)
  expect(data.warRoom.supervisors[0]).toMatchObject({
    minimumVisitsPerPdv: 4,
    expectedMonthlyVisits: 8,
    monthlyVisitsCompleted: 1,
  })
  expect(data.warRoom.supervisors[0]?.quotaProgress).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        pdvId: 'pdv-1',
        quotaMensual: 6,
        visitasRealizadas: 1,
        visitasPendientes: 5,
      }),
      expect.objectContaining({
        pdvId: 'pdv-2',
        quotaMensual: 2,
        visitasRealizadas: 0,
        visitasPendientes: 2,
      }),
    ])
  )
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

test('normaliza solicitudes de cambio de ruta por dia con propuesta nueva o cancelacion total', async () => {
  const dayRequest = parseRutaSemanalWorkflowMetadata({
    changeRequest: {
      status: 'PENDIENTE',
      note: 'Mover el jueves completo',
      requestType: 'CAMBIO_DIA',
      targetScope: 'DIA',
      targetDayNumber: 4,
      targetDayLabel: 'Jueves',
      proposedVisits: [
        { pdvId: 'pdv-1', order: 2 },
        { pdvId: 'pdv-2', order: 1 },
      ],
      previousApprovalState: 'APROBADA',
      previousRouteStatus: 'PUBLICADA',
    },
  })

  expect(dayRequest.changeRequest).toMatchObject({
    status: 'PENDIENTE',
    requestType: 'CAMBIO_DIA',
    targetScope: 'DIA',
    targetDayNumber: 4,
    targetDayLabel: 'Jueves',
    previousApprovalState: 'APROBADA',
    previousRouteStatus: 'PUBLICADA',
  })
  expect(dayRequest.changeRequest.proposedVisits).toEqual([
    { pdvId: 'pdv-2', order: 1 },
    { pdvId: 'pdv-1', order: 2 },
  ])

  const visitRequest = parseRutaSemanalWorkflowMetadata({
    changeRequest: {
      status: 'PENDIENTE',
      note: 'Mover solo una tienda',
      requestType: 'CAMBIO_TIENDA',
      targetScope: 'VISITA',
      targetVisitId: 'visita-1',
      targetPdvId: 'pdv-1',
      targetDayNumber: 2,
      targetDayLabel: 'Martes',
    },
  })

  expect(visitRequest.changeRequest).toMatchObject({
    status: 'PENDIENTE',
    requestType: 'CAMBIO_TIENDA',
    targetScope: 'VISITA',
    targetVisitId: 'visita-1',
    targetPdvId: 'pdv-1',
    targetDayNumber: 2,
    targetDayLabel: 'Martes',
  })

  const cancelRequest = parseRutaSemanalWorkflowMetadata({
    changeRequest: {
      status: 'PENDIENTE',
      requestType: 'CANCELACION_DIA',
      targetScope: 'DIA',
      targetDayNumber: 5,
      targetDayLabel: 'Viernes',
      proposedVisits: [],
    },
  })

  expect(cancelRequest.changeRequest).toMatchObject({
    status: 'PENDIENTE',
    requestType: 'CANCELACION_DIA',
    targetScope: 'DIA',
    targetDayNumber: 5,
    targetDayLabel: 'Viernes',
    proposedVisits: [],
  })
})
